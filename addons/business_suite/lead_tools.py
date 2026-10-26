"""
Lead intake and assignment tools from the SCM BPO and SCM HB deployments.

  POST /leads/auto-assign                      give every unassigned lead of the company to someone (Admin)
  POST /leads/auto-assign-all                  the same under the SCM HB name (Admin / SalesManager / Demo)
  POST /leads/{id}/auto-assign-employee        pick the best salesperson for one lead (Admin)
  GET  /leads/webhook, /api/leads/webhook      health check and field list for the website form (public)
  POST /leads/webhook, /api/leads/webhook      a website form creates a lead (public, needs the company's intake key)

The original webhook let anyone on the internet create leads in "tenant 1", or in any tenant named in the request. Here the
caller proves which company it is with that company's own key (setting ``lead_intake_api_key``, sent as ``X-API-Key`` or
``api_key``); with no key set the webhook is closed for that company. The key alone identifies the company, so an existing
website form only has to add the header. Who gets the lead is the company's own ``lead_assignment`` strategy.
"""
import hmac
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

import database
from database import ActivityLog, ClientNote, Contact, Lead, TenantSettings
from modules import features, lead_assignment, ratelimit, tenant_settings
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["lead-tools"])


def get_session():
    with Session(database.engine) as session:
        yield session


def _require_roles(session, roles):
    from main import _require_roles as f           # lazy: main imports this package while it loads
    return f(session, roles)


def _notify_admins(*args, **kwargs):
    from main import _notify_admins as f
    return f(*args, **kwargs)


def _tenant_or_400() -> int:
    tid = current_tenant_id.get()
    if tid is None or tid < 1:
        raise HTTPException(status_code=400, detail="Pick a client first: this action works inside one company.")
    return tid


# ── assignment ───────────────────────────────────────────────────────────────
def _assign_everything(session: Session, strategy_default: str) -> dict:
    tid = _tenant_or_400()
    strategy = lead_assignment.strategy_for(tid, strategy_default)
    unassigned = session.exec(select(Lead.id).where(Lead.tenant_id == tid, (Lead.owner_id == None) | (Lead.owner_id == 0))).all()  # noqa: E711
    if not unassigned:
        return {"ok": True, "assigned": 0, "assigned_count": 0, "message": "All leads are already assigned."}
    if lead_assignment.choose_salesperson(session, tid, strategy) is None:
        raise HTTPException(status_code=409, detail="Add an active salesperson before using auto-assign.")
    assignments = lead_assignment.assign_all_unassigned(session, tid, strategy)
    return {"ok": True, "assigned": len(assignments), "assigned_count": len(assignments), "assignments": assignments,
            "message": f"Assigned {len(assignments)} lead{'s' if len(assignments) != 1 else ''} using the {strategy} rule."}


@router.post("/leads/auto-assign")
def auto_assign_unassigned(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    return _assign_everything(session, "workload")


@router.post("/leads/auto-assign-all")
def auto_assign_all(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "SalesManager", "Demo"])
    return _assign_everything(session, "revenue")


@router.post("/leads/{lead_id}/auto-assign-employee")
def auto_assign_one(lead_id: int, session: Session = Depends(get_session)):
    _require_roles(session, ["Admin"])
    tid = _tenant_or_400()
    lead = session.get(Lead, lead_id)
    if not lead or lead.tenant_id != tid:
        raise HTTPException(status_code=404, detail="Lead not found")
    rep = lead_assignment.choose_salesperson(session, tid, lead_assignment.strategy_for(tid, "revenue"))
    if rep is None:
        raise HTTPException(status_code=409, detail="Add an active salesperson before using auto-assign.")
    lead.owner_id = rep.id
    session.add(lead)
    if getattr(lead, "converted_student_id", None) and features.is_enabled(tid, "institute"):
        from addons.institute.models import Student
        student = session.get(Student, lead.converted_student_id)
        if student:
            student.assigned_salesperson_id = rep.id
            session.add(student)
    session.commit()
    return {"ok": True, "employee_id": rep.id, "employee_name": rep.name}


# ── website lead webhook ─────────────────────────────────────────────────────
_RESERVED = {
    "name", "full_name", "first_name", "last_name", "company_name", "company", "business_name", "email", "email_address",
    "phone", "mobile", "phone_number", "contact_number", "form_name", "form_id", "form_title", "page_url", "url", "referer",
    "service", "services_interested", "service_requested", "subject", "message", "notes", "inquiry", "comments",
    "description", "source", "tenant_id", "api_key",
}


@router.get("/api/leads/webhook")
@router.get("/leads/webhook")
def webhook_info():
    return {
        "status": "online",
        "endpoint": "POST /leads/webhook",
        "authentication": "Send your company's lead intake key as the X-API-Key header (or an api_key field).",
        "accepted_content_types": ["application/json", "application/x-www-form-urlencoded", "multipart/form-data"],
        "fields": {
            "name": "Prospect's name (or first_name + last_name, or full_name)",
            "company_name": "Company or business name (optional)",
            "email": "Email address", "phone": "Phone or mobile number",
            "form_name": "Name of the form that was filled (for example 'Contact us')",
            "page_url": "Page the form was submitted from", "service": "Service the prospect asked about",
            "message": "The message or enquiry", "source": "Defaults to 'Website'",
            "any_other_key": "Any other field is kept and shown on the lead.",
        },
    }


def _tenant_for_key(session: Session, key: str) -> Optional[int]:
    """The company whose intake key this is. Compared in constant time against every company that has set one."""
    found = None
    for row in session.exec(select(TenantSettings).execution_options(skip_tenant=True)).all():
        stored = (row.settings or {}).get("lead_intake_api_key")
        if stored and hmac.compare_digest(str(key), str(stored)):
            found = row.tenant_id
    return found


async def _read_body(request: Request) -> dict:
    ctype = request.headers.get("content-type", "").lower()
    try:
        if "application/json" in ctype:
            data = await request.json()
            return data if isinstance(data, dict) else {}
        return dict(await request.form())
    except Exception:
        return {}


@router.post("/api/leads/webhook")
@router.post("/leads/webhook")
async def ingest_website_lead(request: Request, session: Session = Depends(get_session)):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"lead-webhook:{ip}", 120, 60, "Too many submissions. Please slow down.")
    raw = await _read_body(request)
    key = str(raw.get("api_key") or request.headers.get("X-API-Key") or "")
    tenant_id = _tenant_for_key(session, key) if key else None
    if tenant_id is None:
        ratelimit.hit(f"lead-webhook-bad-key:{ip}", 10, 300, "Too many invalid keys. Try again later.")
        raise HTTPException(status_code=401, detail="Invalid or missing API key for lead intake")
    if not features.is_enabled(tenant_id, "lead_webhook"):
        raise HTTPException(status_code=403, detail="The website lead webhook is not enabled for this account.")
    current_tenant_id.set(tenant_id)

    full_name = str(raw.get("name") or raw.get("full_name") or f"{raw.get('first_name', '')} {raw.get('last_name', '')}".strip())
    company = str(raw.get("company_name") or raw.get("company") or raw.get("business_name") or full_name or "Website Lead")[:255]
    email = (raw.get("email") or raw.get("email_address") or None)
    phone = (raw.get("phone") or raw.get("mobile") or raw.get("phone_number") or raw.get("contact_number") or None)
    form_name = str(raw.get("form_name") or raw.get("form_id") or raw.get("form_title") or "Website Inquiry Form")[:200]
    page_url = str(raw.get("page_url") or raw.get("url") or raw.get("referer") or request.headers.get("referer") or
                   tenant_settings.get_setting(tenant_id, "website_url", "") or "")[:500]
    service = str(raw.get("service") or raw.get("services_interested") or raw.get("service_requested") or raw.get("subject") or "")[:200]
    message = str(raw.get("message") or raw.get("notes") or raw.get("inquiry") or raw.get("comments") or raw.get("description") or "")[:5000]
    host = urlparse(page_url).netloc or "the website"
    custom = {str(k)[:100]: str(v)[:2000] for k, v in raw.items() if k not in _RESERVED and v}

    lines = [f"Inbound website lead from {host}", f"Form filled: {form_name}"]
    if page_url:
        lines.append(f"Submitted URL: {page_url}")
    if service:
        lines.append(f"Service interest: {service}")
    if message:
        lines.append(f"\nMessage:\n{message}")
    if custom:
        lines.append("\nAdditional submitted fields:")
        lines += [f"  - {k.replace('_', ' ').capitalize()}: {v}" for k, v in custom.items()]

    lead = Lead(
        tenant_id=tenant_id, company_name=company, email=email, phone=phone, website=page_url or None, source="Website",
        status="New", industry=service or None, notes="\n".join(lines),
        ai_analysis_results={"website_form": {"website": host, "form_name": form_name, "page_url": page_url,
                                              "submitted_at": datetime.now(timezone.utc).isoformat(), "contact_name": full_name,
                                              "email": email or "", "phone": phone or "", "service_requested": service,
                                              "message": message, "custom_fields": custom}},
    )
    rep = lead_assignment.assign_lead(session, lead, tenant_id, lead_assignment.strategy_for(tenant_id, "workload"))
    session.add(lead)
    session.commit()
    session.refresh(lead)

    who = rep.name if rep else "Unassigned"
    first = full_name.split()[0] if full_name else company
    last = " ".join(full_name.split()[1:]) or None
    session.add(Contact(tenant_id=tenant_id, lead_id=lead.id, first_name=first, last_name=last, full_name=full_name or company,
                        email=email, mobile_number=phone, notes=f"Submitted from {host} ({form_name})"))
    session.add(ClientNote(tenant_id=tenant_id, lead_id=lead.id, author_name="Website form",
                           content=f"Website form submission: {form_name}\n\nMessage:\n\"{message or 'No message.'}\"\n\nAssigned to: {who}"))
    session.add(ActivityLog(tenant_id=tenant_id, lead_id=lead.id, action="Website form submitted", method="Website",
                            content=f"A prospect submitted '{form_name}' on {host}. Assigned to {who}."))
    session.commit()
    try:
        _notify_admins(session, tenant_id, title=f"New website lead: {company}",
                       message=f"Form: {form_name} | Assigned: {who}", notif_type="info", link=f"/leads/{lead.id}")
    except Exception:
        pass
    try:
        from main import _trigger_background_research          # starts its own background thread
        _trigger_background_research(entity_id=lead.id, entity_type="lead", company_name=lead.company_name or "",
                                     website=lead.website or "")
    except Exception as e:
        print(f"[lead-webhook] research not started: {type(e).__name__}")
    return {"success": True, "lead_id": lead.id, "company_name": lead.company_name, "source": "Website", "form_name": form_name,
            "page_url": page_url, "assigned_salesperson": {"id": rep.id if rep else None, "name": who, "email": rep.email if rep else None},
            "message": f"Lead #{lead.id} created and assigned to {who}."}
