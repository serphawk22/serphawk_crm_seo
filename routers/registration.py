"""
Self-service registration: a visitor creates their own company workspace with no developer involved.

  GET  /register/options   industries and countries for the form (public)
  POST /register           create tenant + Admin + preset + settings for a verified e-mail (public)

The e-mail must be verified first with ``/email-otp/send`` + ``/email-otp/verify`` (purpose "signup"). The workspace
is a trial with the limits of any trial; the platform operators are notified and can lift the limits, change the
modules or add a demo workspace from Client Management.
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from database import Lead, Tenant, User, engine
from modules import auth_tokens, onboarding, otp, ratelimit

router = APIRouter(tags=["registration"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8


def get_session():
    with Session(engine) as session:
        yield session


class RegisterRequest(BaseModel):
    company_name: str
    admin_name: str
    email: str
    password: str
    phone: str | None = None
    industry: str | None = None
    country: str | None = None
    website: str | None = None
    description: str | None = None


@router.get("/register/options")
def register_options():
    return onboarding.options()


def _add_master_lead(session: Session, body: RegisterRequest) -> None:
    """The platform's own CRM (a tenant called "Master Admin", when there is one) gets the registration as a lead."""
    master = session.exec(select(Tenant).where(Tenant.name == "Master Admin").execution_options(skip_tenant=True)).first()
    if not master:
        return
    try:
        session.add(Lead(company_name=body.company_name.strip()[:255], email=body.email.strip(), phone=body.phone,
                         website=body.website, industry=body.industry, source="Trial Signup", status="New",
                         notes=f"Registered by {body.admin_name.strip()}", tenant_id=master.id))
        from modules.tenant_scope import using_tenant
        with using_tenant(master.id):
            session.commit()
    except Exception as e:                  # a lead that cannot be saved must not undo a registration
        session.rollback()
        print(f"[register] could not add the registration as a lead: {type(e).__name__}")


@router.post("/register")
def register(body: RegisterRequest, request: Request, session: Session = Depends(get_session)):
    from main import _hash_password, _user_dict    # lazy: main imports this router

    ratelimit.hit(f"register-ip:{ratelimit.client_ip(request)}", 10, 3600)
    company, name, email = body.company_name.strip(), body.admin_name.strip(), body.email.strip()
    if not company or not name:
        raise HTTPException(status_code=422, detail="Company name and your name are required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(status_code=422, detail=f"The password must have at least {MIN_PASSWORD} characters")
    if onboarding.email_in_use(session, email):
        raise HTTPException(status_code=400, detail="Email already registered. Please sign in instead.")
    otp.require_verified(session, email, "signup")

    try:
        out = onboarding.register_workspace(
            session, company_name=company, admin_name=name, admin_email=email,
            password_hash=_hash_password(body.password), phone=(body.phone or "").strip() or None,
            industry=body.industry, country=body.country, website=body.website, description=body.description)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    otp.consume(session, email, "signup")
    _add_master_lead(session, body)
    onboarding.notify_operators(session, "New company registered",
                                f"{company} ({email}) created a trial workspace using the '{out['preset']}' setup.")

    # the new user belongs to a tenant this anonymous request is not scoped to, so read it explicitly
    user = session.exec(select(User).where(User.id == out["admin_user_id"]).execution_options(skip_tenant=True)).first()
    return {"success": True, "message": "Workspace created", "tenant_id": out["tenant_id"], "preset": out["preset"],
            "configured": out["reasons"], "user": _user_dict(user),
            "token": auth_tokens.issue_token(user.id, user.password)}
