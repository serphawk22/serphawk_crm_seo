"""
Feature entitlements: which product modules a tenant (client) may use.

Resolution for one feature: a ``tenant_features`` row wins; with no row the registry default applies. Every
feature that existed before this table was introduced defaults to ON, so existing tenants keep exactly what
they had until an admin switches something off. ``locked`` features cannot be switched off. Presets
(modules/presets.py) write an explicit row for every feature when a client is onboarded.

Enforcement
  * Backend: ``gate_for_path`` maps a request path to a feature (``path_prefixes``); the middleware in
    main.py answers 403 when the caller's tenant has it off. Only self-contained modules declare prefixes.
    Anonymous requests (public webhooks, public store) and unscoped SuperAdmin requests are never gated.
  * Frontend: ``GET /me/features`` feeds the sidebar (frontend/src/context/TenantConfigContext.tsx).
"""
import re
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from sqlmodel import Session, select

import database
from database import TenantFeature


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    group: str
    description: str = ""
    locked: bool = False          # cannot be switched off
    default_on: bool = True       # used when the tenant has no row for it
    path_prefixes: Tuple[str, ...] = ()
    path_regexes: Tuple[str, ...] = ()      # for paths with an id in the middle, e.g. /deals/3/negotiations
    public_prefixes: Tuple[str, ...] = ()   # sub-paths that stay reachable without a feature check (webhooks)


def _f(*a, **kw) -> Feature:
    return Feature(*a, **kw)


_FEATURES: List[Feature] = [
    # CRM / Work. Switching a module off closes it, not only its menu entry:
    #   * the page is closed in the app (frontend/src/lib/moduleRoutes.ts + components/ModuleGate.tsx), and
    #   * the module's own API is refused (403) where the endpoints belong to that module alone.
    # Leads, Clients and Calls close their data APIs too. Other shared endpoints
    # remain available to entitled dashboards and still enforce tenant scoping.
    _f("leads", "Leads", "CRM", "Lead list, research and conversion.", path_prefixes=("/leads",)),
    _f("contacts", "Contacts", "CRM"),
    _f("clients", "Clients", "CRM", path_prefixes=("/clients",)),
    _f("deals", "Deals / pipeline", "CRM"),
    # Work
    _f("work_queue", "My Work Queue", "Work", path_prefixes=("/work-queue",)),
    _f("projects", "Projects", "Work"),
    _f("task_sheet", "Task Sheet", "Work", path_prefixes=("/task-sheet",)),
    _f("reports", "Reports", "Work"),
    _f("meetings", "Meetings", "Work", path_prefixes=("/meetings",)),     # /meetings/history is the longer prefix: its own module
    _f("calls", "Calls", "Work", path_prefixes=("/calls", "/scheduled-calls"),
       path_regexes=(r"^/(clients|leads|contacts)/\d+/simulate-call$",)),
    _f("teams", "Team Directory", "Teams"),
    _f("leaderboard", "Leaderboard", "Teams", path_prefixes=("/leaderboard",)),
    # Communication / AI agents
    _f("inbox", "Inbox", "Communication", "Unified mailbox with AI triage and reply drafting.",
       path_prefixes=("/inbox",)),
    _f("followups", "Follow-ups", "Communication", "Follow-up scheduling, reminders and auto-send.",
       path_prefixes=("/followups",), path_regexes=(r"^/leads/\d+/followup$",)),
    _f("email_agent", "Email Agent", "AI agents", "AI outreach and Excel email campaigns.",
       path_prefixes=("/email-campaigns",)),
    _f("voice_agent", "AI Voice Caller", "AI agents", "Outbound AI phone calls.",
       path_prefixes=("/voice-agent", "/calling-agent-logs"), public_prefixes=("/voice-agent/twilio/",)),
    # Sales operations
    _f("inventory", "Inventory & orders", "Sales operations", "Inventory, RFQs, purchase and sales orders.",
       path_prefixes=("/inventory", "/rfq", "/purchase-orders", "/sales-orders")),
    _f("products", "Products catalog", "Sales operations", path_prefixes=("/products",)),
    _f("billing", "Billing", "Sales operations", "Invoices and quotes.", path_prefixes=("/invoices", "/quotes")),
    _f("proposals", "Proposals", "Sales operations", path_prefixes=("/proposals",)),
    _f("marketplace", "Marketplace", "Sales operations", path_prefixes=("/marketplace",)),
    # Support
    _f("support", "Cases & solutions", "Support", path_prefixes=("/cases", "/solutions")),
    _f("scmhub_cases", "SCMHub Cases", "Support", "Bridge to the external SCMHub ticketing database.",
       path_prefixes=("/scmhub-cases",)),
    # System
    _f("import_data", "Import data", "System", path_prefixes=("/import",)),
    _f("api_intelligence", "API Intelligence", "System", path_prefixes=("/api-intelligence",)),
    _f("demo_accounts", "Demo account data", "System"),
    # Add-ons ported from client deployments (business_suite): off unless a preset or an admin enables them
    _f("lead_sources", "Lead sources & analytics", "Business suite", "Configurable lead sources, UTM matching, cost per lead.",
       default_on=False, path_prefixes=("/lead-sources", "/analytics/lead-sources")),
    _f("finance_suite", "Revenue & business costs", "Business suite", "Won-deal revenue, salaries and costs, deal negotiation rounds.",
       default_on=False, path_prefixes=("/business-costs", "/revenue", "/deals-value-tracking"),
       path_regexes=(r"^/deals/\d+/negotiations",)),
    _f("ownership", "Ownership history", "Business suite", "Lead / client owner reassignment with history and reports.",
       default_on=False, path_prefixes=("/ownership",)),
    _f("stock_movements", "Stock movements", "Business suite", "Inventory in/out log and low-stock alerts.",
       default_on=False, path_prefixes=("/inventory-stock",)),
    _f("meeting_history", "Meeting history", "Business suite", default_on=False,
       path_prefixes=("/meetings/history",)),     # /me/timezone is every user's own profile setting: never gated
    _f("command_center", "Command center", "Business suite", "Executive overview and dossier across sales, delivery and finance.",
       default_on=False, path_prefixes=("/command-center", "/reports/executive-dossier", "/management")),
    _f("lead_webhook", "Website lead webhook", "Business suite",
       "A website form posts leads straight into the CRM with the company's intake key; they are assigned automatically.",
       default_on=False, path_regexes=(r"^/(api/)?leads/webhook$",)),
    _f("followup_board", "Follow-up board", "Business suite",
       "The SCM BPO follow-up screens: overdue / pending / upcoming buckets, reschedule, drafted emails, overdue notices.",
       default_on=False, path_prefixes=("/follow-ups",)),
    _f("ai_reports", "AI reports", "Business suite", "Natural-language report generation.",
       default_on=False, path_prefixes=("/reports/ai",)),
    _f("dropped_clients", "Dropped clients", "Business suite", "Record why clients left, reactivate them, reassignment history.",
       default_on=False, path_prefixes=("/dropped-clients", "/salesperson")),
    _f("proposals_portal", "Proposal share links", "Business suite",
       "Public links where a client views, comments on, accepts or declines a quote / proposal.",
       default_on=False, path_prefixes=("/public/proposals",), path_regexes=(r"^/deals/\d+/proposals$",)),
    # Add-on ported from the SCM HB deployment (addons/institute)
    _f("institute", "Institute (students, courses, batches)", "Institute",
       "Courses, instructors, batches, students, enrollments and fees, attendance, class sessions, learning resources, "
       "student and instructor portals, admissions tracking (demo / walk-in / webinar / follow-up) and analytics.",
       default_on=False,
       path_prefixes=("/courses", "/instructors", "/batches", "/students", "/student-files", "/enrollments", "/payments",
                      "/attendance", "/institute", "/institute-sessions", "/institute-resources", "/student-portal",
                      "/instructor-portal", "/lead-demo-sessions", "/lead-follow-ups", "/lead-walk-ins", "/lead-webinars",
                      "/schedule/upcoming", "/leads/intake", "/leads/sources/analytics"),
       path_regexes=(r"^/leads/\d+/(demo-sessions|walk-ins|webinars|follow-ups|convert-to-student|course-plan|background-details)$",)),
]

FEATURES: Dict[str, Feature] = {f.key: f for f in _FEATURES}

_TTL_SECONDS = 30.0
_cache: Dict[int, Tuple[float, Dict[str, bool]]] = {}


def invalidate(tenant_id: Optional[int] = None) -> None:
    if tenant_id is None:
        _cache.clear()
    else:
        _cache.pop(int(tenant_id), None)


def _load_rows(tenant_id: int) -> Dict[str, bool]:
    with Session(database.engine) as session:
        rows = session.exec(select(TenantFeature).where(TenantFeature.tenant_id == tenant_id)
                            .execution_options(skip_tenant=True)).all()
    return {r.feature_key: bool(r.enabled) for r in rows}


def effective_features(tenant_id: Optional[int], use_cache: bool = True) -> Dict[str, bool]:
    """feature key -> enabled. tenant_id None (unscoped SuperAdmin) or < 1 (anonymous) gets everything on."""
    if tenant_id is None or int(tenant_id) < 1:
        return {k: True for k in FEATURES}
    tenant_id = int(tenant_id)
    now = time.monotonic()
    hit = _cache.get(tenant_id)
    if use_cache and hit and now - hit[0] < _TTL_SECONDS:
        return dict(hit[1])
    result = _resolve(_load_rows(tenant_id))
    _cache[tenant_id] = (now, result)
    return dict(result)


def _resolve(rows: Dict[str, bool]) -> Dict[str, bool]:
    """Entitlement rows -> effective on/off for every registered feature."""
    result = {key: True if feat.locked else rows.get(key, feat.default_on) for key, feat in FEATURES.items()}
    if result.get("institute") and "voice_agent" not in rows:
        result["voice_agent"] = False  # admissions calling stays on hold until explicitly configured
    return result


def is_enabled(tenant_id: Optional[int], key: str) -> bool:
    return effective_features(tenant_id).get(key, True)


_PREFIX_INDEX: List[Tuple[str, str]] = sorted(
    ((p, f.key) for f in _FEATURES for p in f.path_prefixes), key=lambda t: -len(t[0]))
_REGEX_INDEX: List[Tuple["re.Pattern", str]] = [(re.compile(rx), f.key) for f in _FEATURES for rx in f.path_regexes]


def _matches(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix.rstrip("/") + "/")


def feature_for_path(path: str) -> Optional[str]:
    """The feature a request path belongs to, or None (not gated / public sub-path).

    The patterns for paths with an id in the middle go first: they are the more specific rule (/deals/3/negotiations belongs
    to the revenue module even though /deals belongs to the pipeline). Among plain prefixes the longest one wins."""
    for rx, key in _REGEX_INDEX:
        if rx.search(path):
            return key
    for prefix, key in _PREFIX_INDEX:
        if _matches(path, prefix):
            for pub in FEATURES[key].public_prefixes:
                if _matches(path, pub):
                    return None
            return key
    return None


def gates_for_path(path: str) -> List[str]:
    key = feature_for_path(path)
    gates = [key] if key else []
    if re.fullmatch(r"/leads/\d+/convert", path):
        gates.append("clients")
    # Specialized handlers still need their parent CRM section enabled. Public
    # intake resolves its tenant and entitlement in the handler itself.
    if path not in {"/leads/intake", "/leads/webhook", "/api/leads/webhook"}:
        for prefix, parent in (("/leads", "leads"), ("/clients", "clients")):
            if _matches(path, prefix) and parent not in gates:
                gates.append(parent)
    return gates


def set_features(session: Session, tenant_id: int, changes: Dict[str, bool]) -> Dict[str, bool]:
    """Upsert entitlement rows for one tenant. Unknown keys raise ValueError; locked features are ignored."""
    unknown = [k for k in changes if k not in FEATURES]
    if unknown:
        raise ValueError(f"Unknown feature(s): {', '.join(sorted(unknown))}")
    existing = {r.feature_key: r for r in session.exec(
        select(TenantFeature).where(TenantFeature.tenant_id == tenant_id).execution_options(skip_tenant=True)).all()}
    for key, enabled in changes.items():
        if FEATURES[key].locked:
            continue
        row = existing.get(key)
        if row:
            row.enabled = bool(enabled)
            session.add(row)
        else:
            session.add(TenantFeature(tenant_id=tenant_id, feature_key=key, enabled=bool(enabled)))
    session.commit()
    invalidate(tenant_id)
    # computed from the session that was written, not through the global engine
    rows = session.exec(select(TenantFeature).where(TenantFeature.tenant_id == tenant_id)
                        .execution_options(skip_tenant=True)).all()
    return _resolve({r.feature_key: bool(r.enabled) for r in rows})


def catalog() -> List[dict]:
    return [{"key": f.key, "label": f.label, "group": f.group, "description": f.description,
             "locked": f.locked, "default_on": f.default_on,
             "gated_on_server": bool(f.path_prefixes or f.path_regexes)}
            for f in _FEATURES]


def keys() -> Iterable[str]:
    return FEATURES.keys()
