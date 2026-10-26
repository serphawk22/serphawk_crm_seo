"""
Client onboarding without a developer: create a workspace, configure it from the company profile, tell the admin
what is left to set up, and give an organization a separate demo workspace.

One code path creates a tenant, whoever starts it: a visitor registering (``POST /register``), the platform operator
onboarding a client (``POST /superadmin/tenants``) or the bulk script (``scripts/onboarding``). It writes the tenant,
its first Admin user, the preset's features and the settings derived from the company profile, and nothing else.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlmodel import Session, select

import database
from database import (EmailSettings, Lead, ClientProfile, Notification, Tenant, TenantAsset, User, UserEmailIntegration)
from modules import features, presets, tenant_settings

PAID_LIMIT = 1_000_000
LIMIT_FIELDS = ("limit_clients", "limit_emails", "limit_searches", "limit_projects", "limit_calls")

# What a visitor can say their business does -> the product preset that fits. Anything unknown gets the standard CRM.
INDUSTRIES: List[dict] = [
    {"key": "general", "label": "Other / general business", "preset": "standard"},
    {"key": "agency", "label": "Digital, marketing or design agency", "preset": "agency"},
    {"key": "consulting", "label": "Consulting or professional services", "preset": "standard"},
    {"key": "retail", "label": "Retail, wholesale or distribution", "preset": "standard"},
    {"key": "real_estate", "label": "Real estate", "preset": "standard"},
    {"key": "logistics", "label": "Logistics, BPO or outsourcing", "preset": "bpo"},
    {"key": "education", "label": "Training institute or education", "preset": "institute"},
]
_INDUSTRY = {i["key"]: i for i in INDUSTRIES}

# ISO code -> (name, currency, IANA timezone, dial code, interface language). Where a country spans several
# timezones the most common one is used; the admin can change it in Branding & Settings.
COUNTRIES: Dict[str, tuple] = {
    "IN": ("India", "INR", "Asia/Kolkata", "+91", "en"), "US": ("United States", "USD", "America/New_York", "+1", "en"),
    "CA": ("Canada", "CAD", "America/Toronto", "+1", "en"), "GB": ("United Kingdom", "GBP", "Europe/London", "+44", "en"),
    "AU": ("Australia", "AUD", "Australia/Sydney", "+61", "en"), "NZ": ("New Zealand", "NZD", "Pacific/Auckland", "+64", "en"),
    "IE": ("Ireland", "EUR", "Europe/Dublin", "+353", "en"), "SG": ("Singapore", "SGD", "Asia/Singapore", "+65", "en"),
    "AE": ("United Arab Emirates", "AED", "Asia/Dubai", "+971", "en"), "SA": ("Saudi Arabia", "SAR", "Asia/Riyadh", "+966", "en"),
    "QA": ("Qatar", "QAR", "Asia/Qatar", "+974", "en"), "PK": ("Pakistan", "PKR", "Asia/Karachi", "+92", "en"),
    "BD": ("Bangladesh", "BDT", "Asia/Dhaka", "+880", "en"), "LK": ("Sri Lanka", "LKR", "Asia/Colombo", "+94", "en"),
    "NP": ("Nepal", "NPR", "Asia/Kathmandu", "+977", "en"), "PH": ("Philippines", "PHP", "Asia/Manila", "+63", "en"),
    "ID": ("Indonesia", "IDR", "Asia/Jakarta", "+62", "en"), "MY": ("Malaysia", "MYR", "Asia/Kuala_Lumpur", "+60", "en"),
    "TH": ("Thailand", "THB", "Asia/Bangkok", "+66", "en"), "VN": ("Vietnam", "VND", "Asia/Ho_Chi_Minh", "+84", "en"),
    "JP": ("Japan", "JPY", "Asia/Tokyo", "+81", "en"), "KR": ("South Korea", "KRW", "Asia/Seoul", "+82", "en"),
    "HK": ("Hong Kong", "HKD", "Asia/Hong_Kong", "+852", "en"), "ZA": ("South Africa", "ZAR", "Africa/Johannesburg", "+27", "en"),
    "NG": ("Nigeria", "NGN", "Africa/Lagos", "+234", "en"), "KE": ("Kenya", "KES", "Africa/Nairobi", "+254", "en"),
    "GH": ("Ghana", "GHS", "Africa/Accra", "+233", "en"), "EG": ("Egypt", "EGP", "Africa/Cairo", "+20", "en"),
    "DE": ("Germany", "EUR", "Europe/Berlin", "+49", "en"), "FR": ("France", "EUR", "Europe/Paris", "+33", "en"),
    "IT": ("Italy", "EUR", "Europe/Rome", "+39", "en"), "NL": ("Netherlands", "EUR", "Europe/Amsterdam", "+31", "en"),
    "ES": ("Spain", "EUR", "Europe/Madrid", "+34", "es"), "PT": ("Portugal", "EUR", "Europe/Lisbon", "+351", "en"),
    "MX": ("Mexico", "MXN", "America/Mexico_City", "+52", "es"), "AR": ("Argentina", "ARS", "America/Argentina/Buenos_Aires", "+54", "es"),
    "CO": ("Colombia", "COP", "America/Bogota", "+57", "es"), "CL": ("Chile", "CLP", "America/Santiago", "+56", "es"),
    "PE": ("Peru", "PEN", "America/Lima", "+51", "es"), "BR": ("Brazil", "BRL", "America/Sao_Paulo", "+55", "en"),
}


def options() -> dict:
    """What the registration form needs: industries and countries."""
    return {
        "industries": [{"key": i["key"], "label": i["label"], "preset": i["preset"]} for i in INDUSTRIES],
        "countries": sorted(({"code": c, "name": v[0], "dial_code": v[3]} for c, v in COUNTRIES.items()),
                            key=lambda x: x["name"]),
    }


def _website(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    return value if re.match(r"^https?://", value, re.I) else "https://" + value


def recommend_config(profile: dict) -> dict:
    """
    The preset and the settings that follow from a company profile.

    ``profile`` keys (all optional): company_name, industry, country, website, description, email, phone.
    Returns ``{"preset", "settings", "reasons"}``; ``settings`` only holds values the profile actually implies.
    """
    reasons: List[str] = []
    industry = _INDUSTRY.get((profile.get("industry") or "").strip().lower())
    preset = industry["preset"] if industry else "standard"
    if industry:
        reasons.append(f"'{industry['label']}' uses the {presets.PRESETS[preset]['label']} setup")
    else:
        reasons.append("No industry given, so the standard CRM is used")

    settings: Dict[str, object] = {}
    country_code = (profile.get("country") or "").strip().upper()
    country = COUNTRIES.get(country_code)
    if country:
        name, currency, tz, dial, locale = country
        settings.update(country=country_code, default_currency=currency, timezone=tz, default_dial_code=dial, locale=locale)
        reasons.append(f"{name}: currency {currency}, timezone {tz}, phone code {dial}, language {'Spanish' if locale == 'es' else 'English'}")
    if industry:
        settings["industry"] = industry["key"]

    company = (profile.get("company_name") or "").strip()
    if company:
        settings["brand_name"] = company
    site = _website(profile.get("website"))
    if site:
        settings["website_url"] = site
    if profile.get("email"):
        settings["contact_email"] = profile["email"].strip()
        settings["support_email"] = profile["email"].strip()
    if profile.get("phone"):
        settings["contact_phone"] = profile["phone"].strip()

    description = (profile.get("description") or "").strip()
    if not description and company:
        where = f" based in {country[0]}" if country else ""
        what = industry["label"].lower() if industry and industry["key"] != "general" else "business"
        description = f"{company} is a {what}{where}."
    if description:
        settings["ai_company_description"] = description[:1500]
    return {"preset": preset, "settings": settings, "reasons": reasons}


def unique_tenant_name(session: Session, base: str) -> str:
    base = (base or "").strip()[:180] or "Workspace"
    name, n = base, 1
    while session.exec(select(Tenant).where(Tenant.name == name).execution_options(skip_tenant=True)).first():
        n += 1
        name = f"{base} ({n})"
    return name


def email_in_use(session: Session, email: str) -> bool:
    return session.exec(select(User).where(func.lower(User.email) == email.strip().lower())
                        .execution_options(skip_tenant=True)).first() is not None


def create_workspace(
    session: Session, *, company_name: str, admin_name: str, admin_email: str, password_hash: str,
    phone: Optional[str] = None, preset: str = "standard", settings: Optional[dict] = None, is_trial: bool = True,
    limits: Optional[dict] = None, tenant_name: Optional[str] = None, business_email: Optional[str] = None,
    admin_role: str = "Admin", demo_of: Optional[int] = None,
) -> dict:
    """Tenant + first user + preset features and settings. Raises ValueError when the preset or settings are invalid."""
    if preset not in presets.PRESETS:
        raise ValueError(f"Unknown preset '{preset}'")
    tenant_settings.validate(settings or {})
    admin_email = admin_email.strip()
    if email_in_use(session, admin_email):
        raise ValueError("A user with this email already exists")

    lim = {f: PAID_LIMIT for f in LIMIT_FIELDS} if not is_trial else {}
    for k, v in (limits or {}).items():
        if k in LIMIT_FIELDS:
            lim[k] = int(v)
    tenant = Tenant(name=unique_tenant_name(session, tenant_name or company_name), business_name=company_name,
                    email=business_email or admin_email, phone=phone, is_trial=is_trial, demo_of_tenant_id=demo_of, **lim)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    try:
        user = User(email=admin_email, password=password_hash, name=admin_name, phone=phone, role=admin_role,
                    tenant_id=tenant.id)
        session.add(user)
        session.commit()
        session.refresh(user)
        applied = presets.apply_preset(session, tenant.id, preset, settings)
    except Exception:
        # never leave a half-made tenant behind (for example when two registrations race on the same email)
        session.rollback()
        session.exec(database.TenantFeature.__table__.delete().where(database.TenantFeature.tenant_id == tenant.id))
        session.exec(database.TenantSettings.__table__.delete().where(database.TenantSettings.tenant_id == tenant.id))
        session.exec(User.__table__.delete().where(User.tenant_id == tenant.id))
        session.exec(Tenant.__table__.delete().where(Tenant.id == tenant.id))
        session.commit()
        raise
    return {"tenant_id": tenant.id, "tenant_name": tenant.name, "admin_user_id": user.id, "admin_email": admin_email,
            **applied}


def register_workspace(session: Session, *, company_name: str, admin_name: str, admin_email: str, password_hash: str,
                       phone: Optional[str] = None, industry: Optional[str] = None, country: Optional[str] = None,
                       website: Optional[str] = None, description: Optional[str] = None) -> dict:
    """The self-service path: derive everything from what the visitor told us, create a trial workspace."""
    rec = recommend_config({"company_name": company_name, "industry": industry, "country": country, "website": website,
                            "description": description, "email": admin_email, "phone": phone})
    out = create_workspace(session, company_name=company_name, admin_name=admin_name, admin_email=admin_email,
                           password_hash=password_hash, phone=phone, preset=rec["preset"], settings=rec["settings"],
                           is_trial=True)
    out["reasons"] = rec["reasons"]
    return out


def notify_operators(session: Session, title: str, message: str, link: str = "/superadmin/clients") -> int:
    """In-app notice for every SuperAdmin (best effort: onboarding must not fail because a notice did)."""
    n = 0
    try:
        for op in session.exec(select(User).where(User.role == "SuperAdmin").execution_options(skip_tenant=True)).all():
            session.add(Notification(user_id=op.id, tenant_id=op.tenant_id, title=title[:255], message=message,
                                     type="info", link=link))
            n += 1
        session.commit()
    except Exception as e:
        session.rollback()
        print(f"[onboarding] could not notify operators: {type(e).__name__}")
        return 0
    return n


# ── Auto-configure an existing tenant from its profile ───────────────────────
def auto_configure(session: Session, tenant_id: int, profile: dict, overwrite: bool = False) -> dict:
    """
    Fill the settings an admin has not set yet from the company profile. By default it never overwrites a value the
    tenant chose (``overwrite=True`` is the admin explicitly asking to apply the profile's defaults again) and it never
    changes features: switching modules on or off stays an explicit decision.
    """
    rec = recommend_config(profile)
    current = tenant_settings.get_stored(tenant_id, use_cache=False)[1]
    fill = {k: v for k, v in rec["settings"].items() if overwrite or current.get(k) in (None, "", [])}
    # what the admin just told us about the business is always saved
    for k in ("industry", "country"):
        if k in rec["settings"]:
            fill[k] = rec["settings"][k]
    if fill:
        tenant_settings.update_settings(session, tenant_id, fill)
    return {"applied": fill, "kept": sorted(k for k in rec["settings"] if k not in fill),
            "suggested_preset": rec["preset"], "reasons": rec["reasons"]}


# ── Setup checklist ──────────────────────────────────────────────────────────
def checklist(session: Session, tenant_id: int) -> dict:
    """What the admin can still do to get the workspace ready. Computed from live data, nothing to keep in sync."""
    opts = {"skip_tenant": True}
    stored = tenant_settings.get_stored(tenant_id, use_cache=False)[1]

    def count(model, *where) -> int:
        return session.exec(select(func.count()).select_from(model).where(model.tenant_id == tenant_id, *where)
                            .execution_options(**opts)).one()

    has_logo = bool(stored.get("brand_logo_url")) or count(TenantAsset) > 0
    tenant_mailbox = count(EmailSettings) > 0
    user_mailbox = session.exec(
        select(func.count()).select_from(UserEmailIntegration)
        .join(User, User.id == UserEmailIntegration.user_id).where(User.tenant_id == tenant_id)
        .execution_options(**opts)).one() > 0
    steps = [
        ("brand", "Add your company name", bool(stored.get("brand_name")), False, "/admin/branding"),
        ("logo", "Upload your logo", has_logo, False, "/admin/branding"),
        ("contact", "Add contact details for documents and emails",
         bool(stored.get("contact_email") or stored.get("contact_phone")), False, "/admin/branding"),
        ("mailbox", "Connect your email so the CRM can send and read mail", tenant_mailbox or user_mailbox, False,
         "/admin/branding#mailbox"),
        ("team", "Invite your team", count(User) > 1, False, "/users"),
        ("statuses", "Review your lead statuses", bool(stored.get("lead_statuses")), True, "/admin/branding#statuses"),
        ("first_lead", "Add your first lead", count(Lead) > 0, False, "/leads"),
    ]
    items = [{"key": k, "title": t, "done": d, "optional": o, "link": link} for k, t, d, o, link in steps]
    required = [i for i in items if not i["optional"]]
    done = sum(1 for i in required if i["done"])
    return {"items": items, "completed": done, "total": len(required),
            "percent": int(100 * done / len(required)) if required else 100}


# ── Demo workspace for an organization ───────────────────────────────────────
_DEMO_LEADS = [
    ("Northwind Traders", "Website enquiry", 0), ("Bright Path Consulting", "Referral", 1),
    ("Blue Harbor Foods", "Trade show", 2), ("Summit Logistics", "Cold outreach", 3),
    ("Greenleaf Studios", "Website enquiry", 4), ("Apex Retail Group", "Referral", 5),
    ("Lumen Health Clinic", "Webinar", 1), ("Orbit Software", "Cold outreach", 2),
]
_DEMO_CLIENTS = [("Harper & Sons", "Active"), ("Zenith Manufacturing", "Active"), ("Coastline Hotels", "Pending")]
_DEFAULT_LEAD_STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"]


def seed_sample_data(session: Session, tenant_id: int, owner_id: Optional[int]) -> dict:
    """Illustrative leads and clients so a demo workspace is not empty. Clearly labelled as sample data."""
    statuses = tenant_settings.get_setting(tenant_id, "lead_statuses", None) or _DEFAULT_LEAD_STATUSES
    now = datetime.now(timezone.utc)
    for i, (company, source, s) in enumerate(_DEMO_LEADS):
        session.add(Lead(company_name=company, source=source, status=statuses[min(s, len(statuses) - 1)],
                         email=f"hello@{re.sub(r'[^a-z]', '', company.lower())}.example",
                         notes="Sample data for the demo workspace.", owner_id=owner_id, tenant_id=tenant_id,
                         created_at=now - timedelta(days=i * 2)))
    for company, status in _DEMO_CLIENTS:
        session.add(ClientProfile(companyName=company, status=status, tenant_id=tenant_id, assignedEmployeeId=owner_id))
    session.commit()
    return {"leads": len(_DEMO_LEADS), "clients": len(_DEMO_CLIENTS)}


def create_demo_workspace(session: Session, source_tenant_id: int, password_hash: str,
                          demo_email: Optional[str] = None, demo_name: str = "Demo User") -> dict:
    """
    A separate trial tenant that looks like ``source_tenant_id`` (same modules, branding and settings) with sample
    data and one Demo user. Nothing in it touches the organization's real records.
    """
    source = session.exec(select(Tenant).where(Tenant.id == source_tenant_id).execution_options(skip_tenant=True)).first()
    if not source:
        raise LookupError("Tenant not found")
    if source.demo_of_tenant_id:
        raise ValueError("This workspace is already a demo workspace")

    existing = session.exec(select(Tenant).where(Tenant.demo_of_tenant_id == source.id)
                            .execution_options(skip_tenant=True)).all()
    email = (demo_email or f"demo.{source.id}{'.' + str(len(existing) + 1) if existing else ''}@demo.invalid").strip()

    _, stored = tenant_settings.get_stored(source.id, use_cache=False)
    stored = dict(stored)
    stored.pop("lead_intake_api_key", None)     # a secret: the demo must not be able to create leads in the real tenant
    preset = tenant_settings.get_stored(source.id, use_cache=False)[0] or "standard"
    out = create_workspace(session, company_name=source.business_name or source.name, admin_name=demo_name,
                           admin_email=email, password_hash=password_hash, preset=preset if preset in presets.PRESETS else "standard",
                           settings=stored, is_trial=True, tenant_name=f"{source.name} (Demo)", admin_role="Demo",
                           demo_of=source.id)
    # same modules as the real tenant, not the preset's defaults
    features.set_features(session, out["tenant_id"], features.effective_features(source.id, use_cache=False))
    out["sample_data"] = seed_sample_data(session, out["tenant_id"], out["admin_user_id"])
    out["demo_of_tenant_id"] = source.id
    return out
