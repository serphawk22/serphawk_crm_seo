"""Tenant-scoped identity checks shared by forms, imports, conversions and extraction."""
import hashlib
import re
import threading
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import inspect, select, text

_locks = {}
_locks_guard = threading.Lock()


def name_key(value):
    return " ".join(str(value or "").casefold().split())


def phone_key(value, dial_code=None):
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("00"):
        digits = digits[2:]
    elif dial_code and not raw.startswith("+") and (len(digits) == 10 or (len(digits) == 11 and digits.startswith("0"))):
        digits = re.sub(r"\D", "", dial_code) + digits[-10:]
    return digits if len(digits) >= 7 else ""


def website_key(value):
    value = str(value or "").strip()
    if not value or value.casefold() in {"n/a", "none", "null", "unknown", "-"}:
        return ""
    try:
        url = urlsplit(value if "://" in value else "https://" + value)
        host = (url.hostname or "").casefold().removeprefix("www.")
        return host + url.path.rstrip("/") if host else ""
    except ValueError:
        return ""


def identifiers(model, values, dial_code=None):
    from database import Lead, ClientProfile, MarketplaceService
    if model is Lead:
        result = {"email": str(values.get("email") or "").strip().casefold(), "phone": phone_key(values.get("phone"), dial_code), "website": website_key(values.get("website"))}
        if not any(result.values()) and values.get("company_name"):
            result["company and address"] = " ".join(str(values["company_name"]).casefold().split()) + "|" + " ".join(str(values.get("address") or "").casefold().split())
        return result
    if model is ClientProfile:
        result = {"account": str(values.get("userId") or ""), "email": str(values.get("email") or "").strip().casefold(), "phone": phone_key(values.get("phone"), dial_code), "website": website_key(values.get("websiteUrl"))}
        if not any(result.values()) and values.get("companyName"):
            result["company and address"] = " ".join(str(values["companyName"]).casefold().split()) + "|" + " ".join(str(values.get("address") or "").casefold().split())
        return result
    if model is MarketplaceService:
        if not values.get("is_active", True):
            return {}
        service = " ".join(str(values.get("service_name") or "").casefold().split())
        provider = " ".join(str(values.get("provider_name") or "").casefold().split())
        if not service:
            return {}
        result = {"service and provider": f"{service}|{provider}"} if provider else {}
        if values.get("provider_client_id"):
            result["service and provider account"] = f"{service}|{values['provider_client_id']}"
        if not result:
            result["service"] = service
        return result
    return {}


def lock_company(session, tenant_id):
    held = session.info.setdefault("duplicate_locks", {})
    connection = session.connection()
    if connection.dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(f"crm-identities:{tenant_id}".encode()).digest()[:8], "big", signed=True)
        connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    else:
        if tenant_id in held:
            return
        with _locks_guard:
            # FastAPI may close a dependency on another worker thread. The
            # session owns this lock (held above), rather than the OS thread.
            lock = _locks.setdefault((id(session.get_bind()), tenant_id), threading.Lock())
        lock.acquire()
        held[tenant_id] = lock


def transaction_ended(session, transaction):
    if transaction.parent is None:
        for lock in session.info.pop("duplicate_locks", {}).values():
            if lock:
                lock.release()


def validate(session):
    from database import Lead, ClientProfile, MarketplaceService, TenantSettings, User
    from modules.tenant_scope import current_tenant_id
    tid = current_tenant_id.get()
    if not tid or tid < 1:
        return
    fields = {Lead: ("email", "phone", "website", "company_name", "address"), ClientProfile: ("userId", "phone", "websiteUrl", "companyName", "address"),
              MarketplaceService: ("service_name", "provider_name", "provider_client_id", "is_active")}
    candidates = [obj for obj in session.new.union(session.dirty) if type(obj) in fields and obj not in session.deleted
                  and (obj in session.new or any(inspect(obj).attrs[field].history.has_changes() for field in fields[type(obj)]))]
    if not candidates:
        return
    lock_company(session, tid)
    stored = session.connection().execute(select(TenantSettings.__table__.c.settings).where(TenantSettings.__table__.c.tenant_id == tid)).scalar_one_or_none() or {}
    dial = stored.get("default_dial_code")
    rows_by_model = {}
    seen = {}
    accounts = dict(session.connection().execute(select(User.__table__.c.id, User.__table__.c.email).where(User.__table__.c.tenant_id == tid)).all()) if any(type(obj) is ClientProfile for obj in candidates) else {}
    def keys_for(model, values):
        return identifiers(model, {**values, "email": accounts.get(values.get("userId"))} if model is ClientProfile else values, dial)
    for obj in candidates:
        model = type(obj)
        keys = {kind: key for kind, key in keys_for(model, obj.model_dump()).items() if key}
        if model not in rows_by_model:
            # Core query intentionally checks every owner, while explicitly limiting the company.
            # A duplicate owned by someone else must be rejected without disclosing its details.
            rows_by_model[model] = list(session.connection().execute(select(model.__table__).where(model.__table__.c.tenant_id == tid)).mappings())
        others = [row for row in rows_by_model[model] if obj.id is None or row["id"] != obj.id]
        other_keys = [keys_for(model, row) for row in others]
        for kind, key in keys.items():
            if (model, kind, key) in seen or any(row.get(kind) == key for row in other_keys):
                label = {Lead: "lead", ClientProfile: "client", MarketplaceService: "marketplace entry"}[model]
                raise HTTPException(status_code=409, detail=f"A {label} with this {kind} already exists in this company")
            seen[(model, kind, key)] = obj.id
