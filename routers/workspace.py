"""
A client Admin sets up their own workspace, with no developer involved.

  Admin   GET  /tenant/onboarding         setup checklist + company profile
  Admin   POST /tenant/auto-configure     fill blank settings (currency, timezone, language ...) from the company profile
  Admin   PUT  /tenant/logo               upload the company logo (PNG / JPEG / WebP)
  Admin   DELETE /tenant/logo
  public  GET  /tenant/logo/{tenant_id}   the logo image (it is printed on documents the client's customers see anyway)
  Admin   PUT  /tenant/lead-statuses      choose / rename the lead status labels, optionally renaming existing leads
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import update
from sqlmodel import Session, select

from database import Lead, TenantAsset
from modules import onboarding, tenant_assets, tenant_settings
from routers.tenant_config import _ADMIN_ROLES, _my_tenant, _role, _super, _tenant_or_404, _user, get_session

router = APIRouter(tags=["workspace"])

# The system moves a lead to these on its own (a new lead; the first e-mail sent), so they cannot be renamed or removed.
LOCKED_STATUSES = ("New", "Contacted")


def _admin_tenant(session: Session) -> int:
    user = _user(session)
    if _role(user) not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin can do this")
    tid = _my_tenant(user)
    if tid is None:
        raise HTTPException(status_code=400, detail="Pick a tenant first (X-Tenant-ID)")
    return tid


# ── Setup checklist and auto-configuration ───────────────────────────────────
@router.get("/tenant/onboarding")
def my_onboarding(session: Session = Depends(get_session)):
    tid = _admin_tenant(session)
    s = tenant_settings.get_settings(tid, use_cache=False)
    return {**onboarding.checklist(session, tid),
            "profile": {k: s.get(k) for k in ("brand_name", "industry", "country", "website_url", "ai_company_description")},
            "options": onboarding.options()}


class AutoConfigure(BaseModel):
    industry: Optional[str] = None
    country: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    overwrite: bool = False      # also replace values the admin already set (an explicit "apply these defaults")


@router.post("/tenant/auto-configure")
def auto_configure(body: AutoConfigure, session: Session = Depends(get_session)):
    tid = _admin_tenant(session)
    current = tenant_settings.get_settings(tid, use_cache=False)
    profile = {
        "company_name": current.get("brand_name"),
        "industry": body.industry or current.get("industry"),
        "country": body.country or current.get("country"),
        "website": body.website or current.get("website_url"),
        "description": body.description or current.get("ai_company_description"),
        "email": current.get("contact_email"), "phone": current.get("contact_phone"),
    }
    try:
        return onboarding.auto_configure(session, tid, profile, overwrite=body.overwrite)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── Logo ─────────────────────────────────────────────────────────────────────
@router.put("/tenant/logo")
async def upload_logo(file: UploadFile = File(...), session: Session = Depends(get_session)):
    tid = _admin_tenant(session)
    raw = await file.read(tenant_assets.MAX_UPLOAD_BYTES + 1)
    try:
        version = tenant_assets.save_logo(session, tid, raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    url = tenant_assets.logo_url(tid, version)
    tenant_settings.update_settings(session, tid, {"brand_logo_url": url})
    return {"logo_url": url}


@router.delete("/tenant/logo")
def remove_logo(session: Session = Depends(get_session)):
    tid = _admin_tenant(session)
    removed = tenant_assets.delete_logo(session, tid)
    if (tenant_settings.get_settings(tid, use_cache=False).get("brand_logo_url") or "").startswith("/tenant/logo/"):
        tenant_settings.update_settings(session, tid, {"brand_logo_url": None})
    return {"removed": removed}


@router.get("/tenant/logo/{tenant_id}")
def get_logo(tenant_id: int, session: Session = Depends(get_session)):
    row = session.exec(select(TenantAsset).where(TenantAsset.tenant_id == tenant_id, TenantAsset.kind == tenant_assets.KIND)
                       .execution_options(skip_tenant=True)).first()
    if not row:
        raise HTTPException(status_code=404, detail="No logo")
    return Response(content=bytes(row.data), media_type=row.content_type, headers={
        "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})


@router.put("/superadmin/tenants/{tenant_id}/logo")
async def upload_client_logo(tenant_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    """The platform operator sets a client's logo (the client's own Admin uses PUT /tenant/logo)."""
    _super(session)
    _tenant_or_404(session, tenant_id)
    raw = await file.read(tenant_assets.MAX_UPLOAD_BYTES + 1)
    try:
        version = tenant_assets.save_logo(session, tenant_id, raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    url = tenant_assets.logo_url(tenant_id, version)
    tenant_settings.update_settings(session, tenant_id, {"brand_logo_url": url})
    return {"logo_url": url}


@router.post("/tenant/lead-intake-key")
def new_lead_intake_key(session: Session = Depends(get_session)):
    """Generate (or replace) the key a website form must send to create leads in this company."""
    import secrets
    tid = _admin_tenant(session)
    key = secrets.token_urlsafe(24)
    tenant_settings.update_settings(session, tid, {"lead_intake_api_key": key})
    return {"api_key": key, "header": "X-API-Key", "endpoint": "/leads/webhook"}


# ── Lead status labels ───────────────────────────────────────────────────────
class LeadStatusUpdate(BaseModel):
    statuses: List[str]
    renames: Dict[str, str] = {}       # old label -> new label, applied to existing leads of this tenant


def _clean_statuses(values: List[str]) -> List[str]:
    cleaned, seen = [], set()
    for v in values:
        v = (v or "").strip()
        if not v:
            continue
        if len(v) > 60:
            raise HTTPException(status_code=422, detail=f"'{v[:20]}...' is longer than 60 characters")
        if v.lower() in seen:
            raise HTTPException(status_code=422, detail=f"'{v}' is listed twice")
        seen.add(v.lower())
        cleaned.append(v)
    return cleaned


@router.put("/tenant/lead-statuses")
def update_lead_statuses(body: LeadStatusUpdate, session: Session = Depends(get_session)):
    tid = _admin_tenant(session)
    statuses = _clean_statuses(body.statuses)
    if len(statuses) < 2 or len(statuses) > 30:
        raise HTTPException(status_code=422, detail="Keep between 2 and 30 statuses")
    for locked in LOCKED_STATUSES:
        if locked not in statuses:
            raise HTTPException(status_code=422, detail=f"'{locked}' must stay in the list: the CRM sets it automatically")
    renames = {}
    for old, new in (body.renames or {}).items():
        old, new = old.strip(), new.strip()
        if not old or old == new:
            continue
        if old in LOCKED_STATUSES:
            raise HTTPException(status_code=422, detail=f"'{old}' is used by the CRM itself and cannot be renamed")
        if new not in statuses:
            raise HTTPException(status_code=422, detail=f"Renamed status '{new}' is not in the new list")
        renames[old] = new

    updated = 0
    for old, new in renames.items():
        result = session.exec(update(Lead).where(Lead.tenant_id == tid, Lead.status == old).values(status=new)
                              .execution_options(skip_tenant=True))
        updated += result.rowcount or 0
    session.commit()
    saved = tenant_settings.update_settings(session, tid, {"lead_statuses": statuses})
    return {"lead_statuses": saved["lead_statuses"], "leads_renamed": updated}
