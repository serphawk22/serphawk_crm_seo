"""Automatic AI calling for newly created leads.

One SQLAlchemy ``after_insert`` event on :class:`~database.Lead` captures every new lead and an
``after_commit`` event enqueues the work. The delay, feature/bulk/phone/DND checks and the actual
dial all happen in a background thread with a fresh session, so request handlers never block and
the settings are re-read at trigger time.

No call logic is duplicated here: pitch text comes from ``modules.voice_agent`` and the call is
placed through the existing ``routers.voice_agent`` stack (pitch audio + Twilio + AI webhooks).
"""
from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import event, update
from sqlalchemy.orm import Session as SASession, object_session
from sqlmodel import Session, select

import database
from database import AICall, ActivityLog, Lead, User, VoicePitch
from modules import features, lead_calls, tenant_settings, tenant_voice, voice_agent as va
from modules.tenant_scope import current_tenant_id
from modules.tts_service import language_label, resolve_voice_locale

log = logging.getLogger(__name__)

FEATURE_KEY = "auto_call_new_leads"
PARENT_FEATURE_KEY = "calls"
LEAD_DELAY_SECONDS = 2.0
PITCH_TIMEOUT_SECONDS = 1.6
RETRY_DELAY_SECONDS = 3.0
_ACTIVE_CALL_STATUSES = ("queued", "initiated", "ringing", "in-progress")


def _emit(message: str, *, warn: bool = False) -> None:
    """Log via both Python logging and flushed stdout so uvicorn terminals always show why an auto-call ran or skipped."""
    if warn:
        log.warning(message)
    else:
        log.info(message)
    print(message, flush=True)

_WORKERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix="auto-call")
_PITCH_WORKERS = ThreadPoolExecutor(max_workers=4, thread_name_prefix="auto-call-pitch")
_INSTALLED = False


def mark_bulk_import(session: SASession) -> None:
    """Mark a session as a bulk-import/lead-campaign session so its new leads are skipped by default.

    Call this before adding/ committing the imported Lead rows. It is deliberately session-local:
    a normal manually created lead in another request is never treated as a bulk import.
    """
    session.info["bulk_lead_import"] = True


def _captured(session: SASession) -> Dict[int, Dict[str, Any]]:
    return session.info.setdefault("auto_call_pending_leads", {})


@event.listens_for(Lead, "after_insert")
def _capture_new_lead(mapper, connection, target: Lead) -> None:
    """Capture only the id/tenant/owner; do no work until the row is committed."""
    if not getattr(target, "id", None):
        return
    session = object_session(target)
    if session is None:
        return
    _captured(session)[int(target.id)] = {
        "tenant_id": getattr(target, "tenant_id", None),
        "owner_id": getattr(target, "owner_id", None),
        "bulk": bool(session.info.get("bulk_lead_import")),
    }


@event.listens_for(SASession, "after_commit")
def _dispatch_after_commit(session: SASession, *args) -> None:
    pending = session.info.pop("auto_call_pending_leads", {})
    for lead_id, meta in pending.items():
        try:
            _enqueue(lead_id, meta)
        except Exception as exc:
            _emit(f"[auto_call] dispatch error for lead={lead_id}: {exc}", warn=True)


@event.listens_for(SASession, "after_rollback")
def _discard_after_rollback(session: SASession, *args) -> None:
    session.info.pop("auto_call_pending_leads", None)


def install() -> None:
    """Idempotent no-op marker; the SQLAlchemy listeners are registered at import time."""
    global _INSTALLED
    _INSTALLED = True


def _enqueue(lead_id: int, meta: Dict[str, Any]) -> None:
    try:
        meta = {**meta, "committed_at": time.monotonic()}
        _emit(f"[auto_call] scheduled lead={lead_id} tenant={meta.get('tenant_id')} delay={LEAD_DELAY_SECONDS}s bulk={bool(meta.get('bulk'))}")
        _WORKERS.submit(_run, lead_id, meta)
    except RuntimeError as exc:  # interpreter shutdown / executor closed
        _emit(f"[auto_call] could not enqueue lead={lead_id}: {exc}", warn=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _scope(tenant_id: Optional[int]):
    return current_tenant_id.set(tenant_id) if tenant_id is not None else None


def _reset_scope(token) -> None:
    if token is not None:
        current_tenant_id.reset(token)


def _log_activity(session: SASession, tenant_id: Optional[int], lead_id: int,
                  action: str, detail: str, user_id: Optional[int] = None) -> None:
    session.add(ActivityLog(
        tenant_id=tenant_id, lead_id=lead_id, userId=user_id,
        action=action, method="AI Voice Call", content=(detail or "")[:2000],
    ))


def _set_status(lead_id: int, tenant_id: Optional[int], *, status: str,
                reason: Optional[str] = None, attempts: Optional[int] = None,
                called_at: bool = False, lead_status: Optional[str] = None) -> None:
    values: Dict[str, Any] = {"auto_call_status": status, "auto_call_reason": (reason or "")[:2000] or None}
    if attempts is not None:
        values["auto_call_attempts"] = attempts
    if called_at:
        values["auto_called_at"] = _now()
    if lead_status:
        values["status"] = lead_status
        values["last_contact_at"] = _now()
    token = _scope(tenant_id)
    try:
        with Session(database.engine) as session:
            stmt = update(Lead).where(Lead.id == lead_id)
            if tenant_id is not None:
                stmt = stmt.where(Lead.tenant_id == tenant_id)
            session.execute(stmt.values(**values))
            session.commit()
    except Exception as exc:
        log.warning("[auto_call] could not record status %s for lead %s: %s", status, lead_id, exc)
    finally:
        _reset_scope(token)


def _normalize_lead_phone(raw: Optional[str], tenant_id: int) -> str:
    """Normalize a lead's phone to E.164, using the tenant's default_dial_code if no '+' country code was entered."""
    number = va.normalize_phone(raw or "")
    if number and not number.startswith("+"):
        dial_code = str(tenant_settings.get_setting(tenant_id, "default_dial_code") or "").strip().lstrip("+")
        dial_digits = re.sub(r"\D", "", dial_code)
        digits = re.sub(r"\D", "", number)
        if dial_digits and (len(digits) == 10 or (len(digits) == 11 and digits.startswith("0"))):
            number = f"+{dial_digits}{digits[-10:]}"
    return number


def _already_called(session: SASession, tenant_id: int, lead_id: int, number: str) -> Optional[str]:
    """Return a skip reason if this lead or phone already has an in-progress/duplicate auto-call, else None."""
    key = lead_calls.phone_key(number)
    if not key:
        return None
    existing_for_lead = session.exec(
        select(AICall.id).where(AICall.tenant_id == tenant_id, AICall.lead_id == lead_id).limit(1)
    ).first()
    if existing_for_lead is not None:
        return f"Lead already has call #{existing_for_lead}"
    others = session.exec(
        select(Lead.phone, Lead.auto_call_status).where(
            Lead.tenant_id == tenant_id,
            Lead.id != lead_id,
            Lead.auto_call_status.in_(("queued", "dialed")),
        )
    ).all()
    if any(lead_calls.phone_key(phone) == key for phone, _ in others):
        return "Another lead with this phone was already auto-called"
    active_numbers = session.exec(
        select(AICall.to_number).where(
            AICall.tenant_id == tenant_id,
            AICall.status.in_(_ACTIVE_CALL_STATUSES),
        )
    ).all()
    if any(lead_calls.phone_key(value) == key for value in active_numbers):
        return "An active AI call to this phone number is already in progress"
    return None


def _calling_user(session: SASession, tenant_id: int, lead: Lead) -> Optional[User]:
    """Prefer the lead owner; otherwise any active calling-capable user in this tenant."""
    owner = session.get(User, lead.owner_id) if lead.owner_id else None
    if owner and owner.tenant_id == tenant_id and owner.is_active:
        return owner
    preferred = ("admin", "salesmanager", "employee", "superadmin", "demo")
    candidates = session.exec(select(User).where(User.tenant_id == tenant_id, User.is_active == True)).all()  # noqa: E712
    for role in preferred:
        for user in candidates:
            if (user.role or "").lower() == role:
                return user
    return candidates[0] if candidates else None


def _pitch_text(session: SASession, lead: Lead, profile: tenant_voice.TenantVoiceProfile,
                info: Dict[str, Any]) -> str:
    """Generate with the existing pitch writer, but keep a ~1s ceiling and a safe fallback."""
    try:
        future = _PITCH_WORKERS.submit(
            va.generate_pitch_text, info.get("context") or "", None,
            language_label(profile.language), profile,
            prospect=info,
        )
        text = (future.result(timeout=PITCH_TIMEOUT_SECONDS) or "").strip()
        return text or tenant_voice.fallback_pitch(info, profile, language_label(profile.language))
    except Exception as exc:
        log.info("[auto_call] pitch generation fell back for lead %s: %s", lead.id, exc)
        return tenant_voice.fallback_pitch(info, profile, language_label(profile.language))


def _prepare_pitch(session: SASession, lead: Lead, user: User,
                   profile: tenant_voice.TenantVoiceProfile) -> Optional[VoicePitch]:
    """Pre-generate the personalized pitch and TTS audio during the 2s lead-creation window."""
    from routers import voice_agent as voice_router

    lead_id = lead.id
    lead_tenant_id = lead.tenant_id
    lead_company = lead.company_name
    user_id = user.id
    info = voice_router._entity_info(session, "lead", lead_id, tenant_id=lead_tenant_id)
    lang, acc, _ = resolve_voice_locale(profile.language, profile.accent)
    # Release DB transaction before OpenAI pitch text & TTS calls.
    session.commit()
    text = _pitch_text(session, lead, profile, info)
    pitch = VoicePitch(
        title=f"Auto pitch for {info.get('name') or lead_company}",
        entity_type="lead", entity_id=lead_id, entity_name=info.get("name") or lead_company,
        pitch_text=text, language=lang, voice=profile.voice, accent=acc,
        style="friendly", speed=1.0, created_by=user_id, tenant_id=lead_tenant_id,
    )
    pitch.audio_url = voice_router._pitch_audio(pitch, session)
    session.add(pitch)
    session.commit()
    session.refresh(pitch)
    return pitch


def _attempt_call(session: SASession, lead: Lead, user: User, number: str,
                  profile: tenant_voice.TenantVoiceProfile, attempt: int,
                  prepared_pitch: Optional[VoicePitch] = None) -> Any:
    """Reuse the exact same calling stack as manual phone-icon calls (routers.voice_agent.start_quick_call)."""
    from routers import voice_agent as voice_router

    pitch_text = None
    if prepared_pitch is None:
        info = voice_router._entity_info(session, "lead", lead.id, tenant_id=lead.tenant_id)
        pitch_text = _pitch_text(session, lead, profile, info)
    _, call = voice_router.start_quick_call(
        session,
        user,
        entity_type="lead",
        entity_id=lead.id,
        to_number=number,
        voice=profile.voice,
        language=profile.language,
        accent=profile.accent,
        style="friendly",
        pitch_text=pitch_text,
        pitch_title=f"Auto pitch for {lead.company_name}",
        allow_pitch_fallback=True,
        prepared_pitch=prepared_pitch,
    )
    return call


def _run(lead_id: int, meta: Dict[str, Any]) -> None:
    tenant_id = meta.get("tenant_id")
    if not tenant_id:
        _emit(f"[auto_call] skipped lead={lead_id}: missing tenant_id", warn=True)
        return
    committed_at = float(meta.get("committed_at") or time.monotonic())
    token = _scope(tenant_id)
    attempts = 0
    try:
        with Session(database.engine) as session:
            flags = features.effective_features(tenant_id, use_cache=False)
            if not flags.get(PARENT_FEATURE_KEY):
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: '{PARENT_FEATURE_KEY}' module is disabled")
                return
            if not flags.get(FEATURE_KEY):
                _emit(
                    f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: '{FEATURE_KEY}' is disabled "
                    "(enable 'Automatic calling on new leads' under SuperAdmin -> Clients -> Configure -> Modules)"
                )
                return

            lead = session.get(Lead, lead_id)
            if not lead or lead.tenant_id != tenant_id:
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: lead not found in tenant", warn=True)
                return
            if lead.do_not_call:
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: do_not_call is True")
                return
            if lead.auto_call_status is not None:
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: already has auto_call_status={lead.auto_call_status!r}")
                return
            if meta.get("bulk") and not tenant_settings.get_settings(tenant_id).get("auto_call_bulk_imports"):
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: bulk import (auto_call_bulk_imports is off)")
                _set_status(lead_id, tenant_id, status="skipped", reason="Bulk import", attempts=0)
                return

            number = _normalize_lead_phone(lead.phone, tenant_id)
            if not va.is_e164(number):
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: missing or invalid E.164 phone ({lead.phone!r})", warn=True)
                _set_status(lead_id, tenant_id, status="skipped",
                            reason="Missing or invalid E.164 phone number", attempts=0)
                return
            skip_reason = _already_called(session, tenant_id, lead_id, number)
            if skip_reason:
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id} to={number}: {skip_reason}")
                _set_status(lead_id, tenant_id, status="skipped", reason=skip_reason, attempts=0)
                return

            # Atomic claim: only the first worker for a lead can pass this UPDATE.
            claimed = session.execute(
                update(Lead)
                .where(Lead.id == lead_id, Lead.tenant_id == tenant_id, Lead.auto_call_status.is_(None))
                .values(auto_call_status="queued", auto_call_attempts=1, auto_call_reason=None)
            )
            if claimed.rowcount != 1:
                _emit(f"[auto_call] skipped lead={lead_id} tenant={tenant_id}: already claimed by another worker")
                return
            session.commit()

            user = _calling_user(session, tenant_id, lead)
            if not user:
                _emit(f"[auto_call] failed lead={lead_id} tenant={tenant_id}: no eligible active calling user", warn=True)
                _set_status(lead_id, tenant_id, status="failed", reason="No eligible calling user", attempts=0)
                return
            profile = tenant_voice.profile_for_call(tenant_id)
            from modules import demo_usage
            restricted = demo_usage.background_restricted(session, tenant_id, user.id)
            demo_usage.demo_context.set(tenant_id if restricted else demo_usage.UNRESTRICTED)
            # Release DB read transaction before overlapping OpenAI/TTS + 2s delay.
            session.commit()

            # Overlap pitch + TTS generation with the 2-second delay so dialing starts right at ~2s.
            prepared_pitch = None
            try:
                prepared_pitch = _prepare_pitch(session, lead, user, profile)
            except Exception as exc:
                session.rollback()
                _emit(f"[auto_call] pitch pre-warm skipped for lead={lead_id}: {exc}", warn=True)

            remaining = (committed_at + LEAD_DELAY_SECONDS) - time.monotonic()
            if remaining > 0:
                time.sleep(remaining)

            last_error = "Unknown dial failure"
            call = None
            for attempt in range(1, 3):
                attempts = attempt
                try:
                    if attempt > 1:
                        _set_status(lead_id, tenant_id, status="queued", attempts=attempt)
                    elapsed_s = time.monotonic() - committed_at
                    _emit(f"[auto_call] dialing lead={lead_id} tenant={tenant_id} company={lead.company_name!r} to={number} user={user.id} attempt={attempt} t=+{elapsed_s:.2f}s")
                    call = _attempt_call(session, lead, user, number, profile, attempt, prepared_pitch=prepared_pitch if attempt == 1 else None)
                    break
                except Exception as exc:
                    session.rollback()
                    last_error = str(exc)
                    _emit(f"[auto_call] attempt {attempt} for lead={lead_id} tenant={tenant_id} failed: {exc}", warn=True)
                    if attempt == 1:
                        time.sleep(RETRY_DELAY_SECONDS)

            if call is not None:
                try:
                    now = _now()
                    session.execute(
                        update(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant_id)
                        .values(auto_call_status="dialed", auto_call_reason=None,
                                auto_call_attempts=attempts, auto_called_at=now,
                                status="Contacted", last_contact_at=now)
                    )
                    _log_activity(session, tenant_id, lead_id, "Auto call started",
                                  f"AI call {call.id} to {number} (attempt {attempts})", user.id)
                    session.commit()
                    _emit(f"[auto_call] started lead={lead_id} tenant={tenant_id} call_id={call.id} to={number} status={call.status}")
                except Exception as exc:
                    session.rollback()
                    _emit(f"[auto_call] call {call.id} started for lead={lead_id} but status update failed: {exc}", warn=True)
                    _set_status(lead_id, tenant_id, status="dialed", attempts=attempts, called_at=True, lead_status="Contacted")
                return

            _set_status(lead_id, tenant_id, status="failed", reason=last_error, attempts=attempts)
            token_log = _scope(tenant_id)
            try:
                with Session(database.engine) as log_session:
                    _log_activity(log_session, tenant_id, lead_id, "Auto call failed",
                                  f"{last_error} (after {attempts} attempts)", user.id)
                    log_session.commit()
            finally:
                _reset_scope(token_log)
    except Exception as exc:
        log.exception("[auto_call] worker failed for lead %s", lead_id)
        _emit(f"[auto_call] worker exception for lead={lead_id} tenant={tenant_id}: {exc}", warn=True)
        _set_status(lead_id, tenant_id, status="failed", reason=str(exc), attempts=max(attempts, 1))
    finally:
        _reset_scope(token)
