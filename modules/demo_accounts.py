"""
Demo accounts: who has one, how they are created and how Demo Account Data (``/admin/telemetry``) manages them.

A demo account is a user with role ``Demo``. There are three kinds:
  * ``self_service``  a visitor signed up on ``/signup`` (or with Google): their own trial tenant, made through the
                      same ``onboarding.create_workspace`` path as every other tenant;
  * ``organization``  a demo workspace the operator made for a client (Client Management > Create demo workspace);
  * ``in_company``    a Demo login inside a real company's tenant (for example a shared showcase login).

Who sees what: the platform operator (SuperAdmin, or the legacy operator login) sees and manages every demo account.
A company Admin sees the demo accounts of their own company (Demo users in their tenant and demo workspaces made for
it) and can switch them off or reset their password. Limits, turning a demo into a client and deleting a workspace
stay with the operator.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import delete, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from database import ClientProfile, EmailOTP, Lead, Notification, PageVisitTelemetry, Tenant, User
from modules import features, onboarding, tenant_settings

DEMO_PRESET = "serphawk"          # a self-service demo shows the product as SerpHawk itself ships it
DEMO_LIMITS = {"limit_clients": 15, "limit_emails": 5, "limit_searches": 5, "limit_projects": 5, "limit_calls": 5}
LIMIT_KEYS = {"clients": "limit_clients", "emails": "limit_emails", "searches": "limit_searches",
              "projects": "limit_projects", "calls": "limit_calls"}
UPGRADE_TITLE = "Demo Upgrade Request"
LEGACY_OPERATOR_EMAIL = "admin@serphawk.com"   # main._require_roles treats this login as an operator too
_OPTS = {"skip_tenant": True}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    dt = as_utc(dt)
    return dt.isoformat() if dt else None


def is_demo(user: Optional[User]) -> bool:
    return bool(user) and (user.role or "").strip().lower() == "demo"


def is_operator(user: Optional[User]) -> bool:
    return bool(user) and ((user.role or "").strip().lower() == "superadmin"
                           or (user.email or "").strip().lower() == LEGACY_OPERATOR_EMAIL)


def signup_mail_ready() -> bool:
    """Whether the server mailbox that sends sign-up codes is configured (modules.email_sender.send_otp_email)."""
    return bool((os.getenv("EMAIL_SENDER") or os.getenv("OUTLOOK_EMAIL"))
                and (os.getenv("EMAIL_PASSWORD") or os.getenv("OUTLOOK_PASSWORD")))


# ── Creation ─────────────────────────────────────────────────────────────────
def create_self_service_demo(session: Session, *, name: str, email: str, password_hash: str) -> dict:
    """A visitor's own demo workspace: trial tenant with demo limits, the flagship modules and one Demo user."""
    email = email.strip()
    name = (name or "").strip() or email.split("@")[0]
    out = onboarding.create_workspace(
        session, company_name=f"{name} (demo)", admin_name=name, admin_email=email, password_hash=password_hash,
        preset=DEMO_PRESET, is_trial=True, limits=DEMO_LIMITS, tenant_name=f"Demo Tenant {email.lower()}",
        admin_role="Demo")
    onboarding.notify_operators(session, "New demo signup", f"{name} ({email}) created a demo workspace.",
                                link="/admin/telemetry")
    return out


# ── Scope ────────────────────────────────────────────────────────────────────
def _demo_rows(session: Session, viewer: User, operator: bool, user_id: Optional[int] = None):
    q = (select(User, Tenant).join(Tenant, Tenant.id == User.tenant_id, isouter=True)
         .where(func.lower(User.role) == "demo"))
    if not operator:
        if not viewer.tenant_id:
            return []
        q = q.where(or_(User.tenant_id == viewer.tenant_id, Tenant.demo_of_tenant_id == viewer.tenant_id))
    if user_id is not None:
        q = q.where(User.id == user_id)
    return session.exec(q.order_by(User.createdAt.desc()).execution_options(**_OPTS)).all()


def get_in_scope(session: Session, viewer: User, operator: bool, user_id: int) -> Tuple[User, Optional[Tenant]]:
    """The demo account ``user_id`` if the viewer may see it, else LookupError (the route answers 404)."""
    rows = _demo_rows(session, viewer, operator, user_id)
    if not rows:
        raise LookupError("Demo account not found")
    return rows[0]


def kind_of(tenant: Optional[Tenant]) -> str:
    if tenant is not None and tenant.demo_of_tenant_id:
        return "organization"
    if tenant is not None and tenant.is_trial:
        return "self_service"
    return "in_company"


def _non_demo_users(session: Session, tenant_id: int) -> int:
    return session.exec(select(func.count()).select_from(User)
                        .where(User.tenant_id == tenant_id, func.lower(User.role) != "demo")
                        .execution_options(**_OPTS)).one()


def _upgrade_notes(session: Session) -> List[Notification]:
    return session.exec(select(Notification).where(Notification.title == UPGRADE_TITLE).execution_options(**_OPTS)).all()


def _mentions(note: Notification, email: str) -> bool:
    return f"({email})".lower() in (note.message or "").lower()


def account_dict(session: Session, user: User, tenant: Optional[Tenant], operator: bool, *,
                 last_active: Optional[datetime] = None, upgrade_notes: Optional[List[Notification]] = None,
                 counts: Optional[Dict[int, dict]] = None, demo_of_names: Optional[Dict[int, str]] = None) -> dict:
    kind = kind_of(tenant)
    own_tenant = kind != "in_company" and tenant is not None
    limits = None
    if own_tenant:
        limits = {k: {"usage": getattr(tenant, f"usage_{k}", 0) or 0, "limit": getattr(tenant, col, 0) or 0}
                  for k, col in LIMIT_KEYS.items()}
    notes = upgrade_notes if upgrade_notes is not None else _upgrade_notes(session)
    deletable = operator and own_tenant and _non_demo_users(session, tenant.id) == 0 and not session.exec(
        select(Tenant.id).where(Tenant.demo_of_tenant_id == tenant.id).execution_options(**_OPTS)).first()
    demo_of_name = None
    if tenant is not None and tenant.demo_of_tenant_id:
        if demo_of_names is not None:
            demo_of_name = demo_of_names.get(tenant.demo_of_tenant_id)
        else:
            src = session.exec(select(Tenant).where(Tenant.id == tenant.demo_of_tenant_id).execution_options(**_OPTS)).first()
            demo_of_name = src.name if src else None
    return {
        "id": user.id, "name": user.name or user.email, "email": user.email,
        "created_at": iso(user.createdAt), "last_active": iso(last_active),
        "tenant_id": user.tenant_id, "tenant_name": tenant.name if tenant else None,
        "company": (tenant.business_name if tenant else None) or None,
        "kind": kind, "demo_of_tenant_id": tenant.demo_of_tenant_id if tenant else None, "demo_of_name": demo_of_name,
        "active": bool(user.is_active),
        "upgrade_requested": any(_mentions(n, user.email or "") for n in notes),
        "limits": limits, "records": (counts or {}).get(tenant.id) if own_tenant else None,
        "can_change_limits": operator and own_tenant,
        "can_convert": operator and kind == "self_service",
        "can_delete": bool(deletable),
    }


def pending_signups(session: Session, days: int = 7) -> List[dict]:
    """Visitors who asked for a sign-up code but have no account: they never got the code, or gave up."""
    since = utc_now() - timedelta(days=days)
    latest: Dict[str, datetime] = {}
    for rec in session.exec(select(EmailOTP).where(EmailOTP.purpose == "signup").execution_options(**_OPTS)).all():
        created = as_utc(rec.created_at)
        if created is None or created < since:
            continue
        key = rec.email.strip().lower()
        if key not in latest or created > latest[key]:
            latest[key] = created
    return [{"email": e, "requested_at": iso(ts)} for e, ts in sorted(latest.items(), key=lambda x: x[1], reverse=True)
            if not onboarding.email_in_use(session, e)]


def list_accounts(session: Session, viewer: User, operator: bool) -> dict:
    rows = _demo_rows(session, viewer, operator)
    user_ids = [u.id for u, _ in rows]
    own_tenants = [t.id for _, t in rows if t is not None and kind_of(t) != "in_company"]

    last_seen: Dict[int, datetime] = {}
    if user_ids:
        for uid, ts in session.exec(select(PageVisitTelemetry.user_id, func.max(PageVisitTelemetry.timestamp))
                                    .where(PageVisitTelemetry.user_id.in_(user_ids))
                                    .group_by(PageVisitTelemetry.user_id).execution_options(**_OPTS)).all():
            last_seen[uid] = ts
    counts: Dict[int, dict] = {tid: {"leads": 0, "clients": 0} for tid in own_tenants}
    if own_tenants:
        for model, key in ((Lead, "leads"), (ClientProfile, "clients")):
            for tid, n in session.exec(select(model.tenant_id, func.count()).where(model.tenant_id.in_(own_tenants))
                                       .group_by(model.tenant_id).execution_options(**_OPTS)).all():
                counts[tid][key] = n
    source_ids = {t.demo_of_tenant_id for _, t in rows if t is not None and t.demo_of_tenant_id}
    demo_of_names = {t.id: t.name for t in session.exec(select(Tenant).where(Tenant.id.in_(source_ids))
                                                        .execution_options(**_OPTS)).all()} if source_ids else {}
    notes = _upgrade_notes(session)

    accounts = [account_dict(session, u, t, operator, last_active=last_seen.get(u.id), upgrade_notes=notes,
                             counts=counts, demo_of_names=demo_of_names) for u, t in rows]
    week_ago = utc_now() - timedelta(days=7)

    def recent(value: Optional[str]) -> bool:
        return bool(value) and datetime.fromisoformat(value) >= week_ago

    summary = {
        "total": len(accounts),
        "active_this_week": sum(1 for a in accounts if recent(a["last_active"])),
        "new_this_week": sum(1 for a in accounts if recent(a["created_at"])),
        "upgrade_requests": sum(1 for a in accounts if a["upgrade_requested"]),
        "disabled": sum(1 for a in accounts if not a["active"]),
    }
    out = {"success": True, "is_operator": operator, "accounts": accounts, "summary": summary}
    if operator:
        out["pending_signups"] = pending_signups(session)
        out["signup_mail_ready"] = signup_mail_ready()
    return out


# ── Actions ──────────────────────────────────────────────────────────────────
def set_active(session: Session, user: User, active: bool) -> None:
    user.is_active = active
    user.status = "Active" if active else "Disabled"
    session.add(user)
    session.commit()


def reset_password(session: Session, user: User, hash_password) -> str:
    """A new random password, shown once. Changing it also signs the account out everywhere (tokens are bound to it)."""
    password = secrets.token_urlsafe(9)
    user.password = hash_password(password)
    user.hashed_password = ""
    session.add(user)
    session.commit()
    return password


def update_limits(session: Session, tenant: Tenant, limits: Optional[Dict[str, int]], reset_usage: bool) -> None:
    for key, value in (limits or {}).items():
        if key not in LIMIT_KEYS:
            raise ValueError(f"Unknown limit '{key}'")
        if int(value) < 0 or int(value) > onboarding.PAID_LIMIT:
            raise ValueError(f"Limit '{key}' is out of range")
        setattr(tenant, LIMIT_KEYS[key], int(value))
    if reset_usage:
        for key in LIMIT_KEYS:
            setattr(tenant, f"usage_{key}", 0)
    session.add(tenant)
    session.commit()


def _clear_upgrade_requests(session: Session, email: str) -> None:
    for n in _upgrade_notes(session):
        if _mentions(n, email):
            session.delete(n)
    session.commit()


def convert_to_client(session: Session, user: User, tenant: Tenant) -> dict:
    """The demo becomes a paying company: no trial limits, the demo user becomes its Admin. Data and modules stay."""
    tenant.is_trial = False
    for col in onboarding.LIMIT_FIELDS:
        setattr(tenant, col, onboarding.PAID_LIMIT)
    company = (tenant.business_name or "").strip()
    if company and not company.endswith("(demo)") and tenant.name.startswith("Demo Tenant "):
        tenant.name = onboarding.unique_tenant_name(session, company)
    user.role = "Admin"
    user.is_active = True
    user.status = "Active"
    session.add(tenant)
    session.add(user)
    session.commit()
    _clear_upgrade_requests(session, user.email or "")
    return {"tenant_id": tenant.id, "tenant_name": tenant.name, "user_id": user.id}


def delete_workspace(session: Session, tenant_id: int) -> dict:
    """
    Delete a demo workspace: every row of the tenant, its users and the tenant itself, in one transaction.

    Foreign keys form cycles (leads <-> clients <-> projects), so there is no single safe order: delete what can be
    deleted, retry what a constraint refused (each attempt in a savepoint) until nothing is left. If something still
    refuses (a row of another tenant points at this one) everything is rolled back and nothing is deleted.
    """
    user_ids = list(session.exec(select(User.id).where(User.tenant_id == tenant_id).execution_options(**_OPTS)).all())
    steps = []
    for t in reversed(SQLModel.metadata.sorted_tables):
        if t.name in ("tenants", "users"):
            continue
        if "tenant_id" in t.c:
            steps.append((t.name, delete(t).where(t.c.tenant_id == tenant_id)))
        if user_ids:
            # rows that point at the workspace's users but carry no tenant (sign-up codes, a few legacy tables)
            for col in t.c:
                if any(fk.column.table.name == "users" for fk in col.foreign_keys):
                    cond = col.in_(user_ids)
                    if "tenant_id" in t.c:
                        cond = cond & t.c.tenant_id.is_(None)
                    steps.append((t.name, delete(t).where(cond)))
    steps.append(("users", delete(User.__table__).where(User.__table__.c.tenant_id == tenant_id)))
    steps.append(("tenants", delete(Tenant.__table__).where(Tenant.__table__.c.id == tenant_id)))

    removed: Dict[str, int] = {}
    pending = steps
    try:
        for _ in range(len(steps) + 2):
            still = []
            for label, stmt in pending:
                try:
                    with session.begin_nested():
                        n = session.execute(stmt.execution_options(**_OPTS)).rowcount
                except IntegrityError:
                    still.append((label, stmt))
                    continue
                if n:
                    removed[label] = removed.get(label, 0) + n
            if not still:
                break
            if len(still) == len(pending):
                raise RuntimeError("Some records of this workspace are still referenced elsewhere: "
                                   + ", ".join(sorted({label for label, _ in still})))
            pending = still
        session.commit()
    except Exception:
        session.rollback()
        raise
    features.invalidate(tenant_id)
    tenant_settings.invalidate(tenant_id)
    return {"tenant_id": tenant_id, "removed": removed}


# ── Upgrade requests (from inside a demo) ────────────────────────────────────
def request_upgrade(session: Session, user: User) -> bool:
    """Tell the operators (and, for an organization's demo, that company's Admins); at most once a day."""
    since = utc_now() - timedelta(hours=24)
    for n in _upgrade_notes(session):
        created = as_utc(n.created_at)
        if _mentions(n, user.email or "") and created is not None and created >= since:
            return False
    recipients = list(session.exec(select(User).where(func.lower(User.role) == "superadmin")
                                   .execution_options(**_OPTS)).all())
    tenant = session.exec(select(Tenant).where(Tenant.id == user.tenant_id).execution_options(**_OPTS)).first() \
        if user.tenant_id else None
    if tenant is not None and tenant.demo_of_tenant_id:
        recipients += session.exec(select(User).where(User.tenant_id == tenant.demo_of_tenant_id,
                                                      func.lower(User.role) == "admin").execution_options(**_OPTS)).all()
    message = f"Demo user {user.name or user.email} ({user.email}) asked to upgrade to a full account."
    for r in {r.id: r for r in recipients}.values():
        session.add(Notification(user_id=r.id, tenant_id=r.tenant_id, title=UPGRADE_TITLE, message=message,
                                 type="info", link="/admin/telemetry"))
    session.commit()
    return True
