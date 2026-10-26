"""
Per-tenant branding and behaviour settings, stored as one JSON document per tenant (``tenant_settings``).

``get_settings(tenant_id)`` always returns every known key: the tenant's stored value if it has one, else the
default. Defaults are all "no override" (None), so a tenant without a row, or a key it never set, behaves
exactly as before: callers that find ``None`` keep their existing hard-coded text (for example
``get_setting(tid, "brand_name", "SerpHawk")``).

Role policy (``role_policy``) lets a tenant change which roles get which access without code changes. Today:
``role_policy.inbox.full_access`` / ``role_policy.inbox.scoped`` (see routers/inbox.py).
"""
import re
import time
from typing import Any, Dict, Optional

from sqlmodel import Session, select

import database
from database import TenantSettings

_TTL_SECONDS = 30.0
_cache: Dict[int, tuple] = {}

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
ROLES = {"SuperAdmin", "Admin", "SalesManager", "Employee", "Intern", "Client", "Supplier", "Demo",
         "ProjectMember", "Developer"}


def _str(max_len):
    def check(v):
        if v is None:
            return None
        if not isinstance(v, str) or len(v) > max_len:
            raise ValueError(f"must be text up to {max_len} characters")
        return v.strip() or None
    return check


def _email(v):
    v = _str(255)(v)
    if v is not None and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
        raise ValueError("must be an email address")
    return v


def _color(v):
    v = _str(7)(v)
    if v is not None and not _HEX_COLOR.match(v):
        raise ValueError("must be a #RRGGBB colour")
    return v


def _currency(v):
    v = _str(3)(v)
    if v is not None and not re.match(r"^[A-Za-z]{3}$", v):
        raise ValueError("must be a 3-letter currency code")
    return v.upper() if v else None


def _locale(v):
    if v is None:
        return None
    if v not in ("en", "es"):
        raise ValueError("must be 'en' or 'es'")
    return v


def _home(v):
    if v is None:
        return None
    if v not in ("default", "command_center"):
        raise ValueError("must be 'default' or 'command_center'")
    return v


def _dial(v):
    v = _str(6)(v)
    if v is not None and not re.match(r"^\+\d{1,4}$", v):
        raise ValueError("must look like +52")
    return v


def _url(v):
    v = _str(500)(v)
    if v is not None and not re.match(r"^https?://", v):
        raise ValueError("must start with http:// or https://")
    return v


def _slug(v):
    v = _str(30)(v)
    if v is not None and not re.match(r"^[a-z][a-z0-9_]*$", v):
        raise ValueError("must be a short lowercase key")
    return v


def _country(v):
    v = _str(2)(v)
    if v is not None and not re.match(r"^[A-Za-z]{2}$", v):
        raise ValueError("must be a 2-letter country code")
    return v.upper() if v else None


def _logo_position(v):
    if v is None:
        return None
    if v not in ("left", "right"):
        raise ValueError("must be 'left' or 'right'")
    return v


def _assignment(v):
    if v is None:
        return None
    if v not in ("workload", "revenue"):
        raise ValueError("must be 'workload' or 'revenue'")
    return v


def _bool(v):
    if v is None or isinstance(v, bool):
        return v
    raise ValueError("must be true or false")


def _str_list(max_items=30, max_len=60):
    def check(v):
        if v is None:
            return None
        if not isinstance(v, list) or len(v) > max_items or not all(isinstance(x, str) and 0 < len(x) <= max_len for x in v):
            raise ValueError(f"must be a list of up to {max_items} short texts")
        return v
    return check


def _role_policy(v):
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("must be an object")
    for area, kinds in v.items():
        if area not in ROLE_POLICY_AREAS or not isinstance(kinds, dict):
            raise ValueError(f"unknown role policy area '{area}'")
        for kind, roles in kinds.items():
            if kind not in ROLE_POLICY_AREAS[area]:
                raise ValueError(f"unknown role policy '{area}.{kind}'")
            if not isinstance(roles, list) or not all(r in ROLES for r in roles):
                raise ValueError(f"'{area}.{kind}' must be a list of known roles")
    return v


ROLE_POLICY_AREAS = {"inbox": {"full_access", "scoped"}}

# key -> (validator, default). A default of None means "no override: keep the built-in behaviour".
SCHEMA: Dict[str, tuple] = {
    "brand_name": (_str(120), None),
    "brand_logo_url": (_str(500), None),
    "brand_tagline": (_str(120), None),
    "primary_color": (_color, None),
    "website_url": (_url, None),
    "support_email": (_email, None),
    "contact_name": (_str(120), None),
    "contact_phone": (_str(50), None),
    "contact_email": (_email, None),
    "contact_address": (_str(300), None),
    "industry": (_slug, None),         # what the business does (modules/onboarding.py INDUSTRIES); drives auto-configuration
    "country": (_country, None),
    "default_currency": (_currency, None),
    "locale": (_locale, None),
    "timezone": (_str(64), None),
    "default_dial_code": (_dial, None),
    "home_dashboard": (_home, None),   # what Admin sees on the home page ("command_center" needs that add-on)
    "ai_company_description": (_str(1500), None),
    "lead_statuses": (_str_list(), None),
    "sales_scoping": (_bool, None),           # salespeople see only their own meetings and not the task-sheet entries
    "lead_auto_assign": (_bool, None),        # give a new lead to a salesperson the moment it is created
    "lead_assignment": (_assignment, None),   # how: "workload" (fewest leads) or "revenue" (least revenue collected)
    "deal_stages": (_str_list(), None),
    "client_statuses": (_str_list(), None),
    "role_policy": (_role_policy, None),
    # Email behaviour
    "append_signature_on_replies": (_bool, None),   # Inbox replies / lead-client Email tab add the agent signature
    "signoff_keywords": (_str_list(10, 40), None),  # extra words that mark a trailing block as a sign-off
    # AI triage persona ("...sales team of {ai_business_type}'s CRM ({ai_triage_notes})")
    "ai_business_type": (_str(200), None),
    "ai_triage_notes": (_str(300), None),
    # Used when the AI is unavailable. Placeholders: {salutation} {company} {owner} {brand} {services}
    "outreach_fallback_subject": (_str(200), None),
    "outreach_fallback_en": (_str(4000), None),
    "outreach_fallback_es": (_str(4000), None),
    "proposal_terms": (_str(1000), None),       # terms shown on public proposal links
    # Invoice look: branding and layout only. Numbering, tax and the calculation are not configurable per tenant.
    "invoice_accent_color": (_color, None),     # rules and headings on invoices (falls back to primary_color)
    "invoice_footer_note": (_str(300), None),   # e.g. "Thank you for your business"
    "invoice_payment_details": (_str(600), None),  # bank / UPI / payment instructions printed under the totals
    "invoice_terms": (_str(1000), None),
    "invoice_logo_position": (_logo_position, None),
    # Secret a website form must send (X-API-Key) to create leads through the public intake webhook
    "lead_intake_api_key": (_str(200), None),
}

# Settings every signed-in user may read (branding and display). Everything else is admin-only.
PUBLIC_KEYS = ("brand_name", "brand_tagline", "brand_logo_url", "primary_color", "website_url", "default_currency", "locale",
               "timezone", "default_dial_code", "home_dashboard", "lead_statuses", "deal_stages", "client_statuses")


def validate(patch: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(patch, dict):
        raise ValueError("settings must be an object")
    clean = {}
    for key, value in patch.items():
        if key not in SCHEMA:
            raise ValueError(f"Unknown setting '{key}'")
        try:
            clean[key] = SCHEMA[key][0](value)
        except ValueError as e:
            raise ValueError(f"{key}: {e}")
    return clean


def defaults() -> Dict[str, Any]:
    return {k: v[1] for k, v in SCHEMA.items()}


def invalidate(tenant_id: Optional[int] = None) -> None:
    if tenant_id is None:
        _cache.clear()
    else:
        _cache.pop(int(tenant_id), None)


def _load(tenant_id: int):
    with Session(database.engine) as session:
        row = session.exec(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)
                           .execution_options(skip_tenant=True)).first()
        return (row.preset, dict(row.settings or {})) if row else (None, {})


def get_stored(tenant_id: int, use_cache: bool = True):
    """(preset, stored settings dict) for a tenant; no defaults merged."""
    now = time.monotonic()
    hit = _cache.get(int(tenant_id))
    if use_cache and hit and now - hit[0] < _TTL_SECONDS:
        return hit[1], dict(hit[2])
    preset, stored = _load(int(tenant_id))
    _cache[int(tenant_id)] = (now, preset, stored)
    return preset, dict(stored)


def get_settings(tenant_id: Optional[int], use_cache: bool = True) -> Dict[str, Any]:
    """All known settings with defaults filled in. Unscoped/anonymous callers get the defaults."""
    merged = defaults()
    if tenant_id is not None and int(tenant_id) >= 1:
        _, stored = get_stored(int(tenant_id), use_cache)
        for k, v in stored.items():
            if k in SCHEMA and v is not None:
                merged[k] = v
    return merged


def get_setting(tenant_id: Optional[int], key: str, fallback: Any = None) -> Any:
    value = get_settings(tenant_id).get(key)
    return fallback if value is None else value


def update_settings(session: Session, tenant_id: int, patch: Dict[str, Any], preset: Optional[str] = None) -> Dict[str, Any]:
    """Validate and merge ``patch`` into the tenant's stored settings (a None value clears a key)."""
    clean = validate(patch)
    key = clean.get("lead_intake_api_key")
    if key:
        # the website webhook finds the company by this key alone, so no two companies may share one
        for other in session.exec(select(TenantSettings).where(TenantSettings.tenant_id != tenant_id)
                                  .execution_options(skip_tenant=True)).all():
            if (other.settings or {}).get("lead_intake_api_key") == key:
                raise ValueError("lead_intake_api_key: that key is already used by another company; choose a different one")
    row = session.exec(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)
                       .execution_options(skip_tenant=True)).first()
    if row is None:
        row = TenantSettings(tenant_id=tenant_id, settings={})
    stored = dict(row.settings or {})
    for k, v in clean.items():
        if v is None:
            stored.pop(k, None)
        else:
            stored[k] = v
    row.settings = stored
    if preset is not None:
        row.preset = preset
    row.updated_at = database._utcnow()
    session.add(row)
    session.commit()
    invalidate(tenant_id)
    merged = defaults()          # computed from what was just written, not through the global engine
    merged.update({k: v for k, v in stored.items() if k in SCHEMA and v is not None})
    return merged


def role_list(tenant_id: Optional[int], area: str, kind: str, default) -> set:
    """Roles a tenant assigned to ``role_policy.<area>.<kind>``, else ``default``."""
    policy = get_setting(tenant_id, "role_policy", {}) or {}
    roles = (policy.get(area) or {}).get(kind)
    return set(roles) if roles is not None else set(default)
