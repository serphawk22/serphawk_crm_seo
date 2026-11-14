"""
Tenant configuration API: feature entitlements, branding/behaviour settings and client onboarding.

  Any signed-in user   GET  /me/features              features on for my tenant + public settings
  Tenant Admin         GET  /tenant/settings          all settings (other roles: public subset)
  Tenant Admin         PUT  /tenant/settings          update my tenant's settings
  SuperAdmin           GET  /superadmin/features/catalog      feature registry + presets
  SuperAdmin           GET  /superadmin/tenants/{id}/config   one tenant's features + settings
  SuperAdmin           PUT  /superadmin/tenants/{id}/features turn features on/off, or apply a preset
  SuperAdmin           PUT  /superadmin/tenants/{id}/settings update any tenant's settings
  SuperAdmin           POST /superadmin/tenants               onboard a client: tenant + admin user + preset
  SuperAdmin           POST /superadmin/tenants/bulk          onboard several clients at once
  SuperAdmin           POST /superadmin/tenants/{id}/demo     create that client's separate demo workspace
  SuperAdmin           GET  /superadmin/tenants/{id}/demos
"""
import secrets
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from database import Tenant, User, engine
from modules import features, onboarding, presets, tenant_settings
from modules.api_tracker import current_salesperson_id
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["tenant-config"])

_ADMIN_ROLES = {"Admin", "SuperAdmin"}


def get_session():
    with Session(engine) as session:
        yield session


def _user(session: Session) -> User:
    uid = current_salesperson_id.get()
    user = session.get(User, uid) if uid else None
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _role(user: User) -> str:
    raw = user.role or "Client"
    return {"admin": "Admin", "employee": "Employee", "client": "Client", "intern": "Intern"}.get(raw.lower(), raw)


def _super(session: Session) -> User:
    user = _user(session)
    if _role(user) != "SuperAdmin":
        raise HTTPException(status_code=403, detail="SuperAdmin only")
    return user


def _my_tenant(user: User) -> Optional[int]:
    """Tenant users act in their own company; platform operators have no CRM tenant."""
    tid = current_tenant_id.get()
    if tid is not None and tid >= 1:
        return tid
    return user.tenant_id if _role(user) != "SuperAdmin" else None


def _tenant_or_404(session: Session, tenant_id: int) -> Tenant:
    tenant = session.exec(select(Tenant).where(Tenant.id == tenant_id)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


# ── Current tenant ───────────────────────────────────────────────────────────
@router.get("/me/features")
def my_features(session: Session = Depends(get_session)):
    user = _user(session)
    tid = _my_tenant(user)
    preset, _ = tenant_settings.get_stored(tid) if tid else (None, {})
    settings = tenant_settings.get_settings(tid)
    from modules.sales_access import effective_modules
    enabled = effective_modules(tid, _role(user))
    if tid and enabled.get("institute") and not settings.get("lead_statuses"):
        from addons.institute.routes import LEAD_STAGES
        settings = {**settings, "lead_statuses": list(LEAD_STAGES)}
    return {
        "tenant_id": tid,
        "preset": preset,
        "features": enabled,
        "settings": {k: settings.get(k) for k in tenant_settings.PUBLIC_KEYS},
    }


@router.get("/tenant/settings")
def get_my_settings(session: Session = Depends(get_session)):
    user = _user(session)
    tid = _my_tenant(user)
    settings = tenant_settings.get_settings(tid)
    if _role(user) not in _ADMIN_ROLES:
        settings = {k: settings.get(k) for k in tenant_settings.PUBLIC_KEYS}
    return {"tenant_id": tid, "settings": settings}


@router.get("/me/demo-usage")
def my_demo_usage(session: Session = Depends(get_session)):
    from modules import demo_usage
    user = _user(session)
    tid = demo_usage.restricted_tenant(session, user)
    return {"restricted": bool(tid), "budgets": demo_usage.usage(session, tid) if tid else None}


class SettingsUpdate(BaseModel):
    settings: Dict[str, object]


@router.get("/tenant/sales-access")
@router.get("/superadmin/tenants/{tenant_id}/sales-access")
def get_sales_access(tenant_id: Optional[int] = None, session: Session = Depends(get_session)):
    user = _user(session)
    if tenant_id is not None:
        _super(session)
        _tenant_or_404(session, tenant_id)
    elif _role(user) not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admins only")
    tid = tenant_id if tenant_id is not None else _my_tenant(user)
    from modules.sales_access import effective_modules
    return {"catalog": features.catalog(), "entitlements": features.effective_features(tid),
            "access": effective_modules(tid, "SalesManager"),
            "overrides": tenant_settings.get_setting(tid, "sales_module_access", {}) or {}}


@router.put("/tenant/sales-access")
@router.put("/superadmin/tenants/{tenant_id}/sales-access")
def set_sales_access(body: Dict[str, bool], tenant_id: Optional[int] = None, session: Session = Depends(get_session)):
    user = _user(session)
    if tenant_id is not None:
        _super(session)
        _tenant_or_404(session, tenant_id)
    elif _role(user) not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admins only")
    tid = tenant_id if tenant_id is not None else _my_tenant(user)
    if not tid:
        raise HTTPException(status_code=400, detail="A company is required")
    try:
        tenant_settings.update_settings(session, tid, {"sales_module_access": body})
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return get_sales_access(tenant_id, session)


@router.put("/tenant/settings")
def update_my_settings(body: SettingsUpdate, session: Session = Depends(get_session)):
    if "lead_form_published" in body.settings:
        raise HTTPException(422, "Use Website leads to publish or unpublish a form")
    user = _user(session)
    if _role(user) not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin can change settings")
    tid = _my_tenant(user)
    if tid is None:
        raise HTTPException(status_code=400, detail="Pick a tenant first (X-Tenant-ID)")
    try:
        return {"tenant_id": tid, "settings": tenant_settings.update_settings(session, tid, body.settings)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── SuperAdmin ───────────────────────────────────────────────────────────────
@router.get("/superadmin/features/catalog")
def features_catalog(session: Session = Depends(get_session)):
    _super(session)
    return {"features": features.catalog(), "presets": presets.list_presets(),
            "settings_keys": sorted(tenant_settings.SCHEMA)}


def _config(session: Session, tenant_id: int) -> dict:
    tenant = _tenant_or_404(session, tenant_id)
    preset, _ = tenant_settings.get_stored(tenant_id, use_cache=False)
    return {"tenant": {"id": tenant.id, "name": tenant.name, "business_name": tenant.business_name,
                       "is_trial": tenant.is_trial},
            "preset": preset,
            "features": features.effective_features(tenant_id, use_cache=False),
            "settings": tenant_settings.get_settings(tenant_id, use_cache=False)}


@router.get("/superadmin/tenants/{tenant_id}/config")
def tenant_config(tenant_id: int, session: Session = Depends(get_session)):
    _super(session)
    return _config(session, tenant_id)


class FeaturesUpdate(BaseModel):
    features: Optional[Dict[str, bool]] = None
    preset: Optional[str] = None


@router.put("/superadmin/tenants/{tenant_id}/features")
def update_tenant_features(tenant_id: int, body: FeaturesUpdate, session: Session = Depends(get_session)):
    _super(session)
    _tenant_or_404(session, tenant_id)
    try:
        if body.preset:
            presets.apply_preset(session, tenant_id, body.preset)
        if body.features:
            features.set_features(session, tenant_id, body.features)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _config(session, tenant_id)


@router.put("/superadmin/tenants/{tenant_id}/settings")
def update_tenant_settings(tenant_id: int, body: SettingsUpdate, session: Session = Depends(get_session)):
    if "lead_form_published" in body.settings:
        raise HTTPException(422, "Use Website leads to publish or unpublish a form")
    _super(session)
    _tenant_or_404(session, tenant_id)
    try:
        tenant_settings.update_settings(session, tenant_id, body.settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _config(session, tenant_id)


@router.get("/superadmin/tenants/overview")
def tenants_overview(session: Session = Depends(get_session)):
    """Every client with the numbers the Client Management page shows, in a handful of grouped queries."""
    operator = _super(session)
    from database import ClientProfile, CustomizationRequest, Lead, TenantAsset, TenantFeature, TenantSettings
    skip = {"skip_tenant": True}

    def counts(model, *where):
        rows = session.exec(select(model.tenant_id, func.count()).where(model.tenant_id.is_not(None), *where)
                            .group_by(model.tenant_id).execution_options(**skip)).all()
        return {tid: n for tid, n in rows}

    users, leads, clients = counts(User), counts(Lead, Lead.is_converted == False), counts(ClientProfile)
    platform_users = counts(User, User.role == "SuperAdmin")
    open_requests = counts(CustomizationRequest, CustomizationRequest.status.in_(("new", "in_review")))
    with_logo = set(session.exec(select(TenantAsset.tenant_id).where(TenantAsset.kind == "logo").execution_options(**skip)).all())
    stored = {r.tenant_id: (r.preset, r.settings or {}) for r in session.exec(select(TenantSettings).execution_options(**skip)).all()}
    rows_by_tenant: Dict[int, Dict[str, bool]] = {}
    for f in session.exec(select(TenantFeature).execution_options(**skip)).all():
        rows_by_tenant.setdefault(f.tenant_id, {})[f.feature_key] = bool(f.enabled)
    out = []
    for t in session.exec(select(Tenant).order_by(Tenant.id.desc()).execution_options(**skip)).all():
        preset, st = stored.get(t.id, (None, {}))
        out.append({
            "id": t.id, "name": t.name, "business_name": t.business_name, "brand_name": st.get("brand_name"),
            "is_trial": bool(t.is_trial), "demo_of_tenant_id": t.demo_of_tenant_id, "created_at": t.created_at,
            "users": users.get(t.id, 0), "leads": leads.get(t.id, 0),
            "clients": clients.get(t.id, 0), "open_requests": open_requests.get(t.id, 0), "preset": preset,
            "country": st.get("country"), "currency": st.get("default_currency"), "locale": st.get("locale"),
            "has_logo": t.id in with_logo or bool(st.get("brand_logo_url")),
            "modules_on": features.module_count(features._resolve(rows_by_tenant.get(t.id, {}))),
            "can_delete": t.id != operator.tenant_id and not platform_users.get(t.id),
        })
    real = [t for t in out if not t["demo_of_tenant_id"]]
    totals = {"clients": len(real), "paid": sum(1 for t in real if not t["is_trial"]), "trial": sum(1 for t in real if t["is_trial"]),
              "demo": len(out) - len(real), "users": sum(t["users"] for t in real),
              "open_requests": sum(t["open_requests"] for t in out)}
    return {"tenants": out, "totals": totals, "total_modules": features.module_count()}


class DeleteTenantRequest(BaseModel):
    confirm_name: str


@router.delete("/superadmin/tenants/{tenant_id}")
def delete_tenant(tenant_id: int, body: DeleteTenantRequest, session: Session = Depends(get_session)):
    operator = _super(session)
    tenant = _tenant_or_404(session, tenant_id)
    if tenant.id == operator.tenant_id or session.exec(select(User.id).where(
            User.tenant_id == tenant.id, User.role == "SuperAdmin").execution_options(skip_tenant=True)).first():
        raise HTTPException(status_code=409, detail="A workspace containing a platform SuperAdmin cannot be deleted")
    if body.confirm_name != tenant.name:
        raise HTTPException(status_code=422, detail="The confirmation does not match this workspace")
    from database import TenantDomain
    if session.exec(select(TenantDomain.id).where(TenantDomain.tenant_id == tenant_id).execution_options(skip_tenant=True)).first():
        raise HTTPException(409, detail="This workspace has a reserved company domain. Retain the workspace to prevent domain reuse.")
    if session.exec(select(Tenant.id).where(Tenant.demo_of_tenant_id == tenant.id)
                    .execution_options(skip_tenant=True)).first():
        raise HTTPException(status_code=409, detail="Delete this client's linked demo workspaces first")
    from modules.demo_accounts import delete_workspace
    try:
        return {"success": True, **delete_workspace(session, tenant.id)}
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error))


class OnboardRequest(BaseModel):
    subdomain_slug: Optional[str] = None
    account_role: str = "Admin"
    name: str                       # unique tenant name / slug
    business_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    preset: str = "standard"
    admin_email: str
    admin_name: str
    admin_password: Optional[str] = None   # generated and returned once when omitted
    settings: Optional[Dict[str, object]] = None
    industry: Optional[str] = None         # with country, fills in currency / timezone / language ... (modules/onboarding.py)
    country: Optional[str] = None
    is_trial: bool = False
    limits: Optional[Dict[str, int]] = None


def _onboard(session: Session, body: OnboardRequest) -> dict:
    """Create one client. Shared by the single and the bulk endpoint so both behave the same."""
    from main import _hash_password  # lazy: main imports this router

    if not presets.is_known_preset(body.preset):
        raise HTTPException(status_code=422, detail=f"Unknown preset '{body.preset}'")
    if body.account_role not in {"Admin", "SalesManager"}:
        raise HTTPException(status_code=422, detail="Choose Admin or SalesManager")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if session.exec(select(Tenant).where(Tenant.name == name)).first():
        raise HTTPException(status_code=409, detail="A tenant with this name already exists")
    admin_email = body.admin_email.strip()
    if onboarding.email_in_use(session, admin_email):
        raise HTTPException(status_code=409, detail="A user with this admin email already exists")

    # Settings: preset defaults < what the company profile implies < what the operator typed
    profile = {"company_name": body.business_name or name, "industry": body.industry, "country": body.country,
               "email": body.email or admin_email, "phone": body.phone}
    implied = {k: v for k, v in onboarding.recommend_config(profile)["settings"].items()
               if k in ("industry", "country", "default_currency", "timezone", "default_dial_code", "locale")}
    settings = {"brand_name": body.business_name or name, **implied, **(body.settings or {})}
    password = body.admin_password or secrets.token_urlsafe(12)
    try:
        out = onboarding.create_workspace(
            session, company_name=body.business_name or name, tenant_name=name, admin_name=body.admin_name,
            admin_email=admin_email, password_hash=_hash_password(password), phone=body.phone, preset=body.preset,
            settings=settings, is_trial=body.is_trial, limits=body.limits, business_email=body.email,
            admin_role=body.account_role, subdomain_slug=body.subdomain_slug)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="An account or subdomain was claimed concurrently; choose another name")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not body.admin_password:
        out["generated_admin_password"] = password
    return out


@router.post("/superadmin/tenants")
def onboard_tenant(body: OnboardRequest, session: Session = Depends(get_session)):
    """Create a client: tenant + its first Admin user + preset features/settings. No code, no new deployment."""
    _super(session)
    return _onboard(session, body)


class BulkOnboard(BaseModel):
    clients: List[OnboardRequest]


@router.post("/superadmin/tenants/bulk")
def onboard_many(body: BulkOnboard, session: Session = Depends(get_session)):
    """Create several clients in one call. Each is independent: one that fails does not stop the others."""
    _super(session)
    if len(body.clients) > 100:
        raise HTTPException(status_code=422, detail="Up to 100 clients per call")
    results = []
    for client in body.clients:
        try:
            results.append({"ok": True, "name": client.name, **_onboard(session, client)})
        except HTTPException as e:
            session.rollback()
            results.append({"ok": False, "name": client.name, "error": e.detail})
    return {"created": sum(1 for r in results if r["ok"]), "failed": sum(1 for r in results if not r["ok"]),
            "results": results}


class DemoRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    name: str = "Demo User"


@router.post("/superadmin/tenants/{tenant_id}/demo")
def create_demo(tenant_id: int, body: Optional[DemoRequest] = None, session: Session = Depends(get_session)):
    """A separate demo workspace for one organization: same modules and branding, sample data, one Demo login."""
    from main import _hash_password  # lazy: main imports this router

    _super(session)
    body = body or DemoRequest()
    password = body.password or secrets.token_urlsafe(10)
    if body.email and onboarding.email_in_use(session, body.email):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    try:
        out = onboarding.create_demo_workspace(session, tenant_id, _hash_password(password), body.email, body.name)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tenant not found")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {**out, "demo_password": password}


@router.get("/superadmin/tenants/{tenant_id}/demos")
def list_demos(tenant_id: int, session: Session = Depends(get_session)):
    _super(session)
    rows = session.exec(select(Tenant).where(Tenant.demo_of_tenant_id == tenant_id).execution_options(skip_tenant=True)).all()
    out = []
    for t in rows:
        u = session.exec(select(User).where(User.tenant_id == t.id).execution_options(skip_tenant=True)).first()
        out.append({"tenant_id": t.id, "name": t.name, "demo_email": u.email if u else None, "created_at": t.created_at})
    return {"demos": out}
