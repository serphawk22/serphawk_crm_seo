"""
Demo accounts: self-service sign-up and their management in Demo Account Data (``/admin/telemetry``).

  POST   /demo/signup                                  create a demo workspace for a verified e-mail (public)
  POST   /demo/request-upgrade, /demo/upgrade          a demo user asks for a full account
  GET    /telemetry/demo-accounts                      list + summary (operator: pending sign-ups, mail status)
  GET    /telemetry/demo-account/{user_id}             what one demo account has done
  PATCH  /telemetry/demo-accounts/{user_id}            switch on/off, change limits, reset usage
  POST   /telemetry/demo-accounts/{user_id}/reset-password
  POST   /telemetry/demo-accounts/{user_id}/convert    turn a self-service demo into a paying company (operator)
  DELETE /telemetry/demo-accounts/{user_id}            delete a demo workspace and all its data (operator)

Rules (who sees and may change what) live in ``modules/demo_accounts.py``.
"""
from typing import Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

import database
from database import (CallLog, ClientProfile, ClientResearch, CompetitorAnalysis, Contact, Lead, Meeting, Project,
                      RadarAnalysis, SentEmail, User)
from modules import auth_tokens, demo_accounts, onboarding, otp, ratelimit
from modules.api_tracker import current_salesperson_id

router = APIRouter(tags=["demo-accounts"])
MIN_PASSWORD = 8
_OPTS = {"skip_tenant": True}


def get_session():
    with Session(database.engine) as session:
        yield session


def _viewer(session: Session):
    """The signed-in Admin or operator looking at Demo Account Data -> (user, is_operator)."""
    from main import _require_roles  # lazy: main imports this router
    user = _require_roles(session, ["Admin"])
    return user, demo_accounts.is_operator(user)


def _account(session: Session, user_id: int):
    viewer, operator = _viewer(session)
    try:
        user, tenant = demo_accounts.get_in_scope(session, viewer, operator, user_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Demo account not found")
    return operator, user, tenant


# ── Sign-up ──────────────────────────────────────────────────────────────────
class DemoSignupRequest(BaseModel):
    name: str
    email: str
    password: str


@router.post("/demo/signup")
def demo_signup(body: DemoSignupRequest, request: Request, session: Session = Depends(get_session)):
    from main import _EMAIL_RE, _hash_password, _user_dict  # lazy: main imports this router

    ratelimit.hit(f"demo-signup-ip:{ratelimit.client_ip(request)}", 10, 3600)
    name, email = body.name.strip(), body.email.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Your name is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(status_code=422, detail=f"The password must have at least {MIN_PASSWORD} characters")
    if onboarding.email_in_use(session, email):
        raise HTTPException(status_code=400, detail="Email already registered. Please sign in instead.")
    otp.require_verified(session, email, "signup")
    try:
        out = demo_accounts.create_self_service_demo(session, name=name, email=email,
                                                     password_hash=_hash_password(body.password))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    otp.consume(session, email, "signup")
    # the new user belongs to a tenant this anonymous request is not scoped to, so read it explicitly
    user = session.exec(select(User).where(User.id == out["admin_user_id"]).execution_options(**_OPTS)).first()
    return {"success": True, "user": _user_dict(user), "token": auth_tokens.issue_token(user.id, user.password)}


# ── Upgrade requests from inside a demo ──────────────────────────────────────
def _ask_upgrade(session: Session) -> dict:
    uid = current_salesperson_id.get()
    user = session.exec(select(User).where(User.id == uid).execution_options(**_OPTS)).first() if uid else None
    if user is None or not demo_accounts.is_demo(user):
        raise HTTPException(status_code=404, detail="Demo account not found")
    sent = demo_accounts.request_upgrade(session, user)
    return {"status": "success", "success": True, "already_requested": not sent,
            "message": "Upgrade request sent to admin." if sent else "Your upgrade request is already with our team."}


@router.post("/demo/request-upgrade")
def demo_request_upgrade(email: Optional[str] = Body(default=None, embed=True), session: Session = Depends(get_session)):
    # `email` is still accepted from older pages but ignored: only the signed-in demo user can ask for themselves
    return _ask_upgrade(session)


@router.post("/demo/upgrade")
def demo_upgrade(session: Session = Depends(get_session)):
    return _ask_upgrade(session)


# ── Demo Account Data ────────────────────────────────────────────────────────
@router.get("/telemetry/demo-accounts")
def list_demo_accounts(session: Session = Depends(get_session)):
    viewer, operator = _viewer(session)
    return demo_accounts.list_accounts(session, viewer, operator)


@router.get("/telemetry/demo-account/{user_id}")
def demo_account_detail(user_id: int, session: Session = Depends(get_session)):
    """Everything one demo account has done, read from its own workspace."""
    operator, user, tenant = _account(session, user_id)
    account = demo_accounts.account_dict(session, user, tenant, operator)
    # A Demo login inside a real company shares that company's records: never show the company's data here.
    tid = user.tenant_id if account["kind"] != "in_company" else None

    def q(model, order_col):
        if not tid:
            return []
        return session.exec(select(model).where(model.tenant_id == tid).order_by(order_col.desc())
                            .execution_options(**_OPTS)).all()

    team = session.exec(select(User).where(User.tenant_id == tid, User.id != user.id)
                        .execution_options(**_OPTS)).all() if tid else []
    iso = demo_accounts.iso
    return {
        "success": True,
        "account": account,
        "user": {"id": user.id, "name": user.name, "email": user.email, "created_at": iso(user.createdAt),
                 "tenant_id": user.tenant_id, "upgrade_requested": account["upgrade_requested"]},
        "clients": [{"id": c.id, "company": c.companyName or c.projectName or "—", "website": c.websiteUrl or "—",
                     "status": c.status or "—", "created_at": None} for c in q(ClientProfile, ClientProfile.id)],
        "leads": [{"id": l.id, "name": l.company_name or "—", "email": l.email or "—", "company": l.company_name or "—",
                   "status": l.status or "—", "created_at": iso(l.created_at)} for l in q(Lead, Lead.created_at)],
        "contacts": [{"id": c.id, "name": (c.full_name or f"{c.first_name} {c.last_name or ''}").strip() or "—",
                      "email": c.email or "—", "designation": c.designation or "—",
                      "created_at": iso(c.created_at)} for c in q(Contact, Contact.id)],
        "radar": [{"id": r.id, "target_name": r.target_name or "—", "target_website": r.target_website or "—",
                   "competitor_count": r.competitor_count or 0, "radius_km": r.radius_km or 0,
                   "run_date": iso(r.run_date)} for r in q(RadarAnalysis, RadarAnalysis.run_date)],
        "emails": [{"id": e.id, "to": e.to_email or "—", "subject": e.subject or "—", "status": e.status or "—",
                    "sent_at": iso(e.sent_at)} for e in q(SentEmail, SentEmail.sent_at)],
        "meetings": [{"id": m.id, "title": m.title or "—", "status": m.status or "—",
                      "scheduled_at": iso(m.scheduled_at)} for m in q(Meeting, Meeting.scheduled_at)],
        "calls": [{"id": c.id, "phone": c.phone_number or "—", "duration": c.duration_seconds or 0,
                   "summary": c.summary or c.description or "—", "received_at": iso(c.received_at)}
                  for c in q(CallLog, CallLog.received_at)],
        "projects": [{"id": p.id, "name": p.name or "—", "status": p.status or "—", "progress": p.progress or 0}
                     for p in q(Project, Project.id)],
        "team_members": [{"id": u.id, "name": u.name or "—", "email": u.email or "—", "role": u.role or "—"}
                         for u in team],
        "researches": [{"id": r.id, "company_overview": r.company_overview or "", "updated_at": iso(r.updated_at)}
                       for r in q(ClientResearch, ClientResearch.updated_at)],
        "competitors": [{"id": c.id, "competitor_domain": c.competitor_domain or "", "last_updated": iso(c.last_updated)}
                        for c in q(CompetitorAnalysis, CompetitorAnalysis.last_updated)],
        "limits": account["limits"],
    }


class DemoAccountUpdate(BaseModel):
    active: Optional[bool] = None
    limits: Optional[Dict[str, int]] = None
    reset_usage: bool = False


@router.patch("/telemetry/demo-accounts/{user_id}")
def update_demo_account(user_id: int, body: DemoAccountUpdate, session: Session = Depends(get_session)):
    operator, user, tenant = _account(session, user_id)
    if body.limits or body.reset_usage:
        if not demo_accounts.account_dict(session, user, tenant, operator)["can_change_limits"]:
            raise HTTPException(status_code=403, detail="Only the platform operator can change a demo's limits")
        try:
            demo_accounts.update_limits(session, tenant, body.limits, body.reset_usage)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    if body.active is not None:
        demo_accounts.set_active(session, user, body.active)
    session.refresh(user)
    if tenant is not None:
        session.refresh(tenant)
    return {"success": True, "account": demo_accounts.account_dict(session, user, tenant, operator)}


@router.post("/telemetry/demo-accounts/{user_id}/reset-password")
def reset_demo_password(user_id: int, session: Session = Depends(get_session)):
    from main import _hash_password  # lazy: main imports this router
    _, user, _ = _account(session, user_id)
    password = demo_accounts.reset_password(session, user, _hash_password)
    return {"success": True, "email": user.email, "password": password}


@router.post("/telemetry/demo-accounts/{user_id}/convert")
def convert_demo_account(user_id: int, session: Session = Depends(get_session)):
    operator, user, tenant = _account(session, user_id)
    if not demo_accounts.account_dict(session, user, tenant, operator)["can_convert"]:
        raise HTTPException(status_code=403, detail="Only the platform operator can turn a self-service demo into a client")
    return {"success": True, **demo_accounts.convert_to_client(session, user, tenant)}


@router.delete("/telemetry/demo-accounts/{user_id}")
def delete_demo_account(user_id: int, session: Session = Depends(get_session)):
    operator, user, tenant = _account(session, user_id)
    if not demo_accounts.account_dict(session, user, tenant, operator)["can_delete"]:
        raise HTTPException(status_code=403, detail="Only the platform operator can delete a demo workspace, and only "
                                                    "one that holds no real users")
    try:
        out = demo_accounts.delete_workspace(session, tenant.id)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"success": True, **out}
