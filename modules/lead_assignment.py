"""
Handing a lead to a salesperson, the way two of the original deployments did it, for ONE company at a time.

  "workload"  (SCM BPO)  the active SalesManager / Sales with the fewest leads, ties broken by the better conversion rate;
                         with no such person, the active Employees.
  "revenue"   (SCM HB)   the active SalesManager / Employee who has collected the least enrollment revenue, then has the
                         fewest leads (needs the Institute module for the revenue figures).

A company picks its strategy with the ``lead_assignment`` setting and whether new leads are assigned the moment they are
created with ``lead_auto_assign``. Every query here names the tenant, so one company's people are never offered another
company's leads (the originals treated "tenant 1" as "everyone").
"""
from typing import Dict, List, Optional

from sqlmodel import Session, select

from database import Lead, User
from modules import tenant_settings

STRATEGIES = ("workload", "revenue")
_PRIMARY_ROLES = ("SalesManager", "Sales")
_FALLBACK_ROLES = ("Employee",)


def strategy_for(tenant_id: Optional[int], default: str = "workload") -> str:
    value = tenant_settings.get_setting(tenant_id, "lead_assignment", default)
    return value if value in STRATEGIES else default


def auto_assign_on_create(tenant_id: Optional[int]) -> bool:
    return bool(tenant_settings.get_setting(tenant_id, "lead_auto_assign", False))


def _active(session: Session, tenant_id: int, roles) -> List[User]:
    return list(session.exec(select(User).where(User.tenant_id == tenant_id, User.role.in_(roles), User.is_active == True)  # noqa: E712
                             .order_by(User.id)).all())


def _workload_stats(session: Session, tenant_id: int, reps: List[User]) -> Dict[int, dict]:
    rows = session.exec(select(Lead.owner_id, Lead.is_converted, Lead.status)
                        .where(Lead.tenant_id == tenant_id, Lead.owner_id.in_([r.id for r in reps]))).all()
    stats = {r.id: {"rep": r, "total": 0, "converted": 0, "new": 0} for r in reps}
    for owner_id, is_converted, status in rows:
        s = stats[owner_id]
        s["total"] += 1
        if is_converted or str(status or "").lower() in ("converted", "won"):
            s["converted"] += 1
    return stats


def _rate(s: dict) -> float:
    return (s["converted"] / s["total"]) if s["total"] else 0.5      # no history: assume average


def _workload_pool(session: Session, tenant_id: int) -> Dict[int, dict]:
    reps = _active(session, tenant_id, _PRIMARY_ROLES) or _active(session, tenant_id, _FALLBACK_ROLES)
    return _workload_stats(session, tenant_id, reps) if reps else {}


def _pick_workload(pool: Dict[int, dict]) -> Optional[User]:
    if not pool:
        return None
    best = min(pool.values(), key=lambda s: (s["total"] + s["new"], -_rate(s), s["rep"].id))
    return best["rep"]


def _revenue_pool(session: Session, tenant_id: int):
    from addons.institute import routes as institute      # the revenue figures live with the Institute module
    from modules.tenant_scope import current_tenant_id
    token = current_tenant_id.set(tenant_id)               # its queries rely on the tenant filter
    try:
        users, metrics = institute._salesperson_assignment_metrics(session)
    finally:
        current_tenant_id.reset(token)
    return [u for u in users if u.tenant_id == tenant_id], metrics


def choose_salesperson(session: Session, tenant_id: int, strategy: Optional[str] = None) -> Optional[User]:
    strategy = strategy or strategy_for(tenant_id)
    if strategy == "revenue":
        users, metrics = _revenue_pool(session, tenant_id)
        if not users:
            return None
        return min(users, key=lambda u: (metrics[u.id]["revenue_collected"], metrics[u.id]["assigned_workload"], u.id or 0))
    return _pick_workload(_workload_pool(session, tenant_id))


def assign_lead(session: Session, lead: Lead, tenant_id: int, strategy: Optional[str] = None) -> Optional[User]:
    """Set ``lead.owner_id`` (not committed). None, and the lead stays unassigned, when the company has nobody eligible."""
    rep = choose_salesperson(session, tenant_id, strategy)
    if rep:
        lead.owner_id = rep.id
    return rep


def assign_all_unassigned(session: Session, tenant_id: int, strategy: Optional[str] = None) -> List[dict]:
    """Give every unassigned lead of the company to someone, balancing as it goes. Commits. [] when nobody is eligible."""
    strategy = strategy or strategy_for(tenant_id)
    leads = list(session.exec(select(Lead).where(Lead.tenant_id == tenant_id, (Lead.owner_id == None) | (Lead.owner_id == 0))  # noqa: E711
                              .order_by(Lead.created_at, Lead.id)).all())
    if not leads:
        return []
    out: List[dict] = []
    if strategy == "revenue":
        users, metrics = _revenue_pool(session, tenant_id)
        if not users:
            return []
        for lead in leads:
            chosen = min(users, key=lambda u: (metrics[u.id]["revenue_collected"], metrics[u.id]["assigned_workload"], u.id or 0))
            metrics[chosen.id]["assigned_workload"] += 1
            lead.owner_id = chosen.id
            session.add(lead)
            out.append({"lead_id": lead.id, "company_name": lead.company_name, "assigned_to": chosen.id, "assigned_name": chosen.name})
    else:
        pool = _workload_pool(session, tenant_id)
        if not pool:
            return []
        for lead in leads:
            rep = _pick_workload(pool)
            pool[rep.id]["new"] += 1
            lead.owner_id = rep.id
            session.add(lead)
            out.append({"lead_id": lead.id, "company_name": lead.company_name, "assigned_to": rep.id, "assigned_name": rep.name})
    session.commit()
    return out
