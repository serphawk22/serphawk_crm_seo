"""In-memory live call session context and reliable background persistence for AI Voice Calls.

Separates latency-critical live phone turns from PostgreSQL I/O:

1. Before dialing, ``LiveCallContext`` is populated ONCE with immutable call metadata
   (lead/client/contact info, opening pitch, voice settings, preloaded tenant knowledge base
   + products + solutions, voice profile, localized phrases, and demo restriction flag).
2. During the live call, every Twilio webhook (answer, gather, reply) and the background
   reply/insights workers read and update ``LiveCallContext`` in memory with zero DB reads.
3. All database writes (transcript turns, call status, insights, CallQuestion rows,
   CallKnowledge usage counts) are coalesced per call and persisted reliably on a dedicated
   background worker pool with retry + backoff and short-lived DB sessions.
4. Before end-of-call finalization (summary, follow-up extraction, conversation log),
   ``flush_sync(call_id)`` guarantees every in-memory turn and insight is committed to
   PostgreSQL so no conversation data, callback request, or meeting date is ever lost.
"""
from __future__ import annotations

import atexit
import copy
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select

import database
from database import AICall, CallKnowledge, CallQuestion
from modules.tenant_scope import current_tenant_id

ACTIVE_STATUSES = {"queued", "initiated", "ringing", "in-progress"}
TERMINAL_STATUSES = {"completed", "busy", "failed", "no-answer", "canceled"}

_PERSIST_RETRIES = 3
_RETRY_BACKOFFS = (0.4, 1.2, 2.5)
_STALE_TTL_SECONDS = 1800.0  # 30 minutes after last activity for ended/abandoned sessions


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


@dataclass
class LiveCallContext:
    """Isolated per-call state kept hot in memory for the lifetime of an active call."""

    # Immutable metadata loaded once before dialing (or hydrated once after a process restart)
    call_id: int
    tenant_id: Optional[int]
    started_by: Optional[int]
    webhook_token: str
    public_base: str

    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    entity_name: Optional[str] = None
    lead_id: Optional[int] = None
    to_number: str = ""
    from_number: str = ""

    pitch_id: Optional[int] = None
    pitch_text: str = ""
    pitch_audio_url: Optional[str] = None
    entity_context: str = "No CRM record linked."
    knowledge_items: List[dict] = field(default_factory=list)
    voice_profile: Dict[str, Any] = field(default_factory=dict)
    phrases: Dict[str, str] = field(default_factory=dict)

    voice: str = "nova"
    accent: Optional[str] = None
    language: str = "en"
    style: str = "friendly"
    speed: float = 1.0
    agent_phone: Optional[str] = None
    demo_restricted: bool = False
    created_at: Optional[datetime] = None

    # Mutable live conversation state
    twilio_call_sid: Optional[str] = None
    status: str = "queued"
    mode: str = "ai"
    answered_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    recording_url: Optional[str] = None
    pending_agent_message: Optional[str] = None
    current_intent: Optional[str] = None
    sentiment: Optional[str] = None
    interest_score: Optional[int] = None

    transcript: List[Dict[str, Any]] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)

    # Queued side-effect records persisted in the same transaction as AICall updates
    pending_questions: List[Dict[str, Any]] = field(default_factory=list)
    pending_kb_ids: List[int] = field(default_factory=list)

    # Versioning & lifecycle bookkeeping
    dirty_version: int = 0
    persisted_version: int = 0
    last_touched_at: float = field(default_factory=time.monotonic)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False, compare=False)

    def voice_settings(self) -> Dict[str, Any]:
        return {
            "voice": self.voice or "nova",
            "accent": self.accent,
            "style": self.style,
            "speed": self.speed or 1.0,
            "language": self.language or "en",
        }

    def phrase(self, key: str, defaults: Dict[str, str]) -> str:
        return (self.phrases or {}).get(key) or (self.context.get("phrases") or {}).get(key) or defaults[key]

    def touch(self, dirty: bool = True) -> int:
        self.last_touched_at = time.monotonic()
        if dirty:
            self.dirty_version += 1
        return self.dirty_version

    def append_turn(self, role: str, text: str, **meta) -> Dict[str, Any]:
        turn = {"role": role, "text": text, "ts": _utcnow().isoformat(), **meta}
        with self.lock:
            self.transcript.append(turn)
            self.touch(dirty=True)
        return turn

    def update_context(self, **values) -> Dict[str, Any]:
        with self.lock:
            self.context.update(values)
            self.touch(dirty=True)
            return dict(self.context)

    def mark_ai_speaking(self, text: str, speech_secs: float) -> None:
        with self.lock:
            self.context["last_ai_started"] = time.time()
            self.context["last_ai_secs"] = speech_secs
            self.touch(dirty=True)

    def record_client_turn(self, speech: str, confidence: Optional[str], speech_secs: float) -> bool:
        """Append client speech and detect whether it interrupted the AI's previous utterance."""
        with self.lock:
            elapsed = time.time() - float(self.context.get("last_ai_started") or 0)
            client_secs = speech_secs + 1.5
            interrupted = (elapsed - client_secs) < float(self.context.get("last_ai_secs") or 0) - 1
            if interrupted:
                for turn in reversed(self.transcript):
                    if turn.get("role") in ("ai", "agent"):
                        turn["interrupted"] = True
                        break
            self.context["silence_count"] = 0
            self.transcript.append({
                "role": "client",
                "text": speech,
                "ts": _utcnow().isoformat(),
                "interrupted_ai": interrupted,
                "confidence": confidence,
            })
            self.touch(dirty=True)
            return interrupted

    def snapshot_for_reply(self) -> Dict[str, Any]:
        """Thread-safe shallow/deep copy of immutable + current turn state for LLM/TTS."""
        with self.lock:
            transcript_copy = copy.deepcopy(self.transcript)
            ctx_copy = copy.deepcopy(self.context)
            return {
                "call_id": self.call_id,
                "tenant_id": self.tenant_id,
                "started_by": self.started_by,
                "webhook_token": self.webhook_token,
                "public_base": self.public_base,
                "entity_type": self.entity_type,
                "entity_id": self.entity_id,
                "entity_name": self.entity_name,
                "lead_id": self.lead_id,
                "pitch_text": self.pitch_text,
                "entity_context": self.entity_context,
                "knowledge_items": self.knowledge_items,  # read-only list of dicts
                "voice_profile": self.voice_profile,
                "phrases": self.phrases,
                "voice_settings": self.voice_settings(),
                "agent_phone": self.agent_phone,
                "demo_restricted": self.demo_restricted,
                "language": self.language,
                "accent": self.accent,
                "mode": self.mode,
                "transcript": transcript_copy,
                "context": ctx_copy,
            }

    def apply_insights(
        self,
        *,
        intent: Optional[str],
        sentiment: Optional[str],
        interest_score: Optional[int],
        stage: Optional[str],
        doubts: List[str],
        objections_to_add: List[str],
        adaptation: Optional[str],
        questions: List[Dict[str, Any]],
        kb_ids: List[int],
        client_speech: Optional[str] = None,
    ) -> None:
        """Apply background AI insights into memory and queue durable DB writes."""
        with self.lock:
            if sentiment:
                self.sentiment = sentiment
            if interest_score is not None:
                self.interest_score = interest_score

            # Annotate the matching client turn (newest matching speech, else latest client turn)
            target_turn = None
            for turn in reversed(self.transcript):
                if turn.get("role") == "client":
                    if client_speech and turn.get("text") == client_speech and "sentiment" not in turn:
                        target_turn = turn
                        break
                    if target_turn is None:
                        target_turn = turn
            if target_turn is not None:
                if intent:
                    target_turn["intent"] = intent
                if sentiment:
                    target_turn["sentiment"] = sentiment

            if stage:
                self.context["stage"] = stage
            if doubts:
                existing_doubts = list(self.context.get("doubts") or [])
                self.context["doubts"] = (existing_doubts + doubts)[-20:]
            if objections_to_add:
                existing_obj = list(self.context.get("objections") or [])
                self.context["objections"] = (existing_obj + objections_to_add)[-20:]
            if adaptation:
                self.context["adaptation"] = adaptation

            if questions:
                self.pending_questions.extend(questions)
            if kb_ids:
                self.pending_kb_ids.extend(kb_ids)
            self.touch(dirty=True)


class CallContextStore:
    """Thread-safe in-memory registry of active AI call sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[int, LiveCallContext] = {}
        self._lock = threading.Lock()

    def register(self, ctx: LiveCallContext) -> LiveCallContext:
        with self._lock:
            self._sessions[ctx.call_id] = ctx
        self._evict_stale()
        return ctx

    def get(self, call_id: int) -> Optional[LiveCallContext]:
        with self._lock:
            ctx = self._sessions.get(call_id)
            if ctx is not None:
                ctx.last_touched_at = time.monotonic()
            return ctx

    def get_validated(self, call_id: int, token: Optional[str]) -> Optional[LiveCallContext]:
        ctx = self.get(call_id)
        if ctx is None or not token or ctx.webhook_token != token:
            return None
        return ctx

    def remove(self, call_id: int) -> None:
        with self._lock:
            self._sessions.pop(call_id, None)

    def _evict_stale(self) -> None:
        now = time.monotonic()
        with self._lock:
            stale_ids = [
                cid for cid, ctx in self._sessions.items()
                if (now - ctx.last_touched_at) > _STALE_TTL_SECONDS
                and ctx.status in TERMINAL_STATUSES
                and ctx.persisted_version >= ctx.dirty_version
                and not ctx.pending_questions
                and not ctx.pending_kb_ids
            ]
            for cid in stale_ids:
                self._sessions.pop(cid, None)

    def overlay_call_dict(self, call_id: int, data: Dict[str, Any], full: bool = False) -> Dict[str, Any]:
        """Merge fresher in-memory live state onto a DB-backed API dict for instant UI visibility."""
        ctx = self.get(call_id)
        if ctx is None:
            return data
        with ctx.lock:
            db_status = data.get("status")
            # Respect terminal DB status if already finalized
            status = db_status if db_status in TERMINAL_STATUSES else (ctx.status or db_status)
            is_active = status in ACTIVE_STATUSES
            data["status"] = status
            data["is_active"] = is_active
            if ctx.mode:
                data["mode"] = ctx.mode
            if ctx.answered_at and not data.get("answered_at"):
                data["answered_at"] = _iso(ctx.answered_at)
            if ctx.ended_at and not data.get("ended_at"):
                data["ended_at"] = _iso(ctx.ended_at)
            if ctx.current_intent:
                data["current_intent"] = ctx.current_intent
            if ctx.sentiment:
                data["sentiment"] = ctx.sentiment
            if ctx.interest_score is not None:
                data["interest_score"] = ctx.interest_score
            if ctx.pending_agent_message is not None:
                data["pending_agent_message"] = ctx.pending_agent_message

            cctx = ctx.context or {}
            if cctx.get("stage"):
                data["stage"] = cctx["stage"]
            if cctx.get("doubts"):
                data["doubts"] = list(cctx["doubts"])
            if cctx.get("objections"):
                data["objections"] = list(cctx["objections"])
            if cctx.get("adaptation"):
                data["adaptation"] = cctx["adaptation"]

            # Prefer whichever transcript is more complete (in-memory during live turns)
            mem_transcript = list(ctx.transcript or [])
            db_transcript = list(data.get("transcript") or [])
            if len(mem_transcript) >= len(db_transcript) and mem_transcript:
                data["turns"] = len(mem_transcript)
                if full:
                    data["transcript"] = copy.deepcopy(mem_transcript)
                if full and ctx.pitch_text and not data.get("pitch_text"):
                    data["pitch_text"] = ctx.pitch_text
            elif not full and len(mem_transcript) > int(data.get("turns") or 0):
                data["turns"] = len(mem_transcript)

            # Recompute speaking window & live_state from freshest in-memory state
            last_ai_started = float(cctx.get("last_ai_started") or 0)
            last_ai_secs = float(cctx.get("last_ai_secs") or 0)
            ai_speaking_until = (
                last_ai_started + last_ai_secs
                if is_active and last_ai_started > 0 and last_ai_secs > 0
                else data.get("ai_speaking_until")
            )
            data["ai_speaking_until"] = ai_speaking_until
            if not is_active:
                data["live_state"] = "ended"
            elif not data.get("answered_at"):
                data["live_state"] = "ringing"
            else:
                latest_turns = data.get("transcript") if full else mem_transcript
                last_non_sys = next((t for t in reversed(latest_turns or []) if t.get("role") != "system"), None)
                if data.get("live_state") == "thinking" or (
                    last_non_sys and last_non_sys.get("role") == "client" and data.get("mode") == "ai"
                ):
                    data["live_state"] = "thinking"
                elif data.get("pending_agent_message") or (
                    last_non_sys
                    and last_non_sys.get("role") in ("ai", "agent")
                    and ai_speaking_until is not None
                    and time.time() < ai_speaking_until
                ):
                    data["live_state"] = "speaking"
                elif data.get("mode") == "ai":
                    data["live_state"] = "listening"
                else:
                    data["live_state"] = "live"
        return data


class ReliableCallPersistence:
    """Coalesced per-call background persistence with retries and flush barriers.

    Guarantees:
    * At most one DB writer runs per ``call_id`` at any moment (no self-inflicted row lock contention).
    * Transient database failures are retried with exponential backoff.
    * Short-lived DB sessions are opened ONLY for the write commit and closed immediately.
    * ``flush_sync(call_id)`` blocks until all pending turns/insights are committed to Postgres
      before end-of-call summarization and follow-up creation run.
    """

    def __init__(self, context_store: CallContextStore, max_workers: int = 4) -> None:
        self._store = context_store
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="voice-persist")
        self._coord_lock = threading.Lock()
        self._in_flight: set[int] = set()
        self._flush_events: Dict[int, threading.Event] = {}

    def enqueue(self, call_id: int) -> None:
        """Schedule asynchronous persistence for ``call_id`` (coalesced per call)."""
        with self._coord_lock:
            if call_id in self._in_flight:
                return
            self._in_flight.add(call_id)
            ev = self._flush_events.setdefault(call_id, threading.Event())
            ev.clear()
        try:
            self._pool.submit(self._run_worker, call_id)
        except RuntimeError:
            # Interpreter shutting down — fall back to synchronous persistence so data is not lost.
            self._run_worker(call_id)

    def flush_sync(self, call_id: int, timeout: float = 12.0) -> bool:
        """Ensure every in-memory update for ``call_id`` is committed to PostgreSQL."""
        ctx = self._store.get(call_id)
        if ctx is None:
            return True

        with self._coord_lock:
            in_flight = call_id in self._in_flight
            ev = self._flush_events.get(call_id)
        if in_flight and ev is not None:
            ev.wait(timeout=timeout)

        # If anything is still dirty (or arrived while waiting), persist synchronously now.
        with ctx.lock:
            needs_flush = (
                ctx.persisted_version < ctx.dirty_version
                or bool(ctx.pending_questions)
                or bool(ctx.pending_kb_ids)
            )
        if needs_flush:
            return self._persist_once(ctx)
        return True

    def _run_worker(self, call_id: int) -> None:
        try:
            while True:
                ctx = self._store.get(call_id)
                if ctx is None:
                    break
                with ctx.lock:
                    needs_flush = (
                        ctx.persisted_version < ctx.dirty_version
                        or bool(ctx.pending_questions)
                        or bool(ctx.pending_kb_ids)
                    )
                if not needs_flush:
                    break
                ok = self._persist_once(ctx)
                if not ok:
                    # Exhausted retries for this wave; avoid spinning tightly.
                    break
        finally:
            with self._coord_lock:
                self._in_flight.discard(call_id)
                ev = self._flush_events.get(call_id)
                if ev is not None:
                    ev.set()

    def _persist_once(self, ctx: LiveCallContext) -> bool:
        with ctx.lock:
            target_version = ctx.dirty_version
            snap = {
                "call_id": ctx.call_id,
                "tenant_id": ctx.tenant_id,
                "twilio_call_sid": ctx.twilio_call_sid,
                "status": ctx.status,
                "mode": ctx.mode,
                "answered_at": ctx.answered_at,
                "ended_at": ctx.ended_at,
                "duration_seconds": ctx.duration_seconds,
                "recording_url": ctx.recording_url,
                "pending_agent_message": ctx.pending_agent_message,
                "current_intent": ctx.current_intent,
                "sentiment": ctx.sentiment,
                "interest_score": ctx.interest_score,
                "transcript": copy.deepcopy(ctx.transcript),
                "context": copy.deepcopy(ctx.context),
            }
            questions = list(ctx.pending_questions)
            kb_ids = list(ctx.pending_kb_ids)
            ctx.pending_questions.clear()
            ctx.pending_kb_ids.clear()

        last_err: Optional[Exception] = None
        for attempt in range(_PERSIST_RETRIES):
            token = current_tenant_id.set(snap["tenant_id"])
            try:
                with Session(database.engine) as session:
                    call = session.exec(
                        select(AICall).where(AICall.id == snap["call_id"])
                        .execution_options(skip_tenant=True)
                    ).first()
                    if call is None:
                        with ctx.lock:
                            ctx.persisted_version = max(ctx.persisted_version, target_version)
                        return True

                    # Preserve terminal status if DB already transitioned (e.g. via status webhook)
                    if call.status not in TERMINAL_STATUSES:
                        if snap["status"] in TERMINAL_STATUSES:
                            call.status = snap["status"]
                        elif snap["status"] and not (
                            call.status == "in-progress" and snap["status"] in ("queued", "initiated", "ringing")
                        ):
                            call.status = snap["status"]

                    if snap["twilio_call_sid"] and not call.twilio_call_sid:
                        call.twilio_call_sid = snap["twilio_call_sid"]
                    if snap["mode"]:
                        call.mode = snap["mode"]
                    if snap["answered_at"] and not call.answered_at:
                        call.answered_at = snap["answered_at"]
                    if snap["ended_at"] and not call.ended_at:
                        call.ended_at = snap["ended_at"]
                    if snap["duration_seconds"] is not None and call.duration_seconds is None:
                        call.duration_seconds = snap["duration_seconds"]
                    if snap["recording_url"] and not call.recording_url:
                        call.recording_url = snap["recording_url"]
                    if snap["current_intent"]:
                        call.current_intent = snap["current_intent"]
                    if snap["sentiment"]:
                        call.sentiment = snap["sentiment"]
                    if snap["interest_score"] is not None:
                        call.interest_score = snap["interest_score"]

                    # Merge transcript safely (never truncate turns already persisted by another path)
                    db_turns = list(call.transcript or [])
                    mem_turns = list(snap["transcript"] or [])
                    if (
                        db_turns
                        and db_turns[-1].get("role") == "system"
                        and str(db_turns[-1].get("text") or "").startswith("Call ended")
                        and not any(
                            t.get("role") == "system" and str(t.get("text") or "").startswith("Call ended")
                            for t in mem_turns
                        )
                    ):
                        mem_turns.append(db_turns[-1])
                    if len(mem_turns) >= len(db_turns):
                        call.transcript = mem_turns
                        flag_modified(call, "transcript")

                    merged_ctx = {**(call.context or {}), **(snap["context"] or {})}
                    call.context = merged_ctx
                    flag_modified(call, "context")
                    call.updated_at = _utcnow()
                    session.add(call)

                    for q in questions:
                        session.add(CallQuestion(
                            tenant_id=call.tenant_id,
                            call_id=call.id,
                            entity_type=call.entity_type,
                            entity_id=call.entity_id,
                            entity_name=call.entity_name,
                            question=str(q.get("question") or "")[:4000],
                            category=q.get("category") or "question",
                            ai_answer=q.get("ai_answer"),
                            status=q.get("status") or "answered",
                            escalation_reason=q.get("reason"),
                        ))

                    for kb_id in kb_ids:
                        kb = session.get(CallKnowledge, kb_id)
                        if kb:
                            kb.usage_count = (kb.usage_count or 0) + 1
                            session.add(kb)

                    session.commit()

                with ctx.lock:
                    ctx.persisted_version = max(ctx.persisted_version, target_version)
                return True
            except Exception as exc:
                last_err = exc
                print(
                    f"[voice-persist] attempt {attempt + 1}/{_PERSIST_RETRIES} failed for call={snap['call_id']}: {exc}",
                    flush=True,
                )
                if attempt < _PERSIST_RETRIES - 1:
                    time.sleep(_RETRY_BACKOFFS[min(attempt, len(_RETRY_BACKOFFS) - 1)])
            finally:
                current_tenant_id.reset(token)

        # All retries failed — restore unsaved side-effect items so a subsequent turn or finalize flush saves them.
        with ctx.lock:
            if questions:
                ctx.pending_questions = questions + ctx.pending_questions
            if kb_ids:
                ctx.pending_kb_ids = kb_ids + ctx.pending_kb_ids
        print(f"[voice-persist] ERROR: persistence exhausted retries for call={snap['call_id']}: {last_err}", flush=True)
        return False


    def flush_all_sync(self, timeout: float = 10.0) -> None:
        """Best-effort graceful shutdown barrier: flush every dirty in-memory call session."""
        with self._store._lock:
            call_ids = list(self._store._sessions.keys())
        for cid in call_ids:
            try:
                self.flush_sync(cid, timeout=timeout)
            except Exception as exc:
                print(f"[voice-persist] shutdown flush failed for call={cid}: {exc}", flush=True)


def build_context_from_call(
    call: AICall,
    *,
    pitch_text: str,
    pitch_audio_url: Optional[str],
    entity_context: str,
    knowledge_items: List[dict],
    voice_profile: Dict[str, Any],
    public_base: str,
    demo_restricted: bool,
) -> LiveCallContext:
    """Create a ``LiveCallContext`` from an ``AICall`` row and preloaded CRM/KB data."""
    cctx = copy.deepcopy(call.context or {})
    phrases = dict(cctx.get("phrases") or {})
    return LiveCallContext(
        call_id=int(call.id),
        tenant_id=call.tenant_id,
        started_by=call.started_by,
        webhook_token=call.webhook_token,
        public_base=public_base or cctx.get("public_base") or "",
        entity_type=call.entity_type,
        entity_id=call.entity_id,
        entity_name=call.entity_name,
        lead_id=call.lead_id,
        to_number=call.to_number,
        from_number=call.from_number,
        pitch_id=call.pitch_id,
        pitch_text=pitch_text or "",
        pitch_audio_url=pitch_audio_url,
        entity_context=entity_context or "No CRM record linked.",
        knowledge_items=list(knowledge_items or []),
        voice_profile=dict(voice_profile or cctx.get("voice_profile") or {}),
        phrases=phrases,
        voice=call.voice or "nova",
        accent=call.accent,
        language=call.language or "en",
        style=call.style or "friendly",
        speed=call.speed or 1.0,
        agent_phone=call.agent_phone,
        demo_restricted=bool(demo_restricted),
        created_at=call.created_at,
        twilio_call_sid=call.twilio_call_sid,
        status=call.status or "queued",
        mode=call.mode or "ai",
        answered_at=call.answered_at,
        ended_at=call.ended_at,
        duration_seconds=call.duration_seconds,
        recording_url=call.recording_url,
        pending_agent_message=call.pending_agent_message,
        current_intent=call.current_intent,
        sentiment=call.sentiment,
        interest_score=call.interest_score,
        transcript=copy.deepcopy(list(call.transcript or [])),
        context=cctx,
        dirty_version=0,
        persisted_version=0,
    )


# Module-level singletons shared across routers/voice_agent.py
store = CallContextStore()
persistence = ReliableCallPersistence(store)
atexit.register(persistence.flush_all_sync)
