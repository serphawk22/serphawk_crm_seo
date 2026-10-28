"""Persist conversations before analysis; share the CRM's tenant-scoped follow-ups."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

import database
from database import AICall, ConversationLog, ConversationReply, FollowUp, FollowUpNoteScan
from modules import features, followup_ai, followups_core as core
from modules.tenant_scope import current_tenant_id


def crm_timezone(tenant_id=None):
    if tenant_id is None:
        tenant_id = current_tenant_id.get()
    return followup_ai._crm_tz(tenant_id)[0]


def ensure_conversation_schema(engine_to_use=None):
    """Add model columns and indexes to existing tables, without changing old data."""
    eng = engine_to_use or database.engine
    result = {"columns": [], "indexes": [], "errors": []}
    defaults = {"follow_up_needed": "FALSE", "ai_detected": "FALSE", "reschedule_count": "0",
                "schedule_status": "'confirmed'", "ai_status": "'pending'", "source": "'manual'"}
    for model in (database.Lead, AICall, ConversationLog, FollowUp):
        table = model.__table__
        inspector = inspect(eng)
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            kind = column.type.compile(dialect=eng.dialect)
            default = f" DEFAULT {defaults[column.name]}" if column.name in defaults else ""
            with eng.begin() as conn:
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {kind}{default}'))
            result["columns"].append(f"{table.name}.{column.name}")
        for index in table.indexes:
            index.create(eng, checkfirst=True)
            result["indexes"].append(index.name)
    return result


def resolve_due_at(conv, due_date, due_time, ambiguous=False):
    tz = crm_timezone(conv.tenant_id)
    base = core.as_utc(conv.conversation_at or conv.created_at or core.utcnow()).astimezone(tz)
    status = "needs_confirmation" if ambiguous or not due_time else "confirmed"
    try:
        day = datetime.fromisoformat(str(due_date)[:10]).date()
        hour, minute = map(int, (due_time or "10:00").split(":"))
        local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
    except (TypeError, ValueError):
        local = base.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)
        status = "needs_confirmation"
    return local.astimezone(timezone.utc), status


def find_for_lead(session, lead_id, conv_id, tenant_id=None):
    stmt = select(ConversationLog).where(ConversationLog.id == conv_id, ConversationLog.lead_id == lead_id)
    if tenant_id is not None:
        stmt = stmt.where(ConversationLog.tenant_id == tenant_id)
    return session.exec(stmt).first()


def upsert_conversation(session, lead_id=None, title="Conversation", type="call", description=None,
                        transcript=None, conversation_at=None, author_id=None, author_name=None,
                        tenant_id=None, source="manual", attachment_urls=None, source_ref=None,
                        client_id=None):
    if source_ref:
        existing = session.exec(select(ConversationLog).where(
            ConversationLog.tenant_id == tenant_id, ConversationLog.source_ref == source_ref)).first()
        if existing:
            return existing, False
    conv = ConversationLog(
        tenant_id=tenant_id, lead_id=lead_id, client_id=client_id, title=title[:500] or "Conversation",
        type=type or "call", description=description, transcript=transcript,
        conversation_at=core.as_utc(conversation_at) if conversation_at else core.utcnow(),
        author_id=author_id, author_name=author_name, source=source, source_ref=source_ref,
        attachment_urls=attachment_urls or [], updated_at=core.utcnow(),
    )
    try:
        with session.begin_nested():
            session.add(conv)
            session.flush()
    except IntegrityError:
        existing = session.exec(select(ConversationLog).where(
            ConversationLog.tenant_id == tenant_id, ConversationLog.source_ref == source_ref)).first()
        if not source_ref or not existing:
            raise
        return existing, False
    return conv, True


def _followup(session, conv):
    fu = session.exec(select(FollowUp).where(
        FollowUp.tenant_id == conv.tenant_id, FollowUp.idempotency_key == f"conv-{conv.id}")).first()
    if fu:
        return fu
    mark = session.exec(select(FollowUpNoteScan).where(
        FollowUpNoteScan.tenant_id == conv.tenant_id, FollowUpNoteScan.source_key == f"conv-{conv.id}")).first()
    if mark and mark.follow_up_id:
        return session.exec(select(FollowUp).where(
            FollowUp.tenant_id == conv.tenant_id, FollowUp.id == mark.follow_up_id)).first()
    return None


def analyze_and_detect(session, conv, actor_id=None, record_label="", existing_summary=""):
    """Retry analysis safely; a source creates at most one follow-up, even across workers."""
    replies = session.exec(select(ConversationReply).where(
        ConversationReply.tenant_id == conv.tenant_id, ConversationReply.conversation_id == conv.id)
        .order_by(ConversationReply.created_at)).all()
    content = "\n".join(part for part in [conv.description, conv.transcript,
                         *[r.content for r in replies]] if part)
    try:
        analysis = followup_ai.analyze_conversation(
            content, conv.conversation_at or conv.created_at, record_label=record_label,
            existing_summary=existing_summary, tenant_id=conv.tenant_id)
    except Exception as exc:
        conv.ai_status, conv.ai_error = "failed", str(exc)
        session.add(conv)
        session.commit()
        return {"ok": False, "error": str(exc), "created": False, "follow_up_created": False}
    conv.ai_summary = analysis.get("summary") or ""
    for key in ("key_points", "requirements", "objections", "decisions", "follow_up_actions"):
        setattr(conv, key, analysis.get(key) or [])
    conv.ai_error = analysis.get("error") or None
    conv.ai_status = "failed" if conv.ai_error else "completed"
    conv.updated_at = core.utcnow()
    session.add(conv)
    session.commit()
    fu, created = _followup(session, conv), False
    suggestion = analysis.get("follow_up") or {}
    if suggestion.get("should_follow_up") and features.is_enabled(conv.tenant_id, "followups"):
        due, status = resolve_due_at(conv, suggestion.get("due_date"), suggestion.get("due_time"),
                                    bool(suggestion.get("ambiguous") or suggestion.get("condition")
                                         or suggestion.get("requested_window")))
        if not fu:
            info = core.record_info(session, conv.lead_id, conv.client_id) or {}
            fu = FollowUp(
                tenant_id=conv.tenant_id, lead_id=conv.lead_id, client_id=conv.client_id,
                title=suggestion.get("title") or "Follow up", notes=suggestion.get("reason"),
                ai_reason=suggestion.get("quote") or suggestion.get("reason"),
                channel=suggestion.get("channel") or "email", priority=suggestion.get("priority") or "medium",
                follow_up_type=suggestion.get("follow_up_type"), due_at=due, remind_at=due,
                source="ai_auto", source_ref=f"conv-{conv.id}", idempotency_key=f"conv-{conv.id}",
                conversation_id=conv.id, ai_detected=True, schedule_status=status,
                requested_window=suggestion.get("requested_window"), condition=suggestion.get("condition"),
                requested_at_text=suggestion.get("requested_at_text"),
                assigned_to=info.get("owner_id") or actor_id, created_by=actor_id,
                contact_name=info.get("contact_name"), contact_email=info.get("contact_email"),
                company_name=info.get("label"),
            )
            try:
                with session.begin_nested():
                    session.add(fu)
                    session.flush()
                    core.log_activity(session, fu, "AI scheduled a follow-up", fu.notes or "", actor_id)
                    core.notify(session, fu.assigned_to, fu.tenant_id, f"AI scheduled a follow-up: {fu.title}",
                                fu.notes or "", core.record_path(conv.lead_id, conv.client_id))
                created = True
            except IntegrityError:
                fu = _followup(session, conv)
                if not fu:
                    raise
        if fu:
            conv.follow_up_date = fu.due_at
            session.add(conv)
    key = f"conv-{conv.id}"
    mark = session.exec(select(FollowUpNoteScan).where(FollowUpNoteScan.source_key == key)).first()
    if not mark and not conv.ai_error:
        try:
            with session.begin_nested():
                session.add(FollowUpNoteScan(tenant_id=conv.tenant_id, source_key=key,
                                            follow_up_id=fu.id if fu else None))
                session.flush()
        except IntegrityError:
            pass
    session.commit()
    return {"ok": not bool(conv.ai_error), "error": conv.ai_error, "created": created,
            "follow_up_created": created, "follow_up": fu, "conversation": conv}


def save_call_conversation(call_id, tenant_id=None, session=None):
    token = current_tenant_id.set(tenant_id)
    try:
        if session is None:
            with Session(database.engine) as own_session:
                return save_call_conversation(call_id, tenant_id, own_session)
        call = session.exec(select(AICall).where(AICall.id == call_id, AICall.tenant_id == tenant_id)).first()
        if not call:
            return {"ok": False, "error": "call_not_found"}
        from modules.lead_calls import normalize_transcript, resolve_lead
        lead = resolve_lead(session, lead_id=call.lead_id, entity_type=call.entity_type,
                            entity_id=call.entity_id, to_number=call.to_number, tenant_id=tenant_id)
        client_id = call.entity_id if call.entity_type == "client" else None
        if not lead and not client_id:
            return {"ok": False, "error": "record_not_found"}
        transcript = "\n".join(f"{t['speaker']}: {t['text']}" for t in normalize_transcript(call.transcript))
        conv, created = upsert_conversation(
            session, lead_id=lead.id if lead else None, client_id=client_id,
            title=call.summary or f"AI Call {call.id}", type="call", description=call.important_notes or call.next_steps,
            transcript=transcript, conversation_at=call.ended_at or call.created_at,
            author_id=call.started_by, tenant_id=call.tenant_id, source="ai_call", source_ref=f"ai_call:{call.id}")
        session.commit()
        if created or conv.ai_status != "completed":
            analysis = analyze_and_detect(session, conv, actor_id=call.started_by,
                                          record_label=call.entity_name or "", existing_summary=call.summary or "")
            fu = analysis.get("follow_up")
        else:
            fu = _followup(session, conv)
        return {"ok": True, "conversation_id": conv.id, "follow_up_id": fu.id if fu else None}
    finally:
        current_tenant_id.reset(token)
