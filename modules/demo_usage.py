"""Durable, atomic demo budgets shared by every user of a workspace.

The transport guard charges actual paid HTTP requests (including retries), before
they leave the process. Route checks provide a useful 403 and prohibit unbounded
background/bulk workflows. Ordinary record reads and edits do not spend credits.
"""
import asyncio
import re
from contextvars import ContextVar
from functools import wraps
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

import database
from database import DemoServiceUsage, Tenant, User
from modules.tenant_scope import current_tenant_id
from modules.api_tracker import current_salesperson_id

BUDGETS = {"ai": 5, "calls": 2}
demo_context = ContextVar("demo_paid_service_tenant", default=None)
PAID_HOSTS = {"api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com",
              "api.groq.com", "api.deepseek.com", "api.elevenlabs.io", "google.serper.dev",
              "maps.googleapis.com", "api.firecrawl.dev"}
_installed = False


def restricted_tenant(session, user=None):
    tid = user.tenant_id if user else current_tenant_id.get()
    if not tid or tid < 1:
        return None
    tenant = session.exec(select(Tenant).where(Tenant.id == tid)).first()
    if not user and current_salesperson_id.get():
        user = session.exec(select(User).where(User.id == current_salesperson_id.get(), User.tenant_id == tid)).first()
    return tid if tenant and (tenant.is_trial or (user and (user.role or "").lower() == "demo")) else None


def background_restricted(session, tenant_id, user_id=None):
    """Workers resolve the actor explicitly: they do not inherit request context."""
    if not tenant_id or tenant_id < 1:
        return False
    tenant = session.exec(select(Tenant).where(Tenant.id == tenant_id).execution_options(skip_tenant=True)).first()
    if tenant and tenant.is_trial:
        return True
    user = session.exec(select(User).where(User.id == user_id, User.tenant_id == tenant_id)
                        .execution_options(skip_tenant=True)).first() if user_id else None
    return bool(user and (user.role or "").lower() == "demo")


def _exhausted(resource):
    return HTTPException(status_code=403, detail={"error": "LIMIT_REACHED", "limit_type": resource,
                         "message": ("Demo limit reached: 5 AI API requests per workspace." if resource == "ai"
                                     else "Demo limit reached: 2 phone calls per workspace.")})


def usage(session, tenant_id):
    rows = session.exec(select(DemoServiceUsage).where(DemoServiceUsage.tenant_id == tenant_id)).all()
    used = {row.resource: row.used for row in rows}
    tenant = session.exec(select(Tenant).where(Tenant.id == tenant_id)).first()
    used["calls"] = tenant.usage_calls if tenant else 0
    return {key: {"used": used.get(key, 0), "limit": limit} for key, limit in BUDGETS.items()}


def check(tenant_id, resource):
    with Session(database.engine) as session:
        if usage(session, tenant_id)[resource]["used"] >= BUDGETS[resource]:
            raise _exhausted(resource)


def consume(tenant_id, resource):
    """Conditional UPDATE / unique INSERT prevents concurrent overspending."""
    if not tenant_id or tenant_id < 1:
        return
    limit = BUDGETS[resource]
    if resource == "calls":
        with Session(database.engine) as session:
            used = session.execute(update(Tenant).where(Tenant.id == tenant_id, Tenant.usage_calls < limit)
                                   .values(usage_calls=Tenant.usage_calls + 1)
                                   .returning(Tenant.usage_calls)).scalar_one_or_none()
            if used is None:
                raise _exhausted(resource)
            session.commit()
        return
    for attempt in range(2):
        with Session(database.engine) as session:
            used = session.execute(update(DemoServiceUsage).where(
                DemoServiceUsage.tenant_id == tenant_id, DemoServiceUsage.resource == resource,
                DemoServiceUsage.used < limit).values(used=DemoServiceUsage.used + 1)
                .returning(DemoServiceUsage.used)).scalar_one_or_none()
            if used is not None:
                session.commit()
                return
            existing = session.exec(select(DemoServiceUsage).where(
                DemoServiceUsage.tenant_id == tenant_id, DemoServiceUsage.resource == resource)).first()
            if existing:
                raise _exhausted(resource)
            session.add(DemoServiceUsage(tenant_id=tenant_id, resource=resource, used=1))
            try:
                session.commit()
                return
            except IntegrityError:
                session.rollback()  # another worker created the first counter
    raise _exhausted(resource)


def request_policy(method, path):
    """Paid entry points, including GETs that actually generate data."""
    if method == "OPTIONS":
        return None
    if method == "POST" and path in {"/voice-agent/calls", "/voice-agent/quick-call"}:
        return "calls"
    # Background jobs can fan out into many provider calls and escape request context.
    if method == "POST" and (path in {"/email-campaigns", "/followups/scan", "/research-map-company", "/automations/intelligence-scan", "/clients/import-sheet"}
                             or re.fullmatch(r"/email-campaigns/\d+/retry", path)
                             or path.endswith("/sync") or path == "/inbox/sync"):
        return "blocked"
    if method in {"POST", "GET"} and (
        path in {"/smart-research", "/generate", "/radar/search", "/radar/analyze", "/competitors/analyze",
                 "/tts/generate", "/chatbot/message", "/chatbot/message/stream", "/task-sheet/ai-summary",
                 "/voice-agent/pitches/generate-text", "/voice-agent/tts/preview", "/email-campaigns/preview", "/documents/ocr", "/clients/auto-fill"}
        or (method == "POST" and path.startswith("/voice-agent/pitches"))
        or re.fullmatch(r"/voice-agent/calls/\d+/say", path)
        or re.search(r"/(ai-insights|auto-research|extract-services|generate-outbound-draft|simulate-call|extract-tasks|reply-draft|draft-email|email-draft|full-analysis|ai-categorize|regenerate|summary|analyze)$", path)
        or path.endswith("/email-composer/draft") or path.endswith("/competitors/scan")
        or path.startswith("/reports/ai/")):
        return "ai"
    return None


def _charge(url):
    if urlparse(str(url)).hostname not in PAID_HOSTS:
        return
    tid = demo_context.get()
    if not tid:
        with Session(database.engine) as session:
            tid = restricted_tenant(session)
    if tid:
        consume(tid, "ai")


def install_guards():
    """Cover OpenAI chat/streaming/TTS as well as paid research providers."""
    global _installed
    if _installed:
        return
    import httpx
    import requests
    original_sync, original_async, original_requests = httpx.Client.send, httpx.AsyncClient.send, requests.Session.send

    @wraps(original_sync)
    def sync_send(self, request, *args, **kwargs):
        _charge(request.url)
        return original_sync(self, request, *args, **kwargs)

    @wraps(original_async)
    async def async_send(self, request, *args, **kwargs):
        await asyncio.to_thread(_charge, request.url)
        return await original_async(self, request, *args, **kwargs)

    @wraps(original_requests)
    def requests_send(self, request, *args, **kwargs):
        _charge(request.url)
        return original_requests(self, request, *args, **kwargs)

    httpx.Client.send, httpx.AsyncClient.send, requests.Session.send = sync_send, async_send, requests_send
    _installed = True
