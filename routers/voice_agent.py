import asyncio
import os
import re
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime
from typing import List, NamedTuple, Optional
from urllib.parse import urlencode
from xml.sax.saxutils import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response
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
from modules import lead_calls
from modules.tts_service import (
    synthesize, delete_audio, tts_options, twilio_language, language_label, resolve_voice_locale, AUDIO_DIR,
    synthesize_cached, cached_audio, prewarm_cached, CALL_TTS_MODEL, CALL_TTS_TIMEOUT, FILLER_PHRASES,
)

router = APIRouter(prefix="/voice-agent", tags=["AI Voice Agent"])

# Boot diagnostic: Twilio fetches every webhook from this base, so a stale value
# (e.g. an old ngrok URL) is the #1 cause of "could not reach the TwiML server".
print(f"[voice_agent] Twilio will fetch TwiML from: "
      f"{va.twilio_config()['public_base'] or '(UNSET — set VOICE_AGENT_BASE_URL or PUBLIC_BASE_URL)'}",
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
    "connect_noted": "Thank you, I've noted your request. One of our sales representatives will get in touch with you shortly.",
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
    if (user.role or "").lower() not in allowed and (user.email or "").lower() != "admin@serphawk.com":
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


def _check_call_limit(session: Session, user: User) -> None:
    if user.role != "Demo" or not user.tenant_id:
        return
    tenant = session.get(Tenant, user.tenant_id)
    if not tenant or not tenant.is_trial:
        return
    if tenant.usage_calls >= tenant.limit_calls:
        raise HTTPException(status_code=403, detail={
            "error": "LIMIT_REACHED", "limit_type": "calls",
            "message": f"Trial limit reached. You can only make {tenant.limit_calls} calls."})
    tenant.usage_calls += 1
    session.add(tenant)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _public_audio(url_path: Optional[str]) -> Optional[str]:
    if not url_path:
        return None
    base = va.twilio_config()["public_base"]
    return f"{base}{url_path}" if base else None


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
    base = va.twilio_config()["public_base"]
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


def _entity_info(session: Session, etype: Optional[str], eid: Optional[int]) -> dict:
    info = {"name": None, "phone": None, "email": None, "context": "No CRM record linked."}
    if not etype or not eid:
        return info
    if etype == "client":
        cp = session.get(ClientProfile, eid)
        if cp:
            kws = ", ".join(cp.targetKeywords or [])
            info.update(
                name=cp.companyName or cp.projectName, phone=cp.phone,
                email=cp.user.email if getattr(cp, "user", None) else None,
                context="\n".join(filter(None, [
                    f"Company: {cp.companyName or cp.projectName}",
                    f"Contact person: {getattr(cp, 'contact_person', None)}" if getattr(cp, "contact_person", None) else None,
                    f"Website: {cp.websiteUrl}" if cp.websiteUrl else None,
                    f"Industry: {getattr(cp, 'industry', None)}" if getattr(cp, "industry", None) else None,
                    f"Services they offer/need: {cp.services_offered}" if cp.services_offered else None,
                    f"Target keywords: {kws}" if kws else None,
                    f"Existing client status: {cp.status}",
                ])))
    elif etype == "lead":
        ld = session.get(Lead, eid)
        if ld:
            info.update(name=ld.company_name, phone=ld.phone, email=ld.email, context="\n".join(filter(None, [
                f"Company: {ld.company_name}",
                f"Website: {ld.website}" if ld.website else None,
                f"Industry: {ld.industry}" if ld.industry else None,
                f"Lead status: {ld.status}",
                f"Notes: {(ld.notes or '')[:1500]}" if ld.notes else None,
            ])))
    elif etype == "contact":
        ct = session.get(Contact, eid)
        if ct:
            name = ct.full_name or " ".join(filter(None, [ct.first_name, ct.last_name]))
            company = None
            if ct.lead_id:
                ld = session.get(Lead, ct.lead_id)
                company = ld.company_name if ld else None
            elif ct.client_id:
                cp = session.get(ClientProfile, ct.client_id)
                company = (cp.companyName or cp.projectName) if cp else None
            info.update(name=name, phone=ct.mobile_number or ct.alternate_number, email=ct.email,
                        context="\n".join(filter(None, [
                            f"Person: {name}",
                            f"Role: {ct.designation}" if ct.designation else None,
                            f"Company: {company}" if company else None,
                            f"Notes: {(ct.notes or '')[:1500]}" if ct.notes else None,
                        ])))
    return info


def _knowledge_items(session: Session) -> List[dict]:
    items = [{"id": f"kb{k.id}", "kind": k.kind, "title": k.title, "answer": k.answer, "tags": k.tags or []}
             for k in session.exec(select(CallKnowledge).where(CallKnowledge.is_active == True)).all()]  # noqa: E712
    for p in session.exec(select(Product).where(Product.is_active == True).limit(40)).all():  # noqa: E712
        price = f" Price: {p.unit_price} {p.currency}." if p.unit_price else ""
        items.append({"id": f"product{p.id}", "kind": "product", "title": p.name,
                      "answer": f"{(p.description or '')[:600]}{price}", "tags": [p.category or ""]})
    for s in session.exec(select(Solution).where(Solution.is_published == True).limit(40)).all():  # noqa: E712
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
        "error": c.error, "turns": len(c.transcript or []), "call_log_id": c.call_log_id,
        "answered_at": _iso(c.answered_at), "ended_at": _iso(c.ended_at), "created_at": _iso(c.created_at),
        "is_active": c.status in ACTIVE_STATUSES,
        "stage": ctx.get("stage"), "doubts": ctx.get("doubts", []), "objections": ctx.get("objections", []),
        "adaptation": ctx.get("adaptation"), "pending_agent_message": c.pending_agent_message,
    }
    if full:
        data["transcript"] = c.transcript or []
        if session is not None:
            qs = session.exec(select(CallQuestion).where(CallQuestion.call_id == c.id)
                              .order_by(CallQuestion.created_at)).all()
            data["questions"] = [_question_dict(q) for q in qs]
    return data


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
    return _public_audio(rel)


def _cached_phrase_url(call: AICall, key: str) -> Optional[str]:
    """Public URL of a pre-generated fixed phrase (PHRASES[key]) in the call's own voice (or None)."""
    v = _call_voice(call)
    rel = cached_audio(_phrase(call, key), voice=v["voice"], accent=v["accent"], style=v["style"],
                       speed=v["speed"], language=v["language"], prefix="filler")
    return _public_audio(rel)


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


def _call_audio(call: AICall, text: str, prefix: str = "reply") -> SpokenAudio:
    """The one shared helper for all call audio (opening pitch, replies and fillers).

    It reads the voice saved on the call record, synthesizes in that voice with a hard timeout
    (no synchronous retry and no gTTS voice switch) and, when TTS times out or fails, returns the
    pre-generated filler clip in the SAME voice. It never returns a Twilio ``<Say>`` fallback."""
    v = _call_voice(call)
    t0 = time.monotonic()
    budget = _tts_budget()
    url = None
    try:
        future = _TTS_POOL.submit(
            synthesize_cached, text, voice=v["voice"], accent=v["accent"], style=v["style"],
            speed=v["speed"], language=v["language"], prefix=prefix, timeout=budget,
        )
        rel = future.result(timeout=budget + 0.5)[0]
        url = _public_audio(rel)
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
                    synthesize_cached, _filler_text(call), voice=v["voice"], accent=v["accent"],
                    style=v["style"], speed=v["speed"], language=v["language"], prefix="filler",
                    timeout=budget,
                ).result(timeout=budget + 0.5)[0]
                url = _public_audio(rel)
            except Exception as e:
                print(f"[voice-agent] filler TTS failed for call {call.id}: {e}")
    print(f"[voice-agent] audio call={call.id} voice={v['voice']} tts_ms={tts_ms} filler={filler} "
          f"line={(text or '')[:48]!r}", flush=True)
    return SpokenAudio(url=url, tts_ms=tts_ms, filler=filler, voice=v["voice"])


def _speak_audio(call: AICall, text: str, prefix: str = "reply") -> Optional[str]:
    """Backward-compatible wrapper around :func:`_call_audio` that returns just the audio URL."""
    return _call_audio(call, text, prefix).url


def _prewarm_call_clips(call: AICall) -> None:
    """Pre-generate this call's fixed lines (wait fillers, silence prompts, apology and goodbyes)
    in the call's own voice in the background, so no turn or error path ever waits on live TTS."""
    def _run() -> None:
        try:
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
            "default_agent_phone": user.phone}


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
        text = (f"Hi there! This is how I'll sound on your calls, calling from {va.COMPANY_NAME}. "
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
    _current_user(session)
    info = _entity_info(session, body.entity_type, body.entity_id)
    try:
        text = va.generate_pitch_text(info["context"], body.context, language_label(body.language))
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
    info = _entity_info(session, body.entity_type, body.entity_id)
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
    _current_user(session)
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
        pitch.entity_name = _entity_info(session, pitch.entity_type, pitch.entity_id)["name"]
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
    # because it cannot fetch TwiML from the configured public base URL — but never block
    # on a stale result: probe once more before refusing to dial.
    problem = va.voice_base_problem() or va.voice_base_problem(force=True)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    return ready


def _resolve_number(session: Session, etype: Optional[str], eid: Optional[int], to_number: Optional[str]):
    info = _entity_info(session, etype, eid)
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
          info: dict, to_number: str, agent_phone: Optional[str]) -> AICall:
    ready = _require_twilio()
    _check_call_limit(session, user)
    context = {"stage": "pitch", "doubts": [], "objections": [], "silence_count": 0}
    if pitch.language and pitch.language != "en":
        context["phrases"] = va.translate_phrases(PHRASES, language_label(pitch.language))
    # Attach the call to its lead now (explicit id, contact/client link or dialed number)
    # so the transcript can never end up as an orphan call.
    lead = lead_calls.resolve_lead(
        session, entity_type=etype, entity_id=eid, to_number=to_number,
        tenant_id=getattr(user, "tenant_id", None),
    )
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

    # Pre-generate this call's fixed filler lines in the background now, so if a live reply ever
    # times out we can play an apology in the SAME voice without a live TTS call.
    _prewarm_call_clips(call)

    try:
        resp = va.twilio_create_call(to_number, _hook_url(call, "answer"), _hook_url(call, "status"),
                                     _hook_url(call, "recording"))
        call.twilio_call_sid = resp.get("sid")
        call.status = resp.get("status") or "queued"
        _append_turn(call, "system", f"Dialing {to_number}...")
    except Exception as e:
        print(f"[voice-agent] Twilio call to {to_number} failed: {e}")
        call.status, call.error = "failed", str(e)
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
    _require_twilio()
    pitch = session.get(VoicePitch, body.pitch_id)
    if not pitch or not pitch.audio_url:
        raise HTTPException(status_code=404, detail="Pitch not found or has no generated speech")
    etype = body.entity_type or pitch.entity_type
    eid = body.entity_id if body.entity_type else pitch.entity_id
    info, number = _resolve_number(session, etype, eid, body.to_number)
    call = _dial(session, user, pitch, etype, eid, info, number, body.agent_phone)
    return {"ok": True, "call": _call_dict(call, full=True, session=session)}


@router.post("/quick-call")
def quick_call(body: QuickCallRequest, session: Session = Depends(get_session)):
    """One step: write the pitch in the chosen language, voice it with the chosen voice/accent, and call the prospect."""
    user = _current_user(session)
    _require_twilio()
    if body.entity_type not in ("client", "lead", "contact"):
        raise HTTPException(status_code=400, detail="entity_type must be client, lead or contact")
    info, number = _resolve_number(session, body.entity_type, body.entity_id, body.to_number)
    lang, acc, _ = resolve_voice_locale(body.language, body.accent)

    text = (body.pitch_text or "").strip()
    if not text:
        try:
            text = va.generate_pitch_text(info["context"], body.context, language_label(lang))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Pitch generation failed: {e}")
    pitch = VoicePitch(
        title=f"Pitch for {info['name'] or 'prospect'}", entity_type=body.entity_type, entity_id=body.entity_id,
        entity_name=info["name"], pitch_text=text, language=lang, voice=body.voice or "nova", accent=acc,
        style=body.style or "friendly", speed=1.0, created_by=user.id,
    )
    try:
        pitch.audio_url = _pitch_audio(pitch, session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {e}")
    session.add(pitch)
    session.commit()
    session.refresh(pitch)

    call = _dial(session, user, pitch, body.entity_type, body.entity_id, info, number, body.agent_phone)
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


def _sync_status(session: Session, call: AICall, background: BackgroundTasks) -> None:
    """Pull the live status from Twilio for active calls.

    Full ("paid") accounts normally receive StatusCallback events, but if one is ever lost (tunnel
    blip, busy worker, missed "completed") the call would sit on "ringing"/"in-progress" forever.
    We therefore poll Twilio as a safety net on every account type, slightly slower on paid accounts
    to avoid the extra round-trips while the callbacks are doing the work.
    """
    if call.status not in ACTIVE_STATUSES or not call.twilio_call_sid:
        return
    ctx = call.context or {}
    throttle = 5 if va.is_paid_account() else 3
    if time.time() - float(ctx.get("last_status_sync") or 0) < throttle:
        return
    _update_context(call, last_status_sync=time.time())
    try:
        data = va.twilio_fetch_call(call.twilio_call_sid)
    except Exception as e:
        print(f"[voice-agent] status sync failed for call {call.id}: {e}")
        session.add(call)
        session.commit()
        return
    status = data.get("status") or call.status
    if status in TERMINAL_STATUSES:
        _mark_ended(call, status, data.get("duration"), background)
    elif status != call.status and not (call.status == "in-progress" and status in ("queued", "ringing")):
        call.status = status
    session.add(call)
    session.commit()
    session.refresh(call)


@router.get("/calls")
def list_calls(background: BackgroundTasks, status: Optional[str] = None, limit: int = 100,
               session: Session = Depends(get_session)):
    _current_user(session)
    stmt = select(AICall).order_by(AICall.created_at.desc()).limit(min(limit, 500))
    if status == "active":
        stmt = stmt.where(AICall.status.in_(list(ACTIVE_STATUSES)))
    elif status:
        stmt = stmt.where(AICall.status == status)
    calls = session.exec(stmt).all()
    for c in calls:
        _sync_status(session, c, background)
    return {"calls": [_call_dict(c) for c in calls]}


@router.get("/calls/{call_id}")
def get_call(call_id: int, background: BackgroundTasks, session: Session = Depends(get_session)):
    _current_user(session)
    call = _get_call(session, call_id)
    _sync_status(session, call, background)
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
    if call.mode != "agent_typed":
        call.mode = "agent_typed"
        _append_turn(call, "system", f"{user.name or 'Agent'} took over the conversation (typed mode).")
    call.pending_agent_message = text
    session.add(call)
    session.commit()
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
    _current_user(session)
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
    if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
        base = va.twilio_config()["public_base"]
        url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    call = session.exec(select(AICall).where(AICall.id == call_id)
                        .execution_options(skip_tenant=True)).first()
    if not call or request.query_params.get("t") != call.webhook_token:
        raise HTTPException(status_code=404, detail="Unknown call")
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


def _twilio_answer_sync(call_id: int, request: Request, form: dict, start: float) -> Response:
    """Blocking body of /twilio/answer. Always run via asyncio.to_thread, never on the event loop."""
    def step(msg: str) -> None:
        print(f"[voice_agent] answer call={call_id} {msg} (t={time.monotonic() - start:.2f}s)", flush=True)

    step("entering handler thread")
    with Session(engine) as session:
        step("DB session opened")
        try:
            step("setting statement_timeout=3000ms, lock_timeout=3000ms")
            session.connection().exec_driver_sql("SET statement_timeout = 3000")
            session.connection().exec_driver_sql("SET lock_timeout = 3000")
            step("DB timeouts set")
        except Exception as e:
            step(f"could not set DB timeouts: {e}")

        if os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() == "true":
            step("validating Twilio signature")
            base = va.twilio_config()["public_base"]
            url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
            if not va.validate_twilio_signature(url, form, request.headers.get("X-Twilio-Signature")):
                step("signature INVALID -> 403")
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")
            step("signature OK")
        else:
            step("signature validation disabled; token check follows")

        step("DB read: AICall lookup")
        call = session.exec(select(AICall).where(AICall.id == call_id)
                            .execution_options(skip_tenant=True)).first()
        step(f"DB read: AICall lookup done (found={call is not None})")
        if not call or request.query_params.get("t") != call.webhook_token:
            raise HTTPException(status_code=404, detail="Unknown call")
        _set_tenant(call.tenant_id)
        form = form or {}

        step("DB write: status=in-progress (flush via add+commit later)")
        call.status, call.answered_at = "in-progress", call.answered_at or va.utcnow()

        step("DB read: VoicePitch lookup")
        pitch = session.get(VoicePitch, call.pitch_id) if call.pitch_id else None
        step(f"DB read: VoicePitch lookup done (found={pitch is not None})")
        pitch_text = pitch.pitch_text if pitch else _phrase(call, "default_opening").replace("{company}", va.COMPANY_NAME)
        lang = twilio_language(call.language, call.accent)
        step("pitch text + language resolved (no LLM call in this path)")

        # Normal path: only play the pitch audio that was generated BEFORE the call was dialed.
        # No TTS, no LLM, no network calls and no slow DB work here — Twilio times out slow webhooks.
        audio = None
        if pitch and pitch.audio_url:
            step(f"pitch audio_url={pitch.audio_url}; waiting up to 3.0s for the file on disk")
            deadline = time.monotonic() + 3.0
            exists = _audio_file_exists(pitch.audio_url)
            while not exists and time.monotonic() < deadline:
                time.sleep(0.25)
                exists = _audio_file_exists(pitch.audio_url)
            if exists:
                step("pitch audio file present -> using <Play>")
                audio = _public_audio(pitch.audio_url)
            else:
                # Never switch to Twilio's <Say> voice mid-call: apologise in the same selected
                # voice with the pre-generated filler clip, then keep listening.
                audio = _cached_filler_url(call)
                step(f"pitch audio file NOT on disk after 3s -> cached voice filler={audio}")
        step("pitch file lookup step finished")

        if (form.get("AnsweredBy") or "").startswith("machine"):
            step("voicemail detected; DB write transcript+commit")
            _append_turn(call, "system", "Voicemail detected; left the pitch as a message.")
            session.add(call)
            session.commit()
            step("returning voice-clip hangup TwiML")
            return _xml(va.twiml_say_hangup(audio or _cached_filler_url(call), None, lang))

        step("DB write: transcript append + commit")
        _append_turn(call, "ai", pitch_text, kind="pitch")
        _mark_ai_speaking(call, pitch_text)
        session.add(call)
        session.commit()
        step("DB write committed")
        step("building TwiML (gather)")
        twiml = _gather(call, audio=audio or _cached_filler_url(call))
        step("TwiML built")
        return _xml(twiml)


def _safe_voice_gather(call_id: int, request: Request) -> str:
    """Always-valid TwiML that keeps the conversation going without ever switching to Twilio's
    ``<Say>`` voice: play the cached filler clip in the call's selected voice (or stay silent when
    the call cannot be read), then listen again."""
    token = request.query_params.get("t") or ""
    try:
        base = va.twilio_config()["public_base"]
    except Exception:
        base = ""
    action = f"{base}/voice-agent/twilio/gather/{call_id}?t={token}"
    audio = None
    try:
        with Session(engine) as session:
            call = session.exec(select(AICall).where(AICall.id == call_id)
                                .execution_options(skip_tenant=True)).first()
            if call:
                _set_tenant(call.tenant_id)
                audio = _cached_filler_url(call)
    except Exception:
        audio = None
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
                  form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        start = time.monotonic()
        resp = _twilio_gather_impl(call_id, request, form, session)
        _webhook_error_clear(call_id)
        print(f"[voice_agent] /gather call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/gather failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


def _twilio_gather_impl(call_id: int, request: Request, form: dict, session: Session):
    start = time.monotonic()
    tt = _TurnTimer(call_id, "gather")
    call, form = _webhook_call(request, session, call_id, form)
    tt.mark("db_read")
    print(f"[voice_agent] /gather call {call_id} SpeechResult={form.get('SpeechResult')!r} Confidence={form.get('Confidence')!r}")
    speech = (form.get("SpeechResult") or "").strip()
    ctx = call.context or {}
    lang = twilio_language(call.language, call.accent)

    # â”€â”€ silence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if not speech:
        if call.mode == "agent_typed":
            return _xml(_wait_twiml(call, 0))
        silence = int(ctx.get("silence_count", 0)) + 1  # consecutive silences per CallSid, reset on speech
        _update_context(call, silence_count=silence)
        if va.is_paid_account():
            # Paid: on the 1st silence one gentle prompt (from 4+ varied phrases, never repeated
            # within the call); on the 2nd consecutive silence a short polite goodbye + hangup.
            if silence >= 2:
                line = _phrase(call, "goodbye_silence")
                spoken = _call_audio(call, line)
                _append_turn(call, "ai", line)
                session.add(call)
                session.commit()
                _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                          silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-goodbye")
                if spoken.filler:
                    # TTS failed: never hang up on a goodbye that didn't render — keep listening.
                    _mark_ai_speaking(call, line)
                    session.add(call)
                    session.commit()
                    return _xml(_gather(call, audio=spoken.url))
                return _xml(va.twiml_say_hangup(spoken.url, None, lang))
            line = _next_silence_prompt(call, ctx)
            spoken = _call_audio(call, line)
            _append_turn(call, "ai", line)
            _mark_ai_speaking(call, line)
            session.add(call)
            session.commit()
            _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                      silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-prompt")
            return _xml(_gather(call, audio=spoken.url))
        # Trial: unchanged behavior — "Are you still there?" / "Hello?" then goodbye on the 3rd silence.
        if silence >= 3:
            line = _phrase(call, "lost_connection")
            spoken = _call_audio(call, line)
            _append_turn(call, "ai", line)
            session.add(call)
            session.commit()
            _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                      silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence-lost")
            if spoken.filler:
                # TTS failed: never hang up on an apology — keep listening.
                _mark_ai_speaking(call, line)
                session.add(call)
                session.commit()
                return _xml(_gather(call, audio=spoken.url))
            return _xml(va.twiml_say_hangup(spoken.url, None, lang))
        line = _phrase(call, "still_there" if silence == 1 else "still_there_2")
        spoken = _call_audio(call, line)
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                  silence_count=silence, wait_ms=int((time.monotonic() - start) * 1000), tag="silence")
        return _xml(_gather(call, audio=spoken.url))

    # â”€â”€ interruption detection: client spoke before our last utterance could finish â”€â”€
    # Interruption detection + persisting the client turn run in the background reply thread
    # (see _record_client_turn), so this webhook performs no database writes.
    confidence = form.get("Confidence")

    # â”€â”€ agent typed mode: just record what the client said and keep listening â”€â”€
    if call.mode == "agent_typed":
        _append_turn(call, "client", speech, confidence=confidence)
        session.add(call)
        session.commit()
        return _xml(_wait_twiml(call, 0))

    # â”€â”€ AI mode: understand + respond â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # The client turn is stored and the reply generated entirely in the background thread, so no
    # slow DB work delays Twilio. The wait loop below picks the reply up as soon as it's ready;
    # until then a pre-rendered filler (in the call's own voice) covers the gap.
    tt.mark("speech_logic")
    paid = va.is_paid_account()
    v = _call_voice(call)
    # Both account types share the same varied hold pool; each line plays at most once per call.
    fillers = _filler_pool(call)
    filler_audio = [
        _public_audio(cached_audio(f, voice=v["voice"], accent=v["accent"], style=v["style"],
                                   speed=v["speed"], language=v["language"], prefix="filler"))
        for f in fillers
    ]
    seq = _begin_reply(call.id, call.webhook_token, language=lang, fillers=fillers,
                       filler_audio=filler_audio, voice=v["voice"])
    # Generate the reply right away (chat + TTS in a background thread).
    threading.Thread(
        target=_prepare_reply,
        args=(call.id, call.tenant_id, speech, confidence, seq),
        daemon=True,
    ).start()
    tt.mark("enqueue")
    # Paid accounts: wait up to ~2s here so reply-ready turns play with NO filler. Otherwise play
    # exactly ONE filler and redirect to the wait endpoint, which holds the request ~8s polling.
    # Trial accounts keep the legacy immediate-filler hold loop.
    remaining = max(0.0, (10.0 if paid else 8.0) - (time.monotonic() - start) - 0.5)
    ready = _wait_for_reply(call.id, seq, min((REPLY_FAST_WAIT_PAID if paid else REPLY_FAST_WAIT), remaining))
    tt.mark("wait_reply")
    if ready is not None:
        meta = ready.get("meta") or {}
        if ready["xml"]:
            _turn_log(call_id, voice=meta.get("voice") or v["voice"], tts_ms=meta.get("tts_ms", 0),
                      filler=meta.get("filler", False), wait_ms=int((time.monotonic() - start) * 1000),
                      tag="served-fast")
            tt.done(served="fast")
            return _xml(ready["xml"])
        # Generation failed: apologise in the same voice and listen again (same recovery as /reply).
        line = _phrase(call, "apology")
        spoken = _call_audio(call, line)
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        _turn_log(call_id, voice=spoken.voice, tts_ms=spoken.tts_ms, filler=spoken.filler,
                  wait_ms=int((time.monotonic() - start) * 1000), tag="fast-failed")
        return _xml(_gather(call, audio=spoken.url))
    _turn_log(call_id, voice=v["voice"], tts_ms=0, filler=True,
              wait_ms=int((time.monotonic() - start) * 1000), tag="holding")
    tt.done(served="filler")
    if paid:
        return _xml(_paid_filler_twiml(call.id, call.webhook_token, seq))
    return _xml(_hold_twiml(call.id, call.webhook_token, seq, 0))


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
# the 3s trial budget. Env-tunable; defaults follow the redesign spec.
REPLY_TTS_BUDGET = float(os.getenv("VOICE_AGENT_REPLY_TTS_SECONDS", str(CALL_TTS_TIMEOUT)))  # trial: 3s
REPLY_TTS_BUDGET_PAID = float(os.getenv("VOICE_AGENT_REPLY_TTS_SECONDS_PAID", "6"))            # paid: 6s
REPLY_FAST_WAIT_PAID = float(os.getenv("VOICE_AGENT_FAST_WAIT_SECONDS_PAID", "2"))             # ~2s for a no-filler reply
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
                 voice: Optional[str] = None) -> int:
    """Register the turn the background reply will publish. ``language``/``fillers`` and the
    pre-generated filler audio URLs ride along in memory so the hold loop can play a filler in the
    call's own voice without touching the DB (the /reply fast path must stay in-memory)."""
    with _PENDING_LOCK:
        seq = (_PENDING_REPLIES.get(call_id, {}).get("seq") or 0) + 1
        _PENDING_REPLIES[call_id] = {"seq": seq, "token": token, "xml": None, "done": False,
                                     "language": language, "voice": voice,
                                     "fillers": list(fillers or ["One moment please."]),
                                     "filler_audio": list(filler_audio or []),
                                     "meta": {}}
        return seq


def _finish_reply(call_id: int, seq: int, xml: Optional[str],
                  meta: Optional[dict] = None) -> None:
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        if entry and entry["seq"] == seq:
            entry.update(xml=xml, done=True, meta=meta or {})


def _wait_for_reply(call_id: int, seq: int, timeout: float) -> Optional[dict]:
    """Block up to ``timeout`` seconds for the background reply of this turn to finish."""
    deadline = time.time() + timeout
    while True:
        with _PENDING_LOCK:
            entry = _PENDING_REPLIES.get(call_id)
            if entry and entry["seq"] == seq and entry["done"]:
                _PENDING_REPLIES.pop(call_id, None)
                return entry
        if time.time() >= deadline:
            return None
        time.sleep(0.2)


def _hold_twiml(call_id: int, token: str, seq: int, n: int) -> str:
    """Hold the line while the reply is generated: play a pre-generated hold clip in the call's
    OWN voice (never Twilio's <Say> voice, which would change the voice mid-call) plus a short
    breath, then redirect back to poll. Each hold line is used at most once per call; once they are
    all spent the agent takes its own time (a silent beat) instead of repeating one."""
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id) or {}
    fillers = entry.get("fillers") or ["One moment please."]
    filler_audio = entry.get("filler_audio") or []
    picked = _pick_filler(call_id, fillers)
    audio = None
    if picked is not None:
        idx = next((i for i, f in enumerate(fillers) if f == picked), 0)
        audio = filler_audio[idx] if idx < len(filler_audio) else None
    # If the line has not been pre-warmed yet (or every line is spent), stay silent for a breath
    # rather than switching voice or repeating a phrase.
    filler = va.twiml_play(audio) if audio else f'<Pause length="{REPLY_HOLD_PAUSE or 1}"/>'
    base = va.twilio_config()["public_base"]
    url = f"{base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': n})}"
    pause = f'<Pause length="{REPLY_HOLD_PAUSE}"/>' if REPLY_HOLD_PAUSE and audio else ""
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response>{filler}{pause}'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _paid_filler_twiml(call_id: int, token: str, seq: int) -> str:
    """Paid accounts, first step of the wait flow: play EXACTLY ONE hold line for this turn (in the
    call's own voice, and never one this call has already used), then redirect to the wait endpoint
    which holds the request polling for the reply. Once every hold line has been used the agent
    stays quiet for a beat instead of repeating itself. Hold lines are never looped."""
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id) or {}
    pool = entry.get("fillers") or ["One moment please."]
    audios = entry.get("filler_audio") or []
    base = va.twilio_config()["public_base"]
    url = f"{base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': 0})}"
    picked = _pick_filler(call_id, pool)
    if picked is None:
        # Every hold line is already spent this call: take a quiet breath, then poll for the reply.
        return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="3"/>'
                f'<Redirect method="POST">{escape(url)}</Redirect></Response>')
    try:
        idx = next(i for i, f in enumerate(pool) if f == picked)
    except StopIteration:
        idx = 0
    audio = audios[idx] if idx < len(audios) else None
    filler = f'<Play>{escape(audio)}</Play>' if audio else f'<Pause length="3"/>'
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response>{filler}'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _paid_hold_twiml(call_id: int, token: str, seq: int, n: int) -> str:
    """Paid accounts, silent wait poll: no speech — just a 3s <Pause> then redirect back to the
    wait endpoint. Used at most ``REPLY_SILENT_POLLS_PAID`` times per turn (~30s total)."""
    base = va.twilio_config()["public_base"]
    url = f"{base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': n})}"
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="3"/>'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _record_client_turn(call: AICall, speech: str, confidence: Optional[str] = None) -> bool:
    """Persist the client's turn and the interruption bookkeeping (caller commits).

    Returns True when this utterance interrupted the AI's previous line. This runs in the
    background reply thread so the Twilio webhook itself performs no database writes.
    """
    ctx = call.context or {}
    elapsed = time.time() - float(ctx.get("last_ai_started") or 0)
    client_secs = va.estimate_speech_seconds(speech) + 1.5  # speech + end-of-speech timeout
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
    """Store the client's turn, decide the spoken reply and synthesize it (runs after the webhook
    returned). The reply is published to the wait loop BEFORE the turn is persisted, so Twilio gets
    the audio the moment TTS finishes; the rich analysis runs afterwards in yet another thread."""
    _set_tenant(tenant_id)
    xml = None
    meta = {}
    reply = ""
    human_requested = False
    t = _TurnTimer(call_id, "reply")
    try:
        with Session(engine) as session:
            call = session.exec(select(AICall).where(AICall.id == call_id)
                                .execution_options(skip_tenant=True)).first()
            t.mark("db_read")
            if not call:
                return
            _record_client_turn(call, speech, confidence)
            t.mark("record_client")
            xml, meta, reply = _build_reply(session, call, speech, t)
            human_requested = call.current_intent == "request_human"
            t.mark("build_reply_total")
            # Publish before committing: the waiting /reply webhook can play the line the instant
            # TTS finishes, without waiting on the persistence round-trip.
            _finish_reply(call_id, seq, xml, meta)
            t.mark("publish")
            session.commit()
            t.mark("db_commit")
    except Exception as e:
        print(f"[voice-agent] reply preparation failed for call {call_id}: {e}")
    finally:
        _finish_reply(call_id, seq, xml, meta)
        t.done(ok=bool(xml), filler=bool(meta.get("filler")), tts_ms=meta.get("tts_ms", 0))
    # Rich, non-spoken analysis (sentiment, doubts, questions, KB usage) — never blocks the reply.
    if not xml:
        return
    try:
        threading.Thread(target=_prepare_insights,
                         args=(call_id, tenant_id, speech, reply, human_requested), daemon=True).start()
    except Exception as e:
        print(f"[voice-agent] could not start insights for call {call_id}: {e}")


def _build_reply(session: Session, call: AICall, speech: str, timer: "Optional[_TurnTimer]" = None):
    """Produce ONLY the spoken line plus its TwiML (latency-critical path). No commit here — the
    caller persists after publishing. Returns ``(xml, meta, reply)``."""
    def _mark(name: str) -> None:
        if timer is not None:
            timer.mark(name)

    ctx = call.context or {}
    lang = twilio_language(call.language, call.accent)
    transcript = list(call.transcript or [])
    interrupted = bool(transcript[-1].get("interrupted_ai")) if transcript else False
    # The client's turn is the last one stored; keep it out of the history (passed as client_text).
    history = transcript[:-1] if transcript and transcript[-1].get("role") == "client" else transcript

    pitch = session.get(VoicePitch, call.pitch_id) if call.pitch_id else None
    info = _entity_info(session, call.entity_type, call.entity_id)
    knowledge = va.rank_knowledge(speech + " " + " ".join(ctx.get("doubts", [])[-3:]), _knowledge_items(session))
    _mark("db_reads")
    result = va.generate_reply_only(
        client_text=speech, transcript=history, pitch_text=pitch.pitch_text if pitch else "",
        entity_context=info["context"], knowledge=knowledge, state=ctx, interrupted=interrupted,
        agent_available=bool(call.agent_phone), language=language_label(call.language),
    )
    _mark("llm")
    reply = result["reply"]
    call.current_intent = result.get("intent")
    # The client asked to speak to a person / sales agent: acknowledge that the request is noted and
    # never announce a live transfer. The request is recorded as an escalated question (see
    # _prepare_insights) for the team to follow up. Use a fixed line (pre-warmed per call with the
    # "filler" prefix) so we never speak "transferring" and never wait on live TTS.
    audio_prefix = "reply"
    if result.get("intent") == "request_human":
        result["end_call"] = False
        reply = _phrase(call, "connect_noted")
        audio_prefix = "filler"
    spoken = _call_audio(call, reply, audio_prefix)
    _mark("tts")
    audio = spoken.url
    meta = {"voice": spoken.voice, "tts_ms": spoken.tts_ms, "filler": spoken.filler}
    _append_turn(call, "ai", reply)

    if result.get("end_call") and not spoken.filler:
        return va.twiml_say_hangup(audio, None, lang), meta, reply

    # If TTS failed and we could only play the apology filler, never hang up on it: keep listening.
    _mark_ai_speaking(call, reply)
    return _gather(call, audio=audio), meta, reply


def _prepare_insights(call_id: int, tenant_id: Optional[int], speech: str,
                      spoken_reply: str, human_requested: bool = False) -> None:
    """Rich analysis of the client's message: sentiment, interest, doubts, objections, questions and
    knowledge usage. Runs after the reply has been spoken, so it adds zero reply latency."""
    _set_tenant(tenant_id)
    t = _TurnTimer(call_id, "insights")
    try:
        with Session(engine) as session:
            call = session.exec(select(AICall).where(AICall.id == call_id)
                                .execution_options(skip_tenant=True)).first()
            t.mark("db_read")
            if not call:
                return
            ctx = call.context or {}
            transcript = list(call.transcript or [])
            # Drop the AI reply we already spoke and the client turn (passed as client_text).
            if transcript and transcript[-1].get("role") in ("ai", "agent"):
                transcript = transcript[:-1]
            if transcript and transcript[-1].get("role") == "client":
                transcript = transcript[:-1]
            pitch = session.get(VoicePitch, call.pitch_id) if call.pitch_id else None
            info = _entity_info(session, call.entity_type, call.entity_id)
            knowledge = va.rank_knowledge(speech + " " + " ".join(ctx.get("doubts", [])[-3:]), _knowledge_items(session))
            t.mark("db_reads")
            result = va.analyze_and_respond(
                client_text=speech, transcript=transcript, pitch_text=pitch.pitch_text if pitch else "",
                entity_context=info["context"], knowledge=knowledge, state=ctx, interrupted=False,
                agent_available=bool(call.agent_phone), language=language_label(call.language),
            )
            t.mark("llm")
            # Re-read just before writing so a turn that started meanwhile is not clobbered.
            # populate_existing() forces the identity-mapped instance to take fresh DB values.
            fresh = session.exec(select(AICall).where(AICall.id == call_id)
                                 .execution_options(skip_tenant=True, populate_existing=True)).first()
            if fresh is not None:
                call = fresh
                ctx = call.context or {}
            t.mark("db_reread")
            doubts = [d for d in result.get("doubts") or [] if isinstance(d, str) and d.strip()]
            objections = list(ctx.get("objections", []))
            obj = result.get("objection") if isinstance(result.get("objection"), dict) else None
            answer = spoken_reply or result.get("reply")
            if obj and obj.get("text"):
                objections.append(f"{obj.get('type', 'other')}: {obj['text']}")
                _add_question(session, call, obj["text"], "objection", "answered", ai_answer=answer)
            for d in doubts:
                _add_question(session, call, d, "doubt", "answered", ai_answer=answer)
            unanswered = (result.get("unanswered_question") or "").strip()
            for q in result.get("questions") or []:
                if isinstance(q, dict) and q.get("question") and q.get("answered") and q["question"] != unanswered:
                    _add_question(session, call, q["question"], "question", "answered",
                                  ai_answer=q.get("answer") or answer)
            if result.get("escalate") or human_requested:
                reason = result.get("escalate_reason") or ("Client asked for a sales representative"
                                                          if human_requested else "Escalated by AI")
                _add_question(session, call, unanswered or speech, "question", "escalated", ai_answer=answer,
                              reason=reason)
            elif unanswered:
                _add_question(session, call, unanswered, "question", "open", ai_answer=answer,
                              reason="AI could not answer from the knowledge base")

            # usage tracking for knowledge entries the model relied on
            used = {str(u) for u in result.get("knowledge_used") or []}
            for item in knowledge:
                if item["id"].startswith("kb") and (item["id"] in used or item["title"] in used):
                    kb = session.get(CallKnowledge, int(item["id"][2:]))
                    if kb:
                        kb.usage_count += 1
                        session.add(kb)

            # annotate the client's turn (shown in the live transcript) with the analysis
            turns = list(call.transcript or [])
            for turn in reversed(turns):
                if turn.get("role") == "client":
                    turn["intent"] = result.get("intent")
                    turn["sentiment"] = result.get("sentiment")
                    break
            call.transcript = turns
            flag_modified(call, "transcript")

            call.sentiment = result.get("sentiment")
            if result.get("interest_score") is not None:
                call.interest_score = result["interest_score"]
            _update_context(
                call, stage=result.get("stage") or ctx.get("stage"),
                doubts=(ctx.get("doubts", []) + doubts)[-20:], objections=objections[-20:],
                adaptation=result.get("adaptation") or ctx.get("adaptation"),
            )
            session.add(call)
            session.commit()
            t.mark("db_commit")
    except Exception as e:
        print(f"[voice-agent] insights preparation failed for call {call_id}: {e}")
    finally:
        t.done()


@router.post("/twilio/reply/{call_id}")
def twilio_reply(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        start = time.monotonic()
        resp = _twilio_reply_impl(call_id, request, form, session)
        _webhook_error_clear(call_id)
        print(f"[voice_agent] /reply call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/reply failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        return _webhook_error_twiml(call_id, request)


def _twilio_reply_impl(call_id: int, request: Request, form: dict, session: Session):
    start = time.monotonic()
    """Hold loop: play the prepared reply as soon as it's ready.

    Paid ("Full") accounts: the first call holds the request up to ~8s polling for the reply and
    returns it the moment it's ready; otherwise it returns a silent <Pause length=\"3\"/> plus a
    <Redirect> for the next poll (up to ``REPLY_SILENT_POLLS_PAID`` silent polls ≈ 30s), then ONE
    apology clip + <Gather>. Trial accounts keep the legacy quick-filler redirect loop.
    The hold/ready paths are answered from memory (no DB) so they stay fast even when the server is busy."""
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
                # Silent polling budget used up and the reply still isn't ready: ONE apology clip
                # (pre-generated in the call's voice) then go back to listening. Never loop fillers.
                with _PENDING_LOCK:
                    _PENDING_REPLIES.pop(call_id, None)
                call, _ = _webhook_call(request, session, call_id, form)
                line = _phrase(call, "apology")
                spoken = _call_audio(call, line)
                _append_turn(call, "ai", line)
                _mark_ai_speaking(call, line)
                session.add(call)
                session.commit()
                _log(spoken.voice, spoken.tts_ms, spoken.filler, f"apology polls={n}", silent=n)
                return _xml(_gather(call, audio=spoken.url))
            # Hold this request up to ~8s polling for the reply; return it as soon as it's ready.
            ready = _wait_for_reply(call_id, seq, REPLY_HOLD_SECONDS_PAID)
            if ready and ready.get("xml"):
                m = ready.get("meta") or {}
                _log(m.get("voice") or ready.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
                     f"served-wait polls={n}", silent=n)
                return _xml(ready["xml"])
            _log("?", 0, False, f"silent-poll polls={n}", silent=n)
            return _xml(_paid_hold_twiml(call_id, token, seq, n + 1))
        # Reply entry was lost (e.g. server restart mid-turn): recover in the call's own voice.
        call, _ = _webhook_call(request, session, call_id, form)
        if call.mode == "agent_typed":
            return _xml(_wait_twiml(call, 0))
        line = _phrase(call, "apology")
        spoken = _call_audio(call, line)
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        _log(spoken.voice, spoken.tts_ms, spoken.filler, "failed-paid", silent=n)
        return _xml(_gather(call, audio=spoken.url))

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

    call, _ = _webhook_call(request, session, call_id, form)
    if current and not current["done"] and n < REPLY_POLL_MAX:
        _log(current.get("voice"), 0, True, f"hold redirects={n + 1}")
        return _xml(_hold_twiml(call_id, token, seq, n + 1))
    if current and current["done"] and current["xml"]:
        m = current.get("meta") or {}
        _log(m.get("voice") or current.get("voice"), m.get("tts_ms", 0), m.get("filler", False),
             f"served redirects={n}")
        return _xml(current["xml"])
    if current and not current["done"]:
        # Polling cap reached and the AI reply is still not ready: stop looping (trial
        # accounts kill calls over the redirect limit), speak a short filler line and
        # go straight back to listening so the call keeps going.
        line = _phrase(call, "one_moment")
        spoken = _call_audio(call, line)
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        _log(spoken.voice, spoken.tts_ms, spoken.filler, f"capped redirects={n}")
        return _xml(_gather(call, audio=spoken.url))
    if call.mode == "agent_typed":
        return _xml(_wait_twiml(call, 0))
    # failed, timed out, or lost (e.g. server restart): apologise in the same voice and keep listening
    line = _phrase(call, "retry")
    spoken = _call_audio(call, line)
    _append_turn(call, "ai", line)
    _mark_ai_speaking(call, line)
    session.add(call)
    session.commit()
    _log(spoken.voice, spoken.tts_ms, spoken.filler, "failed")
    return _xml(_gather(call, audio=spoken.url))


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
                        form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        call, form = _webhook_call(request, session, call_id, form)
        status = form.get("CallStatus") or call.status
        if status == "in-progress" and call.status == "completed":
            return Response(status_code=204)
        if status in TERMINAL_STATUSES:
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
            call.recording_url = form["RecordingUrl"] + ".mp3"
            session.add(call)
            session.commit()
    except Exception:
        # Recording callbacks never reach the caller; log and continue.
        print(f"[voice_agent] /twilio/recording failed for call {call_id}:\n{traceback.format_exc()}")
    return Response(status_code=204)


def _finalize_call(call_id: int, tenant_id: Optional[int]) -> None:
    """Summarize the call into the AICall record and flag follow-ups.

    Idempotent: the first caller claims the call by setting ``finalized_at`` with a conditional
    UPDATE, so the Twilio status webhook and the status-sync poll racing each other cannot
    summarize (or log) the same call twice. AI calls no longer create a row in the normal
    call log — the AICall record *is* the call record.
    """
    _set_tenant(tenant_id)
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
        talk = [t for t in (call.transcript or []) if t.get("role") in ("ai", "client", "agent")]
        has_client = any(t.get("role") == "client" for t in talk)
        if has_client:
            result = va.summarize_call(talk, call.entity_name or "", call.created_at)
        else:
            result = {
                "summary": f"Call {call.status}; no conversation with the client.",
                "outcome": "no_conversation" if call.status == "completed" else call.status,
                "next_steps": "", "important_notes": "",
            }

        summary = (result.get("summary") or "").strip()
        # Plain hyphen prefix (never the mojibake em dash) and UTF-8-safe text.
        call.summary = (
            f"{AI_CALL_SUMMARY_PREFIX}{call.entity_name or call.to_number}: {summary}"
            if summary else f"{AI_CALL_SUMMARY_PREFIX}{call.entity_name or call.to_number}"
        )
        call.important_notes = result.get("important_notes") or None
        call.outcome = result.get("outcome")
        call.next_steps = result.get("next_steps") or None

        pending = session.exec(select(CallQuestion).where(
            CallQuestion.call_id == call.id, CallQuestion.status.in_(["open", "escalated"]))).all()
        starter = session.get(User, call.started_by) if call.started_by else None
        if not call.assigned_to:
            call.assigned_to = (starter.name or starter.email) if starter else None
        # An unresolved client question still needs a follow-up even if the summary
        # itself contains no promise, so pass that signal to the extractor.
        call.followup_needed = bool(pending) or call.outcome in ("interested", "callback", "needs_follow_up")

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
        result = conversation_store.save_call_conversation(call_id, tenant_id)
    except Exception as exc:
        print(f"[voice_agent] conversation save failed for call {call_id}: {exc}")
        return  # the original AICall and transcript are already committed
    # The conversation analyser may resolve a more precise follow-up than the rules did;
    # keep the lead banner and call record aligned with that FollowUp.
    try:
        if result.get("follow_up_id"):
            lead_calls.sync_follow_up_record(call_id, result["follow_up_id"], tenant_id)
    except Exception as exc:  # pragma: no cover - never break finalization
        print(f"[voice_agent] follow-up sync failed for call {call_id}: {exc}")
