"""Conversation intelligence storage and follow-up detection."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy import inspect, text
from sqlmodel import Session, select

from database import (
    AICall,
    ActivityLog,
    ConversationLog,
    ConversationReply,
    FollowUp,
    FollowUpNoteScan,
    Lead,
    Notification,
    User,
    engine,
)
from modules import followup_ai, followups_core
from modules.followups_core import as_utc, utcnow

log = logging.getLogger(__name__)


def crm_timezone():
    tz_name = os.getenv("CRM_TIMEZONE") or "Asia/Kolkata"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def ensure_conversation_schema(engine_to_use=None) -> Dict[str, Any]:
    """Ensure conversation/follow-up schema exists. Idempotent for SQLite and PostgreSQL."""
    eng = engine_to_use or engine
    result = {"columns": [], "indexes": [], "errors": []}
    try:
        insp = inspect(eng)
        dialect = eng.dialect.name
    except Exception as e:
        result["errors"].append(str(e))
        return result

    statements = []

    conv_cols_needed = [
        ("conversation_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("transcript", "TEXT"),
        ("ai_summary", "TEXT"),
        ("key_points", "JSON" if dialect == "postgresql" else "TEXT"),
        ("requirements", "JSON" if dialect == "postgresql" else "TEXT"),
        ("objections", "JSON" if dialect == "postgresql" else "TEXT"),
        ("decisions", "JSON" if dialect == "postgresql" else "TEXT"),
        ("follow_up_actions", "JSON" if dialect == "postgresql" else "TEXT"),
        ("follow_up_date", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("ai_status", "VARCHAR(20)"),
        ("ai_error", "TEXT"),
        ("source", "VARCHAR(50)"),
        ("source_ref", "VARCHAR(120)"),
        ("updated_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
    ]
    if insp.has_table("conversation_logs"):
        existing = {c["name"] for c in insp.get_columns("conversation_logs")}
        for col_name, col_type in conv_cols_needed:
            if col_name not in existing:
                if dialect == "postgresql":
                    statements.append(f'ALTER TABLE conversation_logs ADD COLUMN IF NOT EXISTS {col_name} {col_type}')
                else:
                    statements.append(f'ALTER TABLE conversation_logs ADD COLUMN {col_name} {col_type}')
                result["columns"].append(f"conversation_logs.{col_name}")

    fu_cols_needed = [
        ("conversation_id", "INTEGER"),
        ("ai_detected", "BOOLEAN" if dialect == "postgresql" else "BOOLEAN DEFAULT 0"),
        ("schedule_status", "VARCHAR(30)"),
        ("requested_window", "VARCHAR(120)"),
        ("condition", "TEXT"),
        ("requested_at_text", "VARCHAR(200)"),
        ("reschedule_count", "INTEGER DEFAULT 0"),
        ("rescheduled_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("idempotency_key", "VARCHAR(200)"),
        ("follow_up_type", "VARCHAR(40)"),
        ("ai_reason", "TEXT"),
        ("source_ref", "VARCHAR(100)"),
        ("remind_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("priority", "VARCHAR(20)"),
        ("email_subject", "VARCHAR(500)"),
        ("email_body", "TEXT"),
        ("auto_send", "BOOLEAN" if dialect == "postgresql" else "BOOLEAN DEFAULT 0"),
        ("email_sent_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("sent_email_id", "INTEGER"),
        ("last_error", "TEXT"),
        ("reminder_sent_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("completed_at", "TIMESTAMP" if dialect != "sqlite" else "DATETIME"),
        ("completed_by", "INTEGER"),
        ("outcome", "TEXT"),
    ]
    if insp.has_table("follow_ups"):
        existing = {c["name"] for c in insp.get_columns("follow_ups")}
        for col_name, col_type in fu_cols_needed:
            if col_name not in existing:
                if dialect == "postgresql":
                    statements.append(f'ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS {col_name} {col_type}')
                else:
                    statements.append(f'ALTER TABLE follow_ups ADD COLUMN {col_name} {col_type}')
                result["columns"].append(f"follow_ups.{col_name}")

    try:
        with eng.begin() as conn:
            for stmt in statements:
                try:
                    conn.execute(text(stmt))
                except Exception as e:
                    result["errors"].append(str(e))
            try:
                if dialect == "postgresql":
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_ups_idempotency_key ON follow_ups(idempotency_key) WHERE idempotency_key IS NOT NULL"))
                    result["indexes"].append("uq_follow_ups_idempotency_key")
                else:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_ups_idempotency_key ON follow_ups(idempotency_key)"))
                    result["indexes"].append("uq_follow_ups_idempotency_key")
            except Exception as e:
                result["errors"].append(str(e))
            try:
                if dialect == "postgresql":
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_logs_source_ref ON conversation_logs(tenant_id, source_ref) WHERE source_ref IS NOT NULL"))
                    result["indexes"].append("uq_conversation_logs_source_ref")
                else:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_logs_source_ref ON conversation_logs(tenant_id, source_ref)"))
                    result["indexes"].append("uq_conversation_logs_source_ref")
            except Exception as e:
                result["errors"].append(str(e))
    except Exception as e:
        result["errors"].append(str(e))

    return result


def resolve_due_at(conv: ConversationLog, due_date: Optional[str], due_time: Optional[str], ambiguous: bool = False) -> Tuple[datetime, str]:
    """Resolve due datetime based on conversation time and CRM timezone."""
    tz = crm_timezone()
    base = as_utc(conv.conversation_at) if conv.conversation_at else utcnow()
    base_local = base.astimezone(tz)

    status = "confirmed"
    if ambiguous or not due_date:
        status = "needs_confirmation"
        try:
            due_local = base_local + timedelta(days=3)
            due_local = due_local.replace(hour=10, minute=0, second=0, microsecond=0)
        except Exception:
            due_local = base_local.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)
    else:
        try:
            from datetime import date as _date
            d = _date.fromisoformat(str(due_date)[:10])
            if due_time:
                try:
                    hh, mm = str(due_time).split(":")
                    h, m = int(hh), int(mm)
                    status = "confirmed"
                except Exception:
                    h, m = 10, 0
                    status = "needs_confirmation"
            else:
                h, m = 10, 0
                status = "needs_confirmation"
            due_local = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        except Exception:
            due_local = base_local.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)
            status = "needs_confirmation"

    due_utc = due_local.astimezone(timezone.utc)
    return due_utc, status


def find_for_lead(session: Session, lead_id: int, conv_id: int, tenant_id: Optional[int] = None) -> Optional[ConversationLog]:
    stmt = select(ConversationLog).where(ConversationLog.id == conv_id, ConversationLog.lead_id == lead_id)
    if tenant_id is not None:
        stmt = stmt.where(ConversationLog.tenant_id == tenant_id)
    return session.exec(stmt).first()


def upsert_conversation(session: Session, lead_id: int, title: str, type: str = "call",
                        description: Optional[str] = None, transcript: Optional[str] = None,
                        conversation_at: Optional[datetime] = None, author_id: Optional[int] = None,
                        author_name: Optional[str] = None, tenant_id: Optional[int] = None,
                        source: str = "manual", attachment_urls: Optional[List[str]] = None,
                        source_ref: Optional[str] = None, **kwargs) -> Tuple[ConversationLog, bool]:
    """Create or update a conversation."""
    if source_ref:
        existing = session.exec(select(ConversationLog).where(ConversationLog.source_ref == source_ref)).first()
        if existing:
            return existing, False
    conv = ConversationLog(
        tenant_id=tenant_id,
        lead_id=lead_id,
        title=title or "Conversation",
        type=type or "call",
        description=description,
        transcript=transcript,
        conversation_at=as_utc(conversation_at) if conversation_at else utcnow(),
        author_id=author_id,
        author_name=author_name,
        source=source,
        source_ref=source_ref,
        attachment_urls=attachment_urls or [],
        ai_status="pending",
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(conv)
    session.flush()
    session.refresh(conv)
    return conv, True


def save_call_conversation(call_id: int, tenant_id: Optional[int] = None, session: Optional[Session] = None) -> Dict[str, Any]:
    """Persist AI call transcript as a conversation and analyze for follow-ups."""
    try:
        if session is None:
            with Session(engine) as s:
                return save_call_conversation(call_id, tenant_id, session=s)
        call = session.get(AICall, call_id)
        if not call:
            return {"ok": False, "error": "call_not_found"}
        # Build transcript text
        transcript_text = ""
        try:
            if isinstance(call.transcript, list):
                parts = []
                for t in call.transcript:
                    if isinstance(t, dict):
                        speaker = t.get("speaker") or t.get("role") or ""
                        text = t.get("text") or t.get("message") or ""
                        if speaker and text:
                            parts.append(f"{speaker}: {text}")
                        elif text:
                            parts.append(text)
                transcript_text = "\n".join(parts)
            elif isinstance(call.transcript, str):
                transcript_text = call.transcript
        except Exception:
            transcript_text = str(call.transcript) if call.transcript else ""
        source_ref = f"ai_call:{call.id}"
        # Upsert conversation
        conv, created = upsert_conversation(
            session,
            lead_id=call.lead_id or 0,
            title=call.summary or f"AI Call {call.id}",
            type="call",
            description=call.important_notes or call.next_steps,
            transcript=transcript_text,
            conversation_at=call.ended_at or call.started_at or call.created_at,
            author_id=call.started_by,
            author_name=None,
            tenant_id=tenant_id or call.tenant_id,
            source="ai_call",
            source_ref=source_ref,
        )
        # Analyze and detect
        try:
            analysis = analyze_and_detect(session, conv, actor_id=call.started_by, record_label=call.summary or "", existing_summary=call.summary or "")
            result = {"ok": True, "conversation_id": conv.id}
            if analysis.get("follow_up_created") and analysis.get("follow_up"):
                fu = analysis.get("follow_up")
                result["follow_up_id"] = getattr(fu, "id", None)
            elif analysis.get("follow_up"):
                fu = analysis.get("follow_up")
                result["follow_up_id"] = getattr(fu, "id", None)
            return result
        except Exception as e:
            log.error(f"save_call_conversation analyze failed: {e}")
            session.commit()
            return {"ok": True, "conversation_id": conv.id}
    except Exception as e:
        log.error(f"save_call_conversation failed: {e}")
        return {"ok": False, "error": str(e)}


def analyze_and_detect(session: Session, conv: ConversationLog, actor_id: Optional[int] = None,
                       record_label: str = "", existing_summary: str = "") -> Dict[str, Any]:
    """Analyze conversation and detect follow-ups."""
    try:
        text_to_analyze = conv.description or conv.transcript or ""
        written_at = conv.conversation_at or conv.created_at
        if written_at and written_at.tzinfo is None:
            written_at = written_at.replace(tzinfo=timezone.utc)
        result = followup_ai.analyze_conversation(text_to_analyze, written_at, record_label=record_label,
                                                  existing_summary=existing_summary)
    except Exception as e:
        log.error(f"analyze_and_detect failed: {e}")
        conv.ai_status = "failed"
        conv.ai_error = str(e)
        session.add(conv)
        session.commit()
        session.refresh(conv)
        return {"ok": False, "error": str(e), "follow_up_created": False}

    try:
        # Store results
        conv.ai_summary = result.get("summary") or ""
        conv.key_points = result.get("key_points") or []
        conv.requirements = result.get("requirements") or []
        conv.objections = result.get("objections") or []
        conv.decisions = result.get("decisions") or []
        conv.follow_up_actions = result.get("follow_up_actions") or []
        conv.ai_status = "completed" if not result.get("error") else "failed"
        if result.get("error"):
            conv.ai_error = result.get("error")
        conv.updated_at = utcnow()
        session.add(conv)
        session.flush()

        follow_up_info = result.get("follow_up") or {}
        if follow_up_info.get("should_follow_up") or follow_up_info.get("due_date"):
            # Try to create follow-up
            try:
                due_utc, status = resolve_due_at(conv, follow_up_info.get("due_date"),
                                                 follow_up_info.get("due_time"),
                                                 ambiguous=bool(follow_up_info.get("ambiguous")))
                fu = FollowUp(
                    tenant_id=conv.tenant_id,
                    lead_id=conv.lead_id,
                    title=follow_up_info.get("title") or "Follow up",
                    notes=follow_up_info.get("reason") or follow_up_info.get("quote"),
                    channel=follow_up_info.get("channel") or "email",
                    follow_up_type=follow_up_info.get("follow_up_type"),
                    due_at=due_utc,
                    remind_at=due_utc,
                    status="Pending",
                    priority=follow_up_info.get("priority") or "medium",
                    source="ai_auto",
                    source_ref=f"conv-{conv.id}",
                    ai_reason=follow_up_info.get("reason") or follow_up_info.get("quote"),
                    conversation_id=conv.id,
                    ai_detected=True,
                    schedule_status=status,
                    requested_window=follow_up_info.get("requested_window"),
                    condition=follow_up_info.get("condition"),
                    requested_at_text=follow_up_info.get("requested_at_text"),
                    idempotency_key=f"conv-{conv.id}",
                    assigned_to=actor_id,
                    created_by=actor_id,
                )
                session.add(fu)
                session.flush()
                session.refresh(fu)
                conv.follow_up_date = fu.due_at
                session.add(conv)
                session.commit()
                return {"ok": True, "follow_up_created": True, "follow_up": fu, "conversation": conv}
            except Exception as e:
                log.error(f"Failed to create follow-up: {e}")
                session.rollback()
                # Try to find existing
                session.add(conv)
                session.commit()
                return {"ok": True, "follow_up_created": False, "conversation": conv}
        else:
            session.commit()
            return {"ok": True, "follow_up_created": False, "conversation": conv}
    except Exception as e:
        log.error(f"analyze_and_detect store failed: {e}")
        conv.ai_status = "failed"
        conv.ai_error = str(e)
        session.add(conv)
        session.commit()
        return {"ok": False, "error": str(e), "follow_up_created": False}
