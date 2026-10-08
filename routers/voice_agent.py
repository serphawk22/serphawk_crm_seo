"""
AI Voice Agent router.

- Pitch studio: write a pitch (AI or manual), convert it to speech with a chosen
  voice / accent / style, preview, edit and regenerate.
- Outbound calls via Twilio Voice: the generated pitch is played, then the AI
  listens (speech recognition), understands intent, answers questions, handles
  objections and interruptions, and adapts the pitch. An agent can take over
  (typed messages spoken in the AI voice, or a live phone bridge) and hand back.
- Unanswered / escalated questions are stored for follow-up; resolved answers
  can be promoted to the knowledge base the AI uses on future calls.

Twilio webhooks are unauthenticated, so each call carries a random token in its
webhook URLs (and optional signature validation via TWILIO_VALIDATE_WEBHOOKS).
"""
import asyncio
import os
import re
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime
from typing import List, Optional
from urllib.parse import urlencode
from xml.sax.saxutils import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select

from database import (
    engine, User, Tenant, ClientProfile, Lead, Contact, Product, Solution, CallLog, ActivityLog,
    VoicePitch, AICall, CallQuestion, CallKnowledge,
)
from modules.api_tracker import current_salesperson_id
from modules import voice_agent as va
from modules.tts_service import (
    synthesize, delete_audio, tts_options, twilio_language, language_label, resolve_voice_locale, AUDIO_DIR,
)

router = APIRouter(prefix="/voice-agent", tags=["AI Voice Agent"])

ALLOWED_ROLES = {"Admin", "SalesManager", "Employee", "Demo", "SuperAdmin"}
ACTIVE_STATUSES = {"queued", "initiated", "ringing", "in-progress"}
TERMINAL_STATUSES = {"completed", "busy", "failed", "no-answer", "canceled"}
MAX_WAIT_LOOPS = 200  # ~10 minutes of agent typed-mode listening

# Fixed lines the agent speaks; translated once per call into the call language (stored in call.context).
PHRASES = {
    "still_there": "Are you still there?",
    "still_there_2": "Hello? I can call back at a better time if that's easier.",
    "lost_connection": "It seems we've lost the connection. I'll follow up another time. Thanks, and have a great day!",
    "connect_agent": "Let me connect you with my colleague right now, one moment please.",
    "agent_unavailable": "I'm sorry, my colleague isn't available right this moment. I've noted your request and they'll call you back shortly. Is there anything I can help with in the meantime?",
    "resume": "Thanks for bearing with me. Is there anything else I can help you with?",
    "wait_timeout": "Thanks for your patience. We'll follow up with you shortly. Goodbye!",
    "one_moment": "One moment please.",
    "default_opening": "Hi, this is a call from {company}. Do you have a minute?",
}


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
        "entity_name": c.entity_name, "to_number": c.to_number, "from_number": c.from_number,
        "status": c.status, "mode": c.mode, "language": c.language, "voice": c.voice, "accent": c.accent, "style": c.style,
        "agent_phone": c.agent_phone, "current_intent": c.current_intent, "sentiment": c.sentiment,
        "interest_score": c.interest_score, "summary": c.summary, "outcome": c.outcome,
        "next_steps": c.next_steps, "recording_url": c.recording_url, "duration_seconds": c.duration_seconds,
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
# Live replies use a fast TTS model with a hard time budget so the client isn't left in silence.
REPLY_TTS_MODEL = os.getenv("VOICE_AGENT_REPLY_TTS_MODEL", "tts-1")
REPLY_TTS_BUDGET = float(os.getenv("VOICE_AGENT_REPLY_TTS_SECONDS", "3"))


def _speak_audio(call: AICall, text: str, prefix: str = "reply") -> Optional[str]:
    """Synthesize in the call's voice (voice/accent/style/speed stored on the call record when it
    was created — the single source of truth for the whole call); returns a public URL or None
    (caller falls back to <Say>). Never switches to a different voice on failure: it retries once
    with the same voice/model and only then gives up."""
    def _run() -> str:
        try:
            return synthesize(text, call.voice, call.accent, call.style, speed=call.speed or 1.0,
                              prefix=prefix, language=call.language, model=REPLY_TTS_MODEL,
                              fallback_gtts=False)
        except Exception:
            time.sleep(0.3)  # transient OpenAI hiccup: retry once, still in the call's voice
            return synthesize(text, call.voice, call.accent, call.style, speed=call.speed or 1.0,
                              prefix=prefix, language=call.language, model=REPLY_TTS_MODEL,
                              fallback_gtts=False)

    future = _TTS_POOL.submit(_run)
    try:
        return _public_audio(future.result(timeout=REPLY_TTS_BUDGET))
    except FuturesTimeout:
        print(f"[voice-agent] TTS over {REPLY_TTS_BUDGET}s for call {call.id}; using Twilio <Say>")
        return None
    except Exception as e:
        print(f"[voice-agent] TTS failed for call {call.id}: {e}")
        return None


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
    return synthesize(pitch.pitch_text, pitch.voice, pitch.accent, pitch.style, pitch.speed,
                      language=pitch.language, model=REPLY_TTS_MODEL)


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
def get_options(session: Session = Depends(get_session)):
    user = _current_user(session)
    return {**tts_options(), "twilio": va.twilio_ready(), "default_agent_phone": user.phone}


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
    call = AICall(
        pitch_id=pitch.id, entity_type=etype, entity_id=eid, entity_name=info["name"] or pitch.entity_name,
        to_number=to_number, from_number=ready["from_number"], voice=pitch.voice, accent=pitch.accent, language=pitch.language,
        style=pitch.style, speed=pitch.speed,
        agent_phone=(lambda n: n if va.is_e164(n) else None)(va.normalize_phone(agent_phone or user.phone or "")),
        started_by=user.id, context=context, transcript=[],
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        resp = va.twilio_create_call(to_number, _hook_url(call, "answer"), _hook_url(call, "status"),
                                     _hook_url(call, "recording"))
        call.twilio_call_sid = resp.get("sid")
        call.status = resp.get("status") or "queued"
        _append_turn(call, "system", f"Dialing {to_number}â€¦")
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
    _append_turn(call, "system", f"Call ended ({status}).")
    background.add_task(_finalize_call, call.id, call.tenant_id)


def _sync_status(session: Session, call: AICall, background: BackgroundTasks) -> None:
    """Pull the live status from Twilio (needed when status callbacks aren't available, e.g. trial accounts)."""
    if call.status not in ACTIVE_STATUSES or not call.twilio_call_sid:
        return
    ctx = call.context or {}
    if time.time() - float(ctx.get("last_status_sync") or 0) < 3:
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
                step("pitch audio file NOT on disk after 3s -> falling back to <Say> with pitch text")
        step("pitch file lookup step finished")

        if (form.get("AnsweredBy") or "").startswith("machine"):
            step("voicemail detected; DB write transcript+commit")
            _append_turn(call, "system", "Voicemail detected; left the pitch as a message.")
            session.add(call)
            session.commit()
            step("returning <Say> hangup TwiML")
            return _xml(va.twiml_say_hangup(audio, pitch_text, lang))

        step("DB write: transcript append + commit")
        _append_turn(call, "ai", pitch_text, kind="pitch")
        _mark_ai_speaking(call, pitch_text)
        session.add(call)
        session.commit()
        step("DB write committed")
        step("building TwiML (gather)")
        twiml = _gather(call, audio=audio, text=None if audio else pitch_text)
        step("TwiML built")
        return _xml(twiml)


def _answer_safe_fallback(call_id: int, request: Request, text: Optional[str] = None) -> Response:
    """Always-valid TwiML: <Say> followed by <Gather>, so Twilio never sees a hang/500."""
    line = text or "Sorry, I had trouble getting ready. Could you tell me a bit about your business?"
    try:
        token = request.query_params.get("t") or ""
        base = va.twilio_config()["public_base"]
        action = f"{base}/voice-agent/twilio/gather/{call_id}?t={token}"
        return _xml(va.twiml_gather(action, text=line))
    except Exception:
        try:
            return _xml(f'<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="" method="POST"><Say>{escape(line)}</Say></Gather></Response>')
        except Exception:
            return Response(
                content='<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, could you say that again?</Say><Gather/></Response>',
                media_type="application/xml")


@router.post("/twilio/answer/{call_id}")
async def twilio_answer(call_id: int, request: Request, form: dict = Depends(twilio_form)):
    start = time.monotonic()
    print(f"[voice_agent] answer call={call_id} received (t=0.00s)", flush=True)
    try:
        work = asyncio.to_thread(_twilio_answer_sync, call_id, request, form, start)
        resp = await asyncio.wait_for(work, timeout=10.0)
        print(f"[voice_agent] answer call={call_id} completed (t={time.monotonic() - start:.2f}s)", flush=True)
        return resp
    except asyncio.TimeoutError:
        print(f"[voice_agent] answer call={call_id} TIMEOUT after 10s — returning <Say>+<Gather> fallback (t={time.monotonic() - start:.2f}s)", flush=True)
        return _answer_safe_fallback(call_id, request, "Sorry, that took too long. May I ask what best describes your business?")
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] answer call={call_id} failed after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}", flush=True)
        try:
            return _answer_safe_fallback(call_id, request, "Sorry, we ran into a problem. Could you say that again?")
        except Exception:
            return Response(
                content='<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we ran into a problem. Goodbye.</Say><Hangup/></Response>',
                media_type="application/xml")



@router.post("/twilio/gather/{call_id}")
def twilio_gather(call_id: int, request: Request,
                  form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        start = time.monotonic()
        resp = _twilio_gather_impl(call_id, request, form, session)
        print(f"[voice_agent] /gather call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/gather failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        token = request.query_params.get("t")
        if token:
            try:
                action = f"{va.twilio_config()['public_base']}/voice-agent/twilio/gather/{call_id}?t={token}"
                return _xml(va.twiml_gather(action, text="Sorry, could you say that again?"))
            except Exception:
                print(f"[voice_agent] /twilio/gather recovery failed:\n{traceback.format_exc()}")
        return _xml(va.twiml_say_hangup(None, "Sorry, we ran into a problem. Goodbye."))


def _twilio_gather_impl(call_id: int, request: Request, form: dict, session: Session):
    start = time.monotonic()
    call, form = _webhook_call(request, session, call_id, form)
    print(f"[voice_agent] /gather call {call_id} SpeechResult={form.get('SpeechResult')!r} Confidence={form.get('Confidence')!r}")
    speech = (form.get("SpeechResult") or "").strip()
    ctx = call.context or {}
    lang = twilio_language(call.language, call.accent)

    # â”€â”€ silence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if not speech:
        if call.mode == "agent_typed":
            return _xml(_wait_twiml(call, 0))
        silence = int(ctx.get("silence_count", 0)) + 1
        _update_context(call, silence_count=silence)
        if silence >= 3:
            line = _phrase(call, "lost_connection")
            _append_turn(call, "ai", line)
            session.add(call)
            session.commit()
            return _xml(va.twiml_say_hangup(_speak_audio(call, line), line, lang))
        line = _phrase(call, "still_there" if silence == 1 else "still_there_2")
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        return _xml(_gather(call, audio=_speak_audio(call, line), text=line))

    # â”€â”€ interruption detection: client spoke before our last utterance could finish â”€â”€
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

    # â”€â”€ agent typed mode: just record what the client said and keep listening â”€â”€
    if call.mode == "agent_typed":
        _append_turn(call, "client", speech, confidence=form.get("Confidence"))
        session.add(call)
        session.commit()
        return _xml(_wait_twiml(call, 0))

    # â”€â”€ AI mode: understand + respond â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Record what the client said right away, then think in the background. Twilio drops webhooks that
    # take longer than ~15s (LLM + speech synthesis can exceed that), so we answer immediately with a
    # short hold loop that picks up the reply as soon as it's ready.
    _append_turn(call, "client", speech, interrupted_ai=interrupted, confidence=form.get("Confidence"))
    session.add(call)
    session.commit()
    seq = _begin_reply(call.id, call.webhook_token)
    # Generate the reply right away (chat + TTS in a background thread). If it finishes
    # within ~6-8s we hand Twilio the <Play> directly and skip the redirect polling loop.
    threading.Thread(
        target=_prepare_reply,
        args=(call.id, call.tenant_id, speech, interrupted, seq),
        daemon=True,
    ).start()
    # Hard deadline: never let the webhook take longer than ~8s. Wait only for the
    # reply for whatever time is left, then fall back to the polling path.
    remaining = max(0.0, 8.0 - (time.monotonic() - start) - 0.5)
    ready = _wait_for_reply(call.id, seq, min(REPLY_FAST_WAIT, remaining))
    if ready is not None:
        if ready["xml"]:
            print(f"[voice_agent] call {call.id} turn {seq} redirects=0")
            return _xml(ready["xml"])
        # Generation failed: apologise and listen again (same recovery as the reply loop).
        line = "Sorry, could you say that once more?"
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        print(f"[voice_agent] call {call.id} turn {seq} redirects=0")
        return _xml(_gather(call, audio=_speak_audio(call, line), text=line))
    print(f"[voice_agent] call {call.id} turn {seq} redirects=0 (holding)")
    return _xml(_hold_twiml(call.id, call.webhook_token, seq, 0))


# ── Background reply preparation (keeps every Twilio webhook fast) ──────────────
REPLY_POLL_MAX = 4  # trial-account safety: at most ~4 hold redirects per turn (~16s with 4s pauses)
REPLY_FAST_WAIT = float(os.getenv("VOICE_AGENT_FAST_WAIT_SECONDS", "4"))  # wait in /gather before polling (kept low so the webhook stays under ~8s)
REPLY_HOLD_PAUSE = int(os.getenv("VOICE_AGENT_HOLD_PAUSE_SECONDS", "4"))   # silence before each polling redirect
_PENDING_REPLIES: dict = {}  # call_id -> {"seq": int, "token": str, "xml": Optional[str], "done": bool}
_PENDING_LOCK = threading.Lock()


def _begin_reply(call_id: int, token: str) -> int:
    with _PENDING_LOCK:
        seq = (_PENDING_REPLIES.get(call_id, {}).get("seq") or 0) + 1
        _PENDING_REPLIES[call_id] = {"seq": seq, "token": token, "xml": None, "done": False}
        return seq


def _finish_reply(call_id: int, seq: int, xml: Optional[str]) -> None:
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        if entry and entry["seq"] == seq:
            entry.update(xml=xml, done=True)


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
    base = va.twilio_config()["public_base"]
    url = f"{base}/voice-agent/twilio/reply/{call_id}?{urlencode({'t': token, 's': seq, 'n': n})}"
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="{REPLY_HOLD_PAUSE}"/>'
            f'<Redirect method="POST">{escape(url)}</Redirect></Response>')


def _prepare_reply(call_id: int, tenant_id: Optional[int], speech: str, interrupted: bool, seq: int) -> None:
    """Understand the client's words, decide the reply and synthesize it (runs after the webhook returned)."""
    _set_tenant(tenant_id)
    xml = None
    try:
        with Session(engine) as session:
            call = session.exec(select(AICall).where(AICall.id == call_id)
                                .execution_options(skip_tenant=True)).first()
            if not call:
                return
            xml = _build_reply(session, call, speech, interrupted)
    except Exception as e:
        print(f"[voice-agent] reply preparation failed for call {call_id}: {e}")
    finally:
        _finish_reply(call_id, seq, xml)


def _build_reply(session: Session, call: AICall, speech: str, interrupted: bool) -> str:
    ctx = call.context or {}
    lang = twilio_language(call.language, call.accent)
    transcript = list(call.transcript or [])
    # The client's turn was already stored; keep it out of the history (it's passed as client_text).
    history = transcript[:-1] if transcript and transcript[-1].get("role") == "client" else transcript

    pitch = session.get(VoicePitch, call.pitch_id) if call.pitch_id else None
    info = _entity_info(session, call.entity_type, call.entity_id)
    knowledge = va.rank_knowledge(speech + " " + " ".join(ctx.get("doubts", [])[-3:]), _knowledge_items(session))
    result = va.analyze_and_respond(
        client_text=speech, transcript=history, pitch_text=pitch.pitch_text if pitch else "",
        entity_context=info["context"], knowledge=knowledge, state=ctx, interrupted=interrupted,
        agent_available=bool(call.agent_phone), language=language_label(call.language),
    )
    reply = result["reply"]
    for turn in reversed(transcript):
        if turn.get("role") == "client":
            turn.update(intent=result.get("intent"), sentiment=result.get("sentiment"))
            break
    call.transcript = transcript
    flag_modified(call, "transcript")

    doubts = [d for d in result.get("doubts") or [] if isinstance(d, str) and d.strip()]
    objections = list(ctx.get("objections", []))
    obj = result.get("objection") if isinstance(result.get("objection"), dict) else None
    if obj and obj.get("text"):
        objections.append(f"{obj.get('type', 'other')}: {obj['text']}")
        _add_question(session, call, obj["text"], "objection", "answered", ai_answer=reply)
    for d in doubts:
        _add_question(session, call, d, "doubt", "answered", ai_answer=reply)
    unanswered = (result.get("unanswered_question") or "").strip()
    for q in result.get("questions") or []:
        if isinstance(q, dict) and q.get("question") and q.get("answered") and q["question"] != unanswered:
            _add_question(session, call, q["question"], "question", "answered", ai_answer=q.get("answer") or reply)
    if result.get("escalate"):
        _add_question(session, call, unanswered or speech, "question", "escalated", ai_answer=reply,
                      reason=result.get("escalate_reason") or "Escalated by AI")
    elif unanswered:
        _add_question(session, call, unanswered, "question", "open", ai_answer=reply,
                      reason="AI could not answer from the knowledge base")

    # usage tracking for knowledge entries the model relied on
    used = {str(u) for u in result.get("knowledge_used") or []}
    for item in knowledge:
        if item["id"].startswith("kb") and (item["id"] in used or item["title"] in used):
            kb = session.get(CallKnowledge, int(item["id"][2:]))
            if kb:
                kb.usage_count += 1
                session.add(kb)

    call.current_intent = result.get("intent")
    call.sentiment = result.get("sentiment")
    if result.get("interest_score") is not None:
        call.interest_score = result["interest_score"]
    _update_context(
        call, stage=result.get("stage") or ctx.get("stage"),
        doubts=(ctx.get("doubts", []) + doubts)[-20:], objections=objections[-20:],
        adaptation=result.get("adaptation") or ctx.get("adaptation"),
    )
    audio = _speak_audio(call, reply)
    _append_turn(call, "ai", reply)

    # live transfer when the client explicitly asks for a person and an agent is reachable
    if result.get("escalate") and result.get("intent") == "request_human" and call.agent_phone:
        call.mode = "agent_phone"
        _append_turn(call, "system", f"Transferring to agent {call.agent_phone}.")
        session.add(call)
        session.commit()
        return va.twiml_dial(call.agent_phone, caller_id=call.from_number,
                             action_url=_hook_url(call, "dial-complete"), audio_url=audio, text=reply, language=lang)

    if result.get("end_call"):
        session.add(call)
        session.commit()
        return va.twiml_say_hangup(audio, reply, lang)

    _mark_ai_speaking(call, reply)
    session.add(call)
    session.commit()
    return _gather(call, audio=audio, text=reply)


@router.post("/twilio/reply/{call_id}")
def twilio_reply(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    try:
        start = time.monotonic()
        resp = _twilio_reply_impl(call_id, request, form, session)
        print(f"[voice_agent] /reply call {call_id} took {time.monotonic() - start:.2f}s")
        return resp
    except HTTPException:
        raise
    except Exception:
        print(f"[voice_agent] /twilio/reply failed for call {call_id} after {time.monotonic() - start:.2f}s:\n{traceback.format_exc()}")
        token = request.query_params.get("t")
        if token:
            try:
                action = f"{va.twilio_config()['public_base']}/voice-agent/twilio/gather/{call_id}?t={token}"
                return _xml(va.twiml_gather(action, text="Sorry, could you say that again?"))
            except Exception:
                print(f"[voice_agent] /twilio/reply recovery failed:\n{traceback.format_exc()}")
        return _xml(va.twiml_say_hangup(None, "Sorry, we ran into a problem. Goodbye."))


def _twilio_reply_impl(call_id: int, request: Request, form: dict, session: Session):
    start = time.monotonic()
    """Hold loop: play the prepared reply as soon as it's ready, otherwise pause a second and check again.
    The hold/ready paths are answered from memory (no DB) so they stay fast even when the server is busy."""
    seq = int(request.query_params.get("s") or 0)
    n = int(request.query_params.get("n") or 0)
    token = request.query_params.get("t")
    fast = os.getenv("TWILIO_VALIDATE_WEBHOOKS", "false").lower() != "true"
    with _PENDING_LOCK:
        entry = _PENDING_REPLIES.get(call_id)
        current = entry if entry and entry["seq"] == seq and token and entry["token"] == token else None
        if current and current["done"]:
            _PENDING_REPLIES.pop(call_id, None)
    if current and fast:
        if not current["done"] and n < REPLY_POLL_MAX:
            print(f"[voice_agent] call {call_id} turn {seq} redirects={n + 1}")
            return _xml(_hold_twiml(call_id, token, seq, n + 1))
        if current["done"] and current["xml"]:
            print(f"[voice_agent] call {call_id} turn {seq} redirects={n}")
            return _xml(current["xml"])

    call, _ = _webhook_call(request, session, call_id, form)
    if current and not current["done"] and n < REPLY_POLL_MAX:
        print(f"[voice_agent] call {call_id} turn {seq} redirects={n + 1}")
        return _xml(_hold_twiml(call_id, token, seq, n + 1))
    if current and current["done"] and current["xml"]:
        print(f"[voice_agent] call {call_id} turn {seq} redirects={n}")
        return _xml(current["xml"])
    if current and not current["done"]:
        # Polling cap reached and the AI reply is still not ready: stop looping (trial
        # accounts kill calls over the redirect limit), speak a short filler line and
        # go straight back to listening so the call keeps going.
        line = _phrase(call, "one_moment")
        _append_turn(call, "ai", line)
        _mark_ai_speaking(call, line)
        session.add(call)
        session.commit()
        print(f"[voice_agent] call {call_id} turn {seq} redirects={n} (capped, filler)")
        return _xml(_gather(call, audio=_speak_audio(call, line), text=line))
    if call.mode == "agent_typed":
        return _xml(_wait_twiml(call, 0))
    # failed, timed out, or lost (e.g. server restart): apologise and keep listening
    line = "Sorry, could you say that once more?"
    _append_turn(call, "ai", line)
    _mark_ai_speaking(call, line)
    session.add(call)
    session.commit()
    return _xml(_gather(call, audio=_speak_audio(call, line), text=line))


def _wait_twiml(call: AICall, n: int) -> str:
    """Typed-takeover loop: keep listening to the client while waiting for the agent's next message."""
    return va.twiml_gather(_hook_url(call, "gather"), language=twilio_language(call.language, call.accent), pause=1, timeout=2,
                           action_on_empty=False, fallback_url=_hook_url(call, "wait", n=n + 1))


@router.post("/twilio/wait/{call_id}")
def twilio_wait(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    call, _ = _webhook_call(request, session, call_id, form)
    n = int(request.query_params.get("n") or 0)
    lang = twilio_language(call.language, call.accent)
    if call.mode == "ai":
        return _xml(_resume_twiml(call, session))
    if call.pending_agent_message:
        text = call.pending_agent_message
        call.pending_agent_message = None
        _append_turn(call, "agent", text)
        _mark_ai_speaking(call, text)
        session.add(call)
        session.commit()
        return _xml(va.twiml_gather(_hook_url(call, "gather"), audio_url=_speak_audio(call, text, "agent"),
                                    text=text, language=lang, timeout=4, action_on_empty=False,
                                    fallback_url=_hook_url(call, "wait", n=0)))
    if n >= MAX_WAIT_LOOPS:
        line = _phrase(call, "wait_timeout")
        _append_turn(call, "ai", line)
        session.add(call)
        session.commit()
        return _xml(va.twiml_say_hangup(_speak_audio(call, line), line, lang))
    return _xml(_wait_twiml(call, n))


def _resume_twiml(call: AICall, session: Session) -> str:
    line = _phrase(call, "resume")
    _append_turn(call, "ai", line)
    _mark_ai_speaking(call, line)
    session.add(call)
    session.commit()
    return _gather(call, audio=_speak_audio(call, line), text=line)


@router.post("/twilio/resume/{call_id}")
def twilio_resume(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    call, _ = _webhook_call(request, session, call_id, form)
    call.mode = "ai"
    return _xml(_resume_twiml(call, session))


@router.post("/twilio/dial-complete/{call_id}")
def twilio_dial_complete(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    call, form = _webhook_call(request, session, call_id, form)
    dial_status = form.get("DialCallStatus") or ""
    call.mode = "ai"
    if dial_status == "completed":
        _append_turn(call, "system", "Agent finished the conversation; AI resumed.")
        return _xml(_resume_twiml(call, session))
    _append_turn(call, "system", f"Agent unavailable ({dial_status or 'no answer'}).")
    _add_question(session, call, "Client requested to speak with a human agent", "question", "escalated",
                  reason=f"Live transfer failed: {dial_status or 'no answer'}")
    line = _phrase(call, "agent_unavailable")
    _append_turn(call, "ai", line)
    _mark_ai_speaking(call, line)
    session.add(call)
    session.commit()
    return _xml(_gather(call, audio=_speak_audio(call, line), text=line))


@router.post("/twilio/status/{call_id}")
def twilio_status(call_id: int, request: Request, background: BackgroundTasks,
                        form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    call, form = _webhook_call(request, session, call_id, form)
    status = form.get("CallStatus") or call.status
    if status == "in-progress" and call.status == "completed":
        return Response(status_code=204)
    if status in TERMINAL_STATUSES:
        if call.status not in TERMINAL_STATUSES:
            _mark_ended(call, status, form.get("CallDuration"), background)
    else:
        call.status = status
        call.updated_at = va.utcnow()
    session.add(call)
    session.commit()
    return Response(status_code=204)


@router.post("/twilio/dial/{call_id}")
def twilio_dial(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    """Phone takeover: announce the transfer, then bridge the client to the agent's phone."""
    call, _ = _webhook_call(request, session, call_id, form)
    lang = twilio_language(call.language, call.accent)
    line = _phrase(call, "connect_agent")
    return _xml(va.twiml_dial(call.agent_phone, caller_id=call.from_number, action_url=_hook_url(call, "dial-complete"),
                              audio_url=_speak_audio(call, line, "agent"), text=line, language=lang))


@router.post("/twilio/hangup/{call_id}")
def twilio_hangup(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    _webhook_call(request, session, call_id, form)
    return _xml(va.twiml_hangup())


@router.post("/twilio/recording/{call_id}")
def twilio_recording(call_id: int, request: Request, form: dict = Depends(twilio_form), session: Session = Depends(get_session)):
    call, form = _webhook_call(request, session, call_id, form)
    if form.get("RecordingUrl"):
        call.recording_url = form["RecordingUrl"] + ".mp3"
        session.add(call)
        session.commit()
    return Response(status_code=204)


def _finalize_call(call_id: int, tenant_id: Optional[int]) -> None:
    """Summarize the call, log it in the CRM Calls list and flag follow-ups."""
    _set_tenant(tenant_id)
    with Session(engine) as session:
        call = session.get(AICall, call_id)
        if not call or call.call_log_id:
            return
        talk = [t for t in (call.transcript or []) if t.get("role") in ("ai", "client", "agent")]
        has_client = any(t.get("role") == "client" for t in talk)
        result = va.summarize_call(talk, call.entity_name or "") if has_client else {
            "summary": f"Call {call.status}; no conversation with the client.",
            "outcome": "no_conversation" if call.status == "completed" else call.status, "next_steps": ""}
        call.summary, call.outcome, call.next_steps = result["summary"], result["outcome"], result["next_steps"]

        pending = session.exec(select(CallQuestion).where(
            CallQuestion.call_id == call.id, CallQuestion.status.in_(["open", "escalated"]))).all()
        starter = session.get(User, call.started_by) if call.started_by else None
        lines = "\n".join(f"{ {'ai': 'AI', 'agent': 'Agent', 'client': 'Client'}[t['role']] }: {t.get('text', '')}"
                          for t in talk)
        log = CallLog(
            tenant_id=call.tenant_id, phone_number=call.to_number, duration_seconds=call.duration_seconds,
            summary=f"AI Voice Call â€” {call.entity_name or call.to_number}: {call.summary}",
            description=lines or None, work_done=call.next_steps or None,
            assigned_to=(starter.name or starter.email) if starter else None,
            followup_needed=bool(pending) or call.outcome in ("interested", "callback", "needs_follow_up"),
            client_id=call.entity_id if call.entity_type == "client" else None,
        )
        session.add(log)
        session.flush()
        call.call_log_id = log.id
        if call.entity_type in ("client", "lead") and call.entity_id:
            session.add(ActivityLog(
                tenant_id=call.tenant_id, userId=call.started_by, action="AI Voice Call", method="Phone",
                content=f"AI call ({call.status}, outcome: {call.outcome}). {len(pending)} question(s) need follow-up.",
                details=call.summary,
                clientId=call.entity_id if call.entity_type == "client" else None,
                lead_id=call.entity_id if call.entity_type == "lead" else None,
            ))
        session.add(call)
        session.commit()
