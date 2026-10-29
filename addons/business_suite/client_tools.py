"""
Client and lead tools from the SCM BPO / SCM HB deployments.

  PATCH /clients/{id}  and  /clients/{id}/status    change a client; a new status moves its deals and proposals along
  PATCH /leads/{id}    and  /leads/{id}/status      change a lead; "Converted" turns it into a client
  GET   /clients/{id}/full-analysis                  state of the AI company report (not_started / pending / done / error)
  POST  /clients/{id}/full-analysis                  start it
  GET   /management/dashboard                        lead sources, pipeline, dropped clients, salesperson performance

The originals copied any field of the request onto the record, tenant_id included; here only the fields a client or lead
form edits are accepted, and an assignee has to belong to the same company. On the institute's companies
``PATCH /leads/{id}/status`` keeps meaning "move the lead through the admissions stages".
"""
import asyncio
import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func
from sqlmodel import Session, select

import database
from database import ClientProfile, ClientResearch, Deal, Lead, Proposal, TenantSettings, User  # noqa: F401
from modules import features
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["client-tools"])

CLIENT_FIELDS = (
    "companyName", "phone", "address", "gmbName", "seoStrategy", "tagline", "websiteUrl", "nextMilestone", "nextMilestoneDate",
    "lastActivity", "lastActivityDate", "lead_score", "lead_source", "deal_value", "industry", "employee_count", "revenue_range",
    "linkedin_url", "contact_person", "last_contact_date", "next_followup_date",
)
LEAD_FIELDS = ("company_name", "website", "industry", "email", "phone", "address", "source", "notes", "last_activity")
_DEAL_STAGE = {"Proposal Sent": "Proposal Sent", "Negotiation": "Negotiation", "Won": "Closed Won", "Lost": "Closed Lost"}
_PROPOSAL_STATUS = {"Proposal Sent": "Sent", "Negotiation": "Negotiation", "Won": "Accepted", "Lost": "Rejected"}


def get_session():
    with Session(database.engine) as session:
        yield session


def _main():
    import main      # lazy: main imports this package while it loads
    return main


def _me(session: Session) -> User:
    user = _main()._current_user(session)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _same_company_user(session: Session, user_id, tenant_id) -> Optional[int]:
    if not user_id:
        return None
    u = session.get(User, user_id)
    if not u or (tenant_id is not None and u.tenant_id != tenant_id):
        raise HTTPException(status_code=400, detail="The assignee must be a user in your company.")
    return u.id


# ── clients ──────────────────────────────────────────────────────────────────
def _cascade_client_status(session: Session, client_id: int, status: str) -> None:
    stage, prop = _DEAL_STAGE.get(status), _PROPOSAL_STATUS.get(status)
    if stage:
        for d in session.exec(select(Deal).where(Deal.client_id == client_id)).all():
            d.stage = stage
            if status == "Won":
                d.won_at = _now()
                if d.value and not d.final_value:
                    d.final_value = d.value
            else:
                d.won_at = None
            d.updated_at = _now()
            session.add(d)
    if prop:
        for p in session.exec(select(Proposal).where(Proposal.client_id == client_id)).all():
            p.status = prop
            if status == "Won":
                p.signed_at = _now()
            p.updated_at = _now()
            session.add(p)


@router.patch("/clients/{client_id}")
@router.patch("/clients/{client_id}/status")
def patch_client(client_id: int, body: Dict[str, Any] = Body(...), session: Session = Depends(get_session)):
    _me(session)
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    me = _main()._current_user(session)
    if _main()._sales_scoping_on(cp.tenant_id) and (me.role or "").strip().lower() == "salesmanager" and cp.assignedEmployeeId != me.id:
        raise HTTPException(status_code=403, detail="You can only change clients assigned to you")
    status = body.get("status")
    if status and str(status).lower() == 'converted' and not features.is_enabled(lead.tenant_id, 'clients') and not features.is_enabled(lead.tenant_id, 'institute'):
        raise HTTPException(status_code=403, detail='The Clients module is not enabled for this company')
    if "owner_id" in body:
        _same_company_user(session, body['owner_id'], lead.tenant_id)
    if status:
        cp.status = str(status)[:100]
        _cascade_client_status(session, client_id, cp.status)
    for key in ("assignedEmployeeId", "assigned_employee_id", "employee_id"):
        if key in body:
            cp.assignedEmployeeId = _same_company_user(session, body[key], cp.tenant_id)
            break
    for k in CLIENT_FIELDS:
        if k in body:
            setattr(cp, k, body[k])
    session.add(cp)
    session.commit()
    session.refresh(cp)
    return {"client": _main()._client_dict(cp, session)}


# ── leads ────────────────────────────────────────────────────────────────────
@router.patch("/leads/{lead_id}")
@router.patch("/leads/{lead_id}/status")
def patch_lead(lead_id: int, request: Request, body: Dict[str, Any] = Body(...), session: Session = Depends(get_session)):
    _me(session)
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if request.url.path.endswith("/status") and lead.tenant_id and features.is_enabled(lead.tenant_id, "institute"):
        from addons.institute import routes as institute
        return institute.update_lead_stage(lead_id, institute.LeadStatusRequest(status=str(body.get("status", ""))), session)
    status = body.get("status")
    if status and lead.tenant_id and features.is_enabled(lead.tenant_id, 'institute'):
        from addons.institute import routes as institute
        institute.update_lead_stage(lead_id, institute.LeadStatusRequest(status=str(status)), session)
    if status:
        lead.status = str(status)[:100]
    if "owner_id" in body:
        new_owner = _same_company_user(session, body["owner_id"], lead.tenant_id)
        if new_owner and new_owner != lead.owner_id:
            if lead.tenant_id and features.is_enabled(lead.tenant_id, "ownership"):
                from addons.business_suite.scm2 import reassign_owner       # keeps the ownership history
                reassign_owner(session, "lead", lead.id, new_owner, "Updated from the lead")
                session.refresh(lead)
            else:
                lead.owner_id = new_owner
        elif not new_owner:
            lead.owner_id = None
    for k in LEAD_FIELDS:
        if k in body:
            setattr(lead, k, body[k])
    session.add(lead)
    if status and str(status).lower() == "converted" and not lead.is_converted:
        _main().convert_lead_to_client(lead_id, session)
    else:
        session.commit()
    session.refresh(lead)
    return lead


# ── AI company report ────────────────────────────────────────────────────────
def _can_see_client(session: Session, cp: ClientProfile) -> None:
    me = _me(session)
    if _main()._sales_scoping_on(cp.tenant_id) and (me.role or "").strip().lower() == "salesmanager" and cp.assignedEmployeeId != me.id:
        raise HTTPException(status_code=403, detail="You can only view clients assigned to you")


def _set_status(session: Session, client_id: int, tenant_id: Optional[int], status: str, report: Optional[str] = None, data: Optional[dict] = None):
    rec = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id).execution_options(skip_tenant=True)).first()
    if rec is None:
        rec = ClientResearch(client_id=client_id, tenant_id=tenant_id)
    try:
        existing = json.loads(rec.email_agent_data) if rec.email_agent_data else {}
    except Exception:
        existing = {}
    merged = {**existing, **(data or {}), "__report_status": status, "__full_report": report}
    rec.email_agent_data = json.dumps(merged, default=str)
    if data:
        rec.company_overview = data.get("company_overview", "") or data.get("executive_verdict", "") or rec.company_overview
        if data.get("ideal_customer_profiles"):
            rec.pain_points = json.dumps(data["ideal_customer_profiles"], default=str)
        if data.get("gtm_recommendations"):
            rec.business_goals = json.dumps(data["gtm_recommendations"], default=str)
        if data.get("competitive_landscape"):
            rec.competitors = json.dumps(data["competitive_landscape"], default=str)
    rec.updated_at = _now()
    session.add(rec)
    session.commit()


def run_full_analysis(client_id: int) -> None:
    """The slow part (scrape + AI). Runs in a thread, so it names its tenant itself."""
    with Session(database.engine) as session:
        cp = session.exec(select(ClientProfile).where(ClientProfile.id == client_id).execution_options(skip_tenant=True)).first()
        if cp is None:
            return
        tenant_id, company, url = cp.tenant_id, cp.companyName or "", cp.websiteUrl or ""
        try:
            from modules.llm_engine import deep_investigate_company
            from modules.scraper import scrape_website
            raw = ""
            if url:
                loop = asyncio.new_event_loop()
                try:
                    raw = loop.run_until_complete(scrape_website(url)) or ""
                finally:
                    loop.close()
                if raw.startswith("ERROR"):
                    raw = ""
            data = deep_investigate_company(company_name=company, website=url, scraped_text=raw)
            report = data.get("full_markdown_report", "") or data.get("executive_verdict", "") or ""
            _set_status(session, client_id, tenant_id, "done", report, data)
        except Exception as e:
            print(f"[full-analysis] client {client_id} failed: {type(e).__name__}: {e}")
            session.rollback()
            _set_status(session, client_id, tenant_id, "error", None)


@router.post("/clients/{client_id}/full-analysis")
def start_full_analysis(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    _can_see_client(session, cp)
    _main().check_tenant_limit(session, "searches")
    _set_status(session, client_id, cp.tenant_id, "pending", None)
    threading.Thread(target=run_full_analysis, args=(client_id,), daemon=True).start()
    return {"ok": True, "message": "Full analysis started"}


@router.get("/clients/{client_id}/full-analysis")
def get_full_analysis(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    _can_see_client(session, cp)
    rec = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
    if not rec or not rec.email_agent_data:
        return {"status": "not_started", "report": None}
    try:
        d = json.loads(rec.email_agent_data)
        return {"status": d.get("__report_status", "not_started"), "report": d.get("__full_report")}
    except Exception:
        return {"status": "not_started", "report": None}


# ── management dashboard ─────────────────────────────────────────────────────
@router.get("/management/dashboard")
def management_dashboard(session: Session = Depends(get_session)):
    _main()._require_roles(session, ["Admin", "Demo"])
    tid = current_tenant_id.get()
    if tid is None or tid < 1:
        raise HTTPException(status_code=400, detail="Pick a client first: this dashboard is for one company.")
    from addons.business_suite.models import DroppedClient, LeadSource

    sources = session.exec(select(LeadSource.name, func.count(Lead.id)).select_from(Lead)
                           .join(LeadSource, LeadSource.id == Lead.lead_source_id, isouter=True)
                           .where(Lead.tenant_id == tid).group_by(LeadSource.name)).all()
    lead_sources = [{"source": name or "Unknown", "count": n} for name, n in sources]
    stages = session.exec(select(Deal.stage, func.count(Deal.id), func.sum(Deal.value)).where(Deal.tenant_id == tid).group_by(Deal.stage)).all()
    pipeline = [{"stage": st, "count": n, "total_value": float(v or 0)} for st, n, v in stages]
    dropped = session.exec(select(func.count(DroppedClient.id)).where(DroppedClient.tenant_id == tid)).first() or 0
    perf_rows = session.exec(select(Deal.assigned_to, func.count(Deal.id), func.sum(Deal.value)).where(Deal.tenant_id == tid)
                             .group_by(Deal.assigned_to)).all()
    names = {u.id: u.name for u in session.exec(select(User).where(User.id.in_([r[0] for r in perf_rows if r[0]]))).all()} if perf_rows else {}
    performance = [{"user_id": uid, "salesperson": names.get(uid) or "Unassigned", "deals": n, "pipeline_value": float(v or 0)}
                   for uid, n, v in perf_rows]

    created = session.exec(select(Lead.created_at).where(Lead.tenant_id == tid)).all()
    today = datetime.now(timezone.utc)
    months, y, m = [], today.year, today.month
    for _ in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()
    monthly = [{"month": datetime(y_, m_, 1).strftime("%b %Y"),
                "leads": sum(1 for c in created if c and c.year == y_ and c.month == m_)} for y_, m_ in months]
    return {"lead_sources": lead_sources, "sentiments": [], "pipeline": pipeline, "dropped_clients": dropped,
            "salesperson_performance": performance, "monthly_leads": monthly}
