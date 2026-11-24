"""
Shop & Public Proposal Generator Router:
Powers the public storefront (e.g., shop.dapros.serphawk.in or /shop) where customers can browse
services, build a live proposal cart, and generate a discussion proposal URL.
Automatically creates an entry in the CRM under Leads and Proposals.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from database import (
    get_session,
    Lead,
    Contact,
    Proposal,
    InventoryItem,
    ActivityLog,
    Notification,
    _utcnow
)
from modules.tenant_scope import current_tenant_id, platform_management_write
from database import Tenant

router = APIRouter(prefix="/shop", tags=["Storefront Proposals"])

DEFAULT_STORE_SERVICES = [
    {
        "id": 101,
        "name": "Enterprise SEO & Growth Retainer",
        "category": "SEO & Growth",
        "unit_price": 2499.0,
        "unit": "month",
        "description": "Comprehensive technical SEO, keyword research, competitor gap analysis, and monthly executive ranking reporting.",
        "photo_url": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
        "badge": "Popular"
    },
    {
        "id": 102,
        "name": "360° AI Market Intelligence & Competitor Audit",
        "category": "AI Intelligence",
        "unit_price": 999.0,
        "unit": "audit",
        "description": "Complete scan of competitor rankings, backlinks, SWOT analysis, and custom AI pitch angle generation.",
        "photo_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
        "badge": "AI Powered"
    },
    {
        "id": 103,
        "name": "Autonomous AI Voice Agent Setup",
        "category": "Automation",
        "unit_price": 1499.0,
        "unit": "setup",
        "description": "Configured interactive AI voice caller for incoming lead triage, appointment booking, and automated follow-ups.",
        "photo_url": "https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&w=600&q=80",
        "badge": "High Conversion"
    },
    {
        "id": 104,
        "name": "Local Map Pack & GMB Domination",
        "category": "Local SEO",
        "unit_price": 799.0,
        "unit": "month",
        "description": "Google Business Profile citation building, geo-tagged reviews strategy, and localized rank acceleration.",
        "photo_url": "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80",
        "badge": "Local Pack"
    },
    {
        "id": 105,
        "name": "Multi-Tenant CRM Implementation & Training",
        "category": "CRM Systems",
        "unit_price": 1999.0,
        "unit": "package",
        "description": "Full setup of custom pipelines, email sync, role-based access, and 1-on-1 team onboarding sessions.",
        "photo_url": "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=80",
        "badge": "Enterprise"
    },
    {
        "id": 106,
        "name": "High-Authority Domain Authority Backlinks (Pack of 10)",
        "category": "SEO & Growth",
        "unit_price": 1200.0,
        "unit": "pack",
        "description": "DA 50+ contextual editorial placements with permanent do-follow links on niche relevant industry sites.",
        "photo_url": "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80",
        "badge": "Guaranteed"
    }
]


@router.get("/catalog")
def get_store_catalog(session: Session = Depends(get_session)):
    """Public catalog of available packages and inventory items for storefront."""
    tenant_id = current_tenant_id.get()
    if tenant_id is None or tenant_id < 1:
        first_t = session.exec(select(Tenant)).first()
        tenant_id = first_t.id if first_t else 1
        current_tenant_id.set(tenant_id)
    platform_management_write.set(True)
    
    # Check if there are inventory items
    inv_items = session.exec(select(InventoryItem)).all()
    if inv_items and len(inv_items) > 0:
        custom_items = []
        for it in inv_items:
            custom_items.append({
                "id": it.id,
                "name": it.name,
                "category": it.category or "Products & Services",
                "unit_price": 100.0,  # fallback base
                "unit": it.unit or "package",
                "description": it.description or "Professional business package.",
                "photo_url": it.photo_url or "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
                "badge": "Available"
            })
        return {"items": custom_items + DEFAULT_STORE_SERVICES}
    
    return {"items": DEFAULT_STORE_SERVICES}


@router.post("/proposals")
def create_customer_proposal(payload: Dict[str, Any], session: Session = Depends(get_session)):
    """
    Creates a new proposal and lead directly from the customer storefront cart.
    Returns a live discussion URL where customer and sales team can negotiate and accept.
    """
    tenant_id = current_tenant_id.get()
    if tenant_id is None or tenant_id < 1:
        first_t = session.exec(select(Tenant)).first()
        tenant_id = first_t.id if first_t else 1
        current_tenant_id.set(tenant_id)
    platform_management_write.set(True)

    company_name = (payload.get("company_name") or "Prospective Client").strip()
    contact_name = (payload.get("contact_name") or company_name).strip()
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    notes = (payload.get("notes") or "").strip()
    items = payload.get("items") or []

    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty. Please select at least one item.")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Please provide either an email or phone number to receive your proposal.")

    # Calculate total
    total_val = 0.0
    formatted_line_items = []
    for it in items:
        qty = max(1, int(it.get("quantity") or 1))
        price = float(it.get("unit_price") or it.get("price") or 0.0)
        item_total = qty * price
        total_val += item_total
        formatted_line_items.append({
            "id": it.get("id"),
            "name": it.get("name"),
            "category": it.get("category"),
            "unit_price": price,
            "quantity": qty,
            "total": item_total
        })

    # 1. Create or Find Lead in CRM
    lead = None
    if email:
        lead_q = select(Lead).where(Lead.email == email)
        if tenant_id:
            lead_q = lead_q.where(Lead.tenant_id == tenant_id)
        lead = session.exec(lead_q).first()

    if not lead:
        lead = Lead(
            tenant_id=tenant_id,
            company_name=company_name,
            email=email or None,
            phone=phone or None,
            source="Storefront / Shop",
            status="Proposal Sent",
            deal_value=total_val,
            notes=f"Created via Storefront Cart.\nCustomer Note: {notes}\nItems: {', '.join(it['name'] for it in formatted_line_items)}",
            custom_fields={
                "channel": "Storefront",
                "cart_total": total_val,
                "initial_contact": contact_name
            }
        )
        session.add(lead)
        session.flush()

        # Add Contact
        if contact_name:
            c_parts = contact_name.strip().split(" ", 1)
            c_fname = c_parts[0]
            c_lname = c_parts[1] if len(c_parts) > 1 else ""
            c = Contact(
                tenant_id=tenant_id,
                lead_id=lead.id,
                first_name=c_fname,
                last_name=c_lname,
                full_name=contact_name,
                email=email or None,
                mobile_number=phone or None,
                designation="Prospect / Buyer",
                department="Purchasing"
            )
            session.add(c)
    else:
        # Update existing lead status and deal value
        lead.deal_value = (lead.deal_value or 0.0) + total_val
        lead.notes = (lead.notes or "") + f"\n\n[Storefront Cart Update]: Added {len(formatted_line_items)} items ($ {total_val:.2f})."
        session.add(lead)
        session.flush()

    # 2. Create Proposal in CRM
    share_token = str(uuid.uuid4())
    initial_discussion = [
        {
            "id": str(uuid.uuid4()),
            "sender": contact_name,
            "role": "Customer",
            "message": f"Hello, I generated this proposal from your storefront with {len(formatted_line_items)} items. Looking forward to discussing implementation details!",
            "timestamp": _utcnow().isoformat()
        }
    ]
    if notes:
        initial_discussion.append({
            "id": str(uuid.uuid4()),
            "sender": contact_name,
            "role": "Customer",
            "message": f"Special requirements / Note: {notes}",
            "timestamp": _utcnow().isoformat()
        })

    proposal = Proposal(
        tenant_id=tenant_id,
        title=f"Store Proposal for {company_name}",
        lead_id=lead.id,
        recipient_type="lead",
        status="Sent",
        total_value=total_val,
        currency="USD",
        line_items=formatted_line_items,
        notes=f"Customer self-service from Storefront Cart.\nShare Token: {share_token}",
        created_at=_utcnow(),
        updated_at=_utcnow()
    )
    session.add(proposal)
    session.flush()

    # Log activity in CRM
    activity = ActivityLog(
        action="Proposal Created",
        method="STOREFRONT_CART",
        content=f"Customer {contact_name} ({company_name}) built a proposal cart worth ${total_val:,.2f} via Storefront.",
        leadId=lead.id,
        createdAt=_utcnow()
    )
    session.add(activity)

    session.commit()

    return {
        "ok": True,
        "proposal_id": proposal.id,
        "share_token": share_token,
        "lead_id": lead.id,
        "total_value": total_val,
        "share_url": f"/proposals/{proposal.id}?token={share_token}",
        "message": "Proposal successfully generated and logged in CRM."
    }


@router.get("/proposals/{proposal_id}")
def get_public_proposal(proposal_id: int, token: Optional[str] = None, session: Session = Depends(get_session)):
    """Fetch proposal details for public view & discussion."""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    lead_name = "Valued Customer"
    if proposal.lead_id:
        l = session.get(Lead, proposal.lead_id)
        if l:
            lead_name = l.company_name

    return {
        "ok": True,
        "proposal": {
            "id": proposal.id,
            "title": proposal.title,
            "status": proposal.status,
            "total_value": proposal.total_value,
            "currency": getattr(proposal, "currency", "USD") or "USD",
            "line_items": proposal.line_items or [],
            "notes": proposal.notes,
            "created_at": proposal.created_at.isoformat() if proposal.created_at else None,
            "signed_at": proposal.signed_at.isoformat() if proposal.signed_at else None,
            "client_name": lead_name
        }
    }


@router.post("/proposals/{proposal_id}/discussion")
def add_proposal_discussion(proposal_id: int, payload: Dict[str, Any], session: Session = Depends(get_session)):
    """Append a message to the proposal negotiation / discussion thread."""
    proposal = session.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    sender = payload.get("sender") or "Client"
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Record message in CRM activity log
    act = ActivityLog(
        action="Proposal Discussion",
        method="STOREFRONT_NEGOTIATION",
        content=f"[{sender} on Proposal #{proposal_id}]: {message}",
        leadId=proposal.lead_id or 0,
        createdAt=_utcnow()
    )
    session.add(act)
    session.commit()

    return {
        "ok": True,
        "message_entry": {
            "id": str(uuid.uuid4()),
            "sender": sender,
            "message": message,
            "timestamp": _utcnow().isoformat()
        }
    }
