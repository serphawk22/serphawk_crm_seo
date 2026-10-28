"""Lead-linked AI calls: normalization, follow-up extraction, persistence, and migration helpers."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func
from sqlmodel import Session, select

from database import AICall, ActivityLog, ConversationLog, FollowUp, Lead
from modules import followup_ai
from modules.followups_core import as_utc, utcnow

log = logging.getLogger(__name__)

def latest_call_info(session, lead_ids):
    """Read only the latest call metadata per lead, without loading transcript bodies."""
    if not lead_ids:
        return {}
    linked_id = func.coalesce(AICall.lead_id, case((AICall.entity_type == "lead", AICall.entity_id)))
    ranked = select(
        linked_id.label("lead_id"), AICall.id.label("id"), AICall.status, AICall.created_at,
        func.row_number().over(partition_by=linked_id, order_by=(AICall.created_at.desc(), AICall.id.desc())).label("rank"),
    ).where(linked_id.in_(lead_ids)).subquery()
    rows = session.execute(select(ranked).where(ranked.c.rank == 1)).mappings().all()
    return {r["lead_id"]: {"latest_call_id": r["id"], "latest_call_status": r["status"],
                          "latest_call_at": as_utc(r["created_at"]).isoformat() if r["created_at"] else None}
            for r in rows}


def sync_task_state(session, fu, deleted=False):
    """Keep a call and its latest lead banner aligned when either follow-up UI edits the task."""
    if not fu.conversation_id:
        return
    conv = session.get(ConversationLog, fu.conversation_id)
    if not conv or conv.tenant_id != fu.tenant_id or not (conv.source_ref or "").startswith("ai_call:"):
        return
    try:
        call_id = int(conv.source_ref.split(":", 1)[1])
    except ValueError:
        return
    call = session.get(AICall, call_id)
    if not call or call.tenant_id != fu.tenant_id:
        return
    needed = not deleted and fu.status in ("Pending", "In Progress")
    call.follow_up_needed = call.followup_needed = needed
    call.follow_up_at = fu.due_at if needed else None
    call.followup_date = as_utc(fu.due_at).isoformat() if needed else None
    call.follow_up_reason = (fu.ai_reason or fu.notes) if needed else None
    session.add(call)
    conv.follow_up_date = call.follow_up_at
    session.add(conv)
    lead = session.get(Lead, call.lead_id) if call.lead_id else None
    if lead and lead.tenant_id == call.tenant_id:
        latest = latest_call_info(session, [lead.id]).get(lead.id, {})
        if latest.get("latest_call_id") == call.id:
            lead.follow_up_needed = needed
            lead.next_follow_up_at = call.follow_up_at
            lead.follow_up_reason = call.follow_up_reason
            session.add(lead)


def phone_key(phone: Optional[str]) -> Optional[str]:
    """Normalize a phone number to a key for matching."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if not digits:
        return None
    return digits[2:] if digits.startswith("00") else digits


def normalize_transcript(transcript: Any) -> List[Dict[str, Any]]:
    """Normalize transcript to a standard format."""
    if not transcript:
        return []
    if isinstance(transcript, str):
        result = []
        for line in transcript.splitlines():
            line = line.strip()
            if not line:
                continue
            if re.match(r"^(AI|Agent|Priya|Bot):", line, re.I):
                text = re.sub(r"^(AI|Agent|Priya|Bot):\s*", "", line, flags=re.I)
                result.append({"role": "ai", "speaker": "Priya", "text": text, "ts": None})
            elif re.match(r"^(Client|Prospect|User|Customer):", line, re.I):
                text = re.sub(r"^(Client|Prospect|User|Customer):\s*", "", line, flags=re.I)
                result.append({"role": "client", "speaker": "Prospect", "text": text, "ts": None})
            else:
                result.append({"role": "system", "speaker": "System", "text": line, "ts": None})
        return result
    if isinstance(transcript, list):
        result = []
        for item in transcript:
            if isinstance(item, dict):
                role = item.get("role") or item.get("speaker_role") or ""
                speaker = item.get("speaker") or ""
                text = item.get("text") or item.get("message") or item.get("content") or ""
                ts = item.get("ts") or item.get("timestamp") or item.get("time")
                if role in ("ai", "agent", "assistant", "bot") or (speaker and str(speaker).lower() in ("priya", "ai", "agent")):
                    role_norm = "ai"
                    speaker_norm = speaker or "Priya"
                elif role in ("client", "prospect", "user", "customer") or (speaker and str(speaker).lower() in ("prospect", "client", "customer")):
                    role_norm = "client"
                    speaker_norm = speaker or "Prospect"
                elif role == "system":
                    role_norm = "system"
                    speaker_norm = speaker or "System"
                else:
                    if isinstance(role, str) and "ai" in role.lower():
                        role_norm = "ai"
                        speaker_norm = speaker or "Priya"
                    elif isinstance(role, str) and ("client" in role.lower() or "prospect" in role.lower()):
                        role_norm = "client"
                        speaker_norm = speaker or "Prospect"
                    else:
                        role_norm = role or "system"
                        speaker_norm = speaker or "System"
                result.append({"role": role_norm, "speaker": speaker_norm, "text": text, "timestamp": ts, "ts": ts})
            else:
                result.append({"role": "system", "speaker": "System", "text": str(item), "timestamp": None, "ts": None})
        return result
    return []


def summary_first_line(summary: Optional[str]) -> Optional[str]:
    if not summary:
        return None
    for line in str(summary).splitlines():
        line = line.strip()
        if line:
            return line
    return str(summary).strip() or None


def extract_follow_up(text: str, base_at: Optional[datetime] = None, tenant_id=None) -> Dict[str, Any]:
    """Extract follow-up intent from conversation text."""
    if base_at is None:
        base_at = utcnow()
    base_dt = as_utc(base_at)
    local_tz = followup_ai._crm_tz(tenant_id)[0]
    try:
        base_date_ist = base_dt.astimezone(local_tz).date()
    except Exception:
        base_date_ist = base_dt.date()
    try:
        res = followup_ai.heuristic_extract(text or "", base_date_ist)
    except Exception as e:
        log.error(f"extract_follow_up failed: {e}")
        res = {"should_follow_up": False, "due_date": None, "due_time": None, "reason": ""}

    if not res.get("should_follow_up") or not res.get("due_date"):
        return {"follow_up_needed": False, "follow_up_at": None, "follow_up_reason": None}

    try:
        due_date = __import__("datetime").date.fromisoformat(str(res["due_date"]))
    except Exception:
        return {"follow_up_needed": False, "follow_up_at": None, "follow_up_reason": None}

    due_time = res.get("due_time")
    if due_time and ":" in str(due_time):
        try:
            hh, mm = str(due_time).split(":")
            hour = int(hh)
            minute = int(mm)
        except Exception:
            hour, minute = 10, 0
    else:
        hour, minute = 10, 0

    try:
        due_local = datetime(due_date.year, due_date.month, due_date.day, hour, minute, tzinfo=local_tz)
        due_utc = due_local.astimezone(timezone.utc)
    except Exception:
        tz = base_dt.tzinfo or timezone.utc
        due_local = datetime(due_date.year, due_date.month, due_date.day, hour, minute, tzinfo=tz)
        due_utc = due_local.astimezone(timezone.utc)

    reason = res.get("reason") or res.get("title") or summary_first_line(text) or "Follow-up required"
    return {"follow_up_needed": True, "follow_up_at": due_utc, "follow_up_reason": reason}


def resolve_lead(session: Session,
                 lead_id: Optional[int] = None,
                 entity_type: Optional[str] = None,
                 entity_id: Optional[int] = None,
                 to_number: Optional[str] = None,
                 tenant_id: Optional[int] = None,
                 **kwargs) -> Optional[Lead]:
    """Resolve a lead from various identifiers."""
    if lead_id:
        lead = session.get(Lead, lead_id)
        if lead and lead.tenant_id == tenant_id:
            return lead
        return None
    if entity_type == "lead" and entity_id:
        lead = session.get(Lead, entity_id)
        if lead and lead.tenant_id == tenant_id:
            return lead
        return None
    if to_number:
        key = phone_key(to_number)
        if key:
            leads = session.exec(select(Lead).where(Lead.tenant_id == tenant_id)).all()
            matches = [lead for lead in leads if lead.phone and phone_key(lead.phone) == key]
            return matches[0] if len(matches) == 1 else None
    return None


def apply_call_result(session: Session, call: AICall, lead: Optional[Lead] = None,
                      force_follow_up: bool = False, **kwargs) -> Dict[str, Any]:
    """Apply call results to lead/call - updates follow-ups, activity etc."""
    lead = resolve_lead(session, lead_id=lead.id if lead else call.lead_id,
                        entity_type=call.entity_type, entity_id=call.entity_id,
                        to_number=call.to_number, tenant_id=call.tenant_id)
    if lead and not call.lead_id:
        call.lead_id = lead.id

    result = {"follow_up_needed": False}

    follow_up_needed = bool(call.follow_up_needed or call.followup_needed or force_follow_up)
    follow_up_at = call.follow_up_at
    follow_up_reason = call.follow_up_reason

    if not follow_up_at and call.transcript:
        text_parts = []
        for t in normalize_transcript(call.transcript):
            if isinstance(t, dict) and t.get("text"):
                text_parts.append(t.get("text"))
        combined = " ".join(text_parts)
        if combined:
            try:
                extracted = extract_follow_up(combined, base_at=call.ended_at or call.created_at, tenant_id=call.tenant_id)
                if extracted.get("follow_up_needed"):
                    follow_up_needed = True
                    follow_up_at = extracted.get("follow_up_at")
                    follow_up_reason = extracted.get("follow_up_reason") or follow_up_reason
            except Exception as e:
                log.error(f"extract follow up from transcript failed: {e}")

    if force_follow_up and not follow_up_at:
        follow_up_needed = True
        if not follow_up_at:
            base = call.ended_at or call.created_at or utcnow()
            try:
                extracted = extract_follow_up("follow up", base_at=base, tenant_id=call.tenant_id)
                if extracted.get("follow_up_at"):
                    follow_up_at = extracted.get("follow_up_at")
                else:
                    follow_up_at = as_utc(base) + timedelta(days=3)
            except Exception:
                follow_up_at = as_utc(base) + timedelta(days=3)

    if follow_up_needed:
        call.follow_up_needed = True
        call.followup_needed = True
        call.follow_up_at = as_utc(follow_up_at) if follow_up_at else None
        if follow_up_reason:
            call.follow_up_reason = follow_up_reason
        result["follow_up_needed"] = True
        result["follow_up_at"] = call.follow_up_at
    else:
        call.follow_up_needed = False
        call.followup_needed = False
        call.follow_up_at = None

    if lead:
        if follow_up_needed:
            lead.follow_up_needed = True
            if follow_up_at:
                lead.next_follow_up_at = as_utc(follow_up_at)
            if follow_up_reason:
                lead.follow_up_reason = follow_up_reason
            elif call.follow_up_reason and not lead.follow_up_reason:
                lead.follow_up_reason = call.follow_up_reason
        contact_time = call.ended_at or call.created_at
        if contact_time:
            contact_time_utc = as_utc(contact_time)
            if not lead.last_contact_at or contact_time_utc > as_utc(lead.last_contact_at):
                lead.last_contact_at = contact_time_utc
        session.add(lead)
        session.add(call)

    try:
        activity = ActivityLog(
            tenant_id=call.tenant_id,
            userId=call.started_by,
            clientId=call.entity_id if call.entity_type == "client" else None,
            lead_id=lead.id if lead else call.lead_id,
            action="AI call",
            method="Phone",
            content=f"AI call - {summary_first_line(call.summary) or call.summary or 'AI call completed'}",
            details=call.important_notes or call.next_steps or call.outcome,
        )
        session.add(activity)
    except Exception as e:
        log.error(f"Failed to add activity: {e}")

    return result


def sync_follow_up_record(call_id: int, follow_up_id: int, tenant_id: Optional[int] = None, session: Optional[Session] = None):
    """Sync follow-up record for a call."""
    try:
        if session is None:
            from database import engine
            with Session(engine) as s:
                return sync_follow_up_record(call_id, follow_up_id, tenant_id, session=s)
        call = session.exec(select(AICall).where(AICall.id == call_id, AICall.tenant_id == tenant_id)).first()
        fu = session.exec(select(FollowUp).where(FollowUp.id == follow_up_id, FollowUp.tenant_id == tenant_id)).first()
        if call and fu:
            if fu.lead_id != call.lead_id or fu.client_id != (call.entity_id if call.entity_type == "client" else None):
                return False
            if fu.due_at:
                call.follow_up_at = fu.due_at
                call.follow_up_needed = fu.status in ("Pending", "In Progress")
                call.followup_needed = call.follow_up_needed
                call.followup_date = fu.due_at.isoformat()
            if fu.ai_reason or fu.notes:
                call.follow_up_reason = fu.ai_reason or fu.notes
            session.add(call)
            lead = session.get(Lead, call.lead_id) if call.lead_id else None
            if lead and lead.tenant_id == tenant_id:
                lead.follow_up_needed = call.follow_up_needed
                lead.next_follow_up_at = fu.due_at if call.follow_up_needed else None
                lead.follow_up_reason = call.follow_up_reason if call.follow_up_needed else None
                session.add(lead)
            session.commit()
            return True
        return False
    except Exception as e:
        log.error(f"sync_follow_up_record failed: {e}")
        return False
