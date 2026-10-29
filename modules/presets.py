"""
Product presets: a named bundle of features + default settings applied when a client is onboarded.

They mirror what each of today's separate deployments exposes (derived from the forks' sidebars), so a new
tenant created from a preset starts with the same menu those clients have. Anything can be changed
afterwards per tenant. Add-on modules ported from the forks (institute, finance suite, ...) are added to the
relevant preset when they land.
"""
from typing import Dict, Optional

from sqlmodel import Session

from modules import features, tenant_settings

_CRM_BASE = {"leads", "contacts", "clients", "deals", "work_queue", "projects", "task_sheet", "reports",
             "meetings", "calls", "teams", "leaderboard", "inbox", "followups", "email_agent", "support"}

# The business-suite modules the SerpHawk flagship ships to its own users (ported from the SCM BPO deployment).
_FLAGSHIP_SUITE = {"lead_sources", "finance_suite", "ownership", "stock_movements", "meeting_history", "command_center",
                   "ai_reports", "dropped_clients", "proposals_portal", "followup_board"}

PRESETS: Dict[str, dict] = {
    "serphawk": {
        "label": "SerpHawk flagship",
        "description": "What the main SerpHawk product itself ships: the full CRM plus the business suite (lead sources, "
                       "revenue and costs, ownership history, command center, AI reports, dropped clients, follow-up board, "
                       "proposal share links). Apply it to the original SerpHawk company.",
        "features": {k for k, f in features.FEATURES.items() if f.default_on} | _FLAGSHIP_SUITE,
        "settings": {"sales_scoping": True,
                     "lead_statuses": ["New", "Contacted", "Not Responded", "Neutral", "Positive", "Negative", "Converted"]},
    },
    "standard": {
        "label": "Standard CRM",
        "description": "The CRM every business starts from: leads, contacts, clients, deals, projects and tasks, reports, "
                       "inbox, follow-ups, email agent, products, billing and proposals. Brand-neutral.",
        "features": _CRM_BASE | {"products", "billing", "proposals"},
        "settings": {},
    },
    "full": {
        "label": "Everything",
        "description": "Every module switched on. What existing tenants had before feature entitlements.",
        "features": set(features.FEATURES),
        "settings": {},
    },
    "agency": {
        "label": "Digital agency CRM",
        "description": "SerpHawk-style CRM: leads, clients, projects, inbox, follow-ups, email agent, billing, proposals.",
        "features": _CRM_BASE | {"billing", "proposals"},
        "settings": {},
    },
    "agency-voice": {
        "label": "Digital agency CRM + AI voice caller",
        "description": "The agency preset plus the outbound AI voice agent.",
        "features": _CRM_BASE | {"billing", "proposals", "voice_agent"},
        "settings": {},
    },
    "bpo": {
        "label": "BPO / logistics",
        "description": "SCM BPO-style: CRM plus inventory, billing, proposals and the business suite "
                       "(lead sources, revenue and costs, ownership history, command center, AI reports).",
        "features": _CRM_BASE | {"inventory", "billing", "proposals", "lead_sources", "finance_suite", "ownership",
                                 "stock_movements", "meeting_history", "command_center", "ai_reports",
                                 "dropped_clients", "proposals_portal", "followup_board", "lead_webhook"},
        "settings": {"default_currency": "INR", "timezone": "Asia/Kolkata", "home_dashboard": "command_center",
                     "lead_auto_assign": True, "lead_assignment": "workload", "sales_scoping": True,
                     "lead_statuses": ["New", "Contacted", "Not Responded", "Neutral", "Positive", "Negative", "Converted"]},
    },
    "institute": {
        "label": "Training institute",
        "description": "SCM HB-style: leads and admissions tracking, students, courses, batches, enrollments and fees, "
                       "attendance, portals, reports, inbox, follow-ups and email agent.",
        "features": {"leads", "work_queue", "task_sheet", "reports", "calls", "teams", "leaderboard", "inbox",
                     "followups", "email_agent", "support", "institute", "lead_sources"},
        "settings": {"default_currency": "INR", "timezone": "Asia/Kolkata", "lead_assignment": "revenue",
                     "sales_scoping": True,
                     "lead_statuses": ["New", "Contacted", "Not Responded", "Follow-up", "Webinar Scheduled",
                                       "Webinar Attended", "Webinar Not Attended", "Walk-in Scheduled",
                                       "Walk-in Attended", "Walk-in Not Attended", "Converted", "Lost"]},
    },
    "design-agency": {
        "label": "Design / marketing agency (Spanish-first)",
        "description": "DaPros-style CRM with MXN, +52 and Mexico City defaults.",
        "features": _CRM_BASE | {"inventory", "products", "billing", "proposals", "marketplace"},
        "settings": {
            "default_currency": "MXN", "default_dial_code": "+52", "timezone": "America/Mexico_City",
            "append_signature_on_replies": True,
            "ai_business_type": "a graphic design, marketing and web agency",
            "ai_triage_notes": "enquiries from prospects, existing clients and partners, often in Spanish",
            "signoff_keywords": ["Atentamente"],
        },
    },
}


def list_presets() -> list:
    return [{"key": k, "label": v["label"], "description": v["description"],
             "features": sorted(v["features"]), "settings": v["settings"]} for k, v in PRESETS.items()]


def apply_preset(session: Session, tenant_id: int, name: str, settings_override: Optional[dict] = None) -> dict:
    """Write an explicit entitlement row for every feature and merge the preset's default settings."""
    if name not in PRESETS:
        raise ValueError(f"Unknown preset '{name}'")
    preset = PRESETS[name]
    applied = features.set_features(session, tenant_id, {k: (k in preset["features"]) for k in features.FEATURES})
    merged = dict(preset["settings"])
    merged.update(settings_override or {})
    stored = tenant_settings.update_settings(session, tenant_id, merged, preset=name)
    return {"preset": name, "features": applied, "settings": stored}
