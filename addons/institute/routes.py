"""Institute routes (ported from the SCM HB deployment).

Everything here is gated per tenant by the ``institute`` feature (modules/features.py). The handlers keep the original
behaviour; what was added on the way over:
  * role checks on the handlers the original left open (any logged-in user could create or delete courses);
  * the public lead-intake webhook needs a per-tenant key (``lead_intake_api_key`` setting) instead of choosing any
    tenant, defaulting to tenant 1, and running without a key when the global env var is unset;
  * all datetimes are timezone-aware (the original wrote naive UTC, which sqlmodel 0.0.47 rejects).
"""
import json
import os
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

from database import ClientProfile, FollowUp, Lead, Task, User, engine
from addons.institute.models import (
    Attendance, Batch, Course, Enrollment, InstituteResource, InstituteSession, Instructor, InstructorFeedback,
    LeadDemoSession, LeadFollowUp, LeadWalkIn, LeadWebinar, PaymentRecord, Student, StudentNote, StudentSessionProgress,
    StudentUpload,
)
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["Institute"])


def get_session():
    with Session(engine) as session:
        yield session


# Shared helpers that live in main.py (imported lazily: main imports this package while it is loading).
def _require_roles(session, allowed_roles):
    from main import _require_roles as f
    return f(session, allowed_roles)


def _normalize_role(role):
    from main import _normalize_role as f
    return f(role)


def _notify_admins(*args, **kwargs):
    from main import _notify_admins as f
    return f(*args, **kwargs)


def _task_dict(*args, **kwargs):
    from main import _task_dict as f
    return f(*args, **kwargs)


def _user_dict(user):
    from main import _user_dict as f
    return f(user)


def _hash_password(password):
    from main import _hash_password as f
    return f(password)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """Aware UTC view of a stored datetime (rows written by older code are naive UTC)."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _parse_dt(value: str) -> datetime:
    """ISO date / datetime text -> timezone-aware UTC datetime (naive input is taken as UTC)."""
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _task_dicts(tasks: list[Task], session: Session) -> list[dict]:
    if not tasks:
        return []
    user_ids = set()
    client_ids = set()
    student_ids = set()
    batch_ids = set()
    for t in tasks:
        if t.assigned_to:
            user_ids.add(t.assigned_to)
        if t.created_by:
            user_ids.add(t.created_by)
        if t.client_id:
            client_ids.add(t.client_id)
        if t.student_id:
            student_ids.add(t.student_id)
        if t.batch_id:
            batch_ids.add(t.batch_id)

    users = {}
    if user_ids:
        users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    clients = {}
    if client_ids:
        clients = {c.id: c for c in session.exec(select(ClientProfile).where(ClientProfile.id.in_(client_ids))).all()}
    client_user_ids = {c.userId for c in clients.values() if c.userId}
    if client_user_ids:
        for u in session.exec(select(User).where(User.id.in_(client_user_ids))).all():
            users.setdefault(u.id, u)
    students = {}
    if student_ids:
        students = {s.id: s for s in session.exec(select(Student).where(Student.id.in_(student_ids))).all()}
    batches = {}
    if batch_ids:
        batches = {b.id: b for b in session.exec(select(Batch).where(Batch.id.in_(batch_ids))).all()}

    out = []
    for t in tasks:
        assignee = users.get(t.assigned_to) if t.assigned_to else None
        creator = users.get(t.created_by) if t.created_by else None
        client = clients.get(t.client_id) if t.client_id else None
        client_user = users.get(client.userId) if client and client.userId else None
        student = students.get(t.student_id) if t.student_id else None
        batch = batches.get(t.batch_id) if t.batch_id else None
        out.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date,
            "client_id": t.client_id,
            "lead_id": t.lead_id,
            "student_id": t.student_id,
            "student_name": student.name if student else None,
            "batch_id": t.batch_id,
            "batch_name": batch.batch_name if batch else None,
            "client_name": client_user.name if client_user else (client.companyName if client else None),
            "project_id": t.project_id,
            "assigned_to": t.assigned_to,
            "assignee_name": assignee.name if assignee else None,
            "created_by": t.created_by,
            "creator_name": creator.name if creator else None,
            "submission_url": getattr(t, "submission_url", None),
            "submission_file": getattr(t, "submission_file", None),
            "submission_notes": getattr(t, "submission_notes", None),
            "submitted_at": t.submitted_at.isoformat() if getattr(t, "submitted_at", None) else None,
            "is_submitted": bool(getattr(t, "submission_url", None) or getattr(t, "submission_file", None) or t.status == "Done"),
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        })
    return out


class WebsiteLeadIntakeRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    course: Optional[str] = None
    course_interest_id: Optional[int] = None
    source_page: Optional[str] = None
    page_title: Optional[str] = None
    form_name: Optional[str] = None
    message: Optional[str] = None
    notes: Optional[str] = None
    tenant_id: Optional[int] = None
    api_key: Optional[str] = None


class LeadDemoCreateRequest(BaseModel):
    scheduled_at: datetime
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class LeadDemoUpdateRequest(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class LeadWalkInCreateRequest(BaseModel):
    scheduled_at: datetime
    location: Optional[str] = None
    notes: Optional[str] = None


class LeadWalkInUpdateRequest(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class LeadWebinarCreateRequest(BaseModel):
    scheduled_at: datetime
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class LeadWebinarUpdateRequest(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class BackgroundDetailsUpdateRequest(BaseModel):
    details: Dict[str, str]


def _normalize_background_details(details: Dict[str, str]) -> Dict[str, str]:
    if len(details) > 50:
        raise HTTPException(status_code=422, detail="A maximum of 50 background fields is allowed")
    normalized = {}
    for raw_label, raw_value in details.items():
        label = str(raw_label).strip()
        value = str(raw_value).strip()
        if not label:
            raise HTTPException(status_code=422, detail="Background field names cannot be empty")
        if len(label) > 100 or len(value) > 4000:
            raise HTTPException(status_code=422, detail="Background field names are limited to 100 characters and values to 4000 characters")
        normalized[label] = value
    return normalized


@router.post("/leads/intake")
def intake_website_lead(
    body: WebsiteLeadIntakeRequest,
    request: Request,
    session: Session = Depends(get_session)
):
    """
    Public webhook/API endpoint for external websites (PHP, WordPress, etc.).
    Receives incoming form inquiries, sets source to 'Website', records the exact page URL,
    matches courses, and notifies team members.
    """
    # Multi-tenant hardening: the caller names its tenant, and must prove it with that tenant's own intake key
    # (setting ``lead_intake_api_key``). With no key configured the webhook is closed, so nobody can create leads
    # in a tenant that has not opted in, and there is no "default to tenant 1".
    import hmac
    from modules import features, tenant_settings

    target_tenant_id = body.tenant_id
    if not target_tenant_id:
        t_header = request.headers.get("X-Tenant-ID")
        target_tenant_id = int(t_header) if t_header and t_header.isdigit() else None
    if not target_tenant_id or target_tenant_id < 1:
        raise HTTPException(status_code=400, detail="tenant_id is required")
    tenant_key = tenant_settings.get_setting(target_tenant_id, "lead_intake_api_key")
    req_key = body.api_key or request.headers.get("X-API-Key") or ""
    if not tenant_key or not hmac.compare_digest(str(req_key), str(tenant_key)):
        raise HTTPException(status_code=401, detail="Invalid API key for lead intake")
    if not features.is_enabled(target_tenant_id, "institute"):
        raise HTTPException(status_code=403, detail="The Institute module is not enabled for this account.")
    current_tenant_id.set(target_tenant_id)

    # Match course by ID or name
    matched_course_id = body.course_interest_id
    matched_industry = None
    if not matched_course_id and body.course:
        course_name = body.course.strip()
        matched = session.exec(select(Course).where(func.lower(Course.title) == course_name.lower())).first()
        if not matched:
            matched = session.exec(select(Course).where(Course.title.ilike(f"%{course_name}%"))).first()
        if matched:
            matched_course_id = matched.id
            matched_industry = matched.category
        else:
            matched_industry = course_name

    # Build human-readable notes detailing the source page and form
    note_lines = []
    if body.form_name:
        note_lines.append(f"Form: {body.form_name}")
    if body.page_title:
        note_lines.append(f"Page Title: {body.page_title}")
    if body.source_page:
        note_lines.append(f"Page URL: {body.source_page}")
    user_msg = (body.message or body.notes or "").strip()
    if user_msg:
        note_lines.append(f"Message: {user_msg}")
    combined_notes = "\n".join(note_lines) if note_lines else None

    # Capture structured background details
    bg_details = {}
    if body.source_page:
        bg_details["source_page"] = body.source_page
    if body.page_title:
        bg_details["page_title"] = body.page_title
    if body.form_name:
        bg_details["form_name"] = body.form_name
    if body.course:
        bg_details["submitted_course"] = body.course
    referrer = request.headers.get("referer") or request.headers.get("referrer")
    if referrer and "source_page" not in bg_details:
        bg_details["referrer"] = referrer

    lead_website = (body.source_page or "").strip() or (referrer or None)

    lead = Lead(
        company_name=body.name.strip(),
        email=(body.email or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        source="Website",
        website=lead_website,
        status="New",
        course_interest_id=matched_course_id,
        industry=matched_industry,
        notes=combined_notes,
        background_details=bg_details if bg_details else None,
        tenant_id=target_tenant_id,
    )

    # Auto-assign to a salesperson immediately (performance-balanced round-robin)
    try:
        salesperson = _choose_revenue_balanced_salesperson(session)
        lead.owner_id = salesperson.id
    except Exception:
        pass  # If no salespersons available, leave unassigned

    session.add(lead)
    session.commit()
    try:
        session.refresh(lead, execution_options={"skip_tenant": True})
    except Exception:
        pass

    try:
        page_info = body.page_title or body.source_page or "Website"
        _notify_admins(
            session, target_tenant_id,
            title=f"🎯 New Website Lead: {lead.company_name}",
            message=f"From: {page_info} | Phone: {lead.phone or 'N/A'}",
            notif_type="info",
            link=f"/leads/{lead.id}"
        )
    except Exception:
        pass

    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Lead Added", lead.dict(), f"{base_url}/leads/{lead.id}")
    except Exception as e:
        print("WhatsApp Error:", e)

    return {
        "ok": True,
        "lead_id": lead.id,
        "name": lead.company_name,
        "source": lead.source,
        "source_page": lead.website,
        "course_interest_id": lead.course_interest_id,
        "assigned_to": lead.owner_id,
        "message": "Lead received and assigned successfully"
    }


def _require_lead_demo_access(lead: Optional[Lead], actor: User):
    if not lead or (lead.tenant_id and actor.role != "SuperAdmin" and lead.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    if actor.role == "SalesManager" and lead.owner_id != actor.id:
        raise HTTPException(status_code=403, detail="You can only manage demos for leads assigned to you")


def _lead_demo_dict(demo: LeadDemoSession):
    return {
        "id": demo.id,
        "lead_id": demo.lead_id,
        "scheduled_at": demo.scheduled_at.isoformat(),
        "status": demo.status,
        "meeting_url": demo.meeting_url,
        "notes": demo.notes,
        "created_at": demo.created_at.isoformat(),
    }


@router.get("/leads/{lead_id}/demo-sessions")
def list_lead_demo_sessions(lead_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    lead = session.get(Lead, lead_id)
    _require_lead_demo_access(lead, actor)
    demos = session.exec(select(LeadDemoSession).where(LeadDemoSession.lead_id == lead_id).order_by(LeadDemoSession.scheduled_at.desc())).all()
    return {"demo_sessions": [_lead_demo_dict(demo) for demo in demos]}


@router.post("/leads/{lead_id}/demo-sessions")
def schedule_lead_demo(lead_id: int, body: LeadDemoCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    lead = session.get(Lead, lead_id)
    _require_lead_demo_access(lead, actor)
    demo = LeadDemoSession(
        tenant_id=lead.tenant_id or actor.tenant_id,
        lead_id=lead_id,
        scheduled_at=body.scheduled_at,
        meeting_url=(body.meeting_url or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_by=actor.id,
    )
    lead.status = "Demo"
    session.add(demo)
    session.add(lead)
    session.commit()
    session.refresh(demo)
    return {"demo_session": _lead_demo_dict(demo)}


@router.patch("/lead-demo-sessions/{demo_session_id}")
def update_lead_demo_session(demo_session_id: int, body: LeadDemoUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    demo = session.get(LeadDemoSession, demo_session_id)
    if not demo:
        raise HTTPException(status_code=404, detail="Demo session not found")
    lead = session.get(Lead, demo.lead_id)
    _require_lead_demo_access(lead, actor)
    data = body.dict(exclude_unset=True)
    if data.get("status") not in (None, "Scheduled", "Attended", "Missed", "Not Attended", "Cancelled"):
        raise HTTPException(status_code=422, detail="Choose Scheduled, Attended, Missed, Not Attended, or Cancelled")
    for key, value in data.items():
        setattr(demo, key, value)
    demo.updated_at = _utcnow()
    session.add(demo)
    if data.get("status") in ("Missed", "Not Attended"):
        lead.status = "Webinar Not Attended"
        session.add(lead)
    elif data.get("status") == "Attended":
        lead.status = "Webinar Attended"
        session.add(lead)
    session.commit()
    session.refresh(demo)
    return {"demo_session": _lead_demo_dict(demo)}


LEAD_STAGES = [
    "New",
    "Contacted",
    "Not Responded",
    "Follow-up",
    "Webinar Scheduled",
    "Webinar Attended",
    "Webinar Not Attended",
    "Walk-in Scheduled",
    "Walk-in Attended",
    "Walk-in Not Attended",
    "Converted",
    "Lost",
]


_SALES_SCOPED_ROLES = ("Employee", "Intern", "SalesManager", "Sales", "Demo")


_LEAD_SCHEDULE_ROLES = ["Admin", "Employee", "Intern", "SalesManager", "Sales", "Demo"]


class LeadFollowUpCreateRequest(BaseModel):
    scheduled_at: datetime
    notes: Optional[str] = None
    tz_offset: Optional[int] = None  # JS getTimezoneOffset(); a naive scheduled_at is the scheduler's local time


class LeadFollowUpUpdateRequest(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class LeadStatusRequest(BaseModel):
    status: str


def _require_lead_schedule_access(lead: Optional[Lead], actor: User):
    if not lead or (lead.tenant_id and actor.role != "SuperAdmin" and lead.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    if _normalize_role(actor.role) in _SALES_SCOPED_ROLES and lead.owner_id != actor.id:
        raise HTTPException(status_code=403, detail="You can only manage leads assigned to you")


def _lead_followup_dict(fu: LeadFollowUp):
    return {
        "id": fu.id,
        "lead_id": fu.lead_id,
        "scheduled_at": fu.scheduled_at.isoformat(),
        "status": fu.status,
        "notes": fu.notes,
        "created_at": fu.created_at.isoformat(),
    }


def _local_to_utc(value: datetime, tz_offset: Optional[int]) -> datetime:
    """A datetime-local value from the browser (naive = the user's wall clock) as aware UTC."""
    from modules import followups_core as fcore
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc)
    east = -tz_offset if tz_offset is not None else fcore.default_tz_offset_minutes()
    return value.replace(tzinfo=timezone(timedelta(minutes=east))).astimezone(timezone.utc)


def _unified_followup_dict(fu: FollowUp) -> dict:
    """_lead_followup_dict's shape for a follow-up kept in crm_follow_ups (routers/followups.py)."""
    from modules import followups_core as fcore
    return {
        "id": fu.id,
        "lead_id": fu.lead_id,
        "scheduled_at": fcore.as_utc(fu.due_at).isoformat(),
        "status": fu.status,
        "notes": fu.notes,
        "created_at": fcore.as_utc(fu.created_at).isoformat(),
        "source": "followups",
    }


@router.post("/leads/{lead_id}/follow-ups")
def schedule_lead_followup(lead_id: int, body: LeadFollowUpCreateRequest, session: Session = Depends(get_session)):
    """Schedule a follow-up call with a lead. Follow-ups are unified on the Follow-ups system, so this
    creates a follow_ups row (Follow-ups page and tab, reminders, AI); older lead_follow_ups rows stay
    editable through PATCH /lead-follow-ups/{id} until they are closed."""
    from modules import followups_core as fcore
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    lead = session.get(Lead, lead_id)
    _require_lead_schedule_access(lead, actor)
    due = _local_to_utc(body.scheduled_at, body.tz_offset)
    info = fcore.record_info(session, lead.id, None)
    fu = FollowUp(
        tenant_id=lead.tenant_id or actor.tenant_id,
        lead_id=lead_id,
        contact_name=info.get("contact_name"),
        contact_email=info.get("contact_email"),
        company_name=info.get("label"),
        title=f"Follow-up call: {lead.company_name or 'lead'}"[:500],
        notes=(body.notes or "").strip() or None,
        channel="call",
        due_at=due,
        remind_at=due,
        assigned_to=lead.owner_id or actor.id,
        created_by=actor.id,
        source="manual",
    )
    lead.status = "Follow-up"
    session.add(fu)
    session.add(lead)
    session.flush()
    fcore.log_activity(session, fu, "Follow-up scheduled", f"Due {due.date().isoformat()} via call", actor.id)
    if fu.assigned_to != actor.id:
        fcore.notify(session, fu.assigned_to, fu.tenant_id, f"New follow-up assigned: {fu.title}",
                     f"{actor.name or actor.email} scheduled a follow-up for {due.date().isoformat()}.",
                     fcore.record_path(fu.lead_id, None))
    session.commit()
    session.refresh(fu)
    return {"follow_up": _unified_followup_dict(fu)}


@router.patch("/lead-follow-ups/{follow_up_id}")
def update_lead_followup(follow_up_id: int, body: LeadFollowUpUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    fu = session.get(LeadFollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _require_lead_schedule_access(session.get(Lead, fu.lead_id), actor)
    data = body.dict(exclude_unset=True)
    if data.get("status") not in (None, "Pending", "Done", "Cancelled"):
        raise HTTPException(status_code=422, detail="Choose Pending, Done, or Cancelled")
    for key, value in data.items():
        setattr(fu, key, value)
    fu.updated_at = _utcnow()
    session.add(fu)
    session.commit()
    session.refresh(fu)
    return {"follow_up": _lead_followup_dict(fu)}


def _lead_walkin_dict(wk: LeadWalkIn):
    return {
        "id": wk.id,
        "lead_id": wk.lead_id,
        "scheduled_at": wk.scheduled_at.isoformat(),
        "status": wk.status,
        "location": wk.location,
        "notes": wk.notes,
        "created_at": wk.created_at.isoformat(),
    }


@router.post("/leads/{lead_id}/walk-ins")
def schedule_lead_walkin(lead_id: int, body: LeadWalkInCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    lead = session.get(Lead, lead_id)
    _require_lead_schedule_access(lead, actor)
    wk = LeadWalkIn(
        tenant_id=lead.tenant_id or actor.tenant_id,
        lead_id=lead_id,
        scheduled_at=body.scheduled_at,
        location=(body.location or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_by=actor.id,
        status="Scheduled",
    )
    lead.status = "Walk-in Scheduled"
    session.add(wk)
    session.add(lead)
    session.commit()
    session.refresh(wk)
    return {"walk_in": _lead_walkin_dict(wk)}


@router.patch("/lead-walk-ins/{walk_in_id}")
def update_lead_walkin(walk_in_id: int, body: LeadWalkInUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    wk = session.get(LeadWalkIn, walk_in_id)
    if not wk:
        raise HTTPException(status_code=404, detail="Walk-in record not found")
    lead = session.get(Lead, wk.lead_id)
    _require_lead_schedule_access(lead, actor)
    data = body.dict(exclude_unset=True)
    if data.get("status") not in (None, "Scheduled", "Attended", "Not Attended", "Missed", "Cancelled"):
        raise HTTPException(status_code=422, detail="Choose Scheduled, Attended, Not Attended, Missed, or Cancelled")
    for key, value in data.items():
        setattr(wk, key, value)
    wk.updated_at = _utcnow()
    session.add(wk)
    if data.get("status") == "Attended":
        lead.status = "Walk-in Attended"
        session.add(lead)
    elif data.get("status") in ("Not Attended", "Missed"):
        lead.status = "Walk-in Not Attended"
        session.add(lead)
    session.commit()
    session.refresh(wk)
    return {"walk_in": _lead_walkin_dict(wk)}


def _lead_webinar_dict(wb: LeadWebinar):
    return {
        "id": wb.id,
        "lead_id": wb.lead_id,
        "scheduled_at": wb.scheduled_at.isoformat(),
        "status": wb.status,
        "meeting_url": wb.meeting_url,
        "notes": wb.notes,
        "created_at": wb.created_at.isoformat(),
    }


@router.post("/leads/{lead_id}/webinars")
def schedule_lead_webinar(lead_id: int, body: LeadWebinarCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    lead = session.get(Lead, lead_id)
    _require_lead_schedule_access(lead, actor)
    wb = LeadWebinar(
        tenant_id=lead.tenant_id or actor.tenant_id,
        lead_id=lead_id,
        scheduled_at=body.scheduled_at,
        meeting_url=(body.meeting_url or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_by=actor.id,
        status="Scheduled",
    )
    lead.status = "Webinar Scheduled"
    session.add(wb)
    session.add(lead)
    session.commit()
    session.refresh(wb)
    return {"webinar": _lead_webinar_dict(wb)}


@router.patch("/lead-webinars/{webinar_id}")
def update_lead_webinar(webinar_id: int, body: LeadWebinarUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    wb = session.get(LeadWebinar, webinar_id)
    if not wb:
        raise HTTPException(status_code=404, detail="Webinar record not found")
    lead = session.get(Lead, wb.lead_id)
    _require_lead_schedule_access(lead, actor)
    data = body.dict(exclude_unset=True)
    if data.get("status") not in (None, "Scheduled", "Attended", "Not Attended", "Missed", "Cancelled"):
        raise HTTPException(status_code=422, detail="Choose Scheduled, Attended, Not Attended, Missed, or Cancelled")
    for key, value in data.items():
        setattr(wb, key, value)
    wb.updated_at = _utcnow()
    session.add(wb)
    if data.get("status") == "Attended":
        lead.status = "Webinar Attended"
        session.add(lead)
    elif data.get("status") in ("Not Attended", "Missed"):
        lead.status = "Webinar Not Attended"
        session.add(lead)
    session.commit()
    session.refresh(wb)
    return {"webinar": _lead_webinar_dict(wb)}


@router.patch("/leads/{lead_id}/status")
def update_lead_stage(lead_id: int, body: LeadStatusRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    lead = session.get(Lead, lead_id)
    _require_lead_schedule_access(lead, actor)
    if body.status not in LEAD_STAGES:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(LEAD_STAGES)}")
    if body.status == "Converted" and not (lead.is_converted or lead.converted_student_id):
        raise HTTPException(status_code=422, detail="Enroll the lead as a student to mark it Converted")
    lead.status = body.status
    if body.status == "Lost":
        now = _utcnow()
        for fu in session.exec(select(LeadFollowUp).where(LeadFollowUp.lead_id == lead_id, LeadFollowUp.status == "Pending")).all():
            fu.status = "Cancelled"
            fu.updated_at = now
            session.add(fu)
        for fu in session.exec(select(FollowUp).where(FollowUp.lead_id == lead_id, FollowUp.status == "Pending")).all():
            fu.status = "Cancelled"
            fu.completed_at = fu.updated_at = datetime.now(timezone.utc)
            fu.completed_by = actor.id
            session.add(fu)
        for dm in session.exec(select(LeadDemoSession).where(LeadDemoSession.lead_id == lead_id, LeadDemoSession.status == "Scheduled")).all():
            dm.status = "Cancelled"
            dm.updated_at = now
            session.add(dm)
        for wb in session.exec(select(LeadWebinar).where(LeadWebinar.lead_id == lead_id, LeadWebinar.status == "Scheduled")).all():
            wb.status = "Cancelled"
            wb.updated_at = now
            session.add(wb)
    session.add(lead)
    session.commit()
    return {"ok": True, "status": lead.status}


def _schedule_followup_items(session: Session, actor: User, include_done: bool) -> list:
    """Important Dates rows for the Follow-ups system: every follow-up the actor may see on /followups (the same
    scope), whether it is linked to a lead, a student, a client or only a contact, each with its record."""
    from modules import followups_core as fcore
    from routers import followups as followups_api, inbox as inbox_api
    role = inbox_api._role_of(actor)
    full = (role == "SuperAdmin" or (actor.email or "").lower() == "admin@serphawk.com"
            or role in inbox_api.FULL_ACCESS_ROLES)
    viewer = inbox_api.Viewer(user=actor, role=role, full_access=full,
                              tenant_id=current_tenant_id.get() if role == "SuperAdmin" else actor.tenant_id)
    stmt = followups_api._scope(select(FollowUp), viewer)
    if not include_done:
        stmt = stmt.where(FollowUp.status == fcore.OPEN)
    rows = session.exec(stmt.order_by(FollowUp.due_at).limit(500)).all()
    names = followups_api._names(session, rows)
    lead_ids = {f.lead_id for f in rows if f.lead_id}
    # Follow-ups of students (the email stack's third record kind) exist only where follow_ups has student_id.
    student_ids = {getattr(f, "student_id", None) for f in rows if getattr(f, "student_id", None)}
    leads = {l.id: l for l in session.exec(select(Lead).where(Lead.id.in_(lead_ids))).all()} if lead_ids else {}
    students = {st.id: st for st in session.exec(select(Student).where(Student.id.in_(student_ids))).all()} if student_ids else {}
    local_tz = timezone(timedelta(minutes=fcore.default_tz_offset_minutes()))
    items = []
    for fu in rows:
        fu_student_id = getattr(fu, "student_id", None)
        if fu_student_id:
            record = {"type": "student", "id": fu_student_id, "name": names.get("students", {}).get(fu_student_id)}
        elif fu.client_id:
            record = {"type": "client", "id": fu.client_id, "name": names["clients"].get(fu.client_id)}
        elif fu.lead_id:
            record = {"type": "lead", "id": fu.lead_id, "name": names["leads"].get(fu.lead_id)}
        else:
            record = None
        lead, student = leads.get(fu.lead_id), students.get(fu_student_id)
        due = fcore.as_utc(fu.due_at)
        items.append({
            "id": fu.id, "type": "followup", "source": "followups", "record": record,
            "lead_id": fu.lead_id,
            "lead_name": (record or {}).get("name") or fu.contact_name or fu.company_name or fu.contact_email or fu.title,
            "phone": (student.phone if student else None) or (lead.phone if lead else None),
            "email": fu.contact_email,
            "course": student.course_interest if student else None,
            "owner_id": fu.assigned_to, "owner_name": names["users"].get(fu.assigned_to),
            "lead_status": lead.status if lead else None,
            "scheduled_at": due.isoformat(), "status": fu.status, "notes": fu.notes, "title": fu.title,
            "channel": fu.channel, "meeting_url": None,
            "_ts": due,
        })
    return items


@router.get("/schedule/upcoming")
def get_upcoming_schedule(kind: str = "all", include_done: bool = False, session: Session = Depends(get_session)):
    """Scheduled follow-ups, webinars and walk-ins, nearest first. Sales roles only see their own leads (and
    the follow-ups /followups shows them)."""
    actor = _require_roles(session, _LEAD_SCHEDULE_ROLES)
    lead_q = select(Lead)
    if _normalize_role(actor.role) in _SALES_SCOPED_ROLES:
        lead_q = lead_q.where(Lead.owner_id == actor.id)
    tenant_id = current_tenant_id.get()
    if tenant_id and tenant_id != 1:
        lead_q = lead_q.where(Lead.tenant_id == tenant_id)
    leads = {l.id: l for l in session.exec(lead_q).all()}
    lead_ids = list(leads.keys())
    owner_ids = list({l.owner_id for l in leads.values() if l.owner_id})
    owners = {u.id: u.name for u in session.exec(select(User).where(User.id.in_(owner_ids))).all()} if owner_ids else {}
    course_ids = list({l.course_interest_id for l in leads.values() if l.course_interest_id})
    courses = {c.id: c.title for c in session.exec(select(Course).where(Course.id.in_(course_ids))).all()} if course_ids else {}

    items = []

    def _base(lead: Lead):
        return {
            "lead_id": lead.id,
            "lead_name": lead.company_name,
            "phone": lead.phone,
            "email": lead.email,
            "course": courses.get(lead.course_interest_id),
            "owner_id": lead.owner_id,
            "owner_name": owners.get(lead.owner_id),
            "lead_status": lead.status,
        }

    if kind in ("all", "followup"):
        # Follow-ups live in two tables: lead_follow_ups (scheduled before the Follow-ups system, kept until
        # closed; source "legacy") and crm_follow_ups (source "followups"). The page updates each through its own
        # API, so every row says where it came from.
        fq = select(LeadFollowUp).where(LeadFollowUp.lead_id.in_(lead_ids))
        if not include_done:
            fq = fq.where(LeadFollowUp.status == "Pending")
        for fu in session.exec(fq).all():
            items.append({**_base(leads[fu.lead_id]), "id": fu.id, "type": "followup", "source": "legacy",
                          "scheduled_at": fu.scheduled_at.isoformat(), "status": fu.status, "notes": fu.notes,
                          "meeting_url": None, "_ts": fu.scheduled_at})
        items += _schedule_followup_items(session, actor, include_done)
    if kind in ("all", "webinar", "demo"):
        wb_q = select(LeadWebinar).where(LeadWebinar.lead_id.in_(lead_ids))
        if not include_done:
            wb_q = wb_q.where(LeadWebinar.status == "Scheduled")
        for wb in session.exec(wb_q).all():
            items.append({**_base(leads[wb.lead_id]), "id": wb.id, "type": "webinar", "scheduled_at": wb.scheduled_at.isoformat(),
                          "status": wb.status, "notes": wb.notes, "meeting_url": wb.meeting_url, "location": None, "_ts": wb.scheduled_at})
        dq = select(LeadDemoSession).where(LeadDemoSession.lead_id.in_(lead_ids))
        if not include_done:
            dq = dq.where(LeadDemoSession.status == "Scheduled")
        for dm in session.exec(dq).all():
            items.append({**_base(leads[dm.lead_id]), "id": dm.id, "type": "webinar", "scheduled_at": dm.scheduled_at.isoformat(),
                          "status": dm.status, "notes": dm.notes, "meeting_url": dm.meeting_url, "location": None, "_ts": dm.scheduled_at})
    if kind in ("all", "walkin"):
        wq = select(LeadWalkIn).where(LeadWalkIn.lead_id.in_(lead_ids))
        if not include_done:
            wq = wq.where(LeadWalkIn.status == "Scheduled")
        for wk in session.exec(wq).all():
            items.append({**_base(leads[wk.lead_id]), "id": wk.id, "type": "walkin", "scheduled_at": wk.scheduled_at.isoformat(),
                          "status": wk.status, "notes": wk.notes, "meeting_url": None, "location": wk.location, "_ts": wk.scheduled_at})
    items.sort(key=lambda i: _as_utc(i["_ts"]))
    for i in items:
        i.pop("_ts", None)
    return {"items": items}


@router.get("/leads/sources/analytics")
def get_lead_sources_analytics(session: Session = Depends(get_session)):
    """Comprehensive analytics on lead sources: counts, conversions, win rate %, and recent inquiries."""
    actor = _require_roles(session, ["Admin", "SalesManager", "Employee", "Intern", "Demo", "Sales"])
    lead_q = select(Lead)
    if _normalize_role(actor.role) in _SALES_SCOPED_ROLES:
        lead_q = lead_q.where(Lead.owner_id == actor.id)
    tenant_id = current_tenant_id.get()
    if tenant_id and tenant_id != 1:
        lead_q = lead_q.where(Lead.tenant_id == tenant_id)

    leads = session.exec(lead_q.order_by(Lead.created_at.desc())).all()
    total_leads = len(leads)

    source_buckets = {}
    for l in leads:
        src = (l.source or "Website").strip() or "Website"
        b = source_buckets.setdefault(src, {"total": 0, "converted": 0, "lost": 0, "active": 0})
        b["total"] += 1
        is_conv = bool(l.is_converted or l.converted_student_id or (l.status or "") == "Converted")
        is_lost = bool((l.status or "").lower() == "lost")
        if is_conv:
            b["converted"] += 1
        elif is_lost:
            b["lost"] += 1
        else:
            b["active"] += 1

    sources_list = []
    for src, b in sorted(source_buckets.items(), key=lambda x: -x[1]["total"]):
        wr = round((b["converted"] / b["total"]) * 100, 1) if b["total"] > 0 else 0.0
        share = round((b["total"] / total_leads) * 100, 1) if total_leads > 0 else 0.0
        sources_list.append({
            "source": src,
            "total": b["total"],
            "converted": b["converted"],
            "lost": b["lost"],
            "active": b["active"],
            "win_rate": wr,
            "inquiry_share": share,
        })

    total_converted = sum(b["converted"] for b in source_buckets.values())
    total_lost = sum(b["lost"] for b in source_buckets.values())
    overall_win_rate = round((total_converted / total_leads) * 100, 1) if total_leads > 0 else 0.0

    best_source = max(sources_list, key=lambda s: (s["win_rate"], s["converted"]))["source"] if sources_list else None

    recent = []
    for l in leads[:25]:
        recent.append({
            "id": l.id,
            "company_name": l.company_name,
            "source": l.source or "Website",
            "status": l.status or "New",
            "is_converted": bool(l.is_converted or l.converted_student_id),
            "website": l.website,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })

    return {
        "summary": {
            "total_leads": total_leads,
            "total_converted": total_converted,
            "total_lost": total_lost,
            "overall_win_rate": overall_win_rate,
            "best_source": best_source,
        },
        "sources": sources_list,
        "recent": recent,
    }


@router.patch("/leads/{lead_id}/background-details")
def update_lead_background_details(lead_id: int, body: BackgroundDetailsUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    lead = session.get(Lead, lead_id)
    if not lead or (lead.tenant_id and actor.role != "SuperAdmin" and lead.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    if actor.role == "SalesManager" and lead.owner_id != actor.id:
        raise HTTPException(status_code=403, detail="You can only edit background details for leads assigned to you")
    details = _normalize_background_details(body.details)
    lead.background_details = details
    session.add(lead)
    if lead.converted_student_id:
        student = session.get(Student, lead.converted_student_id)
        if student:
            student.background_details = details
            session.add(student)
    session.commit()
    return {"background_details": details}


class LeadStudentEnrollmentRequest(BaseModel):
    batch_id: int
    discount: Optional[float] = 0.0
    discount_reason: Optional[str] = None


@router.post("/leads/{lead_id}/convert-to-student")
def convert_lead_to_student(
    lead_id: int,
    body: Optional[LeadStudentEnrollmentRequest] = None,
    session: Session = Depends(get_session),
):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    lead = session.get(Lead, lead_id)
    if not lead or (lead.tenant_id and actor.role != "SuperAdmin" and lead.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    batch = session.get(Batch, body.batch_id) if body else None
    course = session.get(Course, batch.course_id) if batch else None
    if body and (not batch or not course):
        raise HTTPException(status_code=404, detail="Batch or course not found")
    if batch and (
        (batch.tenant_id and actor.tenant_id and batch.tenant_id != actor.tenant_id)
        or (batch.tenant_id and lead.tenant_id and batch.tenant_id != lead.tenant_id)
    ):
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch and (not course.is_active or batch.status in ("Completed", "Cancelled")):
        raise HTTPException(status_code=409, detail="This batch is not accepting enrollments")

    student = session.get(Student, lead.converted_student_id) if lead.converted_student_id else None
    if not student:
        student = session.exec(select(Student).where(Student.lead_id == lead.id)).first()
    if not student:
        interest_course = course or (session.get(Course, lead.course_interest_id) if lead.course_interest_id else None)
        student = Student(
            tenant_id=lead.tenant_id or actor.tenant_id,
            lead_id=lead.id,
            name=lead.company_name,
            email=lead.email,
            phone=lead.phone,
            address=lead.address,
            course_interest=interest_course.title if interest_course else lead.industry,
            course_interest_id=interest_course.id if interest_course else lead.course_interest_id,
            gpa=lead.gpa,
            education_level=lead.education_level,
            academic_background=lead.academic_background,
            background_details=lead.background_details,
            career_goal=lead.career_goal,
            course_plan=lead.course_plan,
            source=lead.source,
            assigned_salesperson_id=lead.owner_id,
            notes=lead.notes,
        )
        session.add(student)
        session.flush()
    else:
        if not student.assigned_salesperson_id:
            student.assigned_salesperson_id = lead.owner_id
        if batch:
            student.course_interest = course.title
            student.course_interest_id = course.id
    if not student.background_details and lead.background_details:
        student.background_details = lead.background_details

    enrollment = None
    if batch:
        enrollment = session.exec(
            select(Enrollment).where(
                Enrollment.student_id == student.id,
                Enrollment.batch_id == batch.id,
                Enrollment.status == "Active",
            )
        ).first()
        if not enrollment:
            active_count = session.exec(
                select(func.count(Enrollment.id)).where(
                    Enrollment.batch_id == batch.id,
                    Enrollment.status == "Active",
                )
            ).first() or 0
            if active_count >= batch.max_seats:
                raise HTTPException(status_code=409, detail="This batch has reached its seat limit")
            import random
            import string

            total_fee = course.price or 0.0
            discount_val = max(0.0, float(body.discount or 0.0)) if body else 0.0
            discount_reason_val = body.discount_reason if body else None
            amount_due = max(0.0, total_fee - discount_val)
            enrollment = Enrollment(
                tenant_id=student.tenant_id or actor.tenant_id,
                student_id=student.id,
                batch_id=batch.id,
                course_id=course.id,
                total_fee=total_fee,
                discount=discount_val,
                discount_reason=discount_reason_val,
                amount_paid=0.0,
                amount_due=amount_due,
                payment_status="Pending" if amount_due > 0 else "Paid",
                enrolled_by=_student_salesperson_id(student, session) or actor.id,
                slip_number="ADM-" + "".join(random.choices(string.digits, k=6)),
                notes=f"Enrolled from lead #{lead.id}",
            )
            session.add(enrollment)

    lead.converted_student_id = student.id
    lead.is_converted = True
    lead.status = "Enrolled"
    session.add(lead)
    session.commit()
    return {
        "message": "Lead enrolled as a student" if batch else "Lead converted to student",
        "student_id": student.id,
        "enrollment_id": enrollment.id if enrollment else None,
    }


@router.post("/leads/{lead_id}/course-plan")
def generate_lead_course_plan(lead_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager"])
    lead = session.get(Lead, lead_id)
    if not lead or (lead.tenant_id and actor.role != "SuperAdmin" and lead.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    courses = session.exec(select(Course).where(Course.is_active == True).order_by(Course.title)).all()
    if not courses:
        raise HTTPException(status_code=409, detail="Add an active course to the catalog before generating a course plan")
    import re

    stop_words = {"and", "for", "the", "with", "from", "into", "their", "that", "this", "have", "has", "who", "your", "role"}

    def terms(value):
        return {word for word in re.findall(r"[a-z0-9]+", str(value or "").lower()) if len(word) > 2 and word not in stop_words}

    interest_terms = terms(lead.industry)
    goal_terms = terms(lead.career_goal)
    background_terms = terms(lead.academic_background)
    academic_terms = terms(f"{lead.education_level or ''} {lead.academic_background or ''}")
    profile_fields = [lead.education_level, lead.gpa, lead.academic_background, lead.career_goal, lead.industry]
    profile_completeness = round(sum(value is not None and str(value).strip() != "" for value in profile_fields) / len(profile_fields) * 100)

    def overlap_percent(source_terms, course_terms, default):
        if not source_terms:
            return default
        return round(len(source_terms & course_terms) / len(source_terms) * 100)

    scored_courses = []
    for course in courses:
        course_text = " ".join((course.title or "", course.category or "", course.description or "", course.prerequisites or "", str(course.syllabus or "")))
        course_terms = terms(course_text)
        category_text = f"{course.title or ''} {course.category or ''}".lower()
        interest_text = (lead.industry or "").lower()
        interest_score = 100 if interest_text and interest_text in category_text else overlap_percent(interest_terms, course_terms, 45)
        goal_score = overlap_percent(goal_terms, course_terms, 40)
        background_score = overlap_percent(background_terms, course_terms, 40)

        prerequisite_text = (course.prerequisites or "").lower()
        if not prerequisite_text or any(term in prerequisite_text for term in ("no prerequisite", "no experience", "beginner", "not required")):
            prerequisite_score = 90
        else:
            prerequisite_score = overlap_percent(terms(prerequisite_text), academic_terms, 45)
        gpa_score = round(min(100, max(0, float(lead.gpa) * 10))) if lead.gpa is not None else 50
        academic_score = round(prerequisite_score * 0.7 + gpa_score * 0.3)
        dimensions = {
            "interest_match": interest_score,
            "career_goal_alignment": goal_score,
            "background_relevance": background_score,
            "academic_readiness_evidence": academic_score,
        }
        fit_score = round(
            interest_score * 0.3
            + goal_score * 0.3
            + background_score * 0.25
            + academic_score * 0.15
        )
        scored_courses.append({
            "course_id": course.id,
            "course_title": course.title,
            "category": course.category,
            "duration_weeks": course.duration_weeks,
            "duration_hours": course.duration_hours,
            "prerequisites": course.prerequisites,
            "fit_score_percent": fit_score,
            "fit_dimensions": dimensions,
        })

    scored_courses.sort(key=lambda item: (-item["fit_score_percent"], item["course_title"].lower()))
    selected_course = session.get(Course, lead.course_interest_id) if lead.course_interest_id else None
    if selected_course and not selected_course.is_active:
        selected_course = None
    if not selected_course:
        selected_course = next(course for course in courses if course.id == scored_courses[0]["course_id"])
    selected_fit = next(item for item in scored_courses if item["course_id"] == selected_course.id)
    duration_weeks = selected_course.duration_weeks or 12
    first_phase_end = max(1, round(duration_weeks / 3))
    second_phase_end = max(first_phase_end + 1, round(duration_weeks * 2 / 3))
    readiness_gaps = []
    if not lead.education_level:
        readiness_gaps.append("Confirm the learner's highest completed education level.")
    if lead.gpa is None:
        readiness_gaps.append("Add GPA or another academic-readiness signal if relevant to this course.")
    if not lead.academic_background:
        readiness_gaps.append("Record prior study, work experience, and practical skills.")
    if not lead.career_goal:
        readiness_gaps.append("Clarify the target role or outcome before finalizing the course recommendation.")
    if not lead.industry:
        readiness_gaps.append("Confirm the learner's course or subject interest.")

    course_catalog = [{
        "id": course.id,
        "title": course.title,
        "category": course.category,
        "description": course.description,
        "prerequisites": course.prerequisites,
        "duration_hours": course.duration_hours,
        "duration_weeks": course.duration_weeks,
    } for course in courses]
    plan = {
        "course_id": selected_course.id,
        "course_title": selected_course.title,
        "fit_score_percent": selected_fit["fit_score_percent"],
        "fit_dimensions": selected_fit["fit_dimensions"],
        "profile_completeness_percent": profile_completeness,
        "profile_evidence": {
            "education_level": lead.education_level,
            "gpa": lead.gpa,
            "academic_background": lead.academic_background,
            "career_goal": lead.career_goal,
            "course_interest": lead.industry,
        },
        "recommended_courses": scored_courses[:3],
        "learning_roadmap": [
            {"phase": "Foundations and diagnostic", "weeks": f"1-{first_phase_end}", "focus": "Confirm prerequisites, set a baseline, and close essential knowledge gaps."},
            {"phase": "Guided practice", "weeks": f"{first_phase_end + 1}-{second_phase_end}", "focus": "Practice core skills with feedback and progressively realistic exercises."},
            {"phase": "Portfolio and next steps", "weeks": f"{second_phase_end + 1}-{duration_weeks}", "focus": "Complete a course-relevant project and review next learning or career steps."},
        ],
        "readiness_gaps": readiness_gaps,
        "fit_reason": f"{selected_course.title} is compared with the learner's recorded interest, background, career goal, education, and GPA. The fit score is a guidance signal, not an outcome prediction.",
        "pain_points": readiness_gaps or ["Confirm available weekly study time and preferred learning support."],
        "pitch": f"Connect {selected_course.title} to the learner's goal of {lead.career_goal or 'building new skills'} through guided practice, feedback, and a portfolio-ready project. Confirm schedule and prerequisites before enrollment.",
        "opportunities": ["Build a portfolio project using course skills", "Practice role-specific tasks with instructor feedback", "Review suitable next learning steps without promising placement or income"],
        "next_questions": ["What weekly study time is realistic?", "Which prior experience should the course build on?", "What evidence of progress would be useful to the learner?"],
        "generated_by": "fallback",
    }
    prompt = (
        "Create ethical, specific education-course guidance from the supplied learner profile and course catalog. "
        "Do not claim guaranteed jobs, salaries, admission, or outcomes. Return JSON with keys fit_reason (string), "
        "pain_points (array of strings), pitch (string), opportunities (array of strings), and next_questions (array of strings). "
        f"Learner: {json.dumps({'name': lead.company_name, 'education_level': lead.education_level, 'gpa': lead.gpa, 'background': lead.academic_background, 'goal': lead.career_goal, 'notes': lead.notes, 'interest': lead.industry, 'selected_course_id': selected_course.id})}\n"
        f"Catalog: {json.dumps(course_catalog)}"
    )
    try:
        from modules.llm_engine import get_openai_client
        response = get_openai_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=700,
            response_format={"type": "json_object"},
        )
        generated = json.loads(response.choices[0].message.content or "{}")
        for key in ("fit_reason", "pain_points", "pitch", "opportunities", "next_questions"):
            if key in generated:
                plan[key] = generated[key]
        plan["generated_by"] = "ai"
    except Exception as error:
        print(f"Lead course-plan AI fallback for lead {lead.id}: {error}")

    lead.course_interest_id = selected_course.id
    lead.industry = selected_course.category or lead.industry
    lead.course_plan = plan
    session.add(lead)
    session.commit()
    return {"course_plan": plan}


class CourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    duration_weeks: Optional[int] = None
    duration_hours: Optional[int] = None
    price: float = 0.0
    advance_amount: float = 0.0
    prerequisites: Optional[str] = None
    syllabus: Optional[Any] = None
    thumbnail_url: Optional[str] = None
    is_active: bool = True


class CourseUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    duration_weeks: Optional[int] = None
    duration_hours: Optional[int] = None
    price: Optional[float] = None
    advance_amount: Optional[float] = None
    prerequisites: Optional[str] = None
    syllabus: Optional[Any] = None
    thumbnail_url: Optional[str] = None
    is_active: Optional[bool] = None


class InstructorCreateRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    photo_url: Optional[str] = None
    user_id: Optional[int] = None


class InstructorUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    photo_url: Optional[str] = None
    is_active: Optional[bool] = None


class BatchCreateRequest(BaseModel):
    course_id: int
    instructor_id: Optional[int] = None
    batch_name: str
    batch_code: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    schedule: Optional[str] = None
    session_duration_hours: int = 1
    auto_assign_instructor: bool = False
    assignment_strategy: str = "round_robin"
    mode: str = "Offline"
    max_seats: int = 30
    status: str = "Upcoming"
    room_or_link: Optional[str] = None
    notes: Optional[str] = None


class BatchUpdateRequest(BaseModel):
    instructor_id: Optional[int] = None
    batch_name: Optional[str] = None
    batch_code: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    schedule: Optional[str] = None
    session_duration_hours: Optional[int] = None
    assignment_strategy: Optional[str] = None
    mode: Optional[str] = None
    max_seats: Optional[int] = None
    status: Optional[str] = None
    room_or_link: Optional[str] = None
    notes: Optional[str] = None


class BatchStudentsRequest(BaseModel):
    student_ids: List[int]


class StudentCreateRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    course_interest: Optional[str] = None
    course_interest_id: Optional[int] = None
    gpa: Optional[float] = None
    education_level: Optional[str] = None
    academic_background: Optional[str] = None
    career_goal: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    qualification: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    source: Optional[str] = None
    lead_id: Optional[int] = None
    assigned_salesperson_id: Optional[int] = None
    auto_assign_salesperson: bool = False
    notes: Optional[str] = None


class StudentUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    course_interest: Optional[str] = None
    course_interest_id: Optional[int] = None
    gpa: Optional[float] = None
    education_level: Optional[str] = None
    academic_background: Optional[str] = None
    career_goal: Optional[str] = None
    address: Optional[str] = None
    gender: Optional[str] = None
    qualification: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    status: Optional[str] = None
    assigned_salesperson_id: Optional[int] = None
    auto_assign_salesperson: bool = False
    drop_reason: Optional[str] = None
    improvement_plan: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class StudentNoteRequest(BaseModel):
    content: str


def _salesperson_assignment_metrics(session: Session):
    eligible_users = session.exec(
        select(User).where(User.role.in_(["SalesManager", "Employee"]), User.is_active == True)
    ).all()
    metrics = {user.id: {"revenue_collected": 0.0, "assigned_workload": 0} for user in eligible_users if user.id is not None}
    leads = session.exec(select(Lead)).all()
    lead_by_id = {lead.id: lead for lead in leads}
    students = session.exec(select(Student)).all()
    student_by_id = {student.id: student for student in students}

    for lead in leads:
        if lead.owner_id in metrics:
            metrics[lead.owner_id]["assigned_workload"] += 1
    for student in students:
        linked_lead = lead_by_id.get(student.lead_id)
        lead_owner_id = linked_lead.owner_id if linked_lead else None
        if student.assigned_salesperson_id in metrics and student.assigned_salesperson_id != lead_owner_id:
            metrics[student.assigned_salesperson_id]["assigned_workload"] += 1
    for enrollment in session.exec(select(Enrollment)).all():
        student = student_by_id.get(enrollment.student_id)
        linked_lead = lead_by_id.get(student.lead_id) if student and student.lead_id else None
        owner_id = (student.assigned_salesperson_id if student else None) or (linked_lead.owner_id if linked_lead else None) or enrollment.enrolled_by
        if owner_id in metrics:
            metrics[owner_id]["revenue_collected"] += enrollment.amount_paid or 0
    return eligible_users, metrics


def _choose_revenue_balanced_salesperson(session: Session):
    users, metrics = _salesperson_assignment_metrics(session)
    if not users:
        raise HTTPException(status_code=409, detail="Add an active salesperson before using auto-assign")
    return min(users, key=lambda user: (
        metrics[user.id]["revenue_collected"],
        metrics[user.id]["assigned_workload"],
        user.id or 0,
    ))


def _validate_salesperson(session: Session, user_id: Optional[int]):
    if user_id is None:
        return None
    user = session.get(User, user_id)
    if not user or not user.is_active or user.role not in ("Admin", "SalesManager", "Employee"):
        raise HTTPException(status_code=422, detail="Choose an active salesperson")
    return user


def _student_salesperson_id(student: Student, session: Session):
    if student.assigned_salesperson_id:
        return student.assigned_salesperson_id
    lead = session.get(Lead, student.lead_id) if student.lead_id else None
    return lead.owner_id if lead else None


def _require_student_salesperson_access(actor: User, student: Student, session: Session) -> None:
    actor_role = _normalize_role(actor.role)
    if actor_role in ("SalesManager", "Employee", "Sales", "Demo") and _student_salesperson_id(student, session) != actor.id:
        raise HTTPException(status_code=404, detail="Student not found")


def _require_enrollment_access(actor: User, enrollment: Enrollment, session: Session) -> Student:
    student = session.get(Student, enrollment.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    if _normalize_role(actor.role) == "Student" and student.user_id != actor.id:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    _require_student_salesperson_access(actor, student, session)
    return student


class EnrollmentCreateRequest(BaseModel):
    student_id: int
    batch_id: int
    course_id: int
    total_fee: float = 0.0
    amount_paid: float = 0.0
    payment_mode: Optional[str] = None
    discount: float = 0.0
    discount_reason: Optional[str] = None
    enrolled_by: Optional[int] = None
    notes: Optional[str] = None


class EnrollmentUpdateRequest(BaseModel):
    amount_paid: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    status: Optional[str] = None
    discount: Optional[float] = None
    discount_reason: Optional[str] = None
    notes: Optional[str] = None


class PaymentRecordRequest(BaseModel):
    enrollment_id: int
    student_id: int
    amount: float
    payment_mode: str = "Cash"
    receipt_number: Optional[str] = None
    notes: Optional[str] = None


class InstructorFeedbackRequest(BaseModel):
    instructor_id: int
    batch_id: int
    student_id: Optional[int] = None
    rating: int = 5
    teaching_quality: Optional[int] = None
    punctuality: Optional[int] = None
    communication: Optional[int] = None
    feedback_text: Optional[str] = None


class AttendanceRequest(BaseModel):
    batch_id: int
    student_id: int
    date: Optional[str] = None
    status: str = "Present"
    notes: Optional[str] = None


class InstituteLoginRequest(BaseModel):
    password: str


class InstituteSessionCreateRequest(BaseModel):
    title: str
    topic: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: Optional[datetime] = None
    status: str = "Scheduled"
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class BatchTaskCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium"
    due_date: Optional[str] = None


class InstituteSessionUpdateRequest(BaseModel):
    title: Optional[str] = None
    topic: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    status: Optional[str] = None
    meeting_url: Optional[str] = None
    notes: Optional[str] = None


class SessionAttendanceRequest(BaseModel):
    student_id: int
    status: str = "Present"
    notes: Optional[str] = None


class SessionProgressRequest(BaseModel):
    student_id: int
    status: str = "In Progress"
    completion_percent: int = 0
    score: Optional[float] = None
    notes: Optional[str] = None


@router.get("/courses")
def get_courses(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Instructor", "Student", "Demo", "Intern"])
    courses = session.exec(select(Course).order_by(Course.created_at.desc())).all()
    if not courses:
        return {"courses": []}
    course_ids = [c.id for c in courses]

    # Aggregate counts in two queries instead of two per course.
    batch_rows = session.exec(
        select(Batch.course_id, func.count(Batch.id).label("cnt"))
        .where(Batch.course_id.in_(course_ids))
        .group_by(Batch.course_id)
    ).all()
    batch_map = {row.course_id: row.cnt for row in batch_rows}
    enroll_rows = session.exec(
        select(Enrollment.course_id, func.count(Enrollment.id).label("cnt"))
        .where(Enrollment.course_id.in_(course_ids))
        .group_by(Enrollment.course_id)
    ).all()
    enroll_map = {row.course_id: row.cnt for row in enroll_rows}

    result = []
    for c in courses:
        result.append({
            "id": c.id, "title": c.title, "slug": c.slug, "description": c.description,
            "category": c.category, "duration_weeks": c.duration_weeks, "duration_hours": c.duration_hours,
            "price": c.price, "advance_amount": c.advance_amount, "thumbnail_url": c.thumbnail_url,
            "syllabus": c.syllabus, "prerequisites": c.prerequisites, "is_active": c.is_active,
            "batch_count": batch_map.get(c.id, 0), "enrollment_count": enroll_map.get(c.id, 0),
            "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat()
        })
    return {"courses": result}


@router.post("/courses")
def create_course(body: CourseCreateRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    import re
    slug = re.sub(r'[^a-z0-9]+', '-', body.title.lower()).strip('-') if body.title else None
    course = Course(
        title=body.title, slug=slug, description=body.description, category=body.category,
        duration_weeks=body.duration_weeks, duration_hours=body.duration_hours,
        price=body.price, advance_amount=body.advance_amount, prerequisites=body.prerequisites,
        syllabus=body.syllabus, thumbnail_url=body.thumbnail_url, is_active=body.is_active
    )
    session.add(course)
    session.commit()
    return {"course": {"id": course.id, "title": course.title, "category": course.category, "price": course.price, "is_active": course.is_active}}


@router.get("/courses/{course_id}")
def get_course(course_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Instructor", "Student", "Demo", "Intern"])
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    batches = session.exec(select(Batch).where(Batch.course_id == course_id)).all()
    batch_list = []
    batch_ids = [b.id for b in batches]
    for b in batches:
        instructor = session.get(Instructor, b.instructor_id) if b.instructor_id else None
        enrolled = session.exec(select(func.count(Enrollment.id)).where(Enrollment.batch_id == b.id)).first() or 0
        batch_list.append({
            "id": b.id, "batch_name": b.batch_name, "batch_code": b.batch_code,
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "end_date": b.end_date.isoformat() if b.end_date else None,
            "schedule": b.schedule, "mode": b.mode, "max_seats": b.max_seats,
            "enrolled_count": enrolled, "status": b.status, "room_or_link": b.room_or_link,
            "instructor_name": instructor.name if instructor else None,
            "instructor_id": b.instructor_id
        })
    course_tasks = session.exec(select(Task).where(Task.batch_id.in_(batch_ids))).all() if batch_ids else []
    tasks_by_title = {}
    for t in course_tasks:
        b = next((x for x in batches if x.id == t.batch_id), None)
        st = session.get(Student, t.student_id) if t.student_id else None
        key = (t.title, t.batch_id)
        if key not in tasks_by_title:
            tasks_by_title[key] = {
                "title": t.title,
                "description": t.description,
                "due_date": t.due_date,
                "priority": t.priority,
                "batch_id": t.batch_id,
                "batch_name": b.batch_name if b else "Batch",
                "total_assigned": 0,
                "completed_count": 0,
                "students": []
            }
        tasks_by_title[key]["total_assigned"] += 1
        if t.status == "Done":
            tasks_by_title[key]["completed_count"] += 1
        tasks_by_title[key]["students"].append({
            "task_id": t.id,
            "student_id": t.student_id,
            "student_name": st.name if st else "Student",
            "status": t.status,
            "submission_url": getattr(t, "submission_url", None),
            "submission_file": getattr(t, "submission_file", None),
            "submission_notes": getattr(t, "submission_notes", None),
            "submitted_at": t.submitted_at.isoformat() if getattr(t, "submitted_at", None) else None,
        })
    task_summaries = []
    for info in tasks_by_title.values():
        info["completion_percent"] = round((info["completed_count"] / max(1, info["total_assigned"])) * 100)
        task_summaries.append(info)
    return {
        "course": course.dict(),
        "batches": batch_list,
        "task_summaries": task_summaries,
        "total_tasks_assigned": len(course_tasks),
        "total_tasks_completed": sum(1 for t in course_tasks if t.status == "Done"),
    }


@router.patch("/courses/{course_id}")
def update_course(course_id: int, body: CourseUpdateRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(course, k, v)
    course.updated_at = _utcnow()
    session.add(course)
    session.commit()
    return {"course": {"id": course.id, "title": course.title, "is_active": course.is_active}}


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    session.delete(course)
    session.commit()
    return {"ok": True}


@router.get("/instructors")
def get_instructors(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Instructor", "Student", "Demo", "Intern"])
    instructors = session.exec(select(Instructor).order_by(Instructor.created_at.desc())).all()
    if not instructors:
        return {"instructors": []}
    instructor_ids = [i.id for i in instructors]

    # Batch-load everything in a handful of queries instead of N+1 per instructor.
    all_batches = session.exec(select(Batch).where(Batch.instructor_id.in_(instructor_ids))).all()
    batches_by_instructor: dict = {}
    batch_to_instructor: dict = {}
    for b in all_batches:
        if b.instructor_id is None:
            continue
        batches_by_instructor.setdefault(b.instructor_id, []).append(b)
        batch_to_instructor[b.id] = b.instructor_id

    # Distinct active students per instructor: one query over all their batches.
    students_by_instructor: dict = {}
    all_batch_ids = list(batch_to_instructor.keys())
    if all_batch_ids:
        enroll_rows = session.exec(
            select(Enrollment.batch_id, Enrollment.student_id)
            .where(Enrollment.batch_id.in_(all_batch_ids), Enrollment.status == "Active")
        ).all()
        for row in enroll_rows:
            inst_id = batch_to_instructor.get(row.batch_id)
            if inst_id is not None:
                students_by_instructor.setdefault(inst_id, set()).add(row.student_id)

    # Average rating per instructor: one aggregation query.
    rating_rows = session.exec(
        select(InstructorFeedback.instructor_id, func.avg(InstructorFeedback.rating).label("avg_rating"))
        .where(InstructorFeedback.instructor_id.in_(instructor_ids))
        .group_by(InstructorFeedback.instructor_id)
    ).all()
    rating_map = {row.instructor_id: float(row.avg_rating) for row in rating_rows if row.avg_rating is not None}

    result = []
    now = _utcnow()
    for i in instructors:
        instructor_batches = batches_by_instructor.get(i.id, [])
        batch_count = len(instructor_batches)
        active_batches = sum(1 for batch in instructor_batches if batch.status == "Active")
        upcoming_batches = sum(1 for batch in instructor_batches if batch.status == "Upcoming" or (batch.start_date and batch.start_date > now and batch.status not in ("Completed", "Cancelled")))
        past_batches = sum(1 for batch in instructor_batches if batch.status == "Completed" or (batch.end_date and batch.end_date < now))
        avg_rating = round(rating_map[i.id], 1) if i.id in rating_map else 0.0
        result.append({
            "id": i.id, "name": i.name, "email": i.email, "phone": i.phone,
            "bio": i.bio, "expertise": i.expertise, "qualification": i.qualification,
            "experience_years": i.experience_years, "photo_url": i.photo_url, "is_active": i.is_active,
            "avg_rating": avg_rating, "batch_count": batch_count, "active_batches": active_batches,
            "upcoming_batches": upcoming_batches, "past_batches": past_batches,
            "total_students": len(students_by_instructor.get(i.id, set())), "user_id": i.user_id,
            "created_at": i.created_at.isoformat()
        })
    return {"instructors": result}


@router.post("/instructors")
def create_instructor(body: InstructorCreateRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    instructor = Instructor(**body.dict())
    session.add(instructor)
    session.commit()
    return {"instructor": {"id": instructor.id, "name": instructor.name, "email": instructor.email, "phone": instructor.phone, "expertise": instructor.expertise, "is_active": instructor.is_active}}


@router.get("/instructors/{instructor_id}")
def get_instructor(instructor_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Instructor", "Student", "Demo", "Intern"])
    instructor = session.get(Instructor, instructor_id)
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    batches = session.exec(select(Batch).where(Batch.instructor_id == instructor_id)).all()
    feedbacks = session.exec(select(InstructorFeedback).where(InstructorFeedback.instructor_id == instructor_id)).all()
    avg_rating = round(sum(f.rating for f in feedbacks) / len(feedbacks), 1) if feedbacks else 0.0
    feedback_breakdown = {
        "teaching_quality": round(sum((f.teaching_quality or 0) for f in feedbacks) / max(len(feedbacks),1), 1),
        "punctuality": round(sum((f.punctuality or 0) for f in feedbacks) / max(len(feedbacks),1), 1),
        "communication": round(sum((f.communication or 0) for f in feedbacks) / max(len(feedbacks),1), 1),
    }

    batch_ids = [b.id for b in batches]
    now = _utcnow()

    # Query all sessions across assigned batches
    all_sessions = session.exec(select(InstituteSession).where(InstituteSession.batch_id.in_(batch_ids))).all() if batch_ids else []
    total_classes_scheduled = len(all_sessions)
    completed_classes = sum(1 for s in all_sessions if s.status == "Completed")
    cancelled_classes = sum(1 for s in all_sessions if s.status == "Cancelled")
    pending_classes = sum(1 for s in all_sessions if s.status in ("Scheduled", "Live") or (s.scheduled_start and s.scheduled_start >= now and s.status not in ("Completed", "Cancelled")))

    # Query attendance records
    all_attendance = session.exec(select(Attendance).where(Attendance.batch_id.in_(batch_ids))).all() if batch_ids else []
    attended_count = sum(1 for a in all_attendance if a.status in ("Present", "Late"))
    missed_count = sum(1 for a in all_attendance if a.status == "Absent")
    attendance_total = len(all_attendance)
    attendance_rate = round((attended_count / attendance_total) * 100, 1) if attendance_total else 0.0

    # Query tasks assigned in these batches
    batch_tasks = session.exec(select(Task).where(Task.batch_id.in_(batch_ids))).all() if batch_ids else []
    total_tasks_given = len(batch_tasks)
    tasks_completed_count = sum(1 for t in batch_tasks if t.status == "Done")
    tasks_pending_count = total_tasks_given - tasks_completed_count
    task_completion_rate = round((tasks_completed_count / total_tasks_given) * 100, 1) if total_tasks_given else 0.0

    batch_list = []
    for b in batches:
        course = session.get(Course, b.course_id)
        enrolled = session.exec(select(func.count(Enrollment.id)).where(Enrollment.batch_id == b.id)).first() or 0
        b_sessions = [s for s in all_sessions if s.batch_id == b.id]
        b_attendance = [a for a in all_attendance if a.batch_id == b.id]
        b_tasks = [t for t in batch_tasks if t.batch_id == b.id]
        b_attended = sum(1 for a in b_attendance if a.status in ("Present", "Late"))
        b_missed = sum(1 for a in b_attendance if a.status == "Absent")
        b_tasks_done = sum(1 for t in b_tasks if t.status == "Done")
        batch_list.append({
            "id": b.id, "batch_name": b.batch_name, "status": b.status,
            "course_title": course.title if course else None,
            "enrolled_count": enrolled, "max_seats": b.max_seats,
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "classes_scheduled": len(b_sessions),
            "classes_completed": sum(1 for s in b_sessions if s.status == "Completed"),
            "classes_pending": sum(1 for s in b_sessions if s.status in ("Scheduled", "Live")),
            "attendance_present": b_attended,
            "attendance_missed": b_missed,
            "attendance_rate": round((b_attended / len(b_attendance)) * 100, 1) if b_attendance else 0.0,
            "tasks_given": len(b_tasks),
            "tasks_completed": b_tasks_done,
            "task_completion_rate": round((b_tasks_done / len(b_tasks)) * 100, 1) if b_tasks else 0.0,
        })

    attendance_pie = [
        {"name": "Attended", "value": attended_count, "color": "#10b981"},
        {"name": "Missed", "value": missed_count, "color": "#f43f5e"},
        {"name": "Pending Records", "value": max(0, total_classes_scheduled - completed_classes), "color": "#f59e0b"},
    ]
    task_pie = [
        {"name": "Completed", "value": tasks_completed_count, "color": "#10b981"},
        {"name": "Pending / Todo", "value": tasks_pending_count, "color": "#3b82f6"},
    ]
    classes_pie = [
        {"name": "Completed", "value": completed_classes, "color": "#10b981"},
        {"name": "Pending / Upcoming", "value": pending_classes, "color": "#0284c7"},
        {"name": "Cancelled", "value": cancelled_classes, "color": "#94a3b8"},
    ]

    return {
        "instructor": instructor.dict(),
        "avg_rating": avg_rating,
        "feedback_breakdown": feedback_breakdown,
        "feedback_count": len(feedbacks),
        "batches": batch_list,
        "stats": {
            "classes_scheduled": total_classes_scheduled,
            "classes_completed": completed_classes,
            "classes_pending": pending_classes,
            "classes_cancelled": cancelled_classes,
            "attended_count": attended_count,
            "missed_count": missed_count,
            "attendance_rate": attendance_rate,
            "total_tasks_given": total_tasks_given,
            "tasks_completed_count": tasks_completed_count,
            "tasks_pending_count": tasks_pending_count,
            "task_completion_rate": task_completion_rate,
        },
        "charts": {
            "attendance_pie": attendance_pie,
            "task_pie": task_pie,
            "classes_pie": classes_pie,
        }
    }


@router.patch("/instructors/{instructor_id}")
def update_instructor(instructor_id: int, body: InstructorUpdateRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    instructor = session.get(Instructor, instructor_id)
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(instructor, k, v)
    session.add(instructor)
    session.commit()
    return {"instructor": {"id": instructor.id, "name": instructor.name, "is_active": instructor.is_active}}


@router.delete("/instructors/{instructor_id}")
def delete_instructor(instructor_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    instructor = session.get(Instructor, instructor_id)
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    session.delete(instructor)
    session.commit()
    return {"ok": True}


@router.post("/instructors/{instructor_id}/feedback")
def submit_instructor_feedback(instructor_id: int, body: InstructorFeedbackRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    actor_role = _normalize_role(actor.role)
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5")
    batch = session.get(Batch, body.batch_id)
    if not batch or batch.instructor_id != instructor_id:
        raise HTTPException(status_code=404, detail="Instructor batch not found")
    student_id = body.student_id
    if actor_role == "Student":
        student = session.exec(select(Student).where(Student.user_id == actor.id)).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student profile is not linked to this login")
        enrollment = session.exec(
            select(Enrollment.id).where(
                Enrollment.student_id == student.id,
                Enrollment.batch_id == batch.id,
                Enrollment.status.in_(("Active", "Completed")),
            )
        ).first()
        if not enrollment:
            raise HTTPException(status_code=404, detail="Instructor not found in your courses")
        student_id = student.id
    elif student_id and not session.get(Student, student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    fb = InstructorFeedback(
        instructor_id=instructor_id, batch_id=body.batch_id, student_id=student_id,
        rating=body.rating, teaching_quality=body.teaching_quality, punctuality=body.punctuality,
        communication=body.communication, feedback_text=body.feedback_text
    )
    session.add(fb)
    session.commit()
    return {"ok": True, "review": {"id": fb.id, "rating": fb.rating, "feedback_text": fb.feedback_text}}


@router.get("/batches")
def get_batches(course_id: Optional[int] = None, instructor_id: Optional[int] = None, status: Optional[str] = None, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Demo"])
    query = select(Batch)
    if actor.role == "Instructor":
        instructor = session.exec(select(Instructor).where(Instructor.user_id == actor.id)).first()
        if not instructor:
            return {"batches": []}
        query = query.where(Batch.instructor_id == instructor.id)
    if course_id:
        query = query.where(Batch.course_id == course_id)
    if instructor_id:
        query = query.where(Batch.instructor_id == instructor_id)
    if status:
        query = query.where(Batch.status == status)
    batches = session.exec(query.order_by(Batch.created_at.desc())).all()
    if not batches:
        return {"batches": []}

    # Batch-load courses, instructors and enrollment counts (avoids N+1)
    batch_ids = [b.id for b in batches]
    c_ids = list({b.course_id for b in batches if b.course_id})
    i_ids = list({b.instructor_id for b in batches if b.instructor_id})
    courses_map = {c.id: c.title for c in session.exec(select(Course).where(Course.id.in_(c_ids))).all()} if c_ids else {}
    instructors_map = {i.id: i.name for i in session.exec(select(Instructor).where(Instructor.id.in_(i_ids))).all()} if i_ids else {}
    # Enrollment counts in a single aggregation query
    enroll_rows = session.exec(
        select(Enrollment.batch_id, func.count(Enrollment.id).label("cnt"))
        .where(Enrollment.batch_id.in_(batch_ids))
        .group_by(Enrollment.batch_id)
    ).all()
    enrolled_map = {row.batch_id: row.cnt for row in enroll_rows}

    result = []
    for b in batches:
        enrolled = enrolled_map.get(b.id, 0)
        result.append({
            "id": b.id, "batch_name": b.batch_name, "batch_code": b.batch_code,
            "course_id": b.course_id, "course_title": courses_map.get(b.course_id),
            "instructor_id": b.instructor_id, "instructor_name": instructors_map.get(b.instructor_id),
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "end_date": b.end_date.isoformat() if b.end_date else None,
            "schedule": b.schedule, "mode": b.mode, "max_seats": b.max_seats,
            "session_duration_hours": b.session_duration_hours, "assignment_strategy": b.assignment_strategy,
            "enrolled_count": enrolled, "available_seats": max(0, b.max_seats - enrolled),
            "status": b.status, "room_or_link": b.room_or_link, "notes": b.notes,
            "created_at": b.created_at.isoformat()
        })
    return {"batches": result}


@router.post("/batches")
def create_batch(body: BatchCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    course = session.get(Course, body.course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=404, detail="Active course not found")
    if body.session_duration_hours not in (1, 2, 3, 4):
        raise HTTPException(status_code=422, detail="Class slots must be 1, 2, 3, or 4 hours")
    if body.assignment_strategy not in ("round_robin", "performance", "manual"):
        raise HTTPException(status_code=422, detail="Choose round_robin, performance, or manual assignment")
    instructor_id = body.instructor_id
    if body.auto_assign_instructor and not instructor_id:
        candidates = session.exec(select(Instructor).where(Instructor.is_active == True)).all()
        if not candidates:
            raise HTTPException(status_code=409, detail="Create an active instructor profile before auto-assigning a batch")
        candidate_metrics = []
        for instructor in candidates:
            assignments = session.exec(select(Batch).where(Batch.instructor_id == instructor.id)).all()
            load = sum(1 for item in assignments if item.status in ("Active", "Upcoming"))
            feedbacks = session.exec(select(InstructorFeedback).where(InstructorFeedback.instructor_id == instructor.id)).all()
            rating = sum(item.rating for item in feedbacks) / len(feedbacks) if feedbacks else 0.0
            expertise = (instructor.expertise or "").lower()
            category_match = bool(course.category and course.category.lower() in expertise)
            candidate_metrics.append((instructor, load, rating, category_match))
        if body.assignment_strategy == "performance":
            chosen = max(candidate_metrics, key=lambda item: (item[2], item[3], -item[1], -(item[0].id or 0)))
        else:
            chosen = min(candidate_metrics, key=lambda item: (item[1], not item[3], item[0].id or 0))
        instructor_id = chosen[0].id
    if instructor_id:
        instructor = session.get(Instructor, instructor_id)
        if not instructor or not instructor.is_active:
            raise HTTPException(status_code=422, detail="Selected instructor is not active")
    start_dt = _parse_dt(body.start_date) if body.start_date else None
    end_dt = _parse_dt(body.end_date) if body.end_date else None
    if start_dt and end_dt and end_dt <= start_dt:
        raise HTTPException(status_code=422, detail="Batch end date must be after its start date")
    batch = Batch(
        tenant_id=actor.tenant_id, course_id=body.course_id, instructor_id=instructor_id, batch_name=body.batch_name,
        batch_code=body.batch_code, start_date=start_dt, end_date=end_dt,
        schedule=body.schedule, session_duration_hours=body.session_duration_hours,
        assignment_strategy=body.assignment_strategy if body.auto_assign_instructor else "manual",
        mode=body.mode, max_seats=body.max_seats,
        status=body.status, room_or_link=body.room_or_link, notes=body.notes
    )
    session.add(batch)
    session.commit()
    return {"batch": {"id": batch.id, "batch_name": batch.batch_name, "course_id": batch.course_id, "instructor_id": batch.instructor_id, "session_duration_hours": batch.session_duration_hours, "assignment_strategy": batch.assignment_strategy, "status": batch.status, "mode": batch.mode, "max_seats": batch.max_seats}}


@router.get("/batches/{batch_id}")
def get_batch(batch_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Demo"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    course = session.get(Course, batch.course_id)
    instructor = session.get(Instructor, batch.instructor_id) if batch.instructor_id else None
    enrollments = session.exec(select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.status == "Active")).all()
    batch_tasks = session.exec(select(Task).where(Task.batch_id == batch_id)).all()

    student_ids = {e.student_id for e in enrollments if e.student_id}
    student_ids.update(t.student_id for t in batch_tasks if t.student_id)
    student_by_id = {}
    if student_ids:
        student_by_id = {s.id: s for s in session.exec(select(Student).where(Student.id.in_(student_ids))).all()}

    students_list = []
    for e in enrollments:
        student = student_by_id.get(e.student_id)
        if student:
            students_list.append({
                "id": student.id,
                "student_id": student.id,
                "enrollment_id": e.id,
                "name": student.name,
                "email": student.email,
                "phone": student.phone,
                "status": e.status,
                "progress_status": "Enrolled",
                "completion_percent": 0,
                "payment_status": e.payment_status,
                "amount_paid": e.amount_paid,
                "amount_due": e.amount_due,
                "enrollment_date": e.enrollment_date.isoformat()
            })
    tasks_by_title = {}
    for t in batch_tasks:
        key = t.title
        if key not in tasks_by_title:
            tasks_by_title[key] = {
                "title": t.title,
                "description": t.description,
                "due_date": t.due_date,
                "priority": t.priority,
                "batch_id": batch_id,
                "total_assigned": 0,
                "completed_count": 0,
                "students": []
            }
        info = tasks_by_title[key]
        info["total_assigned"] += 1
        if t.status == "Done":
            info["completed_count"] += 1
        student = student_by_id.get(t.student_id) if t.student_id else None
        info["students"].append({
            "task_id": t.id,
            "student_id": t.student_id,
            "student_name": student.name if student else "Student",
            "status": t.status,
            "submission_url": getattr(t, "submission_url", None),
            "submission_file": getattr(t, "submission_file", None),
            "submission_notes": getattr(t, "submission_notes", None),
            "submitted_at": t.submitted_at.isoformat() if getattr(t, "submitted_at", None) else None,
        })
    task_summaries = []
    for info in tasks_by_title.values():
        info["completion_percent"] = round((info["completed_count"] / max(1, info["total_assigned"])) * 100)
        task_summaries.append(info)

    return {
        "batch": batch.dict(),
        "course": {"id": course.id, "title": course.title} if course else None,
        "instructor": {"id": instructor.id, "name": instructor.name} if instructor else None,
        "students": students_list,
        "tasks": _task_dicts(batch_tasks, session),
        "task_summaries": task_summaries,
        "total_tasks_assigned": len(batch_tasks),
        "total_tasks_completed": sum(1 for t in batch_tasks if t.status == "Done"),
    }


@router.patch("/batches/{batch_id}")
def update_batch(batch_id: int, body: BatchUpdateRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    data = body.dict(exclude_unset=True)
    if "start_date" in data and data["start_date"]:
        data["start_date"] = _parse_dt(data["start_date"])
    if "end_date" in data and data["end_date"]:
        data["end_date"] = _parse_dt(data["end_date"])
    for k, v in data.items():
        setattr(batch, k, v)
    batch.updated_at = _utcnow()
    session.add(batch)
    session.commit()
    return {"batch": {"id": batch.id, "batch_name": batch.batch_name, "status": batch.status}}


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    session.delete(batch)
    session.commit()
    return {"ok": True}


@router.get("/students")
def get_students(status: Optional[str] = None, q: Optional[str] = None, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    actor_role = _normalize_role(actor.role)
    query = select(Student)
    if actor_role == "Student":
        query = query.where(Student.user_id == actor.id)
    elif actor_role == "Instructor":
        instructor = session.exec(select(Instructor).where(Instructor.user_id == actor.id)).first()
        if not instructor:
            return {"students": []}
        assigned_batch_ids = select(Batch.id).where(Batch.instructor_id == instructor.id)
        assigned_student_ids = select(Enrollment.student_id).where(Enrollment.batch_id.in_(assigned_batch_ids), Enrollment.status == "Active")
        query = query.where(Student.id.in_(assigned_student_ids))
    elif actor_role in ("SalesManager", "Employee", "Sales", "Demo"):
        query = query.where(
            or_(
                Student.assigned_salesperson_id == actor.id,
                Student.lead_id.in_(select(Lead.id).where(Lead.owner_id == actor.id)),
            )
        )
    if status:
        query = query.where(Student.status == status)
    if q:
        query = query.where(or_(Student.name.ilike(f"%{q}%"), Student.email.ilike(f"%{q}%"), Student.phone.ilike(f"%{q}%")))
    students = session.exec(query.order_by(Student.created_at.desc())).all()
    result = []
    for s in students:
        enrollments = session.exec(select(Enrollment).where(Enrollment.student_id == s.id)).all()
        active_enrollment = next((e for e in enrollments if e.status == "Active"), None)
        batch_name = None
        course_title = None
        active_batch_id = None
        active_course_id = None
        if active_enrollment:
            batch = session.get(Batch, active_enrollment.batch_id)
            course = session.get(Course, active_enrollment.course_id)
            batch_name = batch.batch_name if batch else None
            course_title = course.title if course else None
            active_batch_id = batch.id if batch else None
            active_course_id = course.id if course else None
        result.append({
            "id": s.id, "name": s.name, "email": s.email, "phone": s.phone,
            "user_id": s.user_id, "course_interest": s.course_interest,
            "course_interest_id": s.course_interest_id, "gpa": s.gpa,
            "education_level": s.education_level, "academic_background": s.academic_background,
            "career_goal": s.career_goal, "drop_reason": s.drop_reason,
            "improvement_plan": s.improvement_plan,
            "address": s.address, "gender": s.gender, "qualification": s.qualification,
            "guardian_name": s.guardian_name, "guardian_phone": s.guardian_phone,
            "assigned_salesperson_id": _student_salesperson_id(s, session),
            "source": s.source, "status": s.status, "photo_url": s.photo_url,
            "enrollment_count": len(enrollments),
            "active_course": course_title, "active_batch": batch_name,
            "active_course_id": active_course_id, "active_batch_id": active_batch_id,
            "created_at": s.created_at.isoformat()
        })
    return {"students": result}


@router.post("/students")
def create_student(body: StudentCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    actor_role = _normalize_role(actor.role)
    if body.gpa is not None and not 0 <= body.gpa <= 10:
        raise HTTPException(status_code=422, detail="GPA must be between 0 and 10")
    linked_lead = None
    if body.lead_id:
        linked_lead = session.get(Lead, body.lead_id)
        if not linked_lead:
            raise HTTPException(status_code=404, detail="Source lead not found")
    if body.auto_assign_salesperson and body.assigned_salesperson_id is not None:
        raise HTTPException(status_code=422, detail="Choose a salesperson or auto-assign, not both")
    if body.auto_assign_salesperson:
        salesperson_id = _choose_revenue_balanced_salesperson(session).id
    elif body.assigned_salesperson_id is not None:
        salesperson_id = _validate_salesperson(session, body.assigned_salesperson_id).id
    else:
        salesperson_id = linked_lead.owner_id if linked_lead else (actor.id if actor_role in ("Employee", "SalesManager", "Sales", "Demo") else None)
    dob = _parse_dt(body.date_of_birth) if body.date_of_birth else None
    student = Student(
        tenant_id=actor.tenant_id, name=body.name, email=body.email, phone=body.phone,
        course_interest=body.course_interest, course_interest_id=body.course_interest_id,
        gpa=body.gpa, education_level=body.education_level,
        academic_background=body.academic_background, career_goal=body.career_goal, address=body.address,
        date_of_birth=dob, gender=body.gender, qualification=body.qualification,
        guardian_name=body.guardian_name, guardian_phone=body.guardian_phone,
        source=body.source, lead_id=body.lead_id, assigned_salesperson_id=salesperson_id, notes=body.notes
    )
    session.add(student)
    session.commit()
    return {"student": {"id": student.id, "name": student.name, "email": student.email, "phone": student.phone, "status": student.status}}


@router.get("/students/{student_id}")
def get_student(student_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    actor_role = _normalize_role(actor.role)
    student = session.get(Student, student_id)
    if not student or (student.tenant_id and actor_role != "SuperAdmin" and student.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    enrollments = session.exec(select(Enrollment).where(Enrollment.student_id == student_id)).all()
    enrollment_list = []
    progress_total = 0
    progress_count = 0
    attendance_total = 0
    attendance_present = 0
    for e in enrollments:
        batch = session.get(Batch, e.batch_id)
        course = session.get(Course, e.course_id)
        payments = session.exec(select(PaymentRecord).where(PaymentRecord.enrollment_id == e.id)).all()
        class_sessions = session.exec(select(InstituteSession).where(InstituteSession.batch_id == e.batch_id)).all()
        progress_rows = session.exec(select(StudentSessionProgress).where(StudentSessionProgress.student_id == student_id, StudentSessionProgress.batch_id == e.batch_id)).all()
        attendance_rows = session.exec(select(Attendance).where(Attendance.student_id == student_id, Attendance.batch_id == e.batch_id)).all()
        progress_percent = round(sum(item.completion_percent for item in progress_rows) / len(progress_rows)) if progress_rows else 0
        if class_sessions:
            progress_total += progress_percent
            progress_count += 1
        attendance_total += len(attendance_rows)
        attendance_present += sum(1 for item in attendance_rows if item.status in ("Present", "Late"))
        instructor = session.get(Instructor, batch.instructor_id) if batch and batch.instructor_id else None
        enrollment_list.append({
            "id": e.id, "batch_id": e.batch_id, "course_id": e.course_id,
            "batch_name": batch.batch_name if batch else None,
            "course_title": course.title if course else None,
            "instructor_id": instructor.id if instructor else None,
            "instructor_name": instructor.name if instructor else None,
            "session_count": len(class_sessions),
            "progress_percent": progress_percent,
            "attendance_rate": round(sum(1 for item in attendance_rows if item.status in ("Present", "Late")) / len(attendance_rows) * 100) if attendance_rows else 0,
            "total_fee": e.total_fee, "amount_paid": e.amount_paid, "amount_due": e.amount_due,
            "payment_status": e.payment_status, "status": e.status,
            "enrollment_date": e.enrollment_date.isoformat(),
            "slip_number": e.slip_number, "admission_slip_generated": e.admission_slip_generated,
            "payments": [{"id": p.id, "amount": p.amount, "mode": p.payment_mode, "date": p.payment_date.isoformat(), "receipt": p.receipt_number} for p in payments]
        })
    lead = session.get(Lead, student.lead_id) if student.lead_id else None
    salesperson_id = student.assigned_salesperson_id or (lead.owner_id if lead else None)
    salesperson = session.get(User, salesperson_id) if salesperson_id else None
    notes = session.exec(select(StudentNote).where(StudentNote.student_id == student_id).order_by(StudentNote.created_at.desc())).all()
    uploads = session.exec(select(StudentUpload).where(StudentUpload.student_id == student_id).order_by(StudentUpload.created_at.desc())).all()
    tasks = session.exec(select(Task).where(Task.student_id == student_id).order_by(Task.created_at.desc())).all()
    tasks_list = _task_dicts(tasks, session)
    return {
        "student": student.dict(),
        "lead": {"id": lead.id, "source": lead.source, "created_at": lead.created_at.isoformat()} if lead else None,
        "salesperson": {"id": salesperson.id, "name": salesperson.name, "email": salesperson.email} if salesperson else None,
        "enrollments": enrollment_list,
        "tasks": tasks_list,
        "performance": {
            "course_progress_percent": round(progress_total / progress_count) if progress_count else 0,
            "attendance_rate": round(attendance_present / attendance_total * 100) if attendance_total else 0,
        },
        "notes": [{"id": item.id, "content": item.content, "author_id": item.author_id, "created_at": item.created_at.isoformat()} for item in notes],
        "uploads": [{"id": item.id, "filename": item.filename, "content_type": item.content_type, "size_bytes": item.size_bytes, "description": item.description, "created_at": item.created_at.isoformat()} for item in uploads],
    }


@router.patch("/students/{student_id}")
def update_student(student_id: int, body: StudentUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    data = body.dict(exclude_unset=True)
    auto_assign = data.pop("auto_assign_salesperson", False)
    assigned_salesperson_id = data.pop("assigned_salesperson_id", None)
    if auto_assign and assigned_salesperson_id is not None:
        raise HTTPException(status_code=422, detail="Choose a salesperson or auto-assign, not both")
    if auto_assign:
        student.assigned_salesperson_id = _choose_revenue_balanced_salesperson(session).id
    elif "assigned_salesperson_id" in body.__fields_set__:
        selected_salesperson = _validate_salesperson(session, assigned_salesperson_id)
        student.assigned_salesperson_id = selected_salesperson.id if selected_salesperson else None
    if body.gpa is not None and not 0 <= body.gpa <= 10:
        raise HTTPException(status_code=422, detail="GPA must be between 0 and 10")
    if data.get("status") == "Dropped":
        if not (data.get("drop_reason") or student.drop_reason or "").strip():
            raise HTTPException(status_code=422, detail="A drop reason is required")
        if not (data.get("improvement_plan") or student.improvement_plan or "").strip():
            raise HTTPException(status_code=422, detail="An improvement plan is required")
        student.dropped_at = _utcnow()
        student.dropped_by = actor.id
    for k, v in data.items():
        setattr(student, k, v)
    student.updated_at = _utcnow()
    session.add(student)
    session.commit()
    return {"student": {"id": student.id, "name": student.name, "status": student.status}}


@router.patch("/students/{student_id}/background-details")
def update_student_background_details(student_id: int, body: BackgroundDetailsUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Demo"])
    student = session.get(Student, student_id)
    if not student or (student.tenant_id and actor.role != "SuperAdmin" and student.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    details = _normalize_background_details(body.details)
    student.background_details = details
    student.updated_at = _utcnow()
    session.add(student)
    if student.lead_id:
        lead = session.get(Lead, student.lead_id)
        if lead:
            lead.background_details = details
            session.add(lead)
    session.commit()
    return {"background_details": details}


@router.delete("/students/{student_id}")
def delete_student(student_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if session.exec(select(Enrollment.id).where(Enrollment.student_id == student_id)).first():
        raise HTTPException(status_code=409, detail="Students with enrollment history cannot be deleted; mark them Dropped instead")
    session.delete(student)
    session.commit()
    return {"ok": True}


class PaymentReminderRequest(BaseModel):
    amount_due: Optional[float] = None
    notes: Optional[str] = None
    scheduled_at: Optional[str] = None  # ISO datetime string


@router.post("/students/{student_id}/payment-reminder")
def create_payment_reminder(student_id: int, body: PaymentReminderRequest, session: Session = Depends(get_session)):
    """Log a payment reminder call for a student (salesperson use)."""
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    student = session.get(Student, student_id)
    if not student or (student.tenant_id and actor.role != "SuperAdmin" and student.tenant_id != actor.tenant_id):
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    # Get balance from most recent active enrollment if not provided
    amount_due = body.amount_due
    if amount_due is None:
        enr = session.exec(
            select(Enrollment).where(Enrollment.student_id == student_id, Enrollment.status == "Active")
            .order_by(Enrollment.id.desc())
        ).first()
        amount_due = enr.amount_due if enr else 0
    schedule_info = f" (scheduled for {body.scheduled_at})" if body.scheduled_at else ""
    note_content = (
        f"📞 Payment reminder call logged by {actor.name or actor.email or 'staff'}{schedule_info}. "
        f"Outstanding balance: ₹{amount_due:,.0f}."
    )
    if body.notes and body.notes.strip():
        note_content += f" Notes: {body.notes.strip()}"
    note = StudentNote(student_id=student_id, author_id=actor.id, content=note_content)
    session.add(note)
    session.commit()
    session.refresh(note)
    return {
        "reminder": {
            "id": note.id,
            "student_id": student_id,
            "student_name": student.name,
            "amount_due": amount_due,
            "scheduled_at": body.scheduled_at,
            "logged_by": actor.name or actor.email or "Staff",
            "note": note_content,
            "created_at": note.created_at.isoformat(),
        }
    }


@router.get("/students/{student_id}/notes")
def get_student_notes(student_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    notes = session.exec(select(StudentNote).where(StudentNote.student_id == student_id).order_by(StudentNote.created_at.desc())).all()
    return {"notes": [{"id": item.id, "content": item.content, "author_id": item.author_id, "created_at": item.created_at.isoformat()} for item in notes]}


@router.post("/students/{student_id}/notes")
def create_student_note(student_id: int, body: StudentNoteRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Comment cannot be empty")
    note = StudentNote(student_id=student_id, author_id=actor.id, content=content)
    session.add(note)
    session.commit()
    session.refresh(note)
    return {"note": {"id": note.id, "content": note.content, "author_id": note.author_id, "created_at": note.created_at.isoformat()}}


@router.get("/students/{student_id}/files")
def get_student_files(student_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    files = session.exec(select(StudentUpload).where(StudentUpload.student_id == student_id).order_by(StudentUpload.created_at.desc())).all()
    return {"uploads": [{"id": item.id, "filename": item.filename, "content_type": item.content_type, "size_bytes": item.size_bytes, "description": item.description, "created_at": item.created_at.isoformat()} for item in files]}


@router.post("/students/{student_id}/files")
async def upload_student_file(student_id: int, file: UploadFile = File(...), description: str = Form(""), session: Session = Depends(get_session)):
    import os
    import uuid
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _require_student_profile_access(actor, student, session)
    original_name = os.path.basename(file.filename or "upload")[:255]
    file_bytes = await file.read(15 * 1024 * 1024 + 1)
    if not file_bytes or len(file_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Files must be between 1 byte and 15 MB")
    extension = os.path.splitext(original_name)[1].lower()
    storage_key = f"{uuid.uuid4().hex}{extension}"
    upload_root = os.path.join(os.path.dirname(__file__), "uploads", "students")
    os.makedirs(upload_root, exist_ok=True)
    with open(os.path.join(upload_root, storage_key), "wb") as target:
        target.write(file_bytes)
    record = StudentUpload(
        student_id=student_id,
        uploaded_by=actor.id,
        filename=original_name,
        storage_key=storage_key,
        content_type=file.content_type,
        size_bytes=len(file_bytes),
        description=description[:500] or None,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return {"upload": {"id": record.id, "filename": record.filename, "size_bytes": record.size_bytes, "created_at": record.created_at.isoformat()}}


@router.get("/student-files/{upload_id}/download")
def download_student_file(upload_id: int, session: Session = Depends(get_session)):
    import os
    from fastapi.responses import FileResponse
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor", "Student", "Demo"])
    record = session.get(StudentUpload, upload_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    student = session.get(Student, record.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="File not found")
    _require_student_profile_access(actor, student, session)
    upload_root = os.path.realpath(os.path.join(os.path.dirname(__file__), "uploads", "students"))
    file_path = os.path.realpath(os.path.join(upload_root, record.storage_key))
    if os.path.commonpath([upload_root, file_path]) != upload_root or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=record.filename, media_type=record.content_type or "application/octet-stream")


@router.get("/enrollments")
def get_enrollments(batch_id: Optional[int] = None, student_id: Optional[int] = None, course_id: Optional[int] = None, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo", "Student"])
    actor_role = _normalize_role(actor.role)
    query = select(Enrollment)
    if actor_role == "Student":
        student_profile = session.exec(select(Student.id).where(Student.user_id == actor.id)).first()
        if not student_profile:
            raise HTTPException(status_code=404, detail="Student profile is not linked to this login")
        query = query.where(Enrollment.student_id == student_profile)
    elif actor_role in ("SalesManager", "Employee", "Sales", "Demo"):
        assigned_student_ids = select(Student.id).where(
            or_(
                Student.assigned_salesperson_id == actor.id,
                Student.lead_id.in_(select(Lead.id).where(Lead.owner_id == actor.id)),
            )
        )
        query = query.where(Enrollment.student_id.in_(assigned_student_ids))
    if batch_id:
        query = query.where(Enrollment.batch_id == batch_id)
    if student_id:
        query = query.where(Enrollment.student_id == student_id)
    if course_id:
        query = query.where(Enrollment.course_id == course_id)
    enrollments = session.exec(query.order_by(Enrollment.created_at.desc())).all()
    result = []
    for e in enrollments:
        student = session.get(Student, e.student_id)
        batch = session.get(Batch, e.batch_id)
        course = session.get(Course, e.course_id)
        result.append({
            "id": e.id, "student_id": e.student_id, "student_name": student.name if student else None,
            "batch_id": e.batch_id, "batch_name": batch.batch_name if batch else None,
            "course_id": e.course_id, "course_title": course.title if course else None,
            "total_fee": e.total_fee, "amount_paid": e.amount_paid, "amount_due": e.amount_due,
            "payment_status": e.payment_status, "status": e.status,
            "enrollment_date": e.enrollment_date.isoformat(),
            "slip_number": e.slip_number, "admission_slip_generated": e.admission_slip_generated,
            "advance_slip_generated": e.advance_slip_generated, "discount": e.discount,
            "payment_mode": e.payment_mode, "notes": e.notes,
            "created_at": e.created_at.isoformat()
        })
    return {"enrollments": result}


@router.post("/enrollments")
def create_enrollment(body: EnrollmentCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    import random, string
    student = session.get(Student, body.student_id)
    batch = session.get(Batch, body.batch_id)
    course = session.get(Course, body.course_id)
    if not student or not batch or not course:
        raise HTTPException(status_code=404, detail="Student, batch, or course not found")
    _require_student_salesperson_access(actor, student, session)
    if batch.course_id != course.id:
        raise HTTPException(status_code=422, detail="The selected course does not match the batch")
    if not course.is_active or batch.status in ("Completed", "Cancelled"):
        raise HTTPException(status_code=409, detail="This course batch is not accepting enrollments")
    if body.total_fee < 0 or body.amount_paid < 0 or body.discount < 0:
        raise HTTPException(status_code=422, detail="Fees, payments, and discounts cannot be negative")
    net_fee = body.total_fee - body.discount
    if body.discount > body.total_fee or body.amount_paid > net_fee:
        raise HTTPException(status_code=422, detail="Payment and discount cannot exceed the course fee")
    duplicate = session.exec(
        select(Enrollment).where(
            Enrollment.student_id == body.student_id,
            Enrollment.batch_id == body.batch_id,
            Enrollment.status == "Active",
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Student is already active in this batch")
    active_count = session.exec(
        select(func.count(Enrollment.id)).where(
            Enrollment.batch_id == body.batch_id,
            Enrollment.status == "Active",
        )
    ).first() or 0
    if active_count >= batch.max_seats:
        raise HTTPException(status_code=409, detail="This batch has reached its seat limit")

    slip_num = "ADM-" + "".join(random.choices(string.digits, k=6))
    amount_due = body.total_fee - body.amount_paid - body.discount
    payment_status = "Paid" if amount_due <= 0 else ("Partial" if body.amount_paid > 0 else "Pending")
    salesperson_id = _student_salesperson_id(student, session) or actor.id
    enrollment = Enrollment(
        student_id=body.student_id, batch_id=body.batch_id, course_id=body.course_id,
        total_fee=body.total_fee, amount_paid=body.amount_paid, amount_due=max(0, amount_due),
        payment_mode=body.payment_mode, payment_status=payment_status,
        discount=body.discount, discount_reason=body.discount_reason,
        enrolled_by=salesperson_id, notes=body.notes, slip_number=slip_num
    )
    session.add(enrollment)
    session.flush()
    if body.amount_paid > 0:
        session.add(PaymentRecord(
            enrollment_id=enrollment.id,
            student_id=body.student_id, amount=body.amount_paid,
            payment_mode=body.payment_mode or "Cash", receipt_number=slip_num,
            recorded_by=actor.id,
        ))
    session.commit()
    session.refresh(enrollment)
    return {"enrollment": enrollment.dict()}


@router.patch("/enrollments/{enrollment_id}")
def update_enrollment(enrollment_id: int, body: EnrollmentUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    enrollment = session.get(Enrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    _require_enrollment_access(actor, enrollment, session)
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(enrollment, k, v)
    enrollment.amount_due = max(0, enrollment.total_fee - enrollment.amount_paid - enrollment.discount)
    if enrollment.amount_due <= 0:
        enrollment.payment_status = "Paid"
    elif enrollment.amount_paid > 0:
        enrollment.payment_status = "Partial"
    enrollment.updated_at = _utcnow()
    session.add(enrollment)
    session.commit()
    return {"enrollment": {"id": enrollment.id, "payment_status": enrollment.payment_status, "amount_due": enrollment.amount_due}}


@router.post("/enrollments/{enrollment_id}/generate-admission-slip")
def generate_admission_slip(enrollment_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo", "Student"])
    enrollment = session.get(Enrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    _require_enrollment_access(actor, enrollment, session)
    student = session.get(Student, enrollment.student_id)
    batch = session.get(Batch, enrollment.batch_id)
    course = session.get(Course, enrollment.course_id)
    instructor = session.get(Instructor, batch.instructor_id) if batch and batch.instructor_id else None
    enrollment.admission_slip_generated = True
    session.add(enrollment)
    session.commit()
    return {
        "slip_type": "admission",
        "slip_number": enrollment.slip_number,
        "student_name": student.name if student else "",
        "student_email": student.email if student else "",
        "student_phone": student.phone if student else "",
        "course_title": course.title if course else "",
        "batch_name": batch.batch_name if batch else "",
        "batch_code": batch.batch_code if batch else "",
        "start_date": batch.start_date.isoformat() if batch and batch.start_date else "",
        "schedule": batch.schedule if batch else "",
        "mode": batch.mode if batch else "",
        "instructor_name": instructor.name if instructor else "",
        "total_fee": enrollment.total_fee,
        "amount_paid": enrollment.amount_paid,
        "amount_due": enrollment.amount_due,
        "discount": enrollment.discount,
        "payment_status": enrollment.payment_status,
        "enrollment_date": enrollment.enrollment_date.isoformat(),
        "generated_at": _utcnow().isoformat()
    }


@router.post("/enrollments/{enrollment_id}/generate-advance-slip")
def generate_advance_slip(enrollment_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo", "Student"])
    enrollment = session.get(Enrollment, enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    _require_enrollment_access(actor, enrollment, session)
    student = session.get(Student, enrollment.student_id)
    batch = session.get(Batch, enrollment.batch_id)
    course = session.get(Course, enrollment.course_id)
    enrollment.advance_slip_generated = True
    session.add(enrollment)
    session.commit()
    return {
        "slip_type": "advance",
        "slip_number": "ADV-" + (enrollment.slip_number or "").replace("ADM-", ""),
        "student_name": student.name if student else "",
        "course_title": course.title if course else "",
        "batch_name": batch.batch_name if batch else "",
        "amount_paid": enrollment.amount_paid,
        "payment_mode": enrollment.payment_mode,
        "enrollment_date": enrollment.enrollment_date.isoformat(),
        "generated_at": _utcnow().isoformat()
    }


@router.post("/payments")
def add_payment(body: PaymentRecordRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Demo"])
    import random, string
    enrollment = session.get(Enrollment, body.enrollment_id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    student = _require_enrollment_access(actor, enrollment, session)
    if body.student_id != student.id:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    if body.amount <= 0 or body.amount > enrollment.amount_due:
        raise HTTPException(status_code=422, detail="Payment must be greater than zero and no more than the outstanding balance")
    receipt = body.receipt_number or "REC-" + "".join(random.choices(string.digits, k=6))
    payment = PaymentRecord(
        enrollment_id=body.enrollment_id, student_id=body.student_id,
        amount=body.amount, payment_mode=body.payment_mode,
        receipt_number=receipt, notes=body.notes
    )
    session.add(payment)
    # Update enrollment paid amount
    enrollment.amount_paid += body.amount
    enrollment.amount_due = max(0, enrollment.total_fee - enrollment.amount_paid - enrollment.discount)
    enrollment.payment_status = "Paid" if enrollment.amount_due <= 0 else "Partial"
    enrollment.updated_at = _utcnow()
    session.add(enrollment)
    session.commit()
    return {"payment": {"id": payment.id, "amount": payment.amount}, "receipt_number": receipt}


@router.post("/attendance")
def mark_attendance(body: AttendanceRequest, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "Instructor"])
    date_dt = _parse_dt(body.date) if body.date else _utcnow()
    attendance = Attendance(
        batch_id=body.batch_id, student_id=body.student_id,
        date=date_dt, status=body.status, notes=body.notes
    )
    session.add(attendance)
    session.commit()
    return {"attendance": {"id": attendance.id, "status": attendance.status}}


@router.get("/attendance")
def get_attendance(batch_id: int, date: Optional[str] = None, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Employee", "Instructor"])
    query = select(Attendance).where(Attendance.batch_id == batch_id)
    if date:
        target = _parse_dt(date).date()
        query = query.filter(func.date(Attendance.date) == target)
    records = session.exec(query).all()
    result = []
    for a in records:
        student = session.get(Student, a.student_id)
        result.append({
            "id": a.id, "student_id": a.student_id, "student_name": student.name if student else None,
            "date": a.date.isoformat(), "status": a.status, "notes": a.notes
        })
    return {"attendance": result}


def _create_institute_login(profile, role: str, body: InstituteLoginRequest, session: Session, allowed_roles: list[str]):
    actor = _require_roles(session, allowed_roles)
    if profile.user_id:
        raise HTTPException(status_code=409, detail="This profile already has a login account")
    if not profile.email:
        raise HTTPException(status_code=400, detail="Add an email address before creating a login")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if profile.tenant_id and actor.role != "SuperAdmin" and profile.tenant_id != actor.tenant_id:
        raise HTTPException(status_code=404, detail="Profile not found")
    existing = session.exec(select(User).where(User.email == profile.email).execution_options(skip_tenant=True)).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account already uses this email address")

    user = User(
        email=profile.email,
        password=_hash_password(body.password),
        name=profile.name,
        role=role,
        tenant_id=profile.tenant_id or actor.tenant_id,
    )
    session.add(user)
    session.flush()
    profile.user_id = user.id
    session.add(profile)
    session.commit()
    session.refresh(user)
    return {"user": _user_dict(user)}


@router.post("/students/{student_id}/login")
def create_student_login(student_id: int, body: InstituteLoginRequest, session: Session = Depends(get_session)):
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return _create_institute_login(student, "Student", body, session, ["Admin", "SalesManager"])


@router.post("/instructors/{instructor_id}/login")
def create_instructor_login(instructor_id: int, body: InstituteLoginRequest, session: Session = Depends(get_session)):
    instructor = session.get(Instructor, instructor_id)
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor not found")
    return _create_institute_login(instructor, "Instructor", body, session, ["Admin"])


def _institute_session_payload(class_session: InstituteSession) -> dict:
    start = class_session.scheduled_start.timestamp()
    end = class_session.scheduled_end.timestamp() if class_session.scheduled_end else start + 7200
    now = _utcnow().timestamp()
    return {
        "id": class_session.id,
        "batch_id": class_session.batch_id,
        "session_number": class_session.session_number,
        "title": class_session.title,
        "topic": class_session.topic,
        "scheduled_start": class_session.scheduled_start.isoformat(),
        "scheduled_end": class_session.scheduled_end.isoformat() if class_session.scheduled_end else None,
        "status": class_session.status,
        "is_live": class_session.status == "Live" or (start <= now <= end and class_session.status == "Scheduled"),
        "meeting_url": class_session.meeting_url,
        "notes": class_session.notes,
    }


def _require_instructor_batch_access(actor: User, batch: Batch, session: Session) -> None:
    if _normalize_role(actor.role) != "Instructor":
        return
    instructor = session.exec(select(Instructor).where(Instructor.user_id == actor.id)).first()
    if not instructor or batch.instructor_id != instructor.id:
        raise HTTPException(status_code=403, detail="This batch is not assigned to your instructor account")


def _require_student_profile_access(actor: User, student: Student, session: Session) -> None:
    actor_role = _normalize_role(actor.role)
    if actor_role == "Student":
        if student.user_id != actor.id:
            raise HTTPException(status_code=404, detail="Student not found")
        return
    _require_student_salesperson_access(actor, student, session)
    if actor_role == "Instructor":
        instructor = session.exec(select(Instructor).where(Instructor.user_id == actor.id)).first()
        if not instructor:
            raise HTTPException(status_code=403, detail="Instructor profile is not linked to this login")
        assigned_batches = select(Batch.id).where(Batch.instructor_id == instructor.id)
        enrollment = session.exec(
            select(Enrollment.id).where(
                Enrollment.student_id == student.id,
                Enrollment.batch_id.in_(assigned_batches),
                Enrollment.status == "Active",
            )
        ).first()
        if not enrollment:
            raise HTTPException(status_code=404, detail="Student not found in your assigned batches")


@router.get("/batches/{batch_id}/sessions")
def get_batch_sessions(batch_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    sessions = session.exec(
        select(InstituteSession)
        .where(InstituteSession.batch_id == batch_id)
        .order_by(InstituteSession.scheduled_start)
    ).all()
    session_items = []
    enrollments = session.exec(
        select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.status == "Active")
    ).all()
    enrolled_student_ids = [e.student_id for e in enrollments if e.student_id]
    student_by_id = {}
    if enrolled_student_ids:
        student_by_id = {
            s.id: s
            for s in session.exec(select(Student).where(Student.id.in_(enrolled_student_ids))).all()
        }
    session_ids = [s.id for s in sessions]
    attendance_by_key = {}
    progress_by_key = {}
    if session_ids and enrolled_student_ids:
        for a in session.exec(
            select(Attendance).where(
                Attendance.session_id.in_(session_ids),
                Attendance.student_id.in_(enrolled_student_ids),
            )
        ).all():
            attendance_by_key[(a.session_id, a.student_id)] = a
        for p in session.exec(
            select(StudentSessionProgress).where(
                StudentSessionProgress.session_id.in_(session_ids),
                StudentSessionProgress.student_id.in_(enrolled_student_ids),
            )
        ).all():
            progress_by_key[(p.session_id, p.student_id)] = p
    for class_session in sessions:
        item = _institute_session_payload(class_session)
        students = []
        for enrollment in enrollments:
            student = student_by_id.get(enrollment.student_id)
            if not student:
                continue
            attendance = attendance_by_key.get((class_session.id, student.id))
            progress = progress_by_key.get((class_session.id, student.id))
            students.append({
                "id": student.id,
                "name": student.name,
                "attendance_status": attendance.status if attendance else None,
                "progress_status": progress.status if progress else "Not Started",
                "completion_percent": progress.completion_percent if progress else 0,
            })
        item["students"] = students
        session_items.append(item)
    return {"sessions": session_items}


@router.post("/batches/{batch_id}/sessions")
def create_batch_session(batch_id: int, body: InstituteSessionCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    if body.scheduled_end and body.scheduled_end <= body.scheduled_start:
        raise HTTPException(status_code=422, detail="Session end must be after its start")
    last_session = session.exec(
        select(InstituteSession)
        .where(InstituteSession.batch_id == batch_id)
        .order_by(InstituteSession.session_number.desc())
    ).first()
    class_session = InstituteSession(
        batch_id=batch_id,
        session_number=(last_session.session_number + 1) if last_session else 1,
        title=body.title.strip(),
        topic=body.topic,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        status=body.status,
        meeting_url=body.meeting_url,
        notes=body.notes,
    )
    session.add(class_session)
    session.commit()
    session.refresh(class_session)
    return {"session": _institute_session_payload(class_session)}


@router.post("/batches/{batch_id}/tasks")
def create_batch_student_tasks(batch_id: int, body: BatchTaskCreateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Task title cannot be empty")
    enrollments = session.exec(select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.status == "Active")).all()
    if not enrollments:
        raise HTTPException(status_code=409, detail="Add active students to this batch before creating class tasks")
    tasks = []
    for enrollment in enrollments:
        tasks.append(Task(
            title=title,
            description=body.description,
            status="Todo",
            priority=body.priority,
            due_date=body.due_date,
            batch_id=batch_id,
            student_id=enrollment.student_id,
            assigned_to=actor.id,
            created_by=actor.id,
        ))
    session.add_all(tasks)
    session.commit()
    return {"created_count": len(tasks), "student_ids": [enrollment.student_id for enrollment in enrollments]}


@router.post("/batches/{batch_id}/students")
def add_students_to_batch(batch_id: int, body: BatchStudentsRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    course = session.get(Course, batch.course_id)
    if not course or not course.is_active or batch.status in ("Completed", "Cancelled"):
        raise HTTPException(status_code=409, detail="This batch is not accepting students")
    student_ids = list(dict.fromkeys(body.student_ids))
    if not student_ids:
        raise HTTPException(status_code=422, detail="Select at least one student")
    active_count = session.exec(select(func.count(Enrollment.id)).where(Enrollment.batch_id == batch_id, Enrollment.status == "Active")).first() or 0
    if active_count + len(student_ids) > batch.max_seats:
        raise HTTPException(status_code=409, detail=f"Only {max(0, batch.max_seats - active_count)} seats remain")
    new_enrollments = []
    for student_id in student_ids:
        student = session.get(Student, student_id)
        if not student or (student.tenant_id and actor.role != "SuperAdmin" and student.tenant_id != actor.tenant_id):
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found")
        if actor.role == "Instructor":
            _require_student_profile_access(actor, student, session)
        duplicate = session.exec(select(Enrollment.id).where(Enrollment.student_id == student_id, Enrollment.batch_id == batch_id, Enrollment.status == "Active")).first()
        if duplicate:
            raise HTTPException(status_code=409, detail=f"{student.name} is already active in this batch")
        slip_number = "ADM-" + "".join(random.choices(string.digits, k=6))
        fee = course.price or 0
        new_enrollments.append(Enrollment(
            tenant_id=actor.tenant_id,
            student_id=student_id,
            batch_id=batch_id,
            course_id=course.id,
            total_fee=fee,
            amount_paid=0,
            amount_due=fee,
            payment_status="Pending" if fee > 0 else "Paid",
            status="Active",
            enrolled_by=_student_salesperson_id(student, session),
            slip_number=slip_number,
        ))
    session.add_all(new_enrollments)
    session.commit()
    return {"added_count": len(new_enrollments), "student_ids": student_ids}


@router.post("/batches/{batch_id}/resources")
async def share_batch_resource(batch_id: int, file: UploadFile = File(...), description: str = Form(""), session: Session = Depends(get_session)):
    import os
    import uuid
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    enrollments = session.exec(select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.status == "Active")).all()
    if not enrollments:
        raise HTTPException(status_code=409, detail="Add active students before sharing a resource")
    filename = os.path.basename(file.filename or "class-resource")[:255]
    content = await file.read(15 * 1024 * 1024 + 1)
    if not content or len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Files must be between 1 byte and 15 MB")
    upload_root = os.path.join(os.path.dirname(__file__), "uploads", "students")
    os.makedirs(upload_root, exist_ok=True)
    uploads = []
    for enrollment in enrollments:
        storage_key = f"{uuid.uuid4().hex}{os.path.splitext(filename)[1].lower()}"
        with open(os.path.join(upload_root, storage_key), "wb") as target:
            target.write(content)
        uploads.append(StudentUpload(
            student_id=enrollment.student_id,
            uploaded_by=actor.id,
            filename=filename,
            storage_key=storage_key,
            content_type=file.content_type,
            size_bytes=len(content),
            description=(description.strip() or f"Shared with batch {batch.batch_name}")[:500],
        ))
    session.add_all(uploads)
    session.commit()
    return {"shared_with": len(uploads), "filename": filename}


@router.patch("/institute-sessions/{session_id}")
def update_institute_session(session_id: int, body: InstituteSessionUpdateRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    class_session = session.get(InstituteSession, session_id)
    if not class_session:
        raise HTTPException(status_code=404, detail="Session not found")
    batch = session.get(Batch, class_session.batch_id)
    if batch:
        _require_instructor_batch_access(actor, batch, session)
    data = body.dict(exclude_unset=True)
    start = data.get("scheduled_start", class_session.scheduled_start)
    end = data.get("scheduled_end", class_session.scheduled_end)
    if end and end <= start:
        raise HTTPException(status_code=422, detail="Session end must be after its start")
    for key, value in data.items():
        setattr(class_session, key, value)
    class_session.updated_at = _utcnow()
    session.add(class_session)
    session.commit()
    session.refresh(class_session)
    return {"session": _institute_session_payload(class_session)}


@router.post("/institute-sessions/{session_id}/attendance")
def mark_session_attendance(session_id: int, body: SessionAttendanceRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    class_session = session.get(InstituteSession, session_id)
    if not class_session:
        raise HTTPException(status_code=404, detail="Session not found")
    batch = session.get(Batch, class_session.batch_id)
    if batch:
        _require_instructor_batch_access(actor, batch, session)
    enrollment = session.exec(
        select(Enrollment).where(
            Enrollment.batch_id == class_session.batch_id,
            Enrollment.student_id == body.student_id,
            Enrollment.status == "Active",
        )
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Active student enrollment not found for this batch")
    record = session.exec(
        select(Attendance).where(
            Attendance.session_id == session_id,
            Attendance.student_id == body.student_id,
        )
    ).first()
    if record:
        record.status = body.status
        record.notes = body.notes
    else:
        record = Attendance(
            batch_id=class_session.batch_id,
            session_id=session_id,
            student_id=body.student_id,
            date=class_session.scheduled_start,
            status=body.status,
            notes=body.notes,
            marked_by=actor.id,
        )
    session.add(record)
    session.commit()
    return {"attendance": {"id": record.id, "student_id": record.student_id, "status": record.status}}


@router.post("/institute-sessions/{session_id}/progress")
def update_session_progress(session_id: int, body: SessionProgressRequest, session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Admin", "Employee", "Instructor"])
    class_session = session.get(InstituteSession, session_id)
    if not class_session:
        raise HTTPException(status_code=404, detail="Session not found")
    batch = session.get(Batch, class_session.batch_id)
    if batch:
        _require_instructor_batch_access(actor, batch, session)
    enrollment = session.exec(
        select(Enrollment).where(
            Enrollment.batch_id == class_session.batch_id,
            Enrollment.student_id == body.student_id,
            Enrollment.status == "Active",
        )
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Active student enrollment not found for this batch")
    if body.completion_percent < 0 or body.completion_percent > 100:
        raise HTTPException(status_code=422, detail="Completion must be between 0 and 100")
    progress = session.exec(
        select(StudentSessionProgress).where(
            StudentSessionProgress.session_id == session_id,
            StudentSessionProgress.student_id == body.student_id,
        )
    ).first()
    if not progress:
        progress = StudentSessionProgress(
            student_id=body.student_id,
            batch_id=class_session.batch_id,
            session_id=session_id,
        )
    progress.status = body.status
    progress.completion_percent = body.completion_percent
    progress.score = body.score
    progress.notes = body.notes
    progress.updated_at = _utcnow()
    session.add(progress)
    session.commit()
    return {"progress": {"id": progress.id, "status": progress.status, "completion_percent": progress.completion_percent}}


@router.post("/institute-resources/batches/{batch_id}")
async def upload_batch_resource(
    batch_id: int,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(""),
    session: Session = Depends(get_session),
):
    import os
    import uuid

    actor = _require_roles(session, ["Admin", "Instructor"])
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_instructor_batch_access(actor, batch, session)
    clean_title = title.strip()
    if not clean_title:
        raise HTTPException(status_code=422, detail="Resource title is required")
    filename = os.path.basename(file.filename or "resource")[:255]
    content = await file.read(20 * 1024 * 1024 + 1)
    if not content or len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resources must be between 1 byte and 20 MB")
    storage_key = f"{uuid.uuid4().hex}{os.path.splitext(filename)[1].lower()}"
    root = os.path.join(os.path.dirname(__file__), "uploads", "institute_resources")
    os.makedirs(root, exist_ok=True)
    with open(os.path.join(root, storage_key), "wb") as target:
        target.write(content)
    resource = InstituteResource(
        tenant_id=batch.tenant_id,
        course_id=batch.course_id,
        batch_id=batch.id,
        title=clean_title[:255],
        description=description.strip()[:500] or None,
        filename=filename,
        storage_key=storage_key,
        content_type=file.content_type,
        size_bytes=len(content),
        uploaded_by=actor.id,
    )
    session.add(resource)
    session.commit()
    session.refresh(resource)
    return {"resource": {"id": resource.id, "title": resource.title, "description": resource.description, "filename": resource.filename, "size_bytes": resource.size_bytes, "created_at": resource.created_at.isoformat()}}


@router.get("/institute-resources/{resource_id}/download")
def download_institute_resource(resource_id: int, session: Session = Depends(get_session)):
    import os
    from fastapi.responses import FileResponse

    actor = _require_roles(session, ["Admin", "Employee", "SalesManager", "Sales", "Instructor", "Student", "Demo"])
    actor_role = _normalize_role(actor.role)
    resource = session.get(InstituteResource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if actor_role == "Student":
        student = session.exec(select(Student).where(Student.user_id == actor.id)).first()
        enrollment_query = select(Enrollment.id).where(
            Enrollment.student_id == (student.id if student else -1),
            Enrollment.course_id == resource.course_id,
            Enrollment.status.in_(("Active", "Completed")),
        )
        if resource.batch_id:
            enrollment_query = enrollment_query.where(Enrollment.batch_id == resource.batch_id)
        if not session.exec(enrollment_query).first():
            raise HTTPException(status_code=404, detail="Resource not found")
    elif actor_role == "Instructor":
        if resource.batch_id:
            batch = session.get(Batch, resource.batch_id)
            if not batch:
                raise HTTPException(status_code=404, detail="Resource not found")
            _require_instructor_batch_access(actor, batch, session)
    elif actor_role in ("SalesManager", "Employee", "Sales", "Demo"):
        enrollments = session.exec(select(Enrollment).where(Enrollment.course_id == resource.course_id)).all()
        if not any(
            (student := session.get(Student, enrollment.student_id))
            and (not resource.batch_id or enrollment.batch_id == resource.batch_id)
            and _student_salesperson_id(student, session) == actor.id
            for enrollment in enrollments
        ):
            raise HTTPException(status_code=404, detail="Resource not found")
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), "uploads", "institute_resources"))
    path = os.path.realpath(os.path.join(root, resource.storage_key))
    if os.path.commonpath([root, path]) != root or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Resource not found")
    return FileResponse(path, filename=resource.filename, media_type=resource.content_type or "application/octet-stream")


@router.delete("/institute-resources/{resource_id}")
def delete_institute_resource(resource_id: int, session: Session = Depends(get_session)):
    import os

    actor = _require_roles(session, ["Admin", "Instructor"])
    resource = session.get(InstituteResource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if resource.batch_id:
        batch = session.get(Batch, resource.batch_id)
        if batch:
            _require_instructor_batch_access(actor, batch, session)
    path = os.path.join(os.path.dirname(__file__), "uploads", "institute_resources", resource.storage_key)
    session.delete(resource)
    session.commit()
    if os.path.isfile(path):
        os.remove(path)
    return {"ok": True}


@router.get("/student-portal/learning")
def get_student_learning(session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Student"])
    student = session.exec(select(Student).where(Student.user_id == actor.id)).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile is not linked to this login")
    enrollments = session.exec(select(Enrollment).where(Enrollment.student_id == student.id)).all()
    courses = []
    for enrollment in enrollments:
        if enrollment.status not in ("Active", "Completed"):
            continue
        batch = session.get(Batch, enrollment.batch_id)
        course = session.get(Course, enrollment.course_id)
        if not batch or not course:
            continue
        instructor = session.get(Instructor, batch.instructor_id) if batch.instructor_id else None
        resources = session.exec(
            select(InstituteResource)
            .where(
                InstituteResource.course_id == course.id,
                or_(InstituteResource.batch_id == batch.id, InstituteResource.batch_id.is_(None)),
            )
            .order_by(InstituteResource.created_at.desc())
        ).all()
        reviews = session.exec(
            select(InstructorFeedback).where(
                InstructorFeedback.student_id == student.id,
                InstructorFeedback.batch_id == batch.id,
            )
        ).all()
        sessions = session.exec(
            select(InstituteSession)
            .where(InstituteSession.batch_id == batch.id)
            .order_by(InstituteSession.scheduled_start)
        ).all()
        progress_rows = session.exec(
            select(StudentSessionProgress).where(
                StudentSessionProgress.student_id == student.id,
                StudentSessionProgress.batch_id == batch.id,
            )
        ).all()
        attendance_rows = session.exec(
            select(Attendance).where(
                Attendance.student_id == student.id,
                Attendance.batch_id == batch.id,
                Attendance.session_id.is_not(None),
            )
        ).all()
        progress_by_session = {item.session_id: item for item in progress_rows}
        attendance_by_session = {item.session_id: item for item in attendance_rows}
        session_items = []
        for class_session in sessions:
            item = _institute_session_payload(class_session)
            progress = progress_by_session.get(class_session.id)
            attendance = attendance_by_session.get(class_session.id)
            item["progress"] = {
                "status": progress.status if progress else "Not Started",
                "completion_percent": progress.completion_percent if progress else 0,
                "score": progress.score if progress else None,
                "notes": progress.notes if progress else None,
            }
            item["attendance_status"] = attendance.status if attendance else None
            session_items.append(item)
        courses.append({
            "enrollment_id": enrollment.id,
            "course_id": course.id,
            "course_title": course.title,
            "batch_id": batch.id,
            "batch_name": batch.batch_name,
            "batch_status": batch.status,
            "enrollment_status": enrollment.status,
            "payment_status": enrollment.payment_status,
            "total_fee": enrollment.total_fee,
            "amount_paid": enrollment.amount_paid,
            "amount_due": enrollment.amount_due,
            "slip_number": enrollment.slip_number,
            "admission_slip_generated": enrollment.admission_slip_generated,
            "advance_slip_generated": enrollment.advance_slip_generated,
            "start_date": batch.start_date.isoformat() if batch.start_date else None,
            "end_date": batch.end_date.isoformat() if batch.end_date else None,
            "schedule": batch.schedule,
            "room_or_link": batch.room_or_link,
            "instructor_name": instructor.name if instructor else None,
            "instructor": {
                "id": instructor.id,
                "name": instructor.name,
                "email": instructor.email,
                "phone": instructor.phone,
                "bio": instructor.bio,
                "expertise": instructor.expertise,
                "qualification": instructor.qualification,
                "experience_years": instructor.experience_years,
                "photo_url": instructor.photo_url,
            } if instructor else None,
            "resources": [{"id": item.id, "title": item.title, "description": item.description, "filename": item.filename, "size_bytes": item.size_bytes, "created_at": item.created_at.isoformat()} for item in resources],
            "review": {"rating": reviews[0].rating, "feedback_text": reviews[0].feedback_text} if reviews else None,
            "progress_percent": round(sum(item["progress"]["completion_percent"] for item in session_items) / len(session_items)) if session_items else 0,
            "sessions": session_items,
        })
    notes = session.exec(select(StudentNote).where(StudentNote.student_id == student.id).order_by(StudentNote.created_at.desc())).all()
    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "email": student.email,
            "phone": student.phone,
            "address": student.address,
            "gender": student.gender,
            "qualification": student.qualification,
            "education_level": student.education_level,
            "gpa": student.gpa,
            "academic_background": student.academic_background,
            "career_goal": student.career_goal,
            "guardian_name": student.guardian_name,
            "guardian_phone": student.guardian_phone,
            "source": student.source,
            "status": student.status,
        },
        "notes": [{"id": note.id, "content": note.content, "created_at": note.created_at.isoformat()} for note in notes],
        "courses": courses,
    }


@router.get("/student-portal/tasks")
def get_student_portal_tasks(session: Session = Depends(get_session)):
    """Return tasks assigned to the authenticated student with submission details."""
    actor = _require_roles(session, ["Student"])
    student = session.exec(select(Student).where(Student.user_id == actor.id)).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile is not linked to this login")
    tasks_rows = session.exec(
        select(Task).where(Task.student_id == student.id).order_by(Task.created_at.desc())
    ).all()
    tasks = _task_dicts(tasks_rows, session)
    return {"tasks": tasks, "total": len(tasks), "completed": sum(1 for t in tasks if t.get("status") == "Done")}


@router.post("/student-portal/tasks/{task_id}/submit")
async def student_portal_submit_task(
    task_id: int,
    submission_url: Optional[str] = Form(None),
    submission_notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
):
    """Allow student to submit a task from the student portal."""
    actor = _require_roles(session, ["Student"])
    student = session.exec(select(Student).where(Student.user_id == actor.id)).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not linked")
    task = session.get(Task, task_id)
    if not task or task.student_id != student.id:
        raise HTTPException(status_code=404, detail="Task not found or not assigned to you")
    if not submission_url and not submission_notes and not file:
        raise HTTPException(status_code=422, detail="Provide a URL, notes, or upload a file")
    task.submission_url = submission_url or task.submission_url
    task.submission_notes = submission_notes or task.submission_notes
    task.status = "Done"
    task.submitted_at = _utcnow()
    if file:
        import uuid
        ext = os.path.splitext(file.filename or "")[1]
        storage_key = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(os.path.dirname(__file__), "uploads", "tasks")
        os.makedirs(dest, exist_ok=True)
        content = await file.read()
        with open(os.path.join(dest, storage_key), "wb") as fh:
            fh.write(content)
        task.submission_file = f"/uploads/tasks/{storage_key}"
    session.add(task)
    session.commit()
    session.refresh(task)
    return {"task": _task_dict(task, session)}


@router.get("/instructor-portal/teaching")
def get_instructor_teaching(session: Session = Depends(get_session)):
    actor = _require_roles(session, ["Instructor"])
    instructor = session.exec(select(Instructor).where(Instructor.user_id == actor.id)).first()
    if not instructor:
        raise HTTPException(status_code=404, detail="Instructor profile is not linked to this login")
    batches = session.exec(select(Batch).where(Batch.instructor_id == instructor.id)).all()
    teaching = []
    for batch in batches:
        course = session.get(Course, batch.course_id)
        enrollments = session.exec(
            select(Enrollment).where(Enrollment.batch_id == batch.id, Enrollment.status == "Active")
        ).all()
        sessions = session.exec(
            select(InstituteSession)
            .where(InstituteSession.batch_id == batch.id)
            .order_by(InstituteSession.scheduled_start)
        ).all()
        resources = session.exec(
            select(InstituteResource)
            .where(InstituteResource.course_id == batch.course_id, InstituteResource.batch_id == batch.id)
            .order_by(InstituteResource.created_at.desc())
        ).all()
        teaching.append({
            "batch_id": batch.id,
            "batch_name": batch.batch_name,
            "batch_status": batch.status,
            "course_title": course.title if course else None,
            "start_date": batch.start_date.isoformat() if batch.start_date else None,
            "schedule": batch.schedule,
            "room_or_link": batch.room_or_link,
            "students": [{"id": (student := session.get(Student, item.student_id)).id, "name": student.name} for item in enrollments if session.get(Student, item.student_id)],
            "sessions": [_institute_session_payload(item) for item in sessions],
            "resources": [{"id": item.id, "title": item.title, "filename": item.filename, "size_bytes": item.size_bytes, "created_at": item.created_at.isoformat()} for item in resources],
        })
    return {"instructor": {"id": instructor.id, "name": instructor.name}, "batches": teaching}


@router.get("/institute/analytics")
def get_institute_analytics(session: Session = Depends(get_session)):
    # Revenue
    _require_roles(session, ["Admin", "Employee", "SalesManager", "Demo"])
    enrollments = session.exec(select(Enrollment)).all()
    total_revenue = sum(float(e.amount_paid or 0) for e in enrollments)
    total_due = sum(float(e.amount_due or 0) for e in enrollments)
    total_enrollments = len(enrollments)
    active_enrollments = len([e for e in enrollments if e.status == "Active"])

    # Students
    total_students = session.exec(select(func.count(Student.id))).first() or 0
    active_students = session.exec(select(func.count(Student.id)).where(Student.status == "Active")).first() or 0

    # Courses & Batches
    total_courses = session.exec(select(func.count(Course.id))).first() or 0
    active_courses = session.exec(select(func.count(Course.id)).where(Course.is_active == True)).first() or 0
    total_batches = session.exec(select(func.count(Batch.id))).first() or 0
    active_batches = session.exec(select(func.count(Batch.id)).where(Batch.status == "Active")).first() or 0

    # Leads conversion
    total_leads = session.exec(select(func.count(Lead.id))).first() or 0
    converted_leads = session.exec(select(func.count(Lead.id)).where(Lead.is_converted == True)).first() or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0

    # Revenue by course
    revenue_by_course = []
    courses = session.exec(select(Course)).all()
    for c in courses:
        course_enrollments = [e for e in enrollments if e.course_id == c.id]
        rev = sum(float(e.amount_paid or 0) for e in course_enrollments)
        if rev > 0:
            revenue_by_course.append({"course": c.title, "revenue": rev, "students": len(course_enrollments)})
    revenue_by_course.sort(key=lambda x: x["revenue"], reverse=True)

    # Monthly revenue (last 6 months)
    from datetime import timedelta
    monthly_revenue = []
    for i in range(5, -1, -1):
        month_start = _utcnow().replace(day=1) - timedelta(days=30*i)
        month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_enrollments = [e for e in enrollments if e.enrollment_date and month_start <= e.enrollment_date < month_end]
        monthly_revenue.append({
            "month": month_start.strftime("%b %Y"),
            "revenue": sum(float(e.amount_paid or 0) for e in month_enrollments),
            "enrollments": len(month_enrollments)
        })

    # Instructor stats
    instructors = session.exec(select(Instructor)).all()
    instructor_stats = []
    for ins in instructors:
        ins_batches = session.exec(select(Batch).where(Batch.instructor_id == ins.id)).all()
        ins_student_ids = set()
        for assigned_batch in ins_batches:
            ins_student_ids.update(session.exec(select(Enrollment.student_id).where(Enrollment.batch_id == assigned_batch.id, Enrollment.status == "Active")).all())
        feedbacks = session.exec(select(InstructorFeedback).where(InstructorFeedback.instructor_id == ins.id)).all()
        avg_r = round(sum(f.rating for f in feedbacks) / len(feedbacks), 1) if feedbacks else 0.0
        now = _utcnow()
        instructor_stats.append({
            "id": ins.id, "name": ins.name, "batches": len(ins_batches),
            "active_batches": sum(1 for item in ins_batches if item.status == "Active"),
            "upcoming_batches": sum(1 for item in ins_batches if item.status == "Upcoming" or (item.start_date and item.start_date > now and item.status not in ("Completed", "Cancelled"))),
            "past_batches": sum(1 for item in ins_batches if item.status == "Completed" or (item.end_date and item.end_date < now)),
            "students": len(ins_student_ids), "avg_rating": avg_r
        })

    # Sales performance
    users = session.exec(select(User).where(User.role.in_(["Admin", "SalesManager", "Employee"]))).all()
    sales_stats = []
    for u in users:
        assigned_leads = session.exec(select(Lead).where(Lead.owner_id == u.id)).all()
        converted = [l for l in assigned_leads if l.converted_student_id]
        sales_stats.append({
            "user_id": u.id, "name": u.name, "role": u.role,
            "leads_assigned": len(assigned_leads), "leads_converted": len(converted),
            "conversion_rate": round(len(converted) / max(len(assigned_leads), 1) * 100, 1)
        })
    sales_stats = [s for s in sales_stats if s["leads_assigned"] > 0]

    return {
        "revenue": {
            "total_collected": total_revenue,
            "total_due": total_due,
            "total_billed": total_revenue + total_due,
        },
        "students": {"total": total_students, "active": active_students},
        "courses": {"total": total_courses, "active": active_courses},
        "batches": {"total": total_batches, "active": active_batches},
        "enrollments": {"total": total_enrollments, "active": active_enrollments},
        "leads": {"total": total_leads, "converted": converted_leads, "conversion_rate": conversion_rate},
        "revenue_by_course": revenue_by_course[:10],
        "monthly_revenue": monthly_revenue,
        "instructor_stats": instructor_stats,
        "sales_stats": sales_stats
    }


@router.get("/institute/team-performance")
def get_institute_team_performance(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "Demo"])
    sales_users, assignment_metrics = _salesperson_assignment_metrics(session)
    sales_users.sort(key=lambda user: user.name.lower())
    sales = []
    for user in sales_users:
        assigned_leads = session.exec(select(Lead).where(Lead.owner_id == user.id)).all()
        converted = [lead for lead in assigned_leads if lead.converted_student_id]
        student_ids = [lead.converted_student_id for lead in converted]
        assigned_students = session.exec(select(Student).where(Student.assigned_salesperson_id == user.id)).all()
        assigned_lead_ids = [lead.id for lead in assigned_leads if lead.id is not None]
        demo_sessions = session.exec(select(LeadDemoSession).where(LeadDemoSession.lead_id.in_(assigned_lead_ids))).all() if assigned_lead_ids else []
        attended_lead_ids = {demo.lead_id for demo in demo_sessions if demo.status == "Attended"}
        converted_after_demo = len({lead.id for lead in converted if lead.id in attended_lead_ids})
        sales.append({
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "leads_assigned": len(assigned_leads),
            "leads_converted": len(converted),
            "conversion_rate": round(len(converted) / len(assigned_leads) * 100, 1) if assigned_leads else 0,
            "students_enrolled": len(set(student_ids) | {student.id for student in assigned_students if student.id is not None}),
            "assigned_students": len(assigned_students),
            "enrollments": session.exec(select(func.count(Enrollment.id)).where(Enrollment.enrolled_by == user.id)).first() or 0,
            "revenue_collected": round(assignment_metrics[user.id]["revenue_collected"], 2),
            "assigned_workload": assignment_metrics[user.id]["assigned_workload"],
            "demos_scheduled": sum(1 for demo in demo_sessions if demo.status == "Scheduled"),
            "demos_attended": sum(1 for demo in demo_sessions if demo.status == "Attended"),
            "demos_missed": sum(1 for demo in demo_sessions if demo.status == "Missed"),
            "demos_cancelled": sum(1 for demo in demo_sessions if demo.status == "Cancelled"),
            "demo_to_conversion_count": converted_after_demo,
            "demo_to_conversion_rate": round(converted_after_demo / len(attended_lead_ids) * 100, 1) if attended_lead_ids else 0,
        })
    instructors = []
    for instructor in session.exec(select(Instructor).order_by(Instructor.name)).all():
        batches = session.exec(select(Batch).where(Batch.instructor_id == instructor.id)).all()
        students = set()
        for assigned_batch in batches:
            students.update(session.exec(select(Enrollment.student_id).where(Enrollment.batch_id == assigned_batch.id, Enrollment.status == "Active")).all())
        feedback = session.exec(select(InstructorFeedback).where(InstructorFeedback.instructor_id == instructor.id)).all()
        instructors.append({
            "id": instructor.id,
            "user_id": instructor.user_id,
            "name": instructor.name,
            "email": instructor.email,
            "is_active": instructor.is_active,
            "students": len(students),
            "batches_total": len(batches),
            "batches_active": sum(1 for item in batches if item.status == "Active"),
            "batches_upcoming": sum(1 for item in batches if item.status == "Upcoming"),
            "batches_completed": sum(1 for item in batches if item.status == "Completed"),
            "avg_rating": round(sum(item.rating for item in feedback) / len(feedback), 1) if feedback else 0,
        })
    return {"sales": sales, "instructors": instructors}

