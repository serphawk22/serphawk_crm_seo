"""
Row-level tenant scoping for ORM statements.

`criteria_options(tenant_id)` returns SQLAlchemy `with_loader_criteria` options, one per mapped table that
has a `tenant_id` column. Attached to a statement they add `tenant_id = :id` to EVERY use of that entity:
plain selects, joins, aliases, column-only selects (`select(Lead.company_name)`), aggregates
(`select(func.count()).select_from(Lead)`), subqueries, relationship loads and ORM bulk UPDATE / DELETE.

What this does NOT cover: raw SQL via `text()` and Core statements that do not name an ORM entity. Those
must filter `tenant_id` themselves.
"""
import contextvars
from functools import lru_cache
from typing import Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import with_loader_criteria
from sqlmodel import SQLModel

# The tenant of the current request. None = unscoped (SuperAdmin without a tenant, background workers),
# -1 = anonymous (matches nothing). Set by main.APIIntelligenceMiddleware.
current_tenant_id = contextvars.ContextVar("current_tenant_id", default=None)

# Tables that are deliberately cross-tenant. `users` is NOT one of them any more: it is scoped like every other
# table, with two rules (see user_option): you can always load yourself, and look-ups BY E-MAIL stay global because
# an e-mail address is unique across all clients (login, password reset, "does this account exist").
GLOBAL_TABLES = frozenset({
    "tenants", "client_statuses", "service_catalog",
    "audit_logs",      # telemetry must always be cross-tenant for the admin view
    "notifications",   # user-scoped, not tenant-scoped
})

_scoped_models: Optional[Tuple[type, ...]] = None


def tenant_scoped_models() -> Tuple[type, ...]:
    """Mapped classes whose table has a tenant_id column and is not global. Computed once, on first use,
    so every model has been imported by then."""
    global _scoped_models
    if _scoped_models is None:
        import database  # noqa: F401  (registers every model on the SQLModel registry)

        found = []
        for mapper in SQLModel._sa_registry.mappers:
            cls = mapper.class_
            table = getattr(cls, "__table__", None)
            if table is None or table.name in GLOBAL_TABLES or table.name == "users":
                continue
            if "tenant_id" in table.c:
                found.append(cls)
        _scoped_models = tuple(found)
    return _scoped_models


@lru_cache(maxsize=16384)
def user_option(tenant_id: int, current_user_id: Optional[int]):
    """Scope the users table to the tenant, but always let the caller load their own row (a SuperAdmin acting inside
    a tenant has no tenant of their own)."""
    from database import User
    cond = User.tenant_id == tenant_id
    if current_user_id:
        cond = or_(cond, User.id == current_user_id)
    return with_loader_criteria(User, cond, include_aliases=True)


@lru_cache(maxsize=2048)
def criteria_options(tenant_id: int):
    """Cached per tenant: building ~80 option objects per statement cost more than the query itself."""
    return tuple(
        with_loader_criteria(model, model.tenant_id == tenant_id, include_aliases=True)
        for model in tenant_scoped_models()
    )
