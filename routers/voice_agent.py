import asyncio
import os
import re
import sys
import threading
from contextvars import copy_context
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime
from typing import List, NamedTuple, Optional
from urllib.parse import urlencode
from xml.sax.saxutils import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select

from database import (
    engine, User, Tenant, ClientProfile, Lead, Contact, Product, Solution, ActivityLog,
    VoicePitch, AICall, CallQuestion, CallKnowledge,
)
from modules.api_tracker import current_salesperson_id
from modules import voice_agent as va
from modules import lead_calls, tenant_voice, voice_call_session as vcs
from modules.tts_service import (
    synthesize, delete_audio, tts_options, twilio_language, language_label, resolve_voice_locale, AUDIO_DIR,
    synthesize_cached, cached_audio, prewarm_cached, CALL_TTS_MODEL, CALL_TTS_TIMEOUT, FILLER_PHRASES,
    start_streaming_tts, get_streaming_clip, iter_streaming_clip,
)

router = APIRouter(prefix="/voice-agent", tags=["AI Voice Agent"])

# Boot diagnostic: Twilio fetches every webhook from this base, so a stale value
# (e.g. an old ngrok URL) is the #1 cause of "could not reach the TwiML server".
# The configured candidates are listed; the one that is actually used is decided by the
# pre-flight check, which verifies that the server really serves this app's routes.
print(f"[voice_agent] Twilio webhook base candidates: "
      f"{', '.join(va.base_candidates()) or '(UNSET — set VOICE_AGENT_BASE_URL or PUBLIC_BASE_URL)'}",
      flush=True)

ALLOWED_ROLES = {"Admin", "SalesManager", "Employee", "Demo", "SuperAdmin"}
ACTIVE_STATUSES = {"queued", "initiated", "ringing", "in-progress"}
TERMINAL_STATUSES = {"completed", "busy", "failed", "no-answer", "canceled"}
MAX_WAIT_LOOPS = 200  # ~10 minutes of agent typed-mode listening

# Prefix for the AI call summary shown in the AI Calls list. Plain hyphen only — do NOT use an
# em dash: this string was previously stored double-encoded ("â€”") and looked garbled in the UI.
AI_CALL_SUMMARY_PREFIX = "AI Voice Call - "

# Fixed lines the agent speaks; translated once per call into the call language (stored in call.context).
PHRASES = {
    "still_there": "Are you still there?",
    "still_there_2": "Hello? I can call back at a better time if that's easier.",
    "silence_2": "I can wait a moment if you need a second.",
    "silence_3": "No pressure at all — whenever you're ready.",
    "silence_4": "If now isn't a good time, just let me know.",
    "lost_connection": "It seems we've lost the connection. I'll follow up another time. Thanks, and have a great day!",
    "connect_agent": "Let me connect you with my colleague right now, one moment please.",
    "connect_noted": "Thank you, I've noted your request. One of our sales representatives will get in touch with you shortly. Have a great day, goodbye!",
    "agent_unavailable": "I'm sorry, my colleague isn't available right this moment. I've noted your request and they'll call you back shortly. Is there anything I can help with in the meantime?",
    "resume": "Thanks for bearing with me. Is there anything else I can help you with?",
    "wait_timeout": "Thanks for your patience. We'll follow up with you shortly. Goodbye!",
    "one_moment": "One moment please.",
    "hold_check": "That's a great question.",
    "hold_1": "Let me look into that for you.",
    "hold_2": "I'm checking that now.",
    "hold_3": "Let me pull up the details.",
    "hold_4": "Bear with me for just a second.",
    "hold_5": "I appreciate your patience, let me confirm that.",
    "hold_6": "Good question, let me find out.",
    "hold_7": "Thanks for waiting, I'm on it.",
    "hold_8": "Let me double-check that for you.",
    "retry": "Sorry, could you say that again?",
    "apology": "Sorry, I lost you for a moment. Could you say that again?",
    "goodbye_silence": "I'll let you go for now. Thanks so much for your time, and have a great day!",
    "goodbye_error": "Sorry, we ran into a problem. I'll have a colleague call you back shortly. Thanks, and goodbye!",
    "default_opening": "Hi, this is a call from {company}. Do you have a minute?",
}

# Filler pool played while the reply is generated (paid accounts: a varied set of hold phrases in
# the call's voice; every phrase is spoken at most ONCE per call, see ``_pick_filler``).
FILLER_KEYS = ("one_moment", "hold_check", "hold_1", "hold_2", "hold_3", "hold_4", "hold_5", "hold_6",
               "hold_7", "hold_8")
# Gentle single silence prompt pool (paid accounts: 1st silence only; the 2nd is a goodbye).
SILENCE_KEYS = ("still_there", "silence_2", "silence_3", "silence_4")
# Fixed apology / goodbye lines pre-warmed per call so error and hangup paths never change voice.
FIXED_KEYS = ("retry", "apology", "goodbye_silence", "goodbye_error", "connect_noted")


def get_session():
    with Session(engine) as session:
        yield session


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Helpers
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _current_user(session: Session) -> User:
    uid = current_salesperson_id.get()
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Roles are stored inconsistently ("admin" vs "Admin"), so compare case-insensitively.
    allowed = {r.lower() for r in ALLOWED_ROLES}
    if (user.role or "").lower() not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _set_tenant(tenant_id: Optional[int]) -> None:
    """Webhooks arrive unauthenticated (tenant -1); scope DB access to the call's tenant."""
    for name in ("main", "__main__"):
        mod = sys.modules.get(name)
        var = getattr(mod, "current_tenant_id", None) if mod else None
        if var is not None:
            var.set(tenant_id)
            return


def _check_call_limit(session: Session, user: User) -> bool:
    from modules import demo_usage
    tid = demo_usage.restricted_tenant(session, user)
    if tid:
        demo_usage.consume(tid, "calls")
        return True
    return False


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _public_audio(url_path: Optional[str], call: Optional[AICall] = None) -> Optional[str]:
    base = _call_base(call)
    if not url_path or not base:
        return None
    return f"{base}{url_path}"


def _call_base(call: Optional[AICall] = None) -> str:
    """The public base URL this call must use for every webhook and audio URL.

    The base is stored on the call when it is dialed (after the pre-flight check verified that
    the server really serves this app's voice-agent routes), so the URLs Twilio fetches during
    the call keep pointing at the same working server - even if the process restarts or the
    configuration changes mid-call.
    """
    base = ((call.context or {}).get("public_base") if call is not None else None) or ""
    return base or va.public_base()


def _audio_file_exists(url_path: Optional[str]) -> bool:
    """True when the ``/static/audio/...`` URL points at a file that is actually on disk."""
    if not url_path:
        return False
    rel = url_path.lstrip("/").replace("/", os.sep)
    return rel.startswith("static") and os.path.isfile(rel)


def _audio_in_use(session: Session, audio_url: Optional[str], exclude_id: Optional[int] = None) -> bool:
    """True when another VoicePitch row still points at this audio file (safe-delete guard)."""
    if not audio_url:
        return False
    stmt = select(VoicePitch).where(VoicePitch.audio_url == audio_url)
    if exclude_id is not None:
        stmt = stmt.where(VoicePitch.id != exclude_id)
    return session.exec(stmt).first() is not None


def _hook_url(call: AICall, name: str, **extra) -> str:
    base = _call_base(call)
    query = urlencode({"t": call.webhook_token, **extra})
    return f"{base}/voice-agent/twilio/{name}/{call.id}?{query}"


def _xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _append_turn(call: AICall, role: str, text: str, **meta) -> None:
    turn = {"role": role, "text": text, "ts": va.utcnow().isoformat(), **meta}
    call.transcript = [*(call.transcript or []), turn]
    flag_modified(call, "transcript")


def _update_context(call: AICall, **values) -> dict:
    ctx = {**(call.context or {}), **values}
    call.context = ctx
    flag_modified(call, "context")
    return ctx


def _entity_info(session: Session, etype: Optional[str], eid: Optional[int],
                 tenant_id: Optional[int] = None) -> dict:
    # Structured company/industry/audience fields are substituted into the pitch; `context`
    # remains the readable CRM block shown to the model and to support tooling.
    info = {"name": None, "company": None, "industry": None, "website": None, "notes": None,
            "phone": None, "email": None, "context": "No CRM record linked."}
    if not etype or not eid:
        return info

    def owned(record) -> bool:
        return bool(record) and (tenant_id is None or getattr(record, "tenant_id", None) == tenant_id)

    if etype == "client":
        cp = session.get(ClientProfile, eid)
        if owned(cp):
            kws = ", ".join(cp.targetKeywords or [])
            name = cp.companyName or cp.projectName
            industry = getattr(cp, "industry", None)
            info.update(
                name=name, company=name, industry=industry, website=cp.websiteUrl,
                notes=cp.services_offered, phone=cp.phone,
                email=cp.user.email if getattr(cp, "user", None) else None,
                context="\n".join(filter(None, [
                    f"Company: {name}",
                    f"Contact person: {getattr(cp, 'contact_person', None)}" if getattr(cp, "contact_person", None) else None,
                    f"Website: {cp.websiteUrl}" if cp.websiteUrl else None,
                    f"Industry: {industry}" if industry else None,
                    f"Services they offer/need: {cp.services_offered}" if cp.services_offered else None,
                    f"Target keywords: {kws}" if kws else None,
                    f"Existing client status: {cp.status}",
                ])))
    elif etype == "lead":
        ld = session.get(Lead, eid)
        if owned(ld):
            info.update(name=ld.company_name, company=ld.company_name, industry=ld.industry,
                        website=ld.website, notes=ld.notes, phone=ld.phone, email=ld.email, context="\n".join(filter(None, [
                f"Company: {ld.company_name}",
                f"Website: {ld.website}" if ld.website else None,
                f"Industry: {ld.industry}" if ld.industry else None,
                f"Lead status: {ld.status}",
                f"Notes: {(ld.notes or '')[:1500]}" if ld.notes else None,
            ])))
    elif etype == "contact":
        ct = session.get(Contact, eid)
        if owned(ct):
            name = ct.full_name or " ".join(filter(None, [ct.first_name, ct.last_name]))
            company, industry = None, None
            if ct.lead_id:
                ld = session.get(Lead, ct.lead_id)
                company = ld.company_name if ld else None
                industry = ld.industry if ld else None
            elif ct.client_id:
                cp = session.get(ClientProfile, ct.client_id)
                company = (cp.companyName or cp.projectName) if cp else None
                industry = getattr(cp, "industry", None) if cp else None
            info.update(name=name, company=company, industry=industry, notes=ct.notes,
                        phone=ct.mobile_number or ct.alternate_number, email=ct.email,
                        context="\n".join(filter(None, [
                            f"Person: {name}",
                            f"Role: {ct.designation}" if ct.designation else None,
                            f"Company: {company}" if company else None,
                            f"Industry: {industry}" if industry else None,
                            f"Notes: {(ct.notes or '')[:1500]}" if ct.notes else None,
                        ])))
    return info


def _knowledge_items(session: Session, tenant_id: Optional[int] = None) -> List[dict]:
    """Knowledge for one tenant only — never leak another client's KB into a call."""
    def scoped(stmt):
        return stmt.where(getattr(stmt.column_descriptions[0]["entity"], "tenant_id") == tenant_id) if tenant_id else stmt

    items = [{"id": f"kb{k.id}", "kind": k.kind, "title": k.title, "answer": k.answer, "tags": k.tags or []}
             for k in session.exec(scoped(select(CallKnowledge).where(CallKnowledge.is_active == True))).all()]  # noqa: E712
    for p in session.exec(scoped(select(Product).where(Product.is_active == True)).limit(40)).all():  # noqa: E712
        price = f" Price: {p.unit_price} {p.currency}." if p.unit_price else ""
        items.append({"id": f"product{p.id}", "kind": "product", "title": p.name,
                      "answer": f"{(p.description or '')[:600]}{price}", "tags": [p.category or ""]})
    for s in session.exec(scoped(select(Solution).where(Solution.is_published == True)).limit(40)).all():  # noqa: E712
        items.append({"id": f"solution{s.id}", "kind": "faq", "title": s.title,
                      "answer": (s.content or "")[:600], "tags": s.tags or []})
    return items


def _pitch_dict(p: VoicePitch) -> dict:
    return {
        "id": p.id, "title": p.title, "entity_type": p.entity_type, "entity_id": p.entity_id,
        "entity_name": p.entity_name, "pitch_text": p.pitch_text, "language": p.language, "voice": p.voice, "accent": p.accent,
        "style": p.style, "speed": p.speed, "audio_url": p.audio_url, "version": p.version,
        "created_at": _iso(p.created_at), "updated_at": _iso(p.updated_at),
    }


def _question_dict(q: CallQuestion) -> dict:
    return {
        "id": q.id, "call_id": q.call_id, "entity_type": q.entity_type, "entity_id": q.entity_id,
        "entity_name": q.entity_name, "question": q.question, "category": q.category,
        "ai_answer": q.ai_answer, "status": q.status, "escalation_reason": q.escalation_reason,
        "resolution": q.resolution, "assigned_to": q.assigned_to, "follow_up_date": q.follow_up_date,
        "created_at": _iso(q.created_at), "resolved_at": _iso(q.resolved_at),
    }


def _call_dict(c: AICall, full: bool = False, session: Optional[Session] = None) -> dict:
    ctx = c.context or {}
    is_active = c.status in ACTIVE_STATUSES
    pending = None
    if is_active:
        with _PENDING_LOCK:
            entry = _PENDING_REPLIES.get(c.id)
            if entry and not entry.get("done"):
                pending = {
                    "client_speech": entry.get("client_speech"),
                    "client_ts": entry.get("client_ts"),
                }
    raw_transcript = list(c.transcript or [])
    if pending and pending.get("client_speech"):
        last_saved = next((t for t in reversed(raw_transcript) if t.get("role") != "system"), None)
        if not (last_saved and last_saved.get("role") == "client" and last_saved.get("text") == pending["client_speech"]):
            raw_transcript.append({
                "role": "client",
                "text": pending["client_speech"],
                "ts": pending.get("client_ts") or va.utcnow().isoformat(),
                "pending": True,
            })
    last_non_sys = next((t for t in reversed(raw_transcript) if t.get("role") != "system"), None)
    last_ai_started = float(ctx.get("last_ai_started") or 0)
    last_ai_secs = float(ctx.get("last_ai_secs") or 0)
    ai_speaking_until = (
        last_ai_started + last_ai_secs
        if is_active and last_ai_started > 0 and last_ai_secs > 0
        else None
    )
    if not is_active:
        live_state = "ended"
    elif not c.answered_at:
        live_state = "ringing"
    elif pending or (last_non_sys and last_non_sys.get("role") == "client" and c.mode == "ai"):
        live_state = "thinking"
    elif c.pending_agent_message or (
        last_non_sys
        and last_non_sys.get("role") in ("ai", "agent")
        and ai_speaking_until is not None
        and time.time() < ai_speaking_until
    ):
        live_state = "speaking"
    elif c.mode == "ai":
        live_state = "listening"
    else:
        live_state = "live"

    data = {
        "id": c.id, "pitch_id": c.pitch_id, "entity_type": c.entity_type, "entity_id": c.entity_id,
        "entity_name": c.entity_name, "lead_id": c.lead_id, "to_number": c.to_number, "from_number": c.from_number,
        "status": c.status, "mode": c.mode, "language": c.language, "voice": c.voice, "accent": c.accent, "style": c.style,
        "agent_phone": c.agent_phone, "current_intent": c.current_intent, "sentiment": c.sentiment,
        "interest_score": c.interest_score, "summary": c.summary, "outcome": c.outcome,
        "next_steps": c.next_steps, "recording_url": c.recording_url, "duration_seconds": c.duration_seconds,
        "duration": c.duration_seconds, "call_sid": c.twilio_call_sid, "started_at": _iso(c.created_at),
        "important_notes": c.important_notes,
        "follow_up_needed": bool(c.follow_up_needed or c.followup_needed),
        "follow_up_at": _iso(c.follow_up_at),
        "follow_up_reason": c.follow_up_reason,
        "error": c.error, "turns": len(raw_transcript), "call_log_id": c.call_log_id,
        "answered_at": _iso(c.answered_at), "ended_at": _iso(c.ended_at), "created_at": _iso(c.created_at),
        "is_active": is_active, "live_state": live_state, "ai_speaking_until": ai_speaking_until,
        "stage": ctx.get("stage"), "doubts": ctx.get("doubts", []), "objections": ctx.get("objections", []),
        "adaptation": ctx.get("adaptation"), "pending_agent_message": c.pending_agent_message,
    }
    if full:
        data["transcript"] = raw_transcript
        live_ctx = vcs.store.get(c.id)
        if live_ctx is not None and live_ctx.pitch_text:
            data["pitch_text"] = live_ctx.pitch_text
        elif session is not None and c.pitch_id:
            pitch_obj = session.get(VoicePitch, c.pitch_id)
            data["pitch_text"] = pitch_obj.pitch_text if pitch_obj else None
        else:
            data["pitch_text"] = None
        if session is not None:
            qs = session.exec(select(CallQuestion).where(CallQuestion.call_id == c.id)
                              .order_by(CallQuestion.created_at)).all()
            data["questions"] = [_question_dict(q) for q in qs]
    return vcs.store.overlay_call_dict(c.id, data, full=full)


def _get_call(session: Session, call_id: int) -> AICall:
    call = session.get(AICall, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return call


_TTS_POOL = ThreadPoolExecutor(max_workers=4)
# Live call audio uses a fast TTS model with a hard per-request timeout, so no webhook can be
# dragged past Twilio's drop limit. Both are env-tunable; the defaults are deliberately short.
# The reply TTS budget is now account-aware (3s trial / 6s paid) — see REPLY_TTS_BUDGET* below.
REPLY_TTS_MODEL = os.getenv("VOICE_AGENT_REPLY_TTS_MODEL", CALL_TTS_MODEL)


class SpokenAudio(NamedTuple):
    url: Optional[str]
    tts_ms: int
    filler: bool
    voice: str


def _call_voice(call: AICall) -> dict:
    """The voice settings stored on the call when it was dialed — the single source of truth that
    every webhook turn must read so the voice never changes mid-call."""
    return {"voice": call.voice or "nova", "accent": call.accent, "style": call.style,
            "speed": call.speed or 1.0, "language": call.language or "en"}


def _filler_text(call: AICall) -> str:
    return _phrase(call, "retry")


def _cached_filler_url(call: AICall) -> Optional[str]:
    """Public URL of the pre-generated retry clip in the call's selected voice (or None)."""
    v = _call_voice(call)
    rel = cached_audio(_filler_text(call), voice=v["voice"], accent=v["accent"], style=v["style"],
                       speed=v["speed"], language=v["language"], prefix="filler")
    return _public_audio(rel, call)


def _cached_phrase_url(call: AICall, key: str) -> Optional[str]:
    """Public URL of a pre-generated fixed phrase (PHRASES[key]) in the call's own voice (or None)."""
    v = _call_voice(call)
    rel = cached_audio(_phrase(call, key), voice=v["voice"], accent=v["accent"], style=v["style"],
                       speed=v["speed"], language=v["language"], prefix="filler")
    return _public_audio(rel, call)


def _filler_pool(call: AICall) -> List[str]:
    """The varied hold phrases for this call (translated into the call language). Each one is used
    at most once per call (see ``_pick_filler``)."""
    return [_phrase(call, k) for k in FILLER_KEYS]


def _silence_pool(call: AICall) -> List[str]:
    """The gentle 1st-silence prompt pool (4+ varied phrases for the call's language)."""
    return [_phrase(call, k) for k in SILENCE_KEYS]


def _next_silence_prompt(call: AICall, ctx: dict) -> str:
    """Pick the 1st-silence prompt, never repeating the one used earlier in the call."""
    pool = [p for p in _silence_pool(call) if p]
    last = ctx.get("last_silence_prompt")
    line = next((p for p in pool if p != last), pool[0] if pool else _phrase(call, "still_there"))
    _update_context(call, last_silence_prompt=line)
    return line


# Per-call record of the hold phrases already spoken, so no line is ever repeated within a call.
# When the pool runs out the agent takes its own time (a short silent beat) and lets the real reply
# come through instead of saying the same thing again.
_USED_FILLERS_BY_CALL: dict = {}
_FILLER_LOCK = threading.Lock()


def _pick_filler(call_id: int, pool: List[str]) -> Optional[str]:
    """Pick a hold phrase this call has NOT used yet, or ``None`` once they are all spent.

    ``pool`` is the per-turn pool stored in the pending-reply entry. Every phrase is spoken at most
    ONCE per call; callers play a short silent pause when nothing is left rather than repeating a
    line the prospect has already heard."""
    pool = [p for p in pool if p]
    if not pool:
        return None
    with _FILLER_LOCK:
        used = _USED_FILLERS_BY_CALL.setdefault(call_id, set())
        picked = next((p for p in pool if p not in used), None)
        if picked is not None:
            used.add(picked)
        return picked


def _forget_filler_state(call_id: int) -> None:
    """Drop the per-call hold-phrase bookkeeping once the call is over."""
    with _FILLER_LOCK:
        _USED_FILLERS_BY_CALL.pop(call_id, None)


def _tts_budget() -> float:
    """Hard per-request TTS timeout: 3s on trial (webhook budget), 6s on paid accounts."""
    return REPLY_TTS_BUDGET_PAID if va.is_paid_account() else REPLY_TTS_BUDGET


def _set_call_demo_context_flag(tenant_id: Optional[int], demo_restricted: bool) -> bool:
    """Apply an already-known demo restriction flag without touching the database."""
    from modules import demo_usage
    demo_usage.demo_context.set(tenant_id if demo_restricted else demo_usage.UNRESTRICTED)
    return bool(demo_restricted)


def _set_call_demo_context(call: AICall) -> bool:
    # Fast path: reuse the preloaded in-memory flag (0 DB queries).
    live_ctx = vcs.store.get(call.id) if getattr(call, "id", None) else None
    if live_ctx is not None:
        return _set_call_demo_context_flag(live_ctx.tenant_id, live_ctx.demo_restricted)
    from modules import demo_usage
    restricted = False
    if call.tenant_id:
        with Session(engine) as session:
            restricted = demo_usage.background_restricted(session, call.tenant_id, call.started_by)
    return _set_call_demo_context_flag(call.tenant_id, restricted)


def _cached_filler_url_ctx(ctx: vcs.LiveCallContext) -> Optional[str]:
    v = ctx.voice_settings()
    rel = cached_audio(ctx.phrase("retry", PHRASES), voice=v["voice"], accent=v["accent"], style=v["style"],
                       speed=v["speed"], language=v["language"], prefix="filler")
    return f"{ctx.public_base}{rel}" if (rel and ctx.public_base) else None


def _cached_phrase_url_ctx(ctx: vcs.LiveCallContext, key: str) -> Optional[str]:
    v = ctx.voice_settings()
    rel = cached_audio(ctx.phrase(key, PHRASES), voice=v["voice"], accent=v["accent"], style=v["style"],
                       speed=v["speed"], language=v["language"], prefix="filler")
    return f"{ctx.public_base}{rel}" if (rel and ctx.public_base) else None


def _call_audio_ctx(ctx: vcs.LiveCallContext, text: str, prefix: str = "reply", *, stream: bool = True) -> SpokenAudio:
    """In-memory live call audio helper — 0 DB queries, with streaming TTS TTFB for low latency."""
    _set_call_demo_context_flag(ctx.tenant_id, ctx.demo_restricted)
    v = ctx.voice_settings()
    base = ctx.public_base or va.public_base()
    t0 = time.monotonic()
    budget = _tts_budget()
    url = None
    streamed = False
    try:
        if stream and base:
            static_rel, clip_id, _ = start_streaming_tts(
                text, voice=v["voice"], accent=v["accent"], style=v["style"],
                speed=v["speed"], language=v["language"], prefix=prefix, timeout=budget,
            )
            if static_rel:
                url = f"{base}{static_rel}"
            elif clip_id:
                url = f"{base}/voice-agent/twilio/audio/{clip_id}.mp3"
                streamed = True
        else:
            future = _TTS_POOL.submit(
                copy_context().run, synthesize_cached, text, voice=v["voice"], accent=v["accent"], style=v["style"],
                speed=v["speed"], language=v["language"], prefix=prefix, timeout=budget,
            )
            rel = future.result(timeout=budget + 0.5)[0]
            url = f"{base}{rel}" if (rel and base) else None
    except Exception as e:
        print(f"[voice-agent] TTS failed for call {ctx.call_id} voice={v['voice']}: {e}")
    tts_ms = int((time.monotonic() - t0) * 1000)

    filler = False
    if not url:
        filler = True
        url = _cached_filler_url_ctx(ctx)
        if not url:
            try:
                rel = _TTS_POOL.submit(
                    copy_context().run, synthesize_cached, ctx.phrase("retry", PHRASES),
                    voice=v["voice"], accent=v["accent"], style=v["style"], speed=v["speed"],
                    language=v["language"], prefix="filler", timeout=budget,
                ).result(timeout=budget + 0.5)[0]
                url = f"{base}{rel}" if (rel and base) else None
            except Exception as e:
                print(f"[voice-agent] filler TTS failed for call {ctx.call_id}: {e}")
    print(f"[voice-agent] audio call={ctx.call_id} voice={v['voice']} tts_ms={tts_ms} "
          f"streamed={streamed} filler={filler} line={(text or '')[:48]!r}", flush=True)
    return SpokenAudio(url=url, tts_ms=tts_ms, filler=filler, voice=v["voice"])


def _call_audio(call: AICall, text: str, prefix: str = "reply") -> SpokenAudio:
    """The one shared helper for all call audio (opening pitch, replies and fillers).

    It reads the voice saved on the call record, synthesizes in that voice with a hard timeout
    (no synchronous retry and no gTTS voice switch) and, when TTS times out or fails, returns the
    pre-generated filler clip in the SAME voice. It never returns a Twilio ``<Say>`` fallback."""
    live_ctx = vcs.store.get(call.id) if getattr(call, "id", None) else None
    if live_ctx is not None:
        return _call_audio_ctx(live_ctx, text, prefix, stream=True)
    _set_call_demo_context(call)
    v = _call_voice(call)
    t0 = time.monotonic()
    budget = _tts_budget()
    url = None
    try:
        future = _TTS_POOL.submit(
            copy_context().run, synthesize_cached, text, voice=v["voice"], accent=v["accent"], style=v["style"],
            speed=v["speed"], language=v["language"], prefix=prefix, timeout=budget,
        )
        rel = future.result(timeout=budget + 0.5)[0]
        url = _public_audio(rel, call)
    except Exception as e:
        print(f"[voice-agent] TTS failed for call {call.id} voice={v['voice']}: {e}")
    tts_ms = int((time.monotonic() - t0) * 1000)

    filler = False
    if not url:
        filler = True
        url = _cached_filler_url(call)
        if not url:
            # Rare: the filler clip has not been pre-warmed yet. Render it once, bounded, in the
            # same voice — still no <Say> and still inside the webhook budget.
            try:
                rel = _TTS_POOL.submit(
                    copy_context().run, synthesize_cached, _filler_text(call), voice=v["voice"], accent=v["accent"],
                    style=v["style"], speed=v["speed"], language=v["language"], prefix="filler",
                    timeout=budget,
                ).result(timeout=budget + 0.5)[0]
                url = _public_audio(rel, call)
            except Exception as e:
                print(f"[voice-agent] filler TTS failed for call {call.id}: {e}")
    print(f"[voice-agent] audio call={call.id} voice={v['voice']} tts_ms={tts_ms} filler={filler} "
          f"line={(text or '')[:48]!r}", flush=True)
    return SpokenAudio(url=url, tts_ms=tts_ms, filler=filler, voice=v["voice"])


def _speak_audio(call: AICall, text: str, prefix: str = "reply") -> Optional[str]:
    """Backward-compatible wrapper around :func:`_call_audio` that returns just the audio URL."""
    return _call_audio(call, text, prefix).url


def _prewarm_call_clips_ctx(ctx: vcs.LiveCallContext) -> None:
    """Pre-generate fixed lines in the background using the preloaded demo flag (0 DB queries)."""
    if ctx.demo_restricted:
        return  # avoid a fan-out of automatic paid speech requests in a demo
    def _run() -> None:
        try:
            _set_call_demo_context_flag(ctx.tenant_id, ctx.demo_restricted)
            v = ctx.voice_settings()
            texts = []
            for key in FIXED_KEYS + FILLER_KEYS + SILENCE_KEYS:
                text = ctx.phrase(key, PHRASES)
                if text:
                    texts.append(text)
            seen, unique = set(), []
            for text in texts:
                if text not in seen:
                    seen.add(text)
                    unique.append(text)
            prewarm_cached(unique, voice=v["voice"], accent=v["accent"], style=v["style"],
                           speed=v["speed"], language=v["language"], prefix="filler",
                           timeout=CALL_TTS_TIMEOUT)
        except Exception as e:
            print(f"[voice-agent] filler prewarm failed for call {ctx.call_id}: {e}")
    threading.Thread(target=_run, daemon=True).start()


def _prewarm_call_clips(call: AICall) -> None:
    """Pre-generate this call's fixed lines (wait fillers, silence prompts, apology and goodbyes)
    in the call's own voice in the background, so no turn or error path ever waits on live TTS."""
    live_ctx = vcs.store.get(call.id) if getattr(call, "id", None) else None
    if live_ctx is not None:
        _prewarm_call_clips_ctx(live_ctx)
        return
    if _set_call_demo_context(call):
        return  # avoid a fan-out of automatic paid speech requests in a demo
    def _run() -> None:
        try:
            _set_call_demo_context_flag(call.tenant_id, False)
            v = _call_voice(call)
            texts = []
            for key in FIXED_KEYS + FILLER_KEYS + SILENCE_KEYS:
                text = _phrase(call, key)
                if text:
                    texts.append(text)
            # Dedupe while keeping order, so translated collisions render once.
            seen, unique = set(), []
            for text in texts:
                if text not in seen:
                    seen.add(text)
                    unique.append(text)
            prewarm_cached(unique, voice=v["voice"], accent=v["accent"], style=v["style"],
                           speed=v["speed"], language=v["language"], prefix="filler",
                           timeout=CALL_TTS_TIMEOUT)
        except Exception as e:
            print(f"[voice-agent] filler prewarm failed for call {call.id}: {e}")
    threading.Thread(target=_run, daemon=True).start()


def _phrase(call: AICall, key: str) -> str:
    return ((call.context or {}).get("phrases") or {}).get(key) or PHRASES[key]


def _call_profile(call: AICall) -> tenant_voice.TenantVoiceProfile:
    """The tenant persona captured when the call was dialed (never re-resolved mid-call)."""
    return tenant_voice.TenantVoiceProfile.from_dict((call.context or {}).get("voice_profile"))


def _pitch_audio(pitch: VoicePitch, session: Optional[Session] = None) -> str:
    # Reuse an already-generated file for the exact same text+voice+accent+style+speed+language
    # instead of running TTS again (same voice/model/speed settings as live replies).
    if session is not None:
        stmt = select(VoicePitch).where(
            VoicePitch.pitch_text == pitch.pitch_text,
            VoicePitch.voice == pitch.voice,
            VoicePitch.accent == pitch.accent,
            VoicePitch.style == pitch.style,
            VoicePitch.speed == pitch.speed,
            VoicePitch.language == pitch.language,
            VoicePitch.audio_url.is_not(None),
        )
        if getattr(pitch, "id", None):
            stmt = stmt.where(VoicePitch.id != pitch.id)
        for existing in session.exec(stmt).all():
            if _audio_file_exists(existing.audio_url):
                print(f"[voice_agent] reusing pitch audio {existing.audio_url} (pitch {existing.id})")
                return existing.audio_url
    return synthesize_cached(pitch.pitch_text, voice=pitch.voice, accent=pitch.accent,
                             style=pitch.style, speed=pitch.speed or 1.0, language=pitch.language,
                             prefix="pitch", timeout=CALL_TTS_TIMEOUT)[0]


def _cleanup_previews(max_age_seconds: int = 3600) -> None:
    try:
        now = time.time()
        for name in os.listdir(AUDIO_DIR):
            if name.startswith(("preview_", "reply_", "agent_")):
                path = os.path.join(AUDIO_DIR, name)
                if now - os.path.getmtime(path) > max_age_seconds:
                    os.remove(path)
    except OSError:
        pass


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Options, entities, stats
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/options")
def get_options(recheck: bool = False, session: Session = Depends(get_session)):
    user = _current_user(session)
    # ?recheck=1 forces a fresh probe of the webhook base so the UI's "Re-check now" / auto-retry
    # loop can clear a cached failure without waiting for the cache to expire.
    return {**tts_options(), "twilio": {**va.twilio_ready(), "webhook_problem": va.voice_base_problem(force=recheck)},
            "default_agent_phone": user.phone,
            "tenant_voice_profile": tenant_voice.profile_for_call(user.tenant_id).to_dict()}


@router.get("/entities")
def list_entities(type: str = "client", q: Optional[str] = None, session: Session = Depends(get_session)):
    _current_user(session)
    out = []
    if type == "client":
        for c in session.exec(select(ClientProfile).order_by(ClientProfile.id.desc()).limit(300)).all():
            out.append({"id": c.id, "name": c.companyName or c.projectName or f"Client #{c.id}", "phone": c.phone})
    elif type == "lead":
        for ld in session.exec(select(Lead).order_by(Lead.id.desc()).limit(300)).all():
            out.append({"id": ld.id, "name": ld.company_name, "phone": ld.phone})
    elif type == "contact":
        for ct in session.exec(select(Contact).order_by(Contact.id.desc()).limit(300)).all():
            name = ct.full_name or " ".join(filter(None, [ct.first_name, ct.last_name]))
            out.append({"id": ct.id, "name": name, "phone": ct.mobile_number or ct.alternate_number})
    else:
        raise HTTPException(status_code=400, detail="type must be client, lead or contact")
    if q:
        ql = q.lower()
        out = [e for e in out if ql in (e["name"] or "").lower() or ql in (e["phone"] or "")]
    return {"entities": out}


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)):
    _current_user(session)
    calls = session.exec(select(AICall)).all()
    questions = session.exec(select(CallQuestion)).all()
    scores = [c.interest_score for c in calls if c.interest_score is not None]
    return {
        "total_calls": len(calls),
        "active_calls": sum(1 for c in calls if c.status in ACTIVE_STATUSES),
        "completed_calls": sum(1 for c in calls if c.status == "completed"),
        "avg_interest": round(sum(scores) / len(scores)) if scores else None,
        "open_follow_ups": sum(1 for q in questions if q.status == "open"),
        "escalated": sum(1 for q in questions if q.status == "escalated"),
        "pitches": len(session.exec(select(VoicePitch.id)).all()),
    }


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Pitch studio
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PreviewRequest(BaseModel):
    text: Optional[str] = None
    voice: str = "nova"
    language: str = "en"
    accent: Optional[str] = None
    style: str = "friendly"
    speed: float = 1.0


class GeneratePitchTextRequest(BaseModel):
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    context: Optional[str] = None
    language: str = "en"


class PitchRequest(BaseModel):
    title: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    pitch_text: Optional[str] = None
    language: Optional[str] = None
    voice: Optional[str] = None
    accent: Optional[str] = None
    style: Optional[str] = None
    speed: Optional[float] = None


@router.post("/tts/preview")
def preview_speech(body: PreviewRequest, session: Session = Depends(get_session)):
    """Unsaved preview (also used for short voice samples)."""
    _current_user(session)
    text = (body.text or "").strip()
    if not text:
        profile = tenant_voice.profile_for_call(_current_user(session).tenant_id,
                                                language=body.language, voice=body.voice, accent=body.accent)
        text = (f"Hi there! This is how I'll sound on your calls, calling from {profile.company_name}. "
                "Do you have a quick minute to chat about growing your business online?")
        if body.language and body.language != "en":
            text = va.translate_phrases({"sample": text}, language_label(body.language))["sample"]
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Text is too long (max 4000 characters)")
    _cleanup_previews()
    try:
        url = synthesize(text, body.voice, body.accent, body.style, body.speed, prefix="preview", language=body.language, model=REPLY_TTS_MODEL)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
    return {"ok": True, "audio_url": url}


@router.post("/pitches/generate-text")
def generate_pitch_text(body: GeneratePitchTextRequest, session: Session = Depends(get_session)):
    user = _current_user(session)
    info = _entity_info(session, body.entity_type, body.entity_id, user.tenant_id)
    profile = tenant_voice.profile_for_call(user.tenant_id)
    # Release DB transaction before calling OpenAI so no connection is held idle.
    session.commit()
    try:
        text = va.generate_pitch_text(info["context"], body.context, language_label(body.language),
                                      profile, prospect=info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pitch generation failed: {e}")
    return {"ok": True, "pitch_text": text, "entity_name": info["name"], "phone": info["phone"]}


@router.get("/pitches")
def list_pitches(session: Session = Depends(get_session)):
    _current_user(session)
    items = session.exec(select(VoicePitch).order_by(VoicePitch.updated_at.desc())).all()
    return {"pitches": [_pitch_dict(p) for p in items]}


@router.post("/pitches")
def create_pitch(body: PitchRequest, session: Session = Depends(get_session)):
    user = _current_user(session)
    text = (body.pitch_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Pitch text is required")
    info = _entity_info(session, body.entity_type, body.entity_id, user.tenant_id)
    lang, acc, _ = resolve_voice_locale(body.language, body.accent)
    pitch = VoicePitch(
        title=(body.title or "").strip() or f"Pitch for {info['name'] or 'prospect'}",
        entity_type=body.entity_type, entity_id=body.entity_id, entity_name=info["name"],
        pitch_text=text, voice=body.voice or "nova", language=lang, accent=acc,
        style=body.style or "friendly", speed=body.speed or 1.0, created_by=user.id,
    )
    try:
        pitch.audio_url = _pitch_audio(pitch, session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
    session.add(pitch)
    session.commit()
    session.refresh(pitch)
    return {"ok": True, "pitch": _pitch_dict(pitch)}


@router.put("/pitches/{pitch_id}")
def update_pitch(pitch_id: int, body: PitchRequest, session: Session = Depends(get_session)):
    user = _current_user(session)
    pitch = session.get(VoicePitch, pitch_id)
    if not pitch:
        raise HTTPException(status_code=404, detail="Pitch not found")
    changed_audio = False
    if body.language is not None or body.accent is not None:
        body.language, body.accent, _ = resolve_voice_locale(body.language or pitch.language, body.accent or pitch.accent)
    for field in ("pitch_text", "language", "voice", "accent", "style", "speed"):
        val = getattr(body, field)
        if val is not None and val != getattr(pitch, field):
            if field == "pitch_text" and not val.strip():
                raise HTTPException(status_code=400, detail="Pitch text cannot be empty")
            setattr(pitch, field, val.strip() if isinstance(val, str) and field == "pitch_text" else val)
            changed_audio = True
    if body.title is not None and body.title.strip():
        pitch.title = body.title.strip()
    if body.entity_type is not None:
        pitch.entity_type, pitch.entity_id = body.entity_type or None, body.entity_id
        pitch.entity_name = _entity_info(session, pitch.entity_type, pitch.entity_id, user.tenant_id)["name"]
    if changed_audio or not pitch.audio_url:
        old = pitch.audio_url
        try:
            pitch.audio_url = _pitch_audio(pitch, session)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
        pitch.version += 1
        if old != pitch.audio_url and not _audio_in_use(session, old, exclude_id=pitch.id):
            delete_audio(old)
    pitch.updated_at = va.utcnow()
    session.add(pitch)
    session.commit()
    session.refresh(pitch)
    return {"ok": True, "pitch": _pitch_dict(pitch)}


@router.post("/pitches/{pitch_id}/regenerate")
def regenerate_pitch_audio(pitch_id: int, session: Session = Depends(get_session)):
    """Produce a fresh take of the same text/settings."""
    _current_user(session)
    pitch = session.get(VoicePitch, pitch_id)
    if not pitch:
        raise HTTPException(status_code=404, detail="Pitch not found")
    old = pitch.audio_url
    try:
        pitch.audio_url = _pitch_audio(pitch, session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
    if old != pitch.audio_url and not _audio_in_use(session, old, exclude_id=pitch.id):
        delete_audio(old)
    pitch.version += 1
    pitch.updated_at = va.utcnow()
    session.add(pitch)
    session.commit()
    session.refresh(pitch)
    return {"ok": True, "pitch": _pitch_dict(pitch)}


@router.delete("/pitches/{pitch_id}")
def delete_pitch(pitch_id: int, session: Session = Depends(get_session)):
    _current_user(session)
    pitch = session.get(VoicePitch, pitch_id)
    if not pitch:
        raise HTTPException(status_code=404, detail="Pitch not found")
    for call in session.exec(select(AICall).where(AICall.pitch_id == pitch_id)).all():
        call.pitch_id = None
        session.add(call)
    if not _audio_in_use(session, pitch.audio_url, exclude_id=pitch.id):
        delete_audio(pitch.audio_url)
    session.delete(pitch)
    session.commit()
    return {"ok": True}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Calls (agent-facing)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class StartCallRequest(BaseModel):
    pitch_id: int
    to_number: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    agent_phone: Optional[str] = None


class TakeoverRequest(BaseModel):
    mode: str = "typed"  # typed | phone
    agent_phone: Optional[str] = None


class SayRequest(BaseModel):
    text: str


class QuickCallRequest(BaseModel):
    """Generate a pitch for the prospect, voice it, and dial immediately."""
    entity_type: str
    entity_id: int
    to_number: Optional[str] = None
    voice: str = "nova"
    language: str = "en"
    accent: Optional[str] = None
    style: str = "friendly"
    context: Optional[str] = None
    pitch_text: Optional[str] = None  # use this text instead of generating one
    agent_phone: Optional[str] = None


def _require_twilio() -> dict:
    ready = va.twilio_ready()
    if not ready["ready"]:
        raise HTTPException(status_code=400, detail=f"Twilio voice is not configured. Missing: {', '.join(ready['missing'])}")
    # Fail fast with a clear message instead of dialing a call that Twilio will drop
    # because it cannot fetch TwiML from the configured public base URL — and never block
    # on a stale failure: only force a live re-probe when the cached check reported a problem.
    problem = va.voice_base_problem() and va.voice_base_problem(force=True)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    return ready


def _resolve_number(session: Session, etype: Optional[str], eid: Optional[int], to_number: Optional[str],
                    tenant_id: Optional[int] = None):
    info = _entity_info(session, etype, eid, tenant_id)
    raw = (to_number or info["phone"] or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="No phone number for this prospect. Enter one with the country code, e.g. +919876543210")
    number = va.normalize_phone(raw)
    if not va.is_e164(number):
        raise HTTPException(status_code=400, detail=(
            f"'{raw}' is missing the country code. Enter it like +91{re.sub(r'[^0-9]', '', raw).lstrip('0')} "
            "(+91 India, +1 US/Canada, +44 UK)."))
    return info, number


def _dial(session: Session, user: User, pitch: VoicePitch, etype: Optional[str], eid: Optional[int],
          info: dict, to_number: str, agent_phone: Optional[str],
          profile: Optional[dict] = None, *, ready: Optional[dict] = None) -> AICall:
    ready = ready or _require_twilio()
    demo_restricted = _check_call_limit(session, user)
    context = {"stage": "pitch", "doubts": [], "objections": [], "silence_count": 0}
    # Every live webhook reuses this exact tenant identity for the rest of the call.
    context["voice_profile"] = profile or tenant_voice.profile_for_call(
        getattr(user, "tenant_id", None), language=pitch.language, voice=pitch.voice, accent=pitch.accent
    ).to_dict()
    # The pre-flight check (_require_twilio) just verified that this base really serves the
    # app's voice-agent routes. Store it on the call so every webhook and audio URL of THIS
    # call keeps pointing at that same working server.
    context["public_base"] = va.public_base()
    if pitch.language and pitch.language != "en":
        context["phrases"] = va.translate_phrases(PHRASES, language_label(pitch.language))
    # Attach the call to its lead now (explicit id, contact/client link or dialed number)
    # so the transcript can never end up as an orphan call.
    tenant_id = getattr(user, "tenant_id", None)
    lead = lead_calls.resolve_lead(
        session, entity_type=etype, entity_id=eid, to_number=to_number,
        tenant_id=tenant_id,
    )
    # Preload tenant knowledge base, products, and solutions ONCE before dialing so live turns
    # run purely from in-memory context with zero repeated DB reads.
    knowledge_items = _knowledge_items(session, tenant_id)
    call = AICall(
        pitch_id=pitch.id, entity_type=etype, entity_id=eid, entity_name=info["name"] or pitch.entity_name,
        lead_id=lead.id if lead else None,
        to_number=to_number, from_number=ready["from_number"], voice=pitch.voice, accent=pitch.accent, language=pitch.language,
        style=pitch.style, speed=pitch.speed,
        agent_phone=(lambda n: n if va.is_e164(n) else None)(va.normalize_phone(agent_phone or user.phone or "")),
        started_by=user.id, context=context, transcript=[],
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    # Register the preloaded in-memory session BEFORE dialing Twilio so /answer and /gather hit
    # warm memory immediately with zero DB reads.
    live_ctx = vcs.build_context_from_call(
        call,
        pitch_text=pitch.pitch_text or "",
        pitch_audio_url=pitch.audio_url,
        entity_context=info.get("context") or "No CRM record linked.",
        knowledge_items=knowledge_items,
        voice_profile=context["voice_profile"],
        public_base=context["public_base"],
        demo_restricted=demo_restricted,
    )
    vcs.store.register(live_ctx)

    # Pre-generate this call's fixed filler lines in the background now, so if a live reply ever
    # times out we can play an apology in the SAME voice without a live TTS call.
    _prewarm_call_clips_ctx(live_ctx)

    try:
        resp = va.twilio_create_call(to_number, _hook_url(call, "answer"), _hook_url(call, "status"),
                                     _hook_url(call, "recording"))
        call.twilio_call_sid = resp.get("sid")
        call.status = resp.get("status") or "queued"
        _append_turn(call, "system", f"Dialing {to_number}...")
        with live_ctx.lock:
            live_ctx.twilio_call_sid = call.twilio_call_sid
            live_ctx.status = call.status
            live_ctx.transcript = list(call.transcript or [])
            live_ctx.touch(dirty=False)
    except Exception as e:
        print(f"[voice-agent] Twilio call to {to_number} failed: {e}")
        call.status, call.error = "failed", str(e)
        vcs.store.remove(call.id)
        session.add(call)
        session.commit()
        raise HTTPException(status_code=502, detail=f"Twilio could not start the call: {e}")
    session.add(call)
    session.commit()
    session.refresh(call)
    return call


@router.post("/calls")
def start_call(body: StartCallRequest, session: Session = Depends(get_session)):
    user = _current_user(session)
    ready = _require_twilio()
    pitch = session.get(VoicePitch, body.pitch_id)
    if not pitch or not pitch.audio_url:
        raise HTTPException(status_code=404, detail="Pitch not found or has no generated speech")
    etype = body.entity_type or pitch.entity_type
    eid = body.entity_id if body.entity_type else pitch.entity_id
    info, number = _resolve_number(session, etype, eid, body.to_number, user.tenant_id)
    profile = tenant_voice.profile_for_call(user.tenant_id, language=pitch.language,
                                            voice=pitch.voice, accent=pitch.accent).to_dict()
    call = _dial(session, user, pitch, etype, eid, info, number, body.agent_phone, profile, ready=ready)
    return {"ok": True, "call": _call_dict(call, full=True, session=session)}


def start_quick_call(
    session: Session,
    user: User,
    *,
    entity_type: str,
    entity_id: int,
    to_number: Optional[str] = None,
    voice: Optional[str] = None,
    language: Optional[str] = None,
    accent: Optional[str] = None,
    style: str = "friendly",
    context: Optional[str] = None,
    pitch_text: Optional[str] = None,
    agent_phone: Optional[str] = None,
    pitch_title: Optional[str] = None,
    allow_pitch_fallback: bool = False,
    prepared_pitch: Optional[VoicePitch] = None,
) -> tuple[VoicePitch, AICall]:
    """Shared calling flow used by both manual phone-icon calls and automatic new-lead calls."""
    ready = _require_twilio()
    if entity_type not in ("client", "lead", "contact"):
        raise HTTPException(status_code=400, detail="entity_type must be client, lead or contact")
    info, number = _resolve_number(session, entity_type, entity_id, to_number, user.tenant_id)
    profile = tenant_voice.profile_for_call(user.tenant_id, language=language,
                                            voice=voice, accent=accent)
    lang, acc, _ = resolve_voice_locale(profile.language, profile.accent)

    if prepared_pitch is not None:
        pitch = prepared_pitch
    else:
        user_id = user.id
        user_tenant_id = user.tenant_id
        text = (pitch_text or "").strip()
        if not text:
            # Release DB read transaction before calling OpenAI pitch generation.
            session.commit()
            try:
                text = (va.generate_pitch_text(info["context"], context, language_label(lang), profile,
                                               prospect=info) or "").strip()
            except Exception as e:
                if not allow_pitch_fallback:
                    raise HTTPException(status_code=500, detail=f"Pitch generation failed: {e}")
                text = ""
            if not text and allow_pitch_fallback:
                text = tenant_voice.fallback_pitch(info, profile, language_label(lang))
        pitch = VoicePitch(
            title=pitch_title or f"Pitch for {info['name'] or 'prospect'}",
            entity_type=entity_type, entity_id=entity_id,
            entity_name=info["name"], pitch_text=text, language=lang, voice=profile.voice, accent=acc,
            style=style or "friendly", speed=1.0, created_by=user_id, tenant_id=user_tenant_id,
        )
        # Release DB read transaction before OpenAI TTS synthesis.
        session.commit()
        try:
            pitch.audio_url = _pitch_audio(pitch, session)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
        session.add(pitch)
        session.commit()
        session.refresh(pitch)

    call = _dial(session, user, pitch, entity_type, entity_id, info, number, agent_phone,
                 profile.to_dict(), ready=ready)
    return pitch, call


@router.post("/quick-call")
def quick_call(body: QuickCallRequest, session: Session = Depends(get_session)):
    """One step: write the pitch in the chosen language, voice it with the chosen voice/accent, and call the prospect."""
    user = _current_user(session)
    pitch, call = start_quick_call(
        session, user,
        entity_type=body.entity_type, entity_id=body.entity_id, to_number=body.to_number,
        voice=body.voice, language=body.language, accent=body.accent,
        style=body.style, context=body.context, pitch_text=body.pitch_text,
        agent_phone=body.agent_phone,
    )
    return {"ok": True, "pitch": _pitch_dict(pitch), "call": _call_dict(call, full=True, session=session)}


def _mark_ended(call: AICall, status: str, duration: Optional[str], background: BackgroundTasks) -> None:
    call.status = status
    call.updated_at = va.utcnow()
    call.ended_at = call.ended_at or va.utcnow()
    if duration and str(duration).isdigit():
        call.duration_seconds = int(duration)
    call.pending_agent_message = None
    _forget_filler_state(call.id)
    _append_turn(call, "system", f"Call ended ({status}).")
    background.add_task(_finalize_call, call.id, call.tenant_id)


_STATUS_SYNC_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="twilio-sync")
_STATUS_SYNC_LOCK = threading.Lock()
_STATUS_SYNC_IN_FLIGHT: set[int] = set()
_STATUS_SYNC_LAST: dict = {}


def _sync_status_worker(call_id: int, call_sid: str, tenant_id: Optional[int]) -> None:
    """Background Twilio status reconciliation — never blocks GET /calls/{id} or holds DB locks during HTTP."""
    try:
        data = va.twilio_fetch_call(call_sid)
    except Exception as e:
        print(f"[voice-agent] background status sync failed for call {call_id}: {e}")
        return
    finally:
        with _STATUS_SYNC_LOCK:
            _STATUS_SYNC_IN_FLIGHT.discard(call_id)

    status = data.get("status")
    if not status:
        return
    duration = data.get("duration")

    # Update in-memory live session immediately so UI polls see it without waiting on DB.
    live_ctx = vcs.store.get(call_id)
    if live_ctx is not None:
        with live_ctx.lock:
            if status in TERMINAL_STATUSES:
                was_terminal = live_ctx.status in TERMINAL_STATUSES
                live_ctx.status = status
                live_ctx.ended_at = live_ctx.ended_at or va.utcnow()
                if duration and str(duration).isdigit():
                    live_ctx.duration_seconds = int(duration)
                live_ctx.pending_agent_message = None
                if not was_terminal:
                    live_ctx.append_turn("system", f"Call ended ({status}).")
                else:
                    live_ctx.touch(dirty=True)
            elif status != live_ctx.status and not (live_ctx.status == "in-progress" and status in ("queued", "ringing")):
                live_ctx.status = status
                live_ctx.touch(dirty=True)

    # Only open a short-lived DB session if status actually transitioned (or terminated).
    _set_tenant(tenant_id)
    should_finalize = False
    try:
        with Session(engine) as session:
            call = session.exec(select(AICall).where(AICall.id == call_id)
                                .execution_options(skip_tenant=True)).first()
            if not call or call.status in TERMINAL_STATUSES:
                return
            if status in TERMINAL_STATUSES:
                call.status = status
                call.updated_at = va.utcnow()
                call.ended_at = call.ended_at or va.utcnow()
                if duration and str(duration).isdigit():
                    call.duration_seconds = int(duration)
                call.pending_agent_message = None
                _forget_filler_state(call.id)
                _append_turn(call, "system", f"Call ended ({status}).")
                session.add(call)
                session.commit()
                should_finalize = True
            elif status != call.status and not (call.status == "in-progress" and status in ("queued", "ringing")):
                call.status = status
                call.updated_at = va.utcnow()
                session.add(call)
                session.commit()
    except Exception as e:
        print(f"[voice-agent] background status DB update failed for call {call_id}: {e}")
        return
    if should_finalize:
        _finalize_call(call_id, tenant_id)


def _schedule_status_sync(call: AICall) -> None:
    """Non-blocking safety-net Twilio status sync triggered off-request by GET /calls endpoints."""
    live_ctx = vcs.store.get(call.id)
    effective_status = live_ctx.status if live_ctx is not None else call.status
    if effective_status not in ACTIVE_STATUSES or not call.twilio_call_sid:
        return
    throttle = 5 if va.is_paid_account() else 3
    now = time.monotonic()
    with _STATUS_SYNC_LOCK:
        last = _STATUS_SYNC_LAST.get(call.id, 0.0)
        if call.id in _STATUS_SYNC_IN_FLIGHT or (now - last) < throttle:
            return
        _STATUS_SYNC_LAST[call.id] = now
        _STATUS_SYNC_IN_FLIGHT.add(call.id)
    try:
        _STATUS_SYNC_POOL.submit(_sync_status_worker, call.id, call.twilio_call_sid, call.tenant_id)
    except RuntimeError:
        with _STATUS_SYNC_LOCK:
            _STATUS_SYNC_IN_FLIGHT.discard(call.id)


@router.get("/calls")
def list_calls(background: BackgroundTasks, status: Optional[str] = None,
               lead_id: Optional[int] = None, limit: int = 100,
               session: Session = Depends(get_session)):
    _current_user(session)
    stmt = select(AICall).order_by(AICall.created_at.desc()).limit(min(limit, 500))
    if status == "active":
        stmt = stmt.where(AICall.status.in_(list(ACTIVE_STATUSES)))
    elif status:
        stmt = stmt.where(AICall.status == status)
    if lead_id is not None:
        stmt = stmt.where(AICall.lead_id == lead_id)
    calls = session.exec(stmt).all()
    for c in calls:
        _schedule_status_sync(c)
    return {"calls": [_call_dict(c) for c in calls]}


@router.get("/calls/{call_id}")
def get_call(call_id: int, background: BackgroundTasks, session: Session = Depends(get_session)):
    _current_user(session)
    call = _get_call(session, call_id)
    _schedule_status_sync(call)
    return {"call": _call_dict(call, full=True, session=session)}


def _require_live(call: AICall) -> None:
    if call.status not in ACTIVE_STATUSES or not call.twilio_call_sid:
        raise HTTPException(status_code=400, detail="This call is not live")


@router.post("/calls/{call_id}/takeover")
def takeover_call(call_id: int, body: TakeoverRequest, session: Session = Depends(get_session)):
    user = _current_user(session)
    call = _get_call(session, call_id)
    _require_live(call)
    try:
        if body.mode == "phone":
            number = va.normalize_phone(body.agent_phone or call.agent_phone or user.phone or "")
            if not va.is_e164(number):
                raise HTTPException(status_code=400, detail="A valid agent phone number with country code (e.g. +919876543210) is required for a phone takeover")
            call.mode, call.agent_phone = "agent_phone", number
            session.add(call)
            session.commit()
            va.twilio_update_call(call.twilio_call_sid, url=_hook_url(call, "dial"))
            _append_turn(call, "system", f"{user.name or 'Agent'} took over by phone ({number}).")
        else:
            call.mode = "agent_typed"
            va.twilio_update_call(call.twilio_call_sid, url=_hook_url(call, "wait"))
            _append_turn(call, "system", f"{user.name or 'Agent'} took over the conversation (typed mode).")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Takeover failed: {e}")
    call.updated_at = va.utcnow()
    session.add(call)
    session.commit()
    live_ctx = vcs.store.get(call.id)
    if live_ctx is not None:
        with live_ctx.lock:
            live_ctx.mode = call.mode
            live_ctx.agent_phone = call.agent_phone
            live_ctx.append_turn("system", call.transcript[-1]["text"] if call.transcript else "Agent takeover.")
    return {"ok": True, "call": _call_dict(call, full=True, session=session)}


@router.post("/calls/{call_id}/say")
def agent_say(call_id: int, body: SayRequest, session: Session = Depends(get_session)):
    """Agent types a message; it's spoken to the client in the call's AI voice right away."""
    user = _current_user(session)
    call = _get_call(session, call_id)
    _require_live(call)
    if call.mode == "agent_phone":
        raise HTTPException(status_code=400, detail="Agent is connected by phone; speak directly")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    switched = False
    if call.mode != "agent_typed":
        call.mode = "agent_typed"
        _append_turn(call, "system", f"{user.name or 'Agent'} took over the conversation (typed mode).")
        switched = True
    call.pending_agent_message = text
    session.add(call)
    session.commit()
    live_ctx = vcs.store.get(call.id)
    if live_ctx is not None:
        with live_ctx.lock:
            live_ctx.mode = call.mode
            live_ctx.pending_agent_message = text
            if switched:
                live_ctx.append_turn("system", f"{user.name or 'Agent'} took over the conversation (typed mode).")
            live_ctx.touch(dirty=False)
    try:
        va.twilio_update_call(call.twilio_call_sid, url=_hook_url(call, "wait"))
    except Exception as e:
        print(f"[voice-agent] redirect for agent message failed (wait loop will pick it up): {e}")
    return {"ok": True, "call": _call_dict(call, full=True, session=session)}


@router.post("/calls/{call_id}/handback")
def handback_call(call_id: int, session: Session = Depends(get_session)):
    user = _current_user(session)
    call = _get_call(session, call_id)
    _require_live(call)
    if call.mode == "agent_phone":
        raise HTTPException(status_code=400, detail="Phone takeover returns to the AI automatically when the agent hangs up")
    call.mode = "ai"
    call.pending_agent_message = None
    _append_turn(call, "system", f"{user.name or 'Agent'} handed the conversation back to the AI.")
    session.add(call)
    session.commit()
    live_ctx = vcs.store.get(call.id)
    if live_ctx is not None:
        with live_ctx.lock:
            live_ctx.mode = "ai"
            live_ctx.pending_agent_message = None
            live_ctx.append_turn("system", f"{user.name or 'Agent'} handed the conversation back to the AI.")
            live_ctx.touch(dirty=False)
    try:
        va.twilio_update_call(call.twilio_call_sid, url=_hook_url(call, "resume"))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Hand back failed: {e}")
    return {"ok": True, "call": _call_dict(call, full=True, session=session)}


@router.post("/calls/{call_id}/hangup")
def hangup_call(call_id: int, session: Session = Depends(get_session)):
    _current_user(session)
    call = _get_call(session, call_id)
    if call.twilio_call_sid and call.status in ACTIVE_STATUSES:
        attempts = ([{"url": _hook_url(call, "hangup")}, {"status": "completed"}] if call.answered_at
                    else [{"status": "canceled"}, {"status": "completed"}, {"url": _hook_url(call, "hangup")}])
        last_error = None
        for kwargs in attempts:
            try:
                va.twilio_update_call(call.twilio_call_sid, **kwargs)
                last_error = None
                break
            except Exception as e:
                last_error = e
        if last_error:
            raise HTTPException(status_code=502, detail=f"Hang up failed: {last_error}")
    return {"ok": True}


@router.delete("/calls/{call_id}")
def delete_call(call_id: int, session: Session = Depends(get_session)):
    _current_user(session)
    call = _get_call(session, call_id)
    if call.status in ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail="Hang up the call before deleting it")
    for q in session.exec(select(CallQuestion).where(CallQuestion.call_id == call_id)).all():
        q.call_id = None
        session.add(q)
    _forget_filler_state(call_id)
    vcs.store.remove(call_id)
    session.delete(call)
    session.commit()
    return {"ok": True}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Follow-up questions
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class QuestionUpdate(BaseModel):
    status: Optional[str] = None
    resolution: Optional[str] = None
    assigned_to: Optional[int] = None
    follow_up_date: Optional[str] = None


class ToKnowledgeRequest(BaseModel):
    answer: Optional[str] = None
    kind: Optional[str] = None


@router.get("/questions")
def list_questions(status: Optional[str] = None, category: Optional[str] = None, call_id: Optional[int] = None,
                   session: Session = Depends(get_session)):
    _current_user(session)
    stmt = select(CallQuestion).order_by(CallQuestion.created_at.desc()).limit(500)
    if status:
        stmt = stmt.where(CallQuestion.status.in_([s.strip() for s in status.split(",") if s.strip()]))
    if category:
        stmt = stmt.where(CallQuestion.category == category)
    if call_id:
        stmt = stmt.where(CallQuestion.call_id == call_id)
    return {"questions": [_question_dict(q) for q in session.exec(stmt).all()]}


@router.put("/questions/{question_id}")
def update_question(question_id: int, body: QuestionUpdate, session: Session = Depends(get_session)):
    actor = _current_user(session)
    q = session.get(CallQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if body.status:
        if body.status not in ("answered", "open", "escalated", "resolved"):
            raise HTTPException(status_code=400, detail="Invalid status")
        q.status = body.status
        q.resolved_at = va.utcnow() if body.status == "resolved" else None
    if body.resolution is not None:
        q.resolution = body.resolution
    if body.assigned_to is not None:
        q.assigned_to = body.assigned_to or None
    if body.follow_up_date is not None:
        q.follow_up_date = body.follow_up_date or None
    session.add(q)
    # Sync scheduled/resolved question follow-ups with the centralized follow_ups table.
    try:
        from modules import followups_core as fcore
        call = session.get(AICall, q.call_id) if q.call_id else None
        tid = q.tenant_id if q.tenant_id is not None else (call.tenant_id if call else actor.tenant_id)
        if q.status == "resolved":
            fcore.upsert_source_followup(
                session, tenant_id=tid, idempotency_key=f"call_question:{q.id}",
                source_ref=f"call_question:{q.id}", completed=True, completed_by=actor.id,
            )
        elif q.follow_up_date:
            lead = lead_calls.resolve_lead(
                session, lead_id=call.lead_id if call else None,
                entity_type=call.entity_type if call else None,
                entity_id=call.entity_id if call else None,
                to_number=call.to_number if call else None,
                tenant_id=tid,
            ) if call else None
            client_id = call.entity_id if (call and call.entity_type == "client") else None
            due_utc = fcore.parse_due_datetime(q.follow_up_date, tenant_id=tid)
            fcore.upsert_source_followup(
                session, tenant_id=tid, idempotency_key=f"call_question:{q.id}",
                source="manual", source_ref=f"call_question:{q.id}",
                lead_id=lead.id if lead else None, client_id=client_id,
                title=f"Follow up: {(q.question or 'Client question')[:160]}",
                notes=(q.resolution or q.question or "").strip() or None,
                channel="call", due_at=due_utc,
                assigned_to=q.assigned_to or (call.started_by if call else actor.id),
                created_by=actor.id,
            )
    except Exception as exc:
        print(f"[voice_agent] question follow-up sync failed for question {q.id}: {exc}")
    session.commit()
    session.refresh(q)
    return {"ok": True, "question": _question_dict(q)}


@router.post("/questions/{question_id}/to-knowledge")
def question_to_knowledge(question_id: int, body: ToKnowledgeRequest, session: Session = Depends(get_session)):
    """Promote a resolved question to the knowledge base so the AI can answer it next time."""
    _current_user(session)
    q = session.get(CallQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    answer = (body.answer or q.resolution or "").strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Provide an answer first")
    kb = CallKnowledge(kind=body.kind or ("objection" if q.category == "objection" else "faq"),
                       title=q.question, answer=answer, tags=[q.category])
    q.status, q.resolution, q.resolved_at = "resolved", answer, va.utcnow()
    session.add(kb)
    session.add(q)
    session.commit()
    session.refresh(q)
    return {"ok": True, "question": _question_dict(q)}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Knowledge base
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class KnowledgeRequest(BaseModel):
    kind: Optional[str] = None
    title: Optional[str] = None
    answer: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


def _kb_dict(k: CallKnowledge) -> dict:
    return {"id": k.id, "kind": k.kind, "title": k.title, "answer": k.answer, "tags": k.tags or [],
            "is_active": k.is_active, "usage_count": k.usage_count, "updated_at": _iso(k.updated_at)}


@router.get("/knowledge")
def list_knowledge(kind: Optional[str] = None, session: Session = Depends(get_session)):
    _current_user(session)
    stmt = select(CallKnowledge).order_by(CallKnowledge.updated_at.desc())
    if kind:
        stmt = stmt.where(CallKnowledge.kind == kind)
    return {"items": [_kb_dict(k) for k in session.exec(stmt).all()]}


@router.post("/knowledge")
def create_knowledge(body: KnowledgeRequest, session: Session = Depends(get_session)):
    _current_user(session)
    if not (body.title or "").strip() or not (body.answer or "").strip():
        raise HTTPException(status_code=400, detail="Title and answer are required")
    if body.kind and body.kind not in ("faq", "objection", "product"):
        raise HTTPException(status_code=400, detail="kind must be faq, objection or product")
    k = CallKnowledge(kind=body.kind or "faq", title=body.title.strip(), answer=body.answer.strip(),
                      tags=[t for t in (body.tags or []) if t], is_active=True if body.is_active is None else body.is_active)
    session.add(k)
    session.commit()
    session.refresh(k)
    return {"ok": True, "item": _kb_dict(k)}


@router.put("/knowledge/{item_id}")
def update_knowledge(item_id: int, body: KnowledgeRequest, session: Session = Depends(get_session)):
    _current_user(session)
    k = session.get(CallKnowledge, item_id)
    if not k:
        raise HTTPException(status_code=404, detail="Item not found")
    if body.kind is not None:
        if body.kind not in ("faq", "objection", "product"):
            raise HTTPException(status_code=400, detail="kind must be faq, objection or product")
        k.kind = body.kind
    if body.title is not None and body.title.strip():
        k.title = body.title.strip()
    if body.answer is not None and body.answer.strip():
        k.answer = body.answer.strip()
    if body.tags is not None:
        k.tags = [t for t in body.tags if t]
    if body.is_active is not None:
        k.is_active = body.is_active
    k.updated_at = va.utcnow()
    session.add(k)
    session.commit()
    session.refresh(k)
    return {"ok": True, "item": _kb_dict(k)}


@router.delete("/knowledge/{item_id}")
def delete_knowledge(item_id: int, session: Session = Depends(get_session)):
    _current_user(session)
    k = session.get(CallKnowledge, item_id)
    if not k:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(k)
    session.commit()
    return {"ok": True}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Twilio webhooks (unauthenticated; protected by per-call token)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def twilio_form(request: Request) -> dict:
    """Parse Twilio's form body in the event loop so the (blocking) handlers can run in the threadpool."""
    return {k: str(v) for k, v in (await request.form()).items()}


def _webhook_call(request: Request, session: Session, call_id: int, form: dict):
    call = session.exec(select(AICall).where(AICall.id == call_id)
                        .execution_options(skip_tenant=True)).first()
    if not call or request.query_params.get("t") != call.webhook_token:
        raise HTTPException(status_code=404, detail="Unknown call")
    if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
        # Twilio signed the URL it was given, which was built from this call's base.
        base = _call_base(call)
        url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    _set_tenant(call.tenant_id)
    return call, form


def _gather(call: AICall, *, text: Optional[str] = None, audio: Optional[str] = None, **kw) -> str:
    return va.twiml_gather(_hook_url(call, "gather"), audio_url=audio, text=text,
                           language=twilio_language(call.language, call.accent), **kw)


def _mark_ai_speaking(call: AICall, text: str) -> None:
    _update_context(call, last_ai_started=time.time(), last_ai_secs=va.estimate_speech_seconds(text))


def _add_question(session: Session, call: AICall, question: str, category: str, status: str,
                  ai_answer: Optional[str] = None, reason: Optional[str] = None) -> None:
    session.add(CallQuestion(
        tenant_id=call.tenant_id, call_id=call.id, entity_type=call.entity_type, entity_id=call.entity_id,
        entity_name=call.entity_name, question=question[:4000], category=category, ai_answer=ai_answer,
        status=status, escalation_reason=reason,
    ))


@router.get("/twilio/audio/{clip_id}.mp3")
def twilio_stream_audio(clip_id: str):
    """Stream live TTS MP3 bytes directly to Twilio as OpenAI generates them."""
    clip = get_streaming_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Audio clip not found")
    return StreamingResponse(
        iter_streaming_clip(clip),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


def _hook_url_ctx(ctx: vcs.LiveCallContext, name: str, **extra) -> str:
    base = ctx.public_base or va.public_base()
    query = urlencode({"t": ctx.webhook_token, **extra})
    return f"{base}/voice-agent/twilio/{name}/{ctx.call_id}?{query}"


def _gather_ctx(ctx: vcs.LiveCallContext, *, text: Optional[str] = None, audio: Optional[str] = None, **kw) -> str:
    return va.twiml_gather(_hook_url_ctx(ctx, "gather"), audio_url=audio, text=text,
                           language=twilio_language(ctx.language, ctx.accent), **kw)


def _wait_twiml_ctx(ctx: vcs.LiveCallContext, n: int) -> str:
    return va.twiml_gather(
        _hook_url_ctx(ctx, "gather"),
        language=twilio_language(ctx.language, ctx.accent),
        pause=1,
        timeout=2,
        action_on_empty=False,
        fallback_url=_hook_url_ctx(ctx, "wait", n=n + 1),
    )


def _filler_pool_ctx(ctx: vcs.LiveCallContext) -> List[str]:
    return [ctx.phrase(k, PHRASES) for k in FILLER_KEYS]


def _next_silence_prompt_ctx(ctx: vcs.LiveCallContext) -> str:
    pool = [ctx.phrase(k, PHRASES) for k in SILENCE_KEYS if ctx.phrase(k, PHRASES)]
    with ctx.lock:
        last = ctx.context.get("last_silence_prompt")
        line = next((p for p in pool if p != last), pool[0] if pool else ctx.phrase("still_there", PHRASES))
        ctx.context["last_silence_prompt"] = line
        ctx.touch(dirty=True)
    return line


def _ensure_live_context(call_id: int, request: Request, form: dict) -> vcs.LiveCallContext:
    """Return the validated in-memory ``LiveCallContext`` (0 DB queries on hit).

    If the server restarted mid-call (cache miss), hydrates the context ONCE from PostgreSQL
    using a short-lived session and registers it so all subsequent turns hit memory.
    """
    token = request.query_params.get("t")
    ctx = vcs.store.get_validated(call_id, token)
    if ctx is not None:
        if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
            base = ctx.public_base or va.public_base()
            url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
            if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")
        _set_tenant(ctx.tenant_id)
        return ctx

    # Cold-restart fallback: load once from DB and cache in memory for the rest of the call.
    with Session(engine) as session:
        call = session.exec(select(AICall).where(AICall.id == call_id)
                            .execution_options(skip_tenant=True)).first()
        if not call or token != call.webhook_token:
            raise HTTPException(status_code=404, detail="Unknown call")
        if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
            base = _call_base(call)
            url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
            if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")
        _set_tenant(call.tenant_id)
        pitch = session.get(VoicePitch, call.pitch_id) if call.pitch_id else None
        info = _entity_info(session, call.entity_type, call.entity_id, call.tenant_id)
        knowledge_items = _knowledge_items(session, call.tenant_id)
        from modules import demo_usage
        demo_restricted = (
            demo_usage.background_restricted(session, call.tenant_id, call.started_by)
            if call.tenant_id else False
        )
        profile_dict = (call.context or {}).get("voice_profile") or {}
        ctx = vcs.build_context_from_call(
            call,
            pitch_text=pitch.pitch_text if pitch else "",
            pitch_audio_url=pitch.audio_url if pitch else None,
            entity_context=info.get("context") or "No CRM record linked.",
            knowledge_items=knowledge_items,
            voice_profile=profile_dict,
            public_base=_call_base(call),
            demo_restricted=demo_restricted,
        )
        vcs.store.register(ctx)
        return ctx


def _twilio_answer_sync(call_id: int, request: Request, form: dict, start: float) -> Response:
    """Blocking body of /twilio/answer. Uses preloaded in-memory context (0 DB queries on hit)."""
    def step(msg: str) -> None:
        print(f"[voice_agent] answer call={call_id} {msg} (t={time.monotonic() - start:.2f}s)", flush=True)

    step("entering handler thread")
    ctx = _ensure_live_context(call_id, request, form or {})
    step("context ready (in-memory)")
    form = form or {}

    with ctx.lock:
        ctx.status = "in-progress"
        ctx.answered_at = ctx.answered_at or va.utcnow()
        ctx.touch(dirty=True)

    pitch_text = ctx.pitch_text or ctx.phrase("default_opening", PHRASES).replace(
        "{company}", tenant_voice.TenantVoiceProfile.from_dict(ctx.voice_profile).company_name
    )
    lang = twilio_language(ctx.language, ctx.accent)

    # Normal path: play the pitch audio that was pre-generated BEFORE the call was dialed.
    audio = None
    if ctx.pitch_audio_url:
        deadline = time.monotonic() + 3.0
        exists = _audio_file_exists(ctx.pitch_audio_url)
        while not exists and time.monotonic() < deadline:
            time.sleep(0.25)
            exists = _audio_file_exists(ctx.pitch_audio_url)
        if exists:
            base = ctx.public_base or va.public_base()
            audio = f"{base}{ctx.pitch_audio_url}" if base else None
        else:
            audio = _cached_filler_url_ctx(ctx)
            step(f"pitch audio file NOT on disk after 3s -> cached voice filler={audio}")

    if (form.get("AnsweredBy") or "").startswith("machine"):
        ctx.append_turn("system", "Voicemail detected; left the pitch as a message.")
        vcs.persistence.enqueue(call_id)
        step("returning voice-clip hangup TwiML")
        return _xml(va.twiml_say_hangup(audio or _cached_filler_url_ctx(ctx), None, lang))

    ctx.append_turn("ai", pitch_text, kind="pitch")
    ctx.mark_ai_speaking(pitch_text, va.estimate_speech_seconds(pitch_text))
    # Persist asynchronously off the live webhook path so Twilio plays the pitch immediately.
    vcs.persistence.enqueue(call_id)
    twiml = _gather_ctx(ctx, audio=audio or _cached_filler_url_ctx(ctx))
    step("TwiML built (0 blocking DB writes)")
    return _xml(twiml)


def _safe_voice_gather(call_id: int, request: Request) -> str:
    """Always-valid TwiML that keeps the conversation going without ever switching to Twilio's
    ``<Say>`` voice: play the cached filler clip in the call's selected voice (or stay silent when
    the call cannot be read), then listen again."""
    token = request.query_params.get("t") or ""
    base = ""
    audio = None
    live_ctx = vcs.store.get(call_id)
    if live_ctx is not None:
        base = live_ctx.public_base
        audio = _cached_filler_url_ctx(live_ctx)
    else:
        try:
            with Session(engine) as session:
                call = session.exec(select(AICall).where(AICall.id == call_id)
                                    .execution_options(skip_tenant=True)).first()
                if call:
                    _set_tenant(call.tenant_id)
                    base = _call_base(call)
                    audio = _cached_filler_url(call)
        except Exception:
            audio = None
    if not base:
        try:
            base = va.public_base()
        except Exception:
            base = ""
    action = f"{base}/voice-agent/twilio/gather/{call_id}?t={token}"
    try:
        return va.twiml_gather(action, audio_url=audio)
    except Exception:
        return '<?xml version="1.0" encoding="UTF-8"?><Response><Gather/></Response>'


def _webhook_error_twiml(call_id: int, request: Request) -> Response:
    """Always-valid TwiML whenever a webhook raises.

    On the FIRST consecutive error: a short <Gather> answered in the call's own voice. On the
    SECOND consecutive error: a polite goodbye clip (pre-generated in the call's voice) followed
    by <Hangup/>. The prospect never hears Twilio's default "application error" message. The
    consecutive-error counter is reset by any webhook that completes successfully."""
    err_no = _webhook_error_incr(call_id)
    if err_no >= 2:
        audio = None
        live_ctx = vcs.store.get(call_id)
        if live_ctx is not None:
            audio = _cached_phrase_url_ctx(live_ctx, "goodbye_error")
        else:
            try:
                with Session(engine) as session:
                    call = session.exec(select(AICall).where(AICall.id == call_id)
                                        .execution_options(skip_tenant=True)).first()
                    if call:
                        _set_tenant(call.tenant_id)
                        audio = _cached_phrase_url(call, "goodbye_error")
            except Exception as e:
                print(f"[voice-agent] goodbye-error clip lookup failed for call {call_id}: {e}")
        print(f"[voice-agent] webhook error {err_no} for call {call_id} -> goodbye + hangup", flush=True)
        try:
            goodbye = f"<Play>{escape(audio)}</Play>" if audio else ""
            return _xml(f'<?xml version="1.0" encoding="UTF-8"?><Response>{goodbye}<Hangup/></Response>')
        except Exception:
            return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
                            media_type="application/xml")
    print(f"[voice-agent] webhook error {err_no} for call {call_id} -> voice gather fallback", flush=True)
    try:
        return _xml(_safe_voice_gather(call_id, request))
    except Exception:
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response><Gather/></Response>',
                        media_type="application/xml")


def _answer_safe_fallback(call_id: int, request: Request, text: Optional[str] = None) -> Response:
    """Always-valid TwiML: a voice-consistent filler clip followed by <Gather>, so Twilio never
    sees a hang/500 and the prospect never hears a different voice."""
    if text:
        print(f"[voice-agent] answer fallback call={call_id}: {text}", flush=True)
    try:
        return _xml(_safe_voice_gather(call_id, request))
    except Exception:
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response><Gather/></Response>',
                        media_type="application/xml")


@router.post("/twilio/answer/{call_id}")
async def twilio_answer(call_id: int, request: Request, form: dict = Depends(twilio_form)):
    start = time.monotonic()
    print(f"[voice_agent] answer call={call_id} received (t=0.00s)", flush=True)
    try:
        work = asyncio.to_thread(_twilio_answer_sync, call_id, request, form, start)
        resp = await asyncio.wait_for(work, timeout=10.0)
        _webhook_error_clear(call_id)
        print(f"[voice_agent] answer call={call_id} completed (t={time.monotonic() - start:.2f}s)", flush=True)
        return resp
    except asyncio.TimeoutError:
        print(f"[voice_agent] answer call={call_id} TIMEOUT after 10s — returning voice-filler+<Gather> fallback (t={time.monotonic() - start:.2f}s)", flush=True)
        return _webhook_error_twiml(call_id, request)
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] answer call={call_id} failed after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}", flush=True)
        return _webhook_error_twiml(call_id, request)



@router.post("/twilio/gather/{call_id}")
def twilio_gather(call_id: int, request: Request,
                  form: dict = Depends(twilio_form)):
    try:
        start = time.monotonic()
        resp = _twilio_gather_impl(call_id, request, form)
        _webhook_error_clear(call_id)
        print(f"[voice_agent] /gather call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/gather failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


def _twilio_gather_impl(call_id: int, request: Request, form: dict):
    start = time.monotonic()
    tt = _TurnTimer(call_id, "gather")
    ctx = _ensure_live_context(call_id, request, form)
    tt.mark("ctx_read")
    print(f"[voice_agent] /gather call {call_id} SpeechResult={form.get('SpeechResult')!r} Confidence={form.get('Confidence')!r}")
    speech = (form.get("SpeechResult") or "").strip()
    lang = twilio_language(ctx.language, ctx.accent)

    # ── silence ──────────────────────────────────────────────────────────────
    if not speech:
        if ctx.mode == "agent_typed":
            return _xml(_wait_twiml_ctx(ctx, 0))
        with ctx.lock:
            silence = int(ctx.context.get("silence_count", 0)) + 1
            ctx.context["silence_count"] = silence
            ctx.touch(dirty=True)
        if va.is_paid_account():
            if silence >= 2:
                line = ctx.phrase("goodbye_silence", PHRASES)
                spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
                ctx.append_turn("ai", line)
                if spoken.filler:
                    ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
                    vcs.persistence.enqueue(call_id)
                    _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                              silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-goodbye")
                    return _xml(_gather_ctx(ctx, audio=spoken.url))
                vcs.persistence.enqueue(call_id)
                _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                          silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-goodbye")
                return _xml(va.twiml_say_hangup(spoken.url, None, lang))
            line = _next_silence_prompt_ctx(ctx)
            spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
            ctx.append_turn("ai", line)
            ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
            vcs.persistence.enqueue(call_id)
            _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                      silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-prompt")
            return _xml(_gather_ctx(ctx, audio=spoken.url))
        # Trial: unchanged behavior — "Are you still there?" / "Hello?" then goodbye on the 3rd silence.
        if silence >= 3:
            line = ctx.phrase("lost_connection", PHRASES)
            spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
            ctx.append_turn("ai", line)
            if spoken.filler:
                ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
                vcs.persistence.enqueue(call_id)
                _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                          silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-lost")
                return _xml(_gather_ctx(ctx, audio=spoken.url))
            vcs.persistence.enqueue(call_id)
            _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                      silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-lost")
            return _xml(va.twiml_say_hangup(spoken.url, None, lang))
        line = ctx.phrase("still_there" if silence == 1 else "still_there_2", PHRASES)
        spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
        ctx.append_turn("ai", line)
        ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
        vcs.persistence.enqueue(call_id)
        _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                  silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence")
        return _xml(_gather_ctx(ctx, audio=spoken.url))

    confidence = form.get("Confidence")

    # ── agent typed mode: record client turn in memory + background persist ──
    if ctx.mode == "agent_typed":
        ctx.append_turn("client", speech, confidence=confidence)
        vcs.persistence.enqueue(call_id)
        return _xml(_wait_twiml_ctx(ctx, 0))

    # ── AI mode: 100% in-memory context -> LLM -> streaming TTS -> playback ──
    tt.mark("speech_logic")
    paid = va.is_paid_account()
    v = ctx.voice_settings()
    base = ctx.public_base or va.public_base()
    fillers = _filler_pool_ctx(ctx)
    filler_audio = [
        (f"{base}{rel}" if (rel and base) else None)
        for rel in (
            cached_audio(f, voice=v["voice"], accent=v["accent"], style=v["style"],
                         speed=v["speed"], language=v["language"], prefix="filler")
            for f in fillers
        )
    ]
    seq = _begin_reply(ctx.call_id, ctx.webhook_token, language=lang, fillers=fillers,
                       filler_audio=filler_audio, voice=v["voice"],
                       client_speech=speech, client_ts=va.utcnow().isoformat())
    threading.Thread(
        target=_prepare_reply,
        args=(ctx.call_id, ctx.tenant_id, speech, confidence, seq),
        daemon=True,
    ).start()
    tt.mark("enqueue")
    # Paid accounts: wait up to ~3.5s on the Event (instant wakeup when ready) so fast
    # 2-3s replies play directly with NO filler and NO redirect round trip.
    remaining = max(0.0, (10.0 if paid else 8.0) - (time.monotonic() - start) - 0.5)
    ready = _wait_for_reply(ctx.call_id, seq, min((REPLY_FAST_WAIT_PAID if paid else REPLY_FAST_WAIT), remaining))
    tt.mark("wait_reply")
    if ready is not None:
        meta = ready.get("meta") or {}
        if ready["xml"]:
            _turn_log(call_id, voice=meta.get("voice") or v["voice"], tts_ms=meta.get("tts_ms", 0),
                      filler=meta.get("filler", False), wait_ms=int((time.monotonic() - start) * 1000),
                      tag="served-fast")
            tt.done(served="fast")
            return _xml(ready["xml"])
        # Generation failed: apologise in the same voice and listen again.
        line = ctx.phrase("apology", PHRASES)
        spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
        ctx.append_turn("ai", line)
        ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
        vcs.persistence.enqueue(call_id)
        _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                  wait_ms=int((time.monotonic() - start) * 1000), tag="fast-failed")
        return _xml(_gather_ctx(ctx, audio=spoken.url))
    _turn_log(call_id, voice=v["voice"], tts_ms=0, filler=True,
              wait_ms=int((time.monotonic() - start) * 1000), tag="holding")
    tt.done(served="filler")
    if paid:
        return _xml(_paid_filler_twiml(ctx.call_id, ctx.webhook_token, seq, base=base))
    return _xml(_hold_twiml(ctx.call_id, ctx.webhook_token, seq, 0, base=base))


# ── Background reply preparation (keeps every Twilio webhook fast) ──────────────
REPLY_POLL_MAX = 4  # trial-account safety: at most ~4 hold redirects per turn
# How long /gather blocks waiting for an already-finished reply before falling back to the hold
# loop. 0 by default: the reply needs several seconds (chat + speech synthesis), so blocking here
# is pure dead air — answer immediately with spoken filler and let the hold loop poll instead.
# Raise via .env only if reply generation gets consistently faster than this wait.
REPLY_FAST_WAIT = float(os.getenv("VOICE_AGENT_FAST_WAIT_SECONDS", "0"))
# Short breath after the spoken filler, before the polling <Redirect>. This used to be a silent
# 4s <Pause>: callers sat in silence after their answer and hung up before the AI ever spoke.
REPLY_HOLD_PAUSE = int(os.getenv("VOICE_AGENT_HOLD_PAUSE_SECONDS", "1"))
_PENDING_REPLIES: dict = {}  # call_id -> {"seq": int, "token": str, "xml": Optional[str], "done": bool}
_PENDING_LOCK = threading.Lock()

# ── Paid ("Full") account timings ──────────────────────────────────────────────
# Paid accounts: a Twilio webhook can safely run about 10s, so we hold the line much longer than
# the 3s trial budget. With zero-DB in-memory turns + streaming TTS, replies typically finish in
# 2-3s, so holding up to 3.5s on /gather lets most turns play immediately with ZERO filler clip.
REPLY_TTS_BUDGET = float(os.getenv("VOICE_AGENT_REPLY_TTS_SECONDS", str(CALL_TTS_TIMEOUT)))  # trial: 3s
REPLY_TTS_BUDGET_PAID = float(os.getenv("VOICE_AGENT_REPLY_TTS_SECONDS_PAID", "6"))            # paid: 6s
REPLY_FAST_WAIT_PAID = float(os.getenv("VOICE_AGENT_FAST_WAIT_SECONDS_PAID", "3.5"))           # up to 3.5s for a no-filler reply
REPLY_HOLD_SECONDS_PAID = float(os.getenv("VOICE_AGENT_HOLD_SECONDS_PAID", "8"))               # up to 8s per wait poll
REPLY_SILENT_POLLS_PAID = int(os.getenv("VOICE_AGENT_SILENT_POLLS_PAID", "4"))                 # up to 4 silent polls (≈30s)
_WEBHOOK_ERRORS: dict = {}   # call_id -> consecutive webhook failures (reset on any success)


class _TurnTimer:
    """Collects per-step durations for one call turn and prints them as a single structured line.

    Use ``mark(name)`` after each interesting step and ``done(**extra)`` at the end; the deltas
    between marks are reported in milliseconds, with the total turn time at the end.
    """

    def __init__(self, call_id: int, tag: str = "turn") -> None:
        self.call_id = call_id
        self.tag = tag
        self.t0 = time.monotonic()
        self._last = self.t0
        self.steps: list = []

    def mark(self, name: str) -> None:
        now = time.monotonic()
        self.steps.append((name, int((now - self._last) * 1000)))
        self._last = now

    def done(self, **extra) -> None:
        total = int((time.monotonic() - self.t0) * 1000)
        parts = " ".join(f"{name}={ms}ms" for name, ms in self.steps)
        extra_txt = " ".join(f"{k}={v}" for k, v in extra.items())
        print(f"[voice-timing] call={self.call_id} tag={self.tag} {parts} total={total}ms "
              + extra_txt, flush=True)


def _turn_log(call_id: int, *, voice: str = "?", tts_ms: int = 0, filler: bool = False,
              silent_polls: int = 0, silence_count: int = 0, wait_ms: int = 0,
              exceptions: int = 0, tag: str = "", extra: str = "") -> None:
    """One structured log line per spoken turn: account type, filler used, silent polls, silence
    count, tts_ms, total wait ms and exceptions caught."""
    account = "full" if va.is_paid_account() else "trial"
    print(
        f"[voice-agent] turn call={call_id} account={account} filler={'yes' if filler else 'none'} "
        f"silent_polls={silent_polls} silence_count={silence_count} tts_ms={tts_ms} "
        f"wait_ms={wait_ms} exceptions={exceptions} voice={voice} tag={tag}"
        + (f" {extra}" if extra else ""), flush=True,
    )


def _webhook_error_incr(call_id: int) -> int:
    with _PENDING_LOCK:
        n = _WEBHOOK_ERRORS.get(call_id, 0) + 1
        _WEBHOOK_ERRORS[call_id] = n
        return n


def _webhook_error_clear(call_id: int) -> None:
    with _PENDING_LOCK:
        _WEBHOOK_ERRORS.pop(call_id, None)


def _begin_reply(call_id: int, token: str, *, language: str = "en-US",
                 fillers: Optional[list] = None, filler_audio: Optional[list] = None,
                 voice: Optional[str] = None, client_speech: Optional[str] = None,
                 client_ts: Optional[str] = None) -> int:
    """Register the turn the background reply will publish. Uses a ``threading.Event`` so
    waiting webhooks wake up in <1ms the moment the reply is ready (no 200ms polling sleep)."""
    with _PENDING_LOCK:
        seq = (_PENDING_REPLIES.get(call_id, {}).get("seq") or 0) + 1
        _PENDING_REPLIES[call_id] = {"seq": seq, "token": token, "xml": None, "done": False,
                                     "event": threading.Event(),
                                     "language": language, "voice": voice,
                                     "fillers": list(fillers or ["One moment please."]),
                                     "filler_audio": list(filler_audio or []),
                                     "client_speech": client_speech, "client_ts": client_ts,
                                     "meta": {}}
        return seq


def _finish_reply(call_id: int, seq: int, xml: Optional[str],
                  meta: Optional[dict] = None) -> None:
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        if entry and entry["seq"] == seq:
            entry.update(xml=xml, done=True, meta=meta or {})
            ev = entry.get("event")
            if ev is not None:
                ev.set()


def _wait_for_reply(call_id: int, seq: int, timeout: float) -> Optional[dict]:
    """Block up to ``timeout`` seconds on the turn's Event; wakes up immediately on publish."""
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        if entry and entry["seq"] == seq and entry["done"]:
            _PENDING_REPLIES.pop(call_id, None)
            return entry
        ev = entry.get("event") if (entry and entry["seq"] == seq) else None
    if ev is None or timeout <= 0:
        return None
    if ev.wait(timeout=timeout):
        with _PENDING_LOCK:
            entry = _PENDING_REPLIES.get(call_id)
            if entry and entry["seq"] == seq and entry["done"]:
                _PENDING_REPLIES.pop(call_id, None)
                return entry
    return None


def _hold_twiml(call_id: int, token: str, seq: int, n: int, call: Optional[AICall] = None,
                *, base: Optional[str] = None) -> str:
    """Hold the line while the reply is generated: play a pre-generated hold clip in the call's
    OWN voice (never Twilio's <Say> voice, which would change the voice mid-call) plus a short
    breath, then redirect back to poll."""
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id) or {}
    fillers = entry.get("fillers") or ["One moment please."]
    filler_audio = entry.get("filler_audio") or []
    picked = _pick_filler(call_id, fillers)
    audio = None
    if picked is not None:
        idx = next((i for i, f in enumerate(fillers) if f == picked), 0)
        audio = filler_audio[idx] if idx < len(filler_audio) else None
    filler = va.twiml_play(audio) if audio else f'<Pause length="{REPLY_HOLD_PAUSE or 1}"/>'
    resolved_base = base or (vcs.store.get(call_id).public_base if vcs.store.get(call_id) else None) or _call_base(call)
    url = f"{resolved_base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': n})}"
    pause = f'<Pause length="{REPLY_HOLD_PAUSE}"/>' if REPLY_HOLD_PAUSE and audio else ""
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response>{filler}{pause}'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _paid_filler_twiml(call_id: int, token: str, seq: int, call: Optional[AICall] = None,
                       *, base: Optional[str] = None) -> str:
    """Paid accounts, first step of the wait flow: play EXACTLY ONE hold line for this turn (in the
    call's own voice, and never one this call has already used), then redirect to the wait endpoint."""
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id) or {}
    pool = entry.get("fillers") or ["One moment please."]
    audios = entry.get("filler_audio") or []
    resolved_base = base or (vcs.store.get(call_id).public_base if vcs.store.get(call_id) else None) or _call_base(call)
    url = f"{resolved_base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': 0})}"
    picked = _pick_filler(call_id, pool)
    if picked is None:
        return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/>'
                f'<Redirect method="POST">{escape(url)}</Redirect></Response>')
    try:
        idx = next(i for i, f in enumerate(pool) if f == picked)
    except StopIteration:
        idx = 0
    audio = audios[idx] if idx < len(audios) else None
    filler = f'<Play>{escape(audio)}</Play>' if audio else f'<Pause length="2"/>'
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response>{filler}'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _paid_hold_twiml(call_id: int, token: str, seq: int, n: int, call: Optional[AICall] = None,
                     *, base: Optional[str] = None) -> str:
    """Paid accounts, silent wait poll: short 2s <Pause> then redirect back to the wait endpoint."""
    resolved_base = base or (vcs.store.get(call_id).public_base if vcs.store.get(call_id) else None) or _call_base(call)
    url = f"{resolved_base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': n})}"
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/>'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _record_client_turn(call: AICall, speech: str, confidence: Optional[str] = None) -> bool:
    """Persist the client's turn and the interruption bookkeeping (legacy DB-row helper)."""
    ctx = call.context or {}
    elapsed = time.time() - float(ctx.get("last_ai_started") or 0)
    client_secs = va.estimate_speech_seconds(speech) + 1.5
    interrupted = (elapsed - client_secs) < float(ctx.get("last_ai_secs") or 0) - 1
    transcript = list(call.transcript or [])
    if interrupted:
        for turn in reversed(transcript):
            if turn.get("role") in ("ai", "agent"):
                turn["interrupted"] = True
                break
        call.transcript = transcript
        flag_modified(call, "transcript")
    _update_context(call, silence_count=0)
    _append_turn(call, "client", speech, interrupted_ai=interrupted, confidence=confidence)
    return interrupted


def _prepare_reply(call_id: int, tenant_id: Optional[int], speech: str,
                   confidence: Optional[str], seq: int) -> None:
    """Live conversation turn: In-Memory Context -> LLM -> Streaming TTS -> Instant Publish.

    Performs ZERO database reads and ZERO blocking database writes on the live response path.
    All durable DB persistence (transcript, call state) and background AI insights are enqueued
    asynchronously after publishing the TwiML response.
    """
    _set_tenant(tenant_id)
    xml = None
    meta = {}
    reply = ""
    human_requested = False
    snap = None
    ranked_kb: List[dict] = []
    t = _TurnTimer(call_id, "reply")
    try:
        ctx = vcs.store.get(call_id)
        t.mark("ctx_lookup")
        if ctx is None:
            print(f"[voice-agent] missing live context for call {call_id}; aborting reply")
            return
        interrupted = ctx.record_client_turn(speech, confidence, va.estimate_speech_seconds(speech))
        t.mark("record_client")
        snap = ctx.snapshot_for_reply()
        xml, meta, reply, ranked_kb = _build_reply_in_memory(ctx, snap, speech, interrupted, t)
        human_requested = ctx.current_intent == "request_human"
        t.mark("build_reply_total")
        # Wake the waiting /gather or /reply webhook IMMEDIATELY (<1ms via Event).
        _finish_reply(call_id, seq, xml, meta)
        t.mark("publish")
        # Enqueue reliable coalesced background persistence (0ms on live path).
        vcs.persistence.enqueue(call_id)
        t.mark("db_enqueue")
    except Exception as e:
        print(f"[voice-agent] reply preparation failed for call {call_id}: {e}")
    finally:
        _finish_reply(call_id, seq, xml, meta)
        t.done(ok=bool(xml), filler=bool(meta.get("filler")), tts_ms=meta.get("tts_ms", 0))
    # Rich, non-spoken analysis (sentiment, doubts, questions, KB usage) — reuses preloaded context.
    if not xml or snap is None:
        return
    try:
        threading.Thread(
            target=_prepare_insights,
            args=(call_id, tenant_id, speech, reply, human_requested, snap, ranked_kb),
            daemon=True,
        ).start()
    except Exception as e:
        print(f"[voice-agent] could not start insights for call {call_id}: {e}")


def _build_reply_in_memory(ctx: vcs.LiveCallContext, snap: dict, speech: str,
                           interrupted: bool, timer: "Optional[_TurnTimer]" = None):
    """Produce ONLY the spoken line plus its TwiML purely from preloaded in-memory context."""
    _set_call_demo_context_flag(ctx.tenant_id, ctx.demo_restricted)

    def _mark(name: str) -> None:
        if timer is not None:
            timer.mark(name)

    cctx = snap["context"]
    lang = twilio_language(ctx.language, ctx.accent)
    transcript = list(snap["transcript"] or [])
    # The client's turn is the last one stored; keep it out of the history (passed as client_text).
    history = transcript[:-1] if transcript and transcript[-1].get("role") == "client" else transcript

    # Rank preloaded tenant KB + products + solutions in memory (0 DB queries).
    knowledge = va.rank_knowledge(
        speech + " " + " ".join(cctx.get("doubts", [])[-3:]),
        snap["knowledge_items"],
        limit=4,
    )
    profile = tenant_voice.TenantVoiceProfile.from_dict(snap["voice_profile"])
    _mark("ctx_prep")
    result = va.generate_reply_only(
        client_text=speech, transcript=history, pitch_text=snap["pitch_text"],
        entity_context=snap["entity_context"], knowledge=knowledge, state=cctx,
        interrupted=interrupted, agent_available=bool(ctx.agent_phone),
        language=language_label(ctx.language), profile=profile,
    )
    _mark("llm")
    reply = result["reply"]
    with ctx.lock:
        ctx.current_intent = result.get("intent")
    # Never announce a live phone transfer. When wrapping up with "one of our sales representatives
    # will get in touch with you", always say a warm goodbye and hang up the call cleanly.
    audio_prefix = "reply"
    lower_reply = (reply or "").lower()
    mentions_transfer = any(p in lower_reply for p in ("transfer you", "transferring", "put you through", "connect you right now", "connecting you"))
    mentions_rep_followup = any(p in lower_reply for p in (
        "sales representative will get in touch",
        "sales representatives will get in touch",
        "sales rep will get in touch",
        "sales rep will reach out",
        "sales representative will reach out",
        "sales representative will follow up",
        "sales executive will follow up",
    ))
    has_goodbye = any(w in lower_reply for w in ("bye", "goodbye", "have a great day", "have a wonderful day", "take care"))
    if result.get("intent") == "request_human" and mentions_transfer:
        reply = ctx.phrase("connect_noted", PHRASES)
        audio_prefix = "filler"
        result["end_call"] = True
    elif mentions_rep_followup and "?" not in reply:
        if not has_goodbye:
            reply = reply.rstrip(" .") + ". Have a great day, goodbye!"
        result["end_call"] = True
    elif result.get("end_call") and not has_goodbye:
        reply = reply.rstrip(" .") + ". Have a great day, goodbye!"

    spoken = _call_audio_ctx(ctx, reply, audio_prefix, stream=(audio_prefix != "filler"))
    _mark("tts")
    audio = spoken.url
    meta = {"voice": spoken.voice, "tts_ms": spoken.tts_ms, "filler": spoken.filler}
    ctx.append_turn("ai", reply)

    if result.get("end_call") and not spoken.filler:
        return va.twiml_say_hangup(audio, None, lang), meta, reply, knowledge

    # If TTS failed and we could only play the apology filler, never hang up on it: keep listening.
    ctx.mark_ai_speaking(reply, va.estimate_speech_seconds(reply))
    return _gather_ctx(ctx, audio=audio), meta, reply, knowledge


def _prepare_insights(call_id: int, tenant_id: Optional[int], speech: str,
                      spoken_reply: str, human_requested: bool = False,
                      snap: Optional[dict] = None,
                      ranked_kb: Optional[List[dict]] = None) -> None:
    """Rich background analysis of the client's message: sentiment, interest, doubts, objections,
    questions and knowledge usage.

    Reuses the preloaded in-memory context (ZERO DB reads before LLM), does NOT generate a
    duplicate spoken reply, holds ZERO DB connections during the OpenAI call, and queues all
    durable DB writes through ``vcs.persistence`` (short-lived session with retries).
    """
    _set_tenant(tenant_id)
    t = _TurnTimer(call_id, "insights")
    try:
        ctx = vcs.store.get(call_id)
        if snap is None and ctx is not None:
            snap = ctx.snapshot_for_reply()
        if snap is None:
            return
        if _set_call_demo_context_flag(snap.get("tenant_id"), bool(snap.get("demo_restricted"))):
            return  # optional background insights are unavailable in demos

        cctx = snap["context"]
        transcript = list(snap["transcript"] or [])
        # Drop the client turn we are analyzing (passed explicitly as client_text).
        if transcript and transcript[-1].get("role") == "client":
            transcript = transcript[:-1]
        knowledge = ranked_kb if ranked_kb is not None else va.rank_knowledge(
            speech + " " + " ".join(cctx.get("doubts", [])[-3:]),
            snap["knowledge_items"],
            limit=4,
        )
        profile = tenant_voice.TenantVoiceProfile.from_dict(snap["voice_profile"])
        t.mark("ctx_reuse")

        # OpenAI call executes with ZERO database sessions open.
        result = va.analyze_turn_insights(
            client_text=speech,
            spoken_reply=spoken_reply,
            transcript=transcript,
            pitch_text=snap["pitch_text"],
            entity_context=snap["entity_context"],
            knowledge=knowledge,
            state=cctx,
            language=language_label(snap.get("language")),
            profile=profile,
        )
        t.mark("llm")

        doubts = [d for d in result.get("doubts") or [] if isinstance(d, str) and d.strip()]
        objections_to_add: List[str] = []
        questions_to_add: List[dict] = []
        obj = result.get("objection") if isinstance(result.get("objection"), dict) else None
        answer = spoken_reply
        if obj and obj.get("text"):
            objections_to_add.append(f"{obj.get('type', 'other')}: {obj['text']}")
            questions_to_add.append({
                "question": obj["text"], "category": "objection", "status": "answered", "ai_answer": answer,
            })
        for d in doubts:
            questions_to_add.append({
                "question": d, "category": "doubt", "status": "answered", "ai_answer": answer,
            })
        unanswered = (result.get("unanswered_question") or "").strip()
        for q in result.get("questions") or []:
            if isinstance(q, dict) and q.get("question") and q.get("answered") and q["question"] != unanswered:
                questions_to_add.append({
                    "question": q["question"], "category": "question", "status": "answered",
                    "ai_answer": q.get("answer") or answer,
                })
        if result.get("escalate") or human_requested:
            reason = result.get("escalate_reason") or ("Client asked for a sales representative"
                                                      if human_requested else "Escalated by AI")
            questions_to_add.append({
                "question": unanswered or speech, "category": "question", "status": "escalated",
                "ai_answer": answer, "reason": reason,
            })
        elif unanswered:
            questions_to_add.append({
                "question": unanswered, "category": "question", "status": "open",
                "ai_answer": answer, "reason": "AI could not answer from the knowledge base",
            })

        used = {str(u) for u in result.get("knowledge_used") or []}
        kb_ids = [
            int(item["id"][2:])
            for item in knowledge
            if item["id"].startswith("kb") and (item["id"] in used or item["title"] in used)
        ]

        live_ctx = vcs.store.get(call_id)
        if live_ctx is not None:
            live_ctx.apply_insights(
                intent=result.get("intent"),
                sentiment=result.get("sentiment"),
                interest_score=result.get("interest_score"),
                stage=result.get("stage"),
                doubts=doubts,
                objections_to_add=objections_to_add,
                adaptation=result.get("adaptation"),
                questions=questions_to_add,
                kb_ids=kb_ids,
                client_speech=speech,
            )
            vcs.persistence.enqueue(call_id)
        t.mark("db_enqueue")
    except Exception as e:
        print(f"[voice-agent] insights preparation failed for call {call_id}: {e}")
    finally:
        t.done()


@router.post("/twilio/reply/{call_id}")
def twilio_reply(call_id: int, request: Request, form: dict = Depends(twilio_form)):
    try:
        start = time.monotonic()
        resp = _twilio_reply_impl(call_id, request, form)
        _webhook_error_clear(call_id)
        print(f"[voice_agent] /reply call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/reply failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


def _twilio_reply_impl(call_id: int, request: Request, form: dict):
    start = time.monotonic()
    """Hold loop: play the prepared reply the instant its Event signals (0 DB sessions on hot path)."""
    seq = int(request.query_params.get("s") or 0)
    n = int(request.query_params.get("n") or 0)
    token = request.query_params.get("t")
    paid = va.is_paid_account()
    fast = os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() != "true"
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        current = entry if entry and entry["seq"] == seq and token and entry["token"] == token else None
        if current and current.get("done") and current.get("xml"):
            _PENDING_REPLIES.pop(call_id, None)

    def _log(voice, tts_ms, filler, tag, silent=0, exc=0):
        _turn_log(call_id, voice=voice, tts_ms=tts_ms, filler=filler, silent_polls=silent,
                  wait_ms=int((time.monotonic() - start) * 1000), exceptions=exc, tag=tag)

    if current and current.get("done") and current.get("xml"):
        m = current.get("meta") or {}
        _log(m.get("voice") or current.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
             f"served redirects={n}", silent=n)
        return _xml(current["xml"])

    if paid:
        if current and not current.get("done"):
            if n >= REPLY_SILENT_POLLS_PAID:
                with _PENDING_LOCK:
                    _PENDING_REPLIES.pop(call_id, None)
                ctx = _ensure_live_context(call_id, request, form)
                line = ctx.phrase("apology", PHRASES)
                spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
                ctx.append_turn("ai", line)
                ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
                vcs.persistence.enqueue(call_id)
                _log(spoken.voice, spoken.tts_ms, spoken.filler, f"apology polls={n}", silent=n)
                return _xml(_gather_ctx(ctx, audio=spoken.url))
            ready = _wait_for_reply(call_id, seq, REPLY_HOLD_SECONDS_PAID)
            if ready and ready.get("xml"):
                m = ready.get("meta") or {}
                _log(m.get("voice") or ready.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
                     f"served-wait polls={n}", silent=n)
                return _xml(ready["xml"])
            _log("?", 0, False, f"silent-poll polls={n}", silent=n)
            return _xml(_paid_hold_twiml(call_id, token, seq, n + 1))
        ctx = _ensure_live_context(call_id, request, form)
        if ctx.mode == "agent_typed":
            return _xml(_wait_twiml_ctx(ctx, 0))
        line = ctx.phrase("apology", PHRASES)
        spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
        ctx.append_turn("ai", line)
        ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
        vcs.persistence.enqueue(call_id)
        _log(spoken.voice, spoken.tts_ms, spoken.filler, "failed-paid", silent=n)
        return _xml(_gather_ctx(ctx, audio=spoken.url))

    # ── Trial accounts: legacy hold-loop behavior, unchanged ──
    if current and fast:
        if not current["done"] and n < REPLY_POLL_MAX:
            _log(current.get("voice"), 0, True, f"hold redirects={n + 1}")
            return _xml(_hold_twiml(call_id, token, seq, n + 1))
        if current["done"] and current["xml"]:
            m = current.get("meta") or {}
            _log(m.get("voice") or current.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
                 f"served redirects={n}")
            return _xml(current["xml"])

    ctx = _ensure_live_context(call_id, request, form)
    if current and not current["done"] and n < REPLY_POLL_MAX:
        _log(current.get("voice"), 0, True, f"hold redirects={n + 1}")
        return _xml(_hold_twiml(call_id, token, seq, n + 1, base=ctx.public_base))
    if current and current["done"] and current["xml"]:
        m = current.get("meta") or {}
        _log(m.get("voice") or current.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
             f"served redirects={n}")
        return _xml(current["xml"])
    if current and not current["done"]:
        line = ctx.phrase("one_moment", PHRASES)
        spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
        ctx.append_turn("ai", line)
        ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
        vcs.persistence.enqueue(call_id)
        _log(spoken.voice, spoken.tts_ms, spoken.filler, f"capped redirects={n}")
        return _xml(_gather_ctx(ctx, audio=spoken.url))
    if ctx.mode == "agent_typed":
        return _xml(_wait_twiml_ctx(ctx, 0))
    line = ctx.phrase("retry", PHRASES)
    spoken = _call_audio_ctx(ctx, line, prefix="filler", stream=False)
    ctx.append_turn("ai", line)
    ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
    vcs.persistence.enqueue(call_id)
    _log(spoken.voice, spoken.tts_ms, spoken.filler, "failed")
    return _xml(_gather_ctx(ctx, audio=spoken.url))


def _wait_twiml(call: AICall, n: int) -> str:
    """Typed-takeover loop: keep listening to the client while waiting for the agent's next message."""
    return va.twiml_gather(_hook_url(call, "gather"), language=twilio_language(call.language, call.accent), pause=1, timeout=2,
                           action_on_empty=False, fallback_url=_hook_url(call, "wait", n=n + 1))


@router.post("/twilio/wait/{call_id}")
def twilio_wait(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        call, _ = _webhook_call(request, session, call_id, form)
        n = int(request.query_params.get("n") or 0)
        lang = twilio_language(call.language, call.accent)
        if call.mode == "ai":
            _webhook_error_clear(call_id)
            return _xml(_resume_twiml(call, session))
        if call.pending_agent_message:
            text = call.pending_agent_message
            call.pending_agent_message = None
            _append_turn(call, "agent", text)
            _mark_ai_speaking(call, text)
            session.add(call)
            session.commit()
            live_ctx = vcs.store.get(call.id)
            if live_ctx is not None:
                with live_ctx.lock:
                    live_ctx.pending_agent_message = None
                    live_ctx.append_turn("agent", text)
                    live_ctx.mark_ai_speaking(text, va.estimate_speech_seconds(text))
                    live_ctx.touch(dirty=False)
            _webhook_error_clear(call_id)
            return _xml(va.twiml_gather(_hook_url(call, "gather"), audio_url=_speak_audio(call, text, "agent"),
                                        text=text, language=lang, timeout=4, action_on_empty=False,
                                        fallback_url=_hook_url(call, "wait", n=0)))
        if n >= MAX_WAIT_LOOPS:
            line = _phrase(call, "wait_timeout")
            _append_turn(call, "ai", line)
            session.add(call)
            session.commit()
            _webhook_error_clear(call_id)
            return _xml(va.twiml_say_hangup(_speak_audio(call, line), line, lang))
        _webhook_error_clear(call_id)
        return _xml(_wait_twiml(call, n))
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/wait failed for call {call_id}:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


def _resume_twiml(call: AICall, session: Session) -> str:
    line = _phrase(call, "resume")
    _append_turn(call, "ai", line)
    _mark_ai_speaking(call, line)
    session.add(call)
    session.commit()
    live_ctx = vcs.store.get(call.id)
    if live_ctx is not None:
        with live_ctx.lock:
            live_ctx.mode = "ai"
            live_ctx.append_turn("ai", line)
            live_ctx.mark_ai_speaking(line, va.estimate_speech_seconds(line))
            live_ctx.touch(dirty=False)
    return _gather(call, audio=_speak_audio(call, line), text=line)


@router.post("/twilio/resume/{call_id}")
def twilio_resume(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        call, _ = _webhook_call(request, session, call_id, form)
        call.mode = "ai"
        _webhook_error_clear(call_id)
        return _xml(_resume_twiml(call, session))
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/resume failed for call {call_id}:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


@router.post("/twilio/dial-complete/{call_id}")
def twilio_dial_complete(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        call, form = _webhook_call(request, session, call_id, form)
        dial_status = form.get("DialCallStatus") or ""
        call.mode = "ai"
        if dial_status == "completed":
            _append_turn(call, "system", "Agent finished the conversation; AI resumed.")
            _webhook_error_clear(call_id)
            return _xml(_resume_twiml(call, session))
        _append_turn(call, "system", f"Agent unavailable ({dial_status or 'no answer'}).")
        _add_question(session, call, "Client requested to speak with a human agent", "question", "escalated",
                      reason=f"Live transfer failed: {dial_status or 'no answer'}")
        line = _phrase(call, "agent_unavailable")
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        _webhook_error_clear(call_id)
        return _xml(_gather(call, audio=_speak_audio(call, line), text=line))
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/dial-complete failed for call {call_id}:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


@router.post("/twilio/status/{call_id}")
def twilio_status(call_id: int, request: Request, background: BackgroundTasks,
                        form: dict = Depends(twilio_form)):
    try:
        token = request.query_params.get("t")
        status = form.get("CallStatus") or ""
        live_ctx = vcs.store.get_validated(call_id, token)

        # Fast non-blocking path for intermediate status callbacks (initiated/ringing/in-progress):
        # update in-memory state and queue background persistence with ZERO blocking DB queries.
        if live_ctx is not None and status and status not in TERMINAL_STATUSES:
            if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
                base = live_ctx.public_base or va.public_base()
                url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
                if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
                    return Response(status_code=204)
            with live_ctx.lock:
                if live_ctx.status not in TERMINAL_STATUSES and not (
                    live_ctx.status == "in-progress" and status in ("queued", "initiated", "ringing")
                ):
                    live_ctx.status = status
                    live_ctx.touch(dirty=True)
            vcs.persistence.enqueue(call_id)
            return Response(status_code=204)

        # Terminal status (or cold-restart miss): update memory if present and persist durably.
        with Session(engine) as session:
            call, form = _webhook_call(request, session, call_id, form)
            status = form.get("CallStatus") or call.status
            if status == "in-progress" and call.status == "completed":
                return Response(status_code=204)
            live_ctx = vcs.store.get(call.id)
            if status in TERMINAL_STATUSES:
                if live_ctx is not None:
                    with live_ctx.lock:
                        was_terminal = live_ctx.status in TERMINAL_STATUSES
                        live_ctx.status = status
                        live_ctx.ended_at = live_ctx.ended_at or va.utcnow()
                        if form.get("CallDuration") and str(form.get("CallDuration")).isdigit():
                            live_ctx.duration_seconds = int(form["CallDuration"])
                        live_ctx.pending_agent_message = None
                        if not was_terminal:
                            live_ctx.append_turn("system", f"Call ended ({status}).")
                if call.status not in TERMINAL_STATUSES:
                    _mark_ended(call, status, form.get("CallDuration"), background)
                elif not call.finalized_at:
                    # Already marked ended but the summary never ran (e.g. the server restarted before
                    # the background task could execute). Retry it now, idempotently, from this
                    # "completed" status callback so summary + Important Notes always get generated.
                    background.add_task(_finalize_call, call.id, call.tenant_id)
            else:
                call.status = status
                call.updated_at = va.utcnow()
                if live_ctx is not None:
                    with live_ctx.lock:
                        if not (live_ctx.status == "in-progress" and status in ("queued", "initiated", "ringing")):
                            live_ctx.status = status
                        live_ctx.touch(dirty=False)
            session.add(call)
            session.commit()
        return Response(status_code=204)
    except Exception:
        # Status callbacks never reach the caller; log and stay silent instead of erroring.
        print(f"[voice_agent] /twilio/status failed for call {call_id}:\n{traceback.format_exc()}")
        return Response(status_code=204)


@router.post("/twilio/dial/{call_id}")
def twilio_dial(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    """Phone takeover: announce the transfer, then bridge the client to the agent's phone."""
    try:
        call, _ = _webhook_call(request, session, call_id, form)
        lang = twilio_language(call.language, call.accent)
        line = _phrase(call, "connect_agent")
        _webhook_error_clear(call_id)
        return _xml(va.twiml_dial(call.agent_phone, caller_id=call.from_number, action_url=_hook_url(call, "dial-complete"),
                                  audio_url=_speak_audio(call, line, "agent"), text=line, language=lang))
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/dial failed for call {call_id}:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


@router.post("/twilio/hangup/{call_id}")
def twilio_hangup(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        _webhook_call(request, session, call_id, form)
        _webhook_error_clear(call_id)
        return _xml(va.twiml_hangup())
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/hangup failed for call {call_id}:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


@router.post("/twilio/recording/{call_id}")
def twilio_recording(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        call, form = _webhook_call(request, session, call_id, form)
        if form.get("RecordingUrl"):
            rec_url = form["RecordingUrl"] + ".mp3"
            call.recording_url = rec_url
            session.add(call)
            session.commit()
            live_ctx = vcs.store.get(call.id)
            if live_ctx is not None:
                with live_ctx.lock:
                    live_ctx.recording_url = rec_url
                    live_ctx.touch(dirty=False)
    except Exception:
        # Recording callbacks never reach the caller; log and continue.
        print(f"[voice_agent] /twilio/recording failed for call {call_id}:\n{traceback.format_exc()}")
    return Response(status_code=204)


def _finalize_call(call_id: int, tenant_id: Optional[int]) -> None:
    """Summarize the call into the AICall record and flag follow-ups.

    Flush barrier: guarantees every in-memory live transcript turn and background insight is
    durably committed to PostgreSQL BEFORE summarization, follow-up extraction, and conversation
    logging run — so no customer message, callback request, or meeting date is ever lost.

    Idempotent: the first caller claims the call by setting ``finalized_at`` with a conditional
    UPDATE, so the Twilio status webhook and the status-sync poll racing each other cannot
    summarize (or log) the same call twice.
    """
    # Ensure all buffered in-memory turns/insights are flushed to Postgres first.
    vcs.persistence.flush_sync(call_id, timeout=12.0)

    _set_tenant(tenant_id)
    # Apply known demo restriction flag if available so summarize_call avoids redundant DB guard reads.
    live_ctx = vcs.store.get(call_id)
    if live_ctx is not None:
        _set_call_demo_context_flag(live_ctx.tenant_id, live_ctx.demo_restricted)

    # Phase 1 (short-lived DB session): claim finalization idempotently and snapshot transcript.
    entity_name = ""
    to_number = ""
    call_status = "completed"
    call_created_at = None
    talk: List[dict] = []
    with Session(engine) as session:
        claimed = session.execute(
            update(AICall)
            .where(AICall.id == call_id, AICall.finalized_at.is_(None))
            .values(finalized_at=va.utcnow())
            .execution_options(synchronize_session=False)
        )
        session.commit()
        if not claimed.rowcount:
            return  # another worker already finalized this call (same Twilio call SID)
        call = session.get(AICall, call_id)
        if not call:
            return
        entity_name = call.entity_name or ""
        to_number = call.to_number or ""
        call_status = call.status or "completed"
        call_created_at = call.created_at
        talk = [t for t in (call.transcript or []) if t.get("role") in ("ai", "client", "agent")]

    # Phase 2 (NO DB connection held): run OpenAI call summarization cleanly off-connection.
    has_client = any(t.get("role") == "client" for t in talk)
    if has_client:
        result = va.summarize_call(talk, entity_name, call_created_at)
    else:
        result = {
            "summary": f"Call {call_status}; no conversation with the client.",
            "outcome": "no_conversation" if call_status == "completed" else call_status,
            "next_steps": "", "important_notes": "",
        }

    # Phase 3 (short-lived DB session): persist summary, outcome, follow-up metadata & lead link.
    with Session(engine) as session:
        call = session.get(AICall, call_id)
        if not call:
            return
        summary = (result.get("summary") or "").strip()
        # Plain hyphen prefix (never the mojibake em dash) and UTF-8-safe text.
        call.summary = (
            f"{AI_CALL_SUMMARY_PREFIX}{entity_name or to_number}: {summary}"
            if summary else f"{AI_CALL_SUMMARY_PREFIX}{entity_name or to_number}"
        )
        call.important_notes = result.get("important_notes") or None
        call.outcome = result.get("outcome")
        call.next_steps = result.get("next_steps") or None

        # If summarize_call resolved an explicit meeting/follow-up date from the conversation,
        # persist it directly onto the call (and apply_call_result will mark it on the lead).
        fu_date_str = (result.get("follow_up_date") or "").strip()
        if fu_date_str:
            try:
                from datetime import date as _date, datetime as _dt, timezone as _tz
                from modules import followup_ai as _fui
                parsed_d = _date.fromisoformat(fu_date_str)
                fu_time_str = (result.get("follow_up_time") or "").strip()
                hour, minute = 10, 0
                if fu_time_str and ":" in fu_time_str:
                    parts = fu_time_str.split(":", 1)
                    hour = max(0, min(23, int(parts[0])))
                    minute = max(0, min(59, int(parts[1])))
                local_tz = _fui._crm_tz(call.tenant_id)[0]
                due_utc = _dt(parsed_d.year, parsed_d.month, parsed_d.day, hour, minute, tzinfo=local_tz).astimezone(_tz.utc)
                call.follow_up_needed = True
                call.followup_needed = True
                call.follow_up_at = due_utc
                call.followup_date = due_utc.isoformat()
                call.follow_up_reason = (
                    call.important_notes
                    or (call.next_steps or "").strip()[:300]
                    or "Meeting / follow-up requested on AI call"
                )
            except Exception as _fu_err:
                print(f"[voice_agent] could not parse follow_up_date {fu_date_str!r} for call {call.id}: {_fu_err}")

        pending = session.exec(select(CallQuestion).where(
            CallQuestion.call_id == call.id, CallQuestion.status.in_(["open", "escalated"]))).all()
        starter = session.get(User, call.started_by) if call.started_by else None
        if not call.assigned_to:
            call.assigned_to = (starter.name or starter.email) if starter else None
        # An unresolved client question still needs a follow-up even if the summary
        # itself contains no promise, so pass that signal to the extractor.
        call.followup_needed = bool(call.followup_needed or pending or call.outcome in ("interested", "callback", "needs_follow_up", "meeting_booked"))

        # Normalize the transcript for the lead chat, attach the call to its lead and
        # write the follow-up state to both records. The helper also adds the Recent
        # Activity entry ("AI call - <summary first line>") exactly once.
        lead = session.get(Lead, call.lead_id) if call.lead_id else None
        lead_calls.apply_call_result(session, call, lead, force_follow_up=bool(pending))
        session.add(call)
        session.commit()

    # Persist the transcript as a lead/client conversation in its own session so a
    # summarization or follow-up-detection failure can never roll back the call record.
    from modules import conversation_store
    try:
        conv_result = conversation_store.save_call_conversation(call_id, tenant_id)
    except Exception as exc:
        print(f"[voice_agent] conversation save failed for call {call_id}: {exc}")
        vcs.store.remove(call_id)
        return  # the original AICall and transcript are already committed
    # The conversation analyser may resolve a more precise follow-up than the rules did;
    # keep the lead banner and call record aligned with that FollowUp.
    try:
        if conv_result.get("follow_up_id"):
            lead_calls.sync_follow_up_record(call_id, conv_result["follow_up_id"], tenant_id)
    except Exception as exc:  # pragma: no cover - never break finalization
        print(f"[voice_agent] follow-up sync failed for call {call_id}: {exc}")
    finally:
        # All turns, summary, conversation log, and follow-up are now durably saved in Postgres.
        vcs.store.remove(call_id)
