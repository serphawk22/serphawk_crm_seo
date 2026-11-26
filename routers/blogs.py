"""
Public Blogs & Knowledge Hub Router
─────────────────────────────────────────────────────────────────────────────
Public Endpoints:
  GET  /blogs                List published blogs with search, category & tags
  GET  /blogs/{slug_or_id}   Read single blog article and increment view counter

Admin / SuperAdmin Endpoints (Requires Credentials):
  POST /blogs                Create a new blog article
  PUT  /blogs/{id}           Update an existing blog article
  DELETE /blogs/{id}         Delete a blog article
  POST /blogs/upload-image   Upload images to embed inside blog articles
"""
from __future__ import annotations

import os
import re
import uuid
import shutil
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Body, Header
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func, or_

from database import BlogPost, User
from modules.tenant_scope import current_tenant_id
from modules.api_tracker import current_salesperson_id
from database import engine

router = APIRouter(prefix="/blogs", tags=["blogs"])

_UPLOAD_DIR = "static/uploads/blogs"
os.makedirs(_UPLOAD_DIR, exist_ok=True)


def _get_session():
    with Session(engine) as session:
        yield session


def _current_auth_user(session: Session) -> Optional[User]:
    """Resolves authenticated user from current session context."""
    uid = current_salesperson_id.get()
    if not uid:
        return None
    return session.get(User, uid)


SECURITY_KEY = "SERP123"


def _require_admin_or_superadmin(session: Session, sec_key: Optional[str] = None) -> User:
    """Ensures caller has SuperAdmin or Admin privileges or valid security key (SERP123)."""
    if sec_key and sec_key.strip() == SECURITY_KEY:
        user = _current_auth_user(session)
        if not user:
            user = session.exec(select(User).where(User.role.in_(["SuperAdmin", "Admin"]))).first()
            if not user:
                user = session.exec(select(User)).first()
            if not user:
                # Emergency author user
                user = User(
                    name="SerpHawk Author",
                    email="author@serphawk.com",
                    role="SuperAdmin",
                    tenant_id=1
                )
                session.add(user)
                session.commit()
                session.refresh(user)
        return user

    user = _current_auth_user(session)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Security key (SERP123) or SuperAdmin credentials required to publish articles."
        )
    role_norm = (user.role or "").strip().lower()
    is_super = role_norm in ("superadmin", "admin") or (user.email or "").lower() == "admin@serphawk.com"
    if not is_super:
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Please enter security key (SERP123) or sign in as Admin."
        )
    return user


def _slugify(text: str) -> str:
    """Create a URL-friendly slug from string."""
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    s = s.strip("-")
    return s or f"post-{uuid.uuid4().hex[:8]}"


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────
class BlogCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    slug: Optional[str] = None
    summary: Optional[str] = None
    content: str = Field(..., min_length=10)
    cover_image: Optional[str] = None
    category: str = "CRM Guide"
    tags: Optional[str] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    author_avatar: Optional[str] = None
    is_published: bool = True
    read_time_minutes: Optional[int] = None
    security_key: Optional[str] = None


class BlogUpdateRequest(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    author_avatar: Optional[str] = None
    is_published: Optional[bool] = None
    read_time_minutes: Optional[int] = None
    security_key: Optional[str] = None


def _blog_dict(b: BlogPost) -> dict:
    return {
        "id": b.id,
        "title": b.title,
        "slug": b.slug,
        "summary": b.summary or "",
        "content": b.content,
        "cover_image": b.cover_image or "",
        "category": b.category or "CRM Guide",
        "tags": [t.strip() for t in (b.tags or "").split(",") if t.strip()],
        "author_id": b.author_id,
        "author_name": b.author_name or "SerpHawk Team",
        "author_role": b.author_role or "Super Admin",
        "author_avatar": b.author_avatar or "",
        "is_published": b.is_published,
        "read_time_minutes": b.read_time_minutes or 4,
        "views_count": b.views_count,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.get("")
@router.get("/")
def list_blogs(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_drafts: bool = Query(False),
    session: Session = Depends(_get_session)
):
    """Public list of blogs with search, category and tag filters."""
    # Ensure default blogs exist
    _ensure_seed_blogs(session)

    q = select(BlogPost).order_by(BlogPost.created_at.desc())
    if not include_drafts:
        q = q.where(BlogPost.is_published == True)

    if category and category.lower() not in ("all", ""):
        q = q.where(BlogPost.category.ilike(f"%{category.strip()}%"))

    if search and search.strip():
        s = f"%{search.strip()}%"
        q = q.where(or_(
            BlogPost.title.ilike(s),
            BlogPost.summary.ilike(s),
            BlogPost.content.ilike(s),
            BlogPost.category.ilike(s),
            BlogPost.tags.ilike(s)
        ))

    if tag and tag.strip():
        q = q.where(BlogPost.tags.ilike(f"%{tag.strip()}%"))

    all_rows = session.exec(q).all()
    total = len(all_rows)
    paginated = all_rows[offset: offset + limit]

    # Collect available categories
    cats = session.exec(select(BlogPost.category).where(BlogPost.is_published == True).distinct()).all()
    categories = sorted(list({c for c in cats if c}))

    return {
        "blogs": [_blog_dict(b) for b in paginated],
        "total": total,
        "categories": categories,
        "limit": limit,
        "offset": offset
    }


@router.get("/{slug_or_id}")
def get_blog(slug_or_id: str, session: Session = Depends(_get_session)):
    """Public single blog view. Automatically increments view count."""
    blog = None
    if slug_or_id.isdigit():
        blog = session.get(BlogPost, int(slug_or_id))
    if not blog:
        blog = session.exec(select(BlogPost).where(BlogPost.slug == slug_or_id.strip())).first()

    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    # Increment views counter atomically
    try:
        blog.views_count = (blog.views_count or 0) + 1
        session.add(blog)
        session.commit()
        session.refresh(blog)
    except Exception:
        pass

    return {"blog": _blog_dict(blog)}


# ─────────────────────────────────────────────────────────────────────────────
# Protected SuperAdmin / Admin Management Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.post("")
@router.post("/")
def create_blog(
    body: BlogCreateRequest,
    x_security_key: Optional[str] = Header(None),
    session: Session = Depends(_get_session)
):
    """Create a new blog article. Restricted to SuperAdmin/Admin or Security Key SERP123."""
    user = _require_admin_or_superadmin(session, x_security_key or body.security_key)

    # Resolve slug
    base_slug = _slugify(body.slug or body.title)
    slug = base_slug
    idx = 1
    while session.exec(select(BlogPost).where(BlogPost.slug == slug)).first():
        slug = f"{base_slug}-{idx}"
        idx += 1

    # Estimate read time if not provided (~200 words per minute)
    words = len(body.content.split())
    read_time = body.read_time_minutes or max(1, round(words / 200))

    author_name = body.author_name or (user.name if user else "SerpHawk Team")
    author_role = body.author_role or (user.role if user else "Super Admin")

    blog = BlogPost(
        title=body.title.strip(),
        slug=slug,
        summary=body.summary.strip() if body.summary else body.content[:220].strip() + "...",
        content=body.content.strip(),
        cover_image=body.cover_image or "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80",
        category=body.category or "CRM Guide",
        tags=body.tags or "crm, sales, automation",
        author_id=user.id if user else None,
        author_name=author_name,
        author_role=author_role,
        author_avatar=body.author_avatar,
        is_published=body.is_published,
        read_time_minutes=read_time,
        views_count=0,
        tenant_id=1,
    )
    session.add(blog)
    session.commit()
    session.refresh(blog)
    return {"success": True, "blog": _blog_dict(blog)}


@router.put("/{blog_id}")
def update_blog(
    blog_id: int,
    body: BlogUpdateRequest,
    x_security_key: Optional[str] = Header(None),
    session: Session = Depends(_get_session)
):
    """Update an existing blog article. Restricted to SuperAdmin/Admin or Security Key SERP123."""
    _require_admin_or_superadmin(session, x_security_key or body.security_key)
    blog = session.get(BlogPost, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    if body.title is not None:
        blog.title = body.title.strip()
    if body.slug is not None and body.slug.strip():
        new_slug = _slugify(body.slug)
        existing = session.exec(select(BlogPost).where(BlogPost.slug == new_slug, BlogPost.id != blog_id)).first()
        if not existing:
            blog.slug = new_slug
    if body.summary is not None:
        blog.summary = body.summary.strip()
    if body.content is not None:
        blog.content = body.content.strip()
        words = len(blog.content.split())
        blog.read_time_minutes = max(1, round(words / 200))
    if body.cover_image is not None:
        blog.cover_image = body.cover_image
    if body.category is not None:
        blog.category = body.category
    if body.tags is not None:
        blog.tags = body.tags
    if body.author_name is not None:
        blog.author_name = body.author_name
    if body.author_role is not None:
        blog.author_role = body.author_role
    if body.author_avatar is not None:
        blog.author_avatar = body.author_avatar
    if body.is_published is not None:
        blog.is_published = body.is_published
    if body.read_time_minutes is not None:
        blog.read_time_minutes = body.read_time_minutes

    blog.updated_at = datetime.now(timezone.utc)
    session.add(blog)
    session.commit()
    session.refresh(blog)
    return {"success": True, "blog": _blog_dict(blog)}


@router.delete("/{blog_id}")
def delete_blog(
    blog_id: int,
    x_security_key: Optional[str] = Header(None),
    session: Session = Depends(_get_session)
):
    """Delete a blog article. Restricted to SuperAdmin/Admin or Security Key SERP123."""
    _require_admin_or_superadmin(session, x_security_key)
    blog = session.get(BlogPost, blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")
    session.delete(blog)
    session.commit()
    return {"success": True, "message": "Blog post deleted successfully"}


@router.post("/upload-image")
def upload_blog_image(
    file: UploadFile = File(...),
    x_security_key: Optional[str] = Header(None),
    session: Session = Depends(_get_session)
):
    """Upload an image to embed in blog articles. Restricted to SuperAdmin/Admin or Security Key SERP123."""
    _require_admin_or_superadmin(session, x_security_key)
    """Upload an image to embed in blog articles. Restricted to SuperAdmin and Admin."""
    _require_admin_or_superadmin(session)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"):
        raise HTTPException(status_code=400, detail="Only images (JPG, PNG, WebP, GIF, SVG) are allowed.")

    filename = f"blog_{uuid.uuid4().hex[:12]}{ext}"
    filepath = os.path.join(_UPLOAD_DIR, filename)

    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {e}")

    # Return relative URL that works through backend static mount
    return {"url": f"/static/uploads/blogs/{filename}", "filename": filename}


# ─────────────────────────────────────────────────────────────────────────────
# Seed Default Blogs on CRM Usage
# ─────────────────────────────────────────────────────────────────────────────
def _ensure_seed_blogs(session: Session) -> None:
    """Seeds initial high-value blogs detailing SerpHawk CRM usage."""
    count = session.exec(select(func.count(BlogPost.id))).one()
    if count > 0:
        return

    seeds = [
        {
            "title": "How to Supercharge Lead Management & Sales Pipelines with SerpHawk CRM",
            "slug": "how-to-supercharge-lead-management-serphawk-crm",
            "category": "CRM Guide",
            "tags": "crm, lead management, sales pipeline, serphawk",
            "cover_image": "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80",
            "author_name": "SerpHawk Strategy Team",
            "author_role": "Super Admin",
            "read_time_minutes": 5,
            "summary": "A masterclass on capturing inbound leads, running autonomous 360° prospect research, and driving 3x faster deal velocity without legacy CRM clutter.",
            "content": """# How to Supercharge Lead Management & Sales Pipelines with SerpHawk CRM

In high-growth sales operations, velocity is everything. Traditional CRMs often become data graveyards—heavy tables where leads sit untouched while sales reps spend hours copying information between tabs.

**SerpHawk CRM** reimagines this entirely by unifying lead capture, deep autonomous company research, and transparent team collaboration into an agile, real-time command center.

---

## 1. Multi-Channel Lead Intake & Instant Capture

SerpHawk CRM centralizes every incoming sales opportunity into a single unified queue:
- **Radar Analysis & Website Scraper**: Uncover prospects with verifiable contact information and direct decision-maker profiles.
- **OCR Business Card Scanner**: Snap a picture of any physical card or digital badge, and our optical engine auto-populates name, title, email, phone, and company address.
- **Website Autofill**: Simply paste a company domain into the lead modal, and SerpHawk fetches verified industry data, headquarters location, and phone records in seconds.

> **Pro Tip**: Use the **Auto-Assign Leads** engine to distribute unassigned leads equitably across available sales reps with a single click.

---

## 2. 360° Autonomous AI Prospect Intelligence

Before picking up the phone or sending an email, SerpHawk equips your reps with full operational intelligence:
1. **Decision Maker Discovery**: Automatically identifies Key Decision Makers (CEOs, VPs of Sales, CTOs).
2. **Tech Stack & Pain Points**: Analyzes client tech infrastructure and identifies high-impact opportunities for service upsells.
3. **Competitor Radar Signals**: Gauges market position, competitor alternatives, and pricing expectations.

---

## 3. Audited Team Transfers & Workload Balancing

When territories shift or a team member is out of office, leads must move smoothly without getting lost:
- Open the **Transfer Leads** modal.
- Filter leads by current stage, date, or specific quantity.
- Select your target salesperson and provide an audit reason.
- Review every historical reassignment in the **Transferred Leads Audit Log**, filterable by date (`Today`, `Yesterday`, `This Week`), stage, and salesperson.

---

## 4. Visual Follow-up Calendar & Vacation Synchronization

Managing enterprise deals requires consistent touchpoints. SerpHawk's integrated calendar features:
- **Unified Calendar Views**: Month, Week, Day, and Agenda sub-views with color-coded appointment bars.
- **Out-of-Office & Vacation Sync**: Ensure meetings are never booked during blocked time slots or national holidays.
- **Automated Reminders**: Visual badges for upcoming meetings, overdue follow-ups, and pending outcomes.

---

## Ready to Elevate Your Sales Engine?

Experience the modern CRM designed for speed, intelligence, and verified team execution.

[**Launch SerpHawk CRM Now →**](/login)
"""
        },
        {
            "title": "Automating Enterprise Follow-ups: The Secret Weapon for Faster Deal Closes",
            "slug": "automating-enterprise-follow-ups-close-deals-faster",
            "category": "Sales Strategies",
            "tags": "sales, follow-ups, enterprise deals, productivity",
            "cover_image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
            "author_name": "SerpHawk Sales Engineering",
            "author_role": "Product Lead",
            "read_time_minutes": 4,
            "summary": "Why 80% of sales require 5+ touchpoints, and how SerpHawk CRM's automated task sheets and follow-up boards ensure no revenue slips away.",
            "content": """# Automating Enterprise Follow-ups: The Secret Weapon for Faster Deal Closes

Statistics show that over 44% of sales reps give up after just one follow-up call, yet **80% of enterprise closed-won contracts require at least five structured touchpoints**.

When reps rely on memory or messy spreadsheets, prospects slip through the cracks. Here is how top performers leverage SerpHawk CRM to maintain a pristine follow-up rhythm.

---

## The Follow-Up Board System

SerpHawk CRM provides a dedicated **Follow-Up Board** that organizes every scheduled interaction:
- **Today's Due Calls**: Highlighted in priority order with direct dial links.
- **Overdue Touchpoints**: Pulsing alerts that flag forgotten prospects before they go cold.
- **Upcoming Engagements**: A structured 7-day outlook to help reps balance call blocks and demo presentations.

---

## Daily AI Task Sheets & Verified Proof of Work

At the end of each day, sales reps open their **Sales & Staff Task Sheet**:
1. Click **Generate Tasksheet for Today** to auto-compile every call logged, meeting held, and proposal dispatched.
2. Record voice notes or quick transcripts detailing custom objections or customer requests.
3. Submit the verified report directly for Admin inspection with traceability.

---

## Take Control of Your Follow-Up Cadence

Transform messy sales notes into an automated, revenue-generating pipeline.

[**Start Managing Follow-ups in SerpHawk CRM →**](/login)
"""
        },
        {
            "title": "Eliminating Sales Chaos: Fair Lead Transfers & Audited Team Ownership",
            "slug": "eliminating-sales-chaos-fair-lead-transfers",
            "category": "Team Management",
            "tags": "team management, lead transfer, audit log, transparency",
            "cover_image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
            "author_name": "SerpHawk Operations",
            "author_role": "Super Admin",
            "read_time_minutes": 4,
            "summary": "How enterprise sales leaders balance rep capacity, prevent lead hoarding, and maintain a complete traceable audit trail across every opportunity.",
            "content": """# Eliminating Sales Chaos: Fair Lead Transfers & Audited Team Ownership

Lead hoarding and messy reassignments can cripple team morale and stall closing velocity. When high-value prospects change hands without clear context, client experience suffers.

SerpHawk CRM solves this with **Audited Bulk Lead Transfers** and transparent team ownership.

---

## 1. Workload Balancing

Managers and senior salespeople can instantly review team capacity:
- Identify team members with capacity to take on new qualified opportunities.
- Rebalance stale leads from unresponsive queues to active, hungry closers.

---

## 2. Complete Transfer Audit Trails

Every lead transfer in SerpHawk records:
- **Exact Timestamp** (displayed in your team's unified timezone).
- **Source Salesperson & Destination Salesperson**.
- **Audit Reason**: e.g., territory realignment, workload rebalancing, or specialist escalation.
- **Direct Link**: Seamlessly inspect the lead's entire conversation and deal history.

---

## Try SerpHawk CRM Free

Create a culture of transparency, accountability, and accelerated deal closing.

[**Get Started with SerpHawk CRM →**](/login)
"""
        },
        {
            "title": "Integrating AI Voice Agents into Your Sales Pipeline: From Lead to Booked Demo",
            "slug": "integrating-ai-voice-agents-sales-pipeline",
            "category": "AI Automation",
            "tags": "ai voice, autonomous caller, sales automation, twilio",
            "cover_image": "https://images.unsplash.com/photo-1534972195531-a756b1126f24?auto=format&fit=crop&w=1200&q=80",
            "author_name": "SerpHawk AI Labs",
            "author_role": "AI Research Lead",
            "read_time_minutes": 6,
            "summary": "Explore how SerpHawk's autonomous AI voice caller qualifies inbound prospects, handles live queries, and books meetings directly into your calendar.",
            "content": """# Integrating AI Voice Agents into Your Sales Pipeline: From Lead to Booked Demo

Speed to lead is the single most predictive metric for closing deals. Reaching out within the first 5 minutes increases conversion odds by **900%**.

SerpHawk CRM integrates an **Autonomous AI Voice Agent** that interacts naturally with prospects over phone and WhatsApp.

---

## How SerpHawk AI Voice Caller Operates

1. **Trigger on Inbound Lead**: When a lead registers or enters the intake pipeline, the AI caller initiates an automated discovery call.
2. **Context-Aware Dialogue**: Powered by real-time NLP, the agent addresses questions regarding your services, pricing tiers, and delivery capabilities.
3. **Sentiment & Qualification**: Evaluates prospect intent, budget, and readiness to purchase.
4. **Calendar Booking**: Immediately reserves open slots on your sales team's vacation-checked calendar.

---

## Experience the Future of Sales Automation

Equip your team with 24/7 AI calling and automated lead enrichment today.

[**Launch Your SerpHawk AI Agent →**](/login)
"""
        }
    ]

    for seed in seeds:
        b = BlogPost(
            title=seed["title"],
            slug=seed["slug"],
            category=seed["category"],
            tags=seed["tags"],
            cover_image=seed["cover_image"],
            author_name=seed["author_name"],
            author_role=seed["author_role"],
            read_time_minutes=seed["read_time_minutes"],
            summary=seed["summary"],
            content=seed["content"],
            is_published=True,
            views_count=18,
            tenant_id=1
        )
        session.add(b)
    session.commit()

