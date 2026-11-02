"""Sales visibility follows authenticated ownership, including aggregate queries."""
from contextvars import ContextVar

from sqlalchemy import or_, select, false
from sqlalchemy.orm import with_loader_criteria

actor = ContextVar("sales_actor", default=None)
SALES_ROLES = {"SalesManager", "Sales", "Employee"}  # legacy accounts keep their assignments


def is_sales():
    value = actor.get()
    return bool(value and value[1] in SALES_ROLES)


def criteria():
    value = actor.get()
    if not value:
        return ()
    from database import Lead, ClientProfile, Contact, CallLog, ScheduledCall, AICall, Invoice
    uid, role = value[:2]
    invoice_options = ()
    if role not in {"Admin", "SuperAdmin", "Demo"}:
        condition = ClientProfile.userId == uid if role == "Client" else or_(ClientProfile.assignedEmployeeId == uid, ClientProfile.created_by == uid) if is_sales() else false()
        invoice_options = (with_loader_criteria(Invoice, Invoice.client_id.in_(select(ClientProfile.id).where(condition)), include_aliases=True),)
    if not is_sales():
        return invoice_options
    # Names are editable and can collide. Only stable account ids authorize access.
    assignees = [str(uid)]
    return invoice_options + tuple(with_loader_criteria(model, condition, include_aliases=True) for model, condition in (
        (Lead, or_(Lead.owner_id == uid, Lead.created_by == uid)),
        (ClientProfile, or_(ClientProfile.assignedEmployeeId == uid, ClientProfile.created_by == uid)),
        (Contact, or_(Contact.owner_id == uid, Contact.created_by == uid)),
        (CallLog, or_(CallLog.assigned_to.in_(assignees), CallLog.created_by == uid)),
        (ScheduledCall, or_(ScheduledCall.assigned_to.in_(assignees), ScheduledCall.created_by == uid)),
        (AICall, or_(AICall.started_by == uid, AICall.assigned_to.in_(assignees))),
    ))


def effective_modules(tenant_id, role):
    from modules import features, tenant_settings
    enabled = features.effective_features(tenant_id)
    if role in SALES_ROLES:
        overrides = tenant_settings.get_setting(tenant_id, "sales_module_access", {}) or {}
        for key in enabled:
            enabled[key] = enabled[key] and overrides.get(key, key != "reports")
        enabled["teams"] = False
    return enabled
