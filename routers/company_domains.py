"""Platform domain reservations and minimal pre-login branding."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, SecretStr
import secrets
import requests
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from database import Tenant, TenantDomain
from modules import company_domains as domains, tenant_settings
from modules.tenant_scope import using_tenant
from routers.tenant_config import get_session, _super, _tenant_or_404, _user, _my_tenant

router = APIRouter()


class BotProtectionBody(BaseModel):
    site_key: str
    secret_key: SecretStr | None = None


@router.get("/superadmin/security/turnstile")
def bot_settings(session=Depends(get_session)):
    _super(session)
    from modules.turnstile_settings import status
    return status(session)


@router.put("/superadmin/security/turnstile")
def save_bot_settings(body: BotProtectionBody, session=Depends(get_session)):
    _super(session)
    from modules.turnstile_settings import save
    return save(session, body.site_key.strip(), body.secret_key.get_secret_value().strip() if body.secret_key else None)


@router.post("/superadmin/domains/check")
def check_infrastructure(session=Depends(get_session)):
    _super(session)
    results = {}
    for label, host in (("apex", domains.base_domain()), ("wildcard", "routing-check-" + secrets.token_hex(4) + "." + domains.base_domain())):
        try:
            response = requests.get("https://" + host + "/login", timeout=8, allow_redirects=False)
            results[label] = {"https_reachable": response.status_code in {200, 404}, "status": response.status_code}
        except requests.RequestException:
            results[label] = {"https_reachable": False}
    return {"checks": results, "configured_ready": domains.configured(),
            "note": "HTTPS checks verify reachability, not ownership or correct tenant routing. Complete the pilot checks before enabling readiness."}


def get_domain(session, tid):
    return session.exec(select(TenantDomain).where(TenantDomain.tenant_id == tid)
                        .execution_options(skip_tenant=True)).first()


@router.get("/internal/company-brand")
def public_brand(session=Depends(get_session)):
    company = domains.request_company.get()
    if not company:
        return {"company": False}
    tid = company["tenant_id"]
    with using_tenant(tid):
        tenant = session.get(Tenant, tid)
        settings = tenant_settings.get_settings(tid)
        return {"company": True, "brand_name": settings.get("brand_name") or tenant.business_name or tenant.name,
                **{k: settings.get(k) for k in ("brand_logo_url", "primary_color", "locale")}}


class DomainBody(BaseModel):
    slug: str


@router.get("/superadmin/tenants/{tenant_id}/domain")
def read_domain(tenant_id: int, session=Depends(get_session)):
    _super(session)
    _tenant_or_404(session, tenant_id)
    return domains.domain_info(get_domain(session, tenant_id))


@router.put("/superadmin/tenants/{tenant_id}/domain")
def assign_domain(tenant_id: int, body: DomainBody, session=Depends(get_session)):
    _super(session)
    _tenant_or_404(session, tenant_id)
    try:
        domains.validate_slug(body.slug)
    except ValueError as error:
        raise HTTPException(422, str(error))
    existing = get_domain(session, tenant_id)
    if existing:
        if existing.slug == body.slug and not existing.retired:
            return domains.domain_info(existing)
        raise HTTPException(409, "This company's domain is immutable; contact the platform operator")
    row = TenantDomain(tenant_id=tenant_id, slug=body.slug)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Subdomain already reserved; choose another name")
    return domains.domain_info(row)


@router.delete("/superadmin/tenants/{tenant_id}/domain")
def retire_domain(tenant_id: int, session=Depends(get_session)):
    _super(session)
    row = get_domain(session, tenant_id)
    if not row:
        raise HTTPException(404, "No domain assigned")
    row.retired = True
    session.add(row)
    session.commit()
    return domains.domain_info(row)


@router.get("/tenant/domain")
def own_domain(session=Depends(get_session)):
    user = _user(session)
    return domains.domain_info(get_domain(session, _my_tenant(user)))
