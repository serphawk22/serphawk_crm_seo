"""Validated host context shared by login, CRM requests and public lead intake."""
import hashlib
import hmac
import os
import re
import time
from contextvars import ContextVar

from fastapi import HTTPException
from sqlmodel import Session, select

import database
from database import TenantDomain

request_company = ContextVar("request_company", default=None)
RESERVED = set("www api app mail smtp imap admin superadmin support static assets cdn status autodiscover".split())


def base_domain():
    return "serphawk.in"


def configured():
    """Signed company routing activates when its required credential is present."""
    return bool(os.getenv("COMPANY_PROXY_SECRET", "").strip())


def validate_slug(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", value) or value in RESERVED:
        raise ValueError("Use 3–63 lowercase letters, digits or hyphens; this name may be reserved")
    return value


def domain_info(row):
    if not row:
        return {"company_url": None, "login_url": None, "lead_form_url": None, "domain_status": "unassigned"}
    url = f"https://{row.slug}.{base_domain()}"
    ready = configured()
    return {"slug": row.slug, "company_url": url, "login_url": url + "/login", "lead_form_url": url + "/leadformpage",
            "domain_status": "retired" if row.retired else "active" if ready else "pending_setup"}


def canonical_origin(tenant_id):
    with Session(database.engine) as session:
        row = session.exec(select(TenantDomain).where(TenantDomain.tenant_id == tenant_id, TenantDomain.retired == False)
                           .execution_options(skip_tenant=True)).first()
        if row and configured():
            return domain_info(row)["company_url"]
    return os.getenv("FRONTEND_URL", "https://serphawk.in").rstrip("/")


def signature(method, target, host, timestamp, body, ip=""):
    secret = os.getenv("COMPANY_PROXY_SECRET", "")
    if not secret:
        raise HTTPException(503, "Company routing is not configured")
    message = "\n".join((method.upper(), target, host, timestamp, hashlib.sha256(body).hexdigest(), ip))
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


async def resolve_request(request):
    request_company.set(None)
    host = request.headers.get("x-company-host")
    required = configured()
    # Provider webhooks retain their independently authenticated contracts.
    exempt = request.url.path.startswith(("/webhook/", "/voice-agent/twilio/", "/static/")) or request.url.path in {
        "/health", "/leads/webhook", "/api/leads/webhook", "/leads/intake"}
    if not host:
        if required and not exempt:
            raise HTTPException(403, "Verified company host context is required")
        return
    stamp = request.headers.get("x-company-time", "")
    try:
        if abs(time.time() - int(stamp)) > 60:
            raise ValueError()
    except ValueError:
        raise HTTPException(403, "Expired host context")
    if host != host.lower() or not re.fullmatch(r"[a-z0-9.-]+", host):
        raise HTTPException(403, "Invalid company host")
    body = await request.body()
    target = request.scope.get("raw_path", request.url.path.encode()).decode("ascii") + ("?" + request.url.query if request.url.query else "")
    expected = signature(request.method, target, host, stamp, body, request.headers.get("x-company-ip", ""))
    if not hmac.compare_digest(expected, request.headers.get("x-company-signature", "")):
        raise HTTPException(403, "Invalid host signature")
    if host == base_domain():
        return
    suffix = "." + base_domain()
    if not host.endswith(suffix):
        raise HTTPException(404, "Company unavailable")
    slug = host[:-len(suffix)]
    try:
        validate_slug(slug)
    except ValueError:
        raise HTTPException(404, "Company unavailable")
    if request.url.path in {"/register", "/signup"}:
        raise HTTPException(403, "Create new workspaces on the platform domain")
    # Keep blocking database work off the event loop. Its lookup transaction is
    # closed before a scoped business transaction can begin.
    def lookup():
        with Session(database.engine) as session:
            row = session.exec(select(TenantDomain).where(TenantDomain.slug == slug, TenantDomain.retired == False)
                               .execution_options(skip_tenant=True)).first()
            return row.tenant_id if row else None
    from starlette.concurrency import run_in_threadpool
    tid = await run_in_threadpool(lookup)
    if tid is None:
        raise HTTPException(404, "Company unavailable")
    request_company.set({"tenant_id": tid, "host": host})


def check_user(user):
    company = request_company.get()
    if company and (str(user.role).lower() == "superadmin" or user.tenant_id != company["tenant_id"]):
        raise HTTPException(403, "Sign in with an account belonging to this company")
