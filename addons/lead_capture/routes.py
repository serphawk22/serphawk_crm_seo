"""Public intake never trusts browser-selected tenant ids or CRM fields."""
import csv
import hashlib
import io
import json
import os
import secrets
import time
import uuid
from collections import Counter
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

import database
from database import ActivityLog, Contact, Lead, Notification, Tenant, TenantDomain, User
from modules import company_domains, features, lead_assignment, tenant_settings, sales_access
from modules.record_duplicates import lock_company, phone_key, website_key
from modules.tenant_scope import using_tenant, current_tenant_id
from routers.tenant_config import _user, _role, _my_tenant
from .models import Enquiry, IntakeCounter
from .config import default_form, validate_form, validate_fields
from .attribution import attribution
from modules import turnstile_settings

router = APIRouter(tags=["website-leads"])
routers = [router]


def get_session():
    with Session(database.engine) as session:
        yield session


def admin(session):
    user = _user(session)
    if _role(user) != "Admin" or not _my_tenant(user):
        raise HTTPException(403, "Company Admin only")
    return _my_tenant(user)


def enabled(tid):
    if not all(features.is_enabled(tid, key) for key in ("leads", "public_lead_pages")):
        raise HTTPException(403, "Website leads are not enabled")


def form_for(tid):
    return tenant_settings.get_setting(tid, "lead_form_published", None)


@router.get("/tenant/lead-capture")
def configuration(session=Depends(get_session)):
    tid = admin(session)
    row = session.exec(select(TenantDomain).where(TenantDomain.tenant_id == tid)).first()
    courses = []
    if features.is_enabled(tid, "institute"):
        from addons.institute.models import Course
        courses = [{"id": c.id, "title": c.title} for c in session.exec(select(Course).where(Course.tenant_id == tid, Course.is_active == True)).all()]
    return {"courses": courses, "draft": tenant_settings.get_setting(tid, "lead_form_draft", None) or default_form(),
            "published": form_for(tid), "domain": company_domains.domain_info(row),
            "enabled": features.is_enabled(tid, "public_lead_pages")}


@router.put("/tenant/lead-capture")
def save_draft(body: dict, session=Depends(get_session)):
    tid = admin(session)
    try:
        form = validate_form(body)
    except ValueError as error:
        raise HTTPException(422, str(error))
    tenant_settings.update_settings(session, tid, {"lead_form_draft": form})
    return {"draft": form}


@router.post("/tenant/lead-capture/publish")
def publish(session=Depends(get_session)):
    tid = admin(session)
    enabled(tid)
    row = session.exec(select(TenantDomain).where(TenantDomain.tenant_id == tid, TenantDomain.retired == False)).first()
    if not row or company_domains.domain_info(row)["domain_status"] != "active":
        raise HTTPException(409, "Activate the company domain first")
    if not os.getenv("COMPANY_PROXY_SECRET"):
        raise HTTPException(503, "Configure bot protection and the company proxy before publishing")
    turnstile_settings.credentials()
    try:
        form = validate_form(tenant_settings.get_setting(tid, "lead_form_draft", None) or default_form())
    except ValueError as error:
        raise HTTPException(422, str(error))
    if not form["privacy_notice"] or not form["heading"] or not form["submit_label"]:
        raise HTTPException(422, "Heading, submit label and privacy notice are required")
    if form.get("course_ids"):
        if not features.is_enabled(tid, "institute"):
            raise HTTPException(422, "Courses require the institute module")
        from addons.institute.models import Course
        courses = session.exec(select(Course).where(Course.tenant_id == tid, Course.is_active == True, Course.id.in_(form["course_ids"]))).all()
        if len(courses) != len(form["course_ids"]) or len({c.title for c in courses}) != len(courses):
            raise HTTPException(422, "Choose active courses in this company with distinct titles")
        form["course_choices"] = {c.title: c.id for c in courses}
        form["fields"] = [f for f in form["fields"] if f["key"] != "interest"] + [{"key": "interest", "label": "Course", "type": "select", "required": True, "options": [c.title for c in courses]}]
    form["revision"] = str(uuid.uuid4())
    tenant_settings.update_settings(session, tid, {"lead_form_published": form})
    return {"published": form}


@router.delete("/tenant/lead-capture/publish")
def unpublish(session=Depends(get_session)):
    tid = admin(session)
    tenant_settings.update_settings(session, tid, {"lead_form_published": None})
    return {"published": None}


def public_company():
    company = company_domains.request_company.get()
    if not company:
        raise HTTPException(404, "Company form unavailable")
    if not company_domains.configured():
        raise HTTPException(503, "Company form temporarily unavailable")
    enabled(company["tenant_id"])
    if not form_for(company["tenant_id"]):
        raise HTTPException(404, "Company form unavailable")
    return company


@router.get("/internal/lead-capture/config")
def public_config():
    company = public_company()
    site_key, _ = turnstile_settings.credentials()
    return {"form": form_for(company["tenant_id"]), "site_key": site_key}


def verify_bot(token, host):
    _, secret = turnstile_settings.credentials()
    if secret in {"1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"}:
        raise HTTPException(503, "Configure production Turnstile credentials")
    try:
        result = requests.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                               data={"secret": secret, "response": token}, timeout=10).json()
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "Verification unavailable. Please retry.")
    valid_context = result.get("hostname") == host and result.get("action") == "lead_capture"
    if not result.get("success") or not valid_context:
        raise HTTPException(422, "Verification expired. Please try again.")


def notify(session, tid, enquiry, owner=None):
    users = session.exec(select(User).where(User.tenant_id == tid, User.is_active == True)).all()
    for user in users:
        if user.role == "Admin" or user.id == owner:
            session.add(Notification(tenant_id=tid, user_id=user.id, type="info", title="New website enquiry",
                message=f"New enquiry for {enquiry.receiving_company_name}. Status: {enquiry.state}.",
                link=f"/leads/{enquiry.lead_id}" if enquiry.lead_id else "/website-leads"))


def link_or_create(session, tid, enquiry):
    values = enquiry.fields
    dial = tenant_settings.get_setting(tid, "default_dial_code", None)
    email = values.get("email", "").lower()
    phone = phone_key(values.get("phone"), dial)
    # Explicit company predicate, independent of owner scoping; public context has no CRM actor.
    leads = session.exec(select(Lead).where(Lead.tenant_id == tid)).all()
    matches = [lead for lead in leads if (email and (lead.email or "").strip().lower() == email) or
               (phone and phone_key(lead.phone, dial) == phone)]
    if len(matches) > 1:
        enquiry.state = "pending_conflict"
        return None
    if matches:
        lead = matches[0]
    else:
        website = website_key(values.get("website"))
        if website and any(website_key(lead.website) == website for lead in leads):
            enquiry.state = "pending_conflict"
            return None
        tenant = session.get(Tenant, tid)
        if tid != 1 and len(leads) >= tenant.limit_clients:
            enquiry.state = "pending_capacity"
            return None
        source = enquiry.attribution["first"]["source"]
        lead = Lead(tenant_id=tid, company_name=values.get("company_name") or values["name"],
                    email=email or None, phone=values.get("phone") or None, website=values.get("website") or None,
                    industry=(values.get("interest") or "")[:200] or None, source=source, status="New")
        published = form_for(tid) or {}
        course_id = published.get("course_choices", {}).get(values.get("interest"))
        if course_id and features.is_enabled(tid, "institute"):
            from addons.institute.models import Course
            course = session.exec(select(Course).where(Course.tenant_id == tid, Course.id == course_id, Course.is_active == True)).first()
            if course:
                lead.course_interest_id = course.id
        if features.is_enabled(tid, "lead_sources"):
            from addons.business_suite.models import LeadSource
            catalog = session.exec(select(LeadSource).where(LeadSource.tenant_id == tid)).all()
            matched = next((s for s in catalog if (s.utm_key or "").lower() == source or s.name.lower() == source), None)
            if matched:
                lead.lead_source_id = matched.id
        if lead_assignment.auto_assign_on_create(tid):
            lead_assignment.assign_lead(session, lead, tid)
        session.add(lead)
        session.flush()
        session.add(Contact(tenant_id=tid, lead_id=lead.id, first_name=values["name"][:100], full_name=values["name"],
                            email=email or None, mobile_number=values.get("phone") or None, owner_id=lead.owner_id))
        enquiry.new_lead = True
    enquiry.lead_id, enquiry.state = lead.id, "linked"
    session.add(ActivityLog(tenant_id=tid, lead_id=lead.id, action="Website enquiry", method="Website",
                            content=f"Enquiry received on {enquiry.hostname}. Receipt: {enquiry.receipt}"))
    return lead


def _submit(body: dict, request: Request):
    started = time.monotonic()
    company = public_company()
    tid = company["tenant_id"]
    if int(request.headers.get("content-length", "0")) > 32768 or len(json.dumps(body).encode()) > 32768:
        raise HTTPException(413, "Submission too large")
    if body.get("website_trap"):
        raise HTTPException(422, "Unable to submit")
    try:
        submission_id = str(uuid.UUID(str(body.get("submission_id", ""))))
        form = form_for(tid)
        if body.get("revision") != form["revision"]:
            raise HTTPException(409, "The form changed. Refresh the form and submit again.")
        values = validate_fields(form, body.get("fields"))
    except ValueError as error:
        raise HTTPException(422, str(error))
    consent = body.get("consent") is True
    attributed = attribution(body.get("attribution"), consent, company["host"])
    payload_hash = hashlib.sha256(json.dumps([values, attributed, consent, body.get("revision")], sort_keys=True).encode()).hexdigest()
    with using_tenant(tid), Session(database.engine) as session:
        lock_company(session, tid)
        existing = session.exec(select(Enquiry).where(Enquiry.tenant_id == tid, Enquiry.submission_id == submission_id)).first()
        if existing:
            if existing.fingerprint != payload_hash:
                raise HTTPException(409, "Submission identifier already used")
            return {"success": True, "receipt": existing.receipt}
        ip = request.headers.get("x-company-ip", "unknown")
        key = hashlib.sha256((os.getenv("COMPANY_PROXY_SECRET", "") + ip).encode()).hexdigest()
        now = int(time.time())
        session.exec(delete(IntakeCounter).where(IntakeCounter.tenant_id == tid, IntakeCounter.hour < now // 3600 - 1))
        counter = session.exec(select(IntakeCounter).where(IntakeCounter.tenant_id == tid, IntakeCounter.key == key)).first()
        if counter is None:
            counter = IntakeCounter(tenant_id=tid, key=key)
        if counter.minute != now // 60:
            counter.minute, counter.minute_count = now // 60, 0
        if counter.hour != now // 3600:
            counter.hour, counter.hour_count = now // 3600, 0
        if counter.minute_count >= 10 or counter.hour_count >= 100:
            raise HTTPException(429, "Too many enquiries. Please try later.", headers={"Retry-After": "60"})
        counter.minute_count += 1
        counter.hour_count += 1
        session.add(counter)
        session.commit()  # Failed bot attempts count, too. Release the lock for network verification.
    verify_bot(str(body.get("turnstile_token", "")), company["host"])
    with using_tenant(tid), Session(database.engine) as session:
        lock_company(session, tid)
        # A simultaneous retry may have committed during verification.
        existing = session.exec(select(Enquiry).where(Enquiry.tenant_id == tid, Enquiry.submission_id == submission_id)).first()
        if existing:
            if existing.fingerprint != payload_hash:
                raise HTTPException(409, "Submission identifier already used")
            return {"success": True, "receipt": existing.receipt}
        if not form_for(tid) or form_for(tid)["revision"] != body["revision"]:
            raise HTTPException(409, "Form changed; please refresh")
        tenant = session.get(Tenant, tid)
        enquiry = Enquiry(tenant_id=tid, submission_id=submission_id, fingerprint=payload_hash,
                          receipt=secrets.token_urlsafe(24), receiving_company_name=tenant_settings.get_setting(tid, "brand_name", tenant.business_name or tenant.name),
                          hostname=company["host"], revision=form["revision"], fields=values, attribution=attributed,
                          consent={"accepted": consent, "version": "1", "recorded_at": datetime.now(timezone.utc).isoformat()})
        lead = link_or_create(session, tid, enquiry)
        session.add(enquiry)
        notify(session, tid, enquiry, lead.owner_id if lead else None)
        session.commit()
        print("[lead-capture] " + json.dumps({"tenant_id": tid, "receipt": enquiry.receipt, "outcome": enquiry.state,
              "duration_ms": round((time.monotonic() - started) * 1000)}))
        return {"success": True, "receipt": enquiry.receipt}


@router.post("/internal/lead-capture/submit")
def submit(body: dict, request: Request):
    try:
        return _submit(body, request)
    except SQLAlchemyError:
        # SQLAlchemy exception strings can contain bound contact data. Do not
        # pass those through the legacy global exception logger/response.
        raise HTTPException(503, "Unable to save the enquiry. Please retry with the same submission.")


def visible_enquiries(session):
    user = _user(session)
    if _role(user) not in {"Admin", "SalesManager", "Sales", "Employee"}:
        raise HTTPException(403, "Staff only")
    tid = _my_tenant(user)
    enabled(tid)
    query = select(Enquiry).where(Enquiry.tenant_id == tid)
    if _role(user) != "Admin":
        query = query.where(Enquiry.lead_id.in_(select(Lead.id).where(Lead.tenant_id == tid)))
    return list(session.exec(query.order_by(Enquiry.created_at.desc())).all())


@router.get("/lead-capture/lead/{lead_id}")
def lead_history(lead_id: int, session=Depends(get_session)):
    rows = [r for r in visible_enquiries(session) if r.lead_id == lead_id]
    lead = session.exec(select(Lead).where(Lead.tenant_id == current_tenant_id.get(), Lead.id == lead_id)).first()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return {"enquiries": [r.model_dump() for r in rows], "original_source": lead.source or "unknown"}


@router.get("/lead-capture")
def enquiries(source: str = "", campaign: str = "", start: str = "", end: str = "", session=Depends(get_session)):
    rows = visible_enquiries(session)
    for date in (start, end):
        if date:
            try:
                datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(422, "Use YYYY-MM-DD dates")
    rows = [r for r in rows if (not source or r.attribution["current"]["source"] == source) and
            (not campaign or r.attribution["current"].get("utm_campaign") == campaign) and
            (not start or r.created_at.date().isoformat() >= start) and (not end or r.created_at.date().isoformat() <= end)]
    acquired_ids = {r.lead_id for r in rows if r.new_lead and r.lead_id}
    acquired = session.exec(select(Lead).where(Lead.tenant_id == current_tenant_id.get(), Lead.id.in_(acquired_ids))).all() if acquired_ids else []
    converted = [lead for lead in acquired if lead.is_converted or lead.converted_client_id or lead.converted_student_id]
    return {"enquiries": [r.model_dump() for r in rows], "summary": {"enquiries": len(rows), "converted_leads": len(converted),
            "conversions_by_original_source": dict(Counter(lead.source or "unknown" for lead in converted)),
            "new_leads": sum(r.new_lead for r in rows), "repeat_enquiries": sum(not r.new_lead and r.state == "linked" for r in rows),
            "pending": sum(r.state != "linked" for r in rows),
            "sources": dict(Counter(r.attribution["current"]["source"] for r in rows))}}


@router.get("/lead-capture/export")
def export(source: str = "", campaign: str = "", start: str = "", end: str = "", session=Depends(get_session)):
    data = enquiries(source, campaign, start, end, session)["enquiries"]
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Date", "Name", "Email", "Phone", "Company", "Source", "Campaign", "State"])
    def safe(value):
        text = str(value or "")
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text
    for r in data:
        writer.writerow([safe(v) for v in (r["created_at"], r["fields"].get("name"), r["fields"].get("email"), r["fields"].get("phone"),
                         r["receiving_company_name"], r["attribution"]["current"]["source"], r["attribution"]["current"].get("utm_campaign"), r["state"])])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="website-enquiries.csv"'})


@router.post("/lead-capture/{enquiry_id}/resolve")
def resolve(enquiry_id: int, body: dict, session=Depends(get_session)):
    tid = admin(session)
    lock_company(session, tid)
    row = session.exec(select(Enquiry).where(Enquiry.tenant_id == tid, Enquiry.id == enquiry_id)).first()
    if not row:
        raise HTTPException(404, "Enquiry not found")
    if row.state == "linked":
        return {"state": row.state}
    if body.get("lead_id"):
        lead = session.exec(select(Lead).where(Lead.tenant_id == tid, Lead.id == body["lead_id"])).first()
        if not lead:
            raise HTTPException(404, "Lead not found")
        row.lead_id, row.state = lead.id, "linked"
    else:
        link_or_create(session, tid, row)
    session.add(row)
    session.commit()
    return {"state": row.state}
