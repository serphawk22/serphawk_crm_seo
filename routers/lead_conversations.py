"""Lead call history and conversation intelligence, using V2 identity and record access."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

import database
from database import AICall, ActivityLog, ConversationLog, ConversationReply, Lead
from modules.api_tracker import current_salesperson_id
from modules.tenant_scope import current_tenant_id
from routers import inbox, followups


def get_session():
    with Session(database.engine) as session:
        yield session


def _access(lead_id: int, v: inbox.Viewer = Depends(inbox.get_viewer),
            session: Session = Depends(get_session)):
    followups._check_record(session, v, lead_id, None)


router = APIRouter(tags=["lead conversations"], dependencies=[Depends(_access)])


class ConversationReplyCreateRequest(BaseModel):
    content: str
    author_id: Optional[int] = None
    author_name: Optional[str] = None


def _lead_call_payload(call: AICall) -> dict:
    """Lead-detail call shape: stable aliases + the full normalized transcript."""
    from modules.lead_calls import normalize_transcript

    def iso(value):
        return value.isoformat() if value else None

    return {
        "id": call.id,
        "lead_id": call.lead_id or (call.entity_id if call.entity_type == "lead" else None),
        "call_sid": call.twilio_call_sid,
        "twilio_call_sid": call.twilio_call_sid,
        "started_at": iso(call.created_at),
        "ended_at": iso(call.ended_at),
        "duration": call.duration_seconds,
        "duration_seconds": call.duration_seconds,
        "status": call.status,
        "summary": call.summary,
        "transcript": normalize_transcript(call.transcript),
        "important_notes": call.important_notes,
        "outcome": call.outcome,
        "next_steps": call.next_steps,
        "recording_url": call.recording_url,
        "to_number": call.to_number,
        "entity_name": call.entity_name,
        "follow_up_needed": bool(call.follow_up_needed or call.followup_needed),
        "follow_up_at": iso(call.follow_up_at),
        "follow_up_reason": call.follow_up_reason,
        "created_at": iso(call.created_at),
    }


@router.get("/leads/{lead_id}/calls")
def get_lead_calls(lead_id: int, session: Session = Depends(get_session)):
    """All AI calls linked to this lead, newest first (source for the lead detail page)."""
    if not session.get(Lead, lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    stmt = select(AICall).where(or_(
        AICall.lead_id == lead_id,
        (AICall.entity_type == "lead") & (AICall.entity_id == lead_id),
    ))
    tenant_id = current_tenant_id.get()
    if tenant_id is not None:
        stmt = stmt.where(AICall.tenant_id == tenant_id)
    calls = session.exec(stmt.order_by(AICall.created_at.desc())).all()
    return {"calls": [_lead_call_payload(call) for call in calls], "lead_id": lead_id}


class LeadFollowUpUpdate(BaseModel):
    follow_up_needed: Optional[bool] = None
    next_follow_up_at: Optional[str] = None
    follow_up_at: Optional[str] = None  # alias convenience for API clients
    follow_up_reason: Optional[str] = None
    completed: bool = False


def _parse_lead_datetime(value: Optional[str]) -> Optional[datetime]:
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="next_follow_up_at must be an ISO date/time.")
    if parsed.tzinfo is None:
        from modules.conversation_store import crm_timezone
        parsed = parsed.replace(tzinfo=crm_timezone())
    return parsed.astimezone(timezone.utc)


def _sync_latest_call_followup(session: Session, lead: Lead) -> None:
    """Keep the most recent AI call's follow-up fields consistent with the lead."""
    latest = session.exec(
        select(AICall).where(or_(
            AICall.lead_id == lead.id,
            (AICall.entity_type == "lead") & (AICall.entity_id == lead.id),
        )).order_by(AICall.created_at.desc())
    ).first()
    if not latest:
        return
    latest.follow_up_needed = bool(lead.follow_up_needed)
    latest.follow_up_at = lead.next_follow_up_at
    latest.follow_up_reason = lead.follow_up_reason
    latest.followup_needed = bool(lead.follow_up_needed)
    latest.followup_date = (lead.next_follow_up_at.isoformat()
                            if lead.next_follow_up_at else None)
    session.add(latest)
    # The banner edits the same task shown on the shared follow-up board.
    from database import FollowUp
    task = session.exec(select(FollowUp).join(
        ConversationLog, ConversationLog.id == FollowUp.conversation_id).where(
        ConversationLog.tenant_id == lead.tenant_id,
        ConversationLog.source_ref == f"ai_call:{latest.id}",
        FollowUp.tenant_id == lead.tenant_id).order_by(FollowUp.id.desc())).first()
    if task:
        if not lead.follow_up_needed:
            task.status = followups.core.DONE
            task.completed_at = datetime.now(timezone.utc)
            task.completed_by = current_salesperson_id.get()
        else:
            task.status = followups.core.OPEN
            task.completed_at = None
            task.completed_by = None
            if lead.next_follow_up_at:
                task.due_at = task.remind_at = lead.next_follow_up_at
                task.reminder_sent_at = None
                task.schedule_status = "confirmed"
            task.notes = lead.follow_up_reason
        task.updated_at = datetime.now(timezone.utc)
        session.add(task)


@router.patch("/leads/{lead_id}/followup")
def update_lead_followup(lead_id: int, body: LeadFollowUpUpdate,
                         session: Session = Depends(get_session)):
    """Mark a follow-up done, reschedule it, or edit its reason."""
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if body.completed:
        lead.follow_up_needed = False
        lead.next_follow_up_at = None
        lead.follow_up_reason = None
    else:
        raw_date = body.next_follow_up_at if body.next_follow_up_at is not None else body.follow_up_at
        if body.follow_up_needed is not None and not body.follow_up_needed:
            lead.follow_up_needed = False
            lead.next_follow_up_at = None
            lead.follow_up_reason = None
        else:
            if raw_date is not None:
                lead.next_follow_up_at = _parse_lead_datetime(raw_date)
                if lead.next_follow_up_at is not None:
                    lead.follow_up_needed = True
            if body.follow_up_reason is not None:
                lead.follow_up_reason = body.follow_up_reason or None
            if body.follow_up_needed is not None:
                lead.follow_up_needed = bool(body.follow_up_needed)
            if lead.next_follow_up_at is not None and lead.follow_up_needed is None:
                lead.follow_up_needed = True

    _sync_latest_call_followup(session, lead)
    action = "Follow-up completed" if body.completed else "Follow-up updated"
    session.add(ActivityLog(
        tenant_id=lead.tenant_id,
        userId=current_salesperson_id.get(),
        action=action,
        method="Phone",
        content=(f"Follow-up marked done for {lead.company_name}" if body.completed
                 else f"Follow-up updated for {lead.company_name}"),
        details=lead.follow_up_reason,
        lead_id=lead.id,
    ))
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return {"ok": True, "lead": lead.model_dump()}


def _lead_or_404(session: Session, lead_id: int) -> Lead:
    lead = session.exec(select(Lead).where(Lead.id == lead_id)).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


def _parse_conversation_at(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO timestamp. A naive value is read in the CRM timezone (not UTC)."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="conversation_at must be an ISO date/time.")
    if parsed.tzinfo is None:
        from modules.conversation_store import crm_timezone
        parsed = parsed.replace(tzinfo=crm_timezone())
    return parsed.astimezone(timezone.utc)


def _conversation_payload(session: Session, conv: ConversationLog, include_replies: bool = True) -> dict:
    from database import FollowUp
    from modules.followups_core import as_utc

    def iso(dt):
        value = as_utc(dt)
        return value.isoformat() if value else None

    replies = []
    if include_replies:
        rows = session.exec(
            select(ConversationReply).where(ConversationReply.conversation_id == conv.id)
            .order_by(ConversationReply.created_at.asc())
        ).all()
        replies = [{
            "id": r.id, "content": r.content, "author_id": r.author_id,
            "author_name": r.author_name, "created_at": iso(r.created_at),
        } for r in rows]
    fu = session.exec(
        select(FollowUp).where(FollowUp.conversation_id == conv.id).order_by(FollowUp.id.desc())
    ).first()
    follow_up = None
    if fu:
        follow_up = {
            "id": fu.id, "title": fu.title, "follow_up_type": fu.follow_up_type,
            "due_at": iso(fu.due_at), "status": fu.status,
            "priority": fu.priority, "assigned_to": fu.assigned_to,
            "ai_detected": bool(fu.ai_detected), "schedule_status": fu.schedule_status or "confirmed",
            "requested_window": fu.requested_window, "requested_at_text": fu.requested_at_text,
        }
    return {
        "id": conv.id, "lead_id": conv.lead_id, "client_id": conv.client_id,
        "title": conv.title, "type": conv.type, "description": conv.description,
        "conversation_at": iso(conv.conversation_at or conv.created_at),
        "transcript": conv.transcript,
        "ai_summary": conv.ai_summary, "key_points": conv.key_points or [],
        "requirements": conv.requirements or [], "objections": conv.objections or [],
        "decisions": conv.decisions or [], "follow_up_actions": conv.follow_up_actions or [],
        "follow_up_date": iso(conv.follow_up_date),
        "ai_status": conv.ai_status or "pending", "ai_error": conv.ai_error,
        "source": conv.source, "source_ref": conv.source_ref,
        "author_id": conv.author_id, "author_name": conv.author_name,
        "attachment_urls": conv.attachment_urls or [], "replies": replies,
        "follow_up": follow_up,
        "created_at": iso(conv.created_at), "updated_at": iso(conv.updated_at or conv.created_at),
    }


@router.get("/leads/{lead_id}/conversations")
def get_lead_conversations(lead_id: int, type: Optional[str] = Query(default=None),
                           include_replies: bool = Query(default=True),
                           session: Session = Depends(get_session)):
    _lead_or_404(session, lead_id)
    stmt = select(ConversationLog).where(ConversationLog.lead_id == lead_id)
    if type and type != "all":
        stmt = stmt.where(ConversationLog.type == type)
    convs = session.exec(stmt.order_by(
        func.coalesce(ConversationLog.conversation_at, ConversationLog.created_at).desc(),
        ConversationLog.created_at.desc(),
    )).all()
    return {"conversations": [_conversation_payload(session, c, include_replies) for c in convs]}


class LeadConversationCreate(BaseModel):
    title: str
    type: str = "call"
    description: Optional[str] = None
    transcript: Optional[str] = None
    conversation_at: Optional[str] = None
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    attachment_urls: Optional[List[str]] = []
    analyze: bool = True


class LeadConversationUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    transcript: Optional[str] = None
    conversation_at: Optional[str] = None
    author_name: Optional[str] = None
    attachment_urls: Optional[List[str]] = None
    reanalyze: bool = False


@router.post("/leads/{lead_id}/conversations")
def create_lead_conversation(lead_id: int, body: LeadConversationCreate,
                             session: Session = Depends(get_session)):
    from modules import conversation_store

    lead = _lead_or_404(session, lead_id)
    uid = current_salesperson_id.get()
    when = _parse_conversation_at(body.conversation_at) or datetime.now(timezone.utc)
    conv, created = conversation_store.upsert_conversation(
        session, lead_id=lead_id, title=body.title.strip() or "Conversation",
        type=(body.type or "call").strip().lower(), description=body.description,
        transcript=body.transcript, conversation_at=when,
        author_id=uid, author_name=body.author_name,
        tenant_id=lead.tenant_id, source="manual", attachment_urls=body.attachment_urls or [],
    )
    session.commit()
    session.refresh(conv)

    result = {}
    if body.analyze:
        # Notes are already committed, so an AI failure cannot lose the conversation.
        result = conversation_store.analyze_and_detect(
            session, conv, actor_id=uid, record_label=lead.company_name or "",
        )
    return {
        "conversation": _conversation_payload(session, conv), "created": created,
        "ai_status": conv.ai_status, "ai_error": conv.ai_error,
        "follow_up": result.get("follow_up"), "follow_up_created": result.get("created", False),
    }


@router.patch("/leads/{lead_id}/conversations/{conv_id}")
def update_lead_conversation(lead_id: int, conv_id: int, body: LeadConversationUpdate,
                             session: Session = Depends(get_session)):
    from modules import conversation_store

    lead = _lead_or_404(session, lead_id)
    conv = conversation_store.find_for_lead(session, lead_id, conv_id, tenant_id=lead.tenant_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    changed = False
    if body.title is not None:
        conv.title = body.title.strip()[:500] or conv.title
        changed = True
    if body.type is not None:
        conv.type = body.type.strip().lower()[:50] or conv.type
        changed = True
    if body.description is not None:
        conv.description = body.description or None
        changed = True
    if body.transcript is not None:
        conv.transcript = body.transcript or None
        changed = True
    if body.conversation_at is not None:
        conv.conversation_at = _parse_conversation_at(body.conversation_at)
        changed = True
    if body.author_name is not None:
        conv.author_name = body.author_name or None
        changed = True
    if body.attachment_urls is not None:
        conv.attachment_urls = body.attachment_urls
        changed = True
    if changed:
        conv.updated_at = datetime.now(timezone.utc)
        session.add(conv)
        session.commit()
        session.refresh(conv)
    if body.reanalyze:
        conversation_store.analyze_and_detect(
            session, conv, actor_id=current_salesperson_id.get(),
            record_label=lead.company_name or "",
        )
    return {"conversation": _conversation_payload(session, conv), "ai_status": conv.ai_status,
            "ai_error": conv.ai_error}


@router.post("/leads/{lead_id}/conversations/{conv_id}/analyze")
def analyze_lead_conversation(lead_id: int, conv_id: int, session: Session = Depends(get_session)):
    """(Re)run the AI summary/intelligence and follow-up detection. Safe to retry."""
    from modules import conversation_store

    lead = _lead_or_404(session, lead_id)
    conv = conversation_store.find_for_lead(session, lead_id, conv_id, tenant_id=lead.tenant_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = conversation_store.analyze_and_detect(
        session, conv, actor_id=current_salesperson_id.get(),
        record_label=lead.company_name or "",
    )
    return {
        "conversation": _conversation_payload(session, conv),
        "ok": result.get("ok"), "error": result.get("error"),
        "ai_status": conv.ai_status, "ai_error": conv.ai_error,
        "follow_up": result.get("follow_up"), "follow_up_created": result.get("created", False),
    }


@router.get("/leads/{lead_id}/conversations/{conv_id}/replies")
def get_conversation_replies(lead_id: int, conv_id: int, session: Session = Depends(get_session)):
    from modules import conversation_store

    lead = _lead_or_404(session, lead_id)
    conv = conversation_store.find_for_lead(session, lead_id, conv_id, tenant_id=lead.tenant_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"replies": _conversation_payload(session, conv)["replies"]}


@router.post("/leads/{lead_id}/conversations/{conv_id}/replies")
def add_lead_conversation_reply(lead_id: int, conv_id: int, body: ConversationReplyCreateRequest,
                                session: Session = Depends(get_session)):
    from modules import conversation_store

    lead = _lead_or_404(session, lead_id)
    conv = conversation_store.find_for_lead(session, lead_id, conv_id, tenant_id=lead.tenant_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not (body.content or "").strip():
        raise HTTPException(status_code=400, detail="A reply cannot be empty.")
    uid = current_salesperson_id.get()
    reply = ConversationReply(
        tenant_id=conv.tenant_id, conversation_id=conv.id, content=body.content.strip(),
        author_id=uid, author_name=body.author_name,
    )
    session.add(reply)
    conv.updated_at = datetime.now(timezone.utc)
    session.add(conv)
    session.commit()
    session.refresh(reply)
    # A reply often carries the actual commitment; re-read the thread for follow-up intent.
    result = conversation_store.analyze_and_detect(
        session, conv, actor_id=uid, record_label=lead.company_name or "",
    )
    return {
        "reply": {"id": reply.id, "content": reply.content, "author_name": reply.author_name,
                  "created_at": reply.created_at.isoformat() if reply.created_at else None},
        "conversation": _conversation_payload(session, conv),
        "ai_status": conv.ai_status, "follow_up": result.get("follow_up"),
        "follow_up_created": result.get("created", False),
    }
