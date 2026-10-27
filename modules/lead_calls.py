"""Lead-linked AI calls: normalization, follow-up extraction, persistence, and migration helpers."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlmodel import Session, select

from database import AICall, ActivityLog, CallLog, FollowUp, Lead
from modules import followup_ai
from modules.followups_core import as_utc, utcnow

log = logging.getLogger(__name__)

AI_CALL_SUMMARY_PREFIX = "AI Voice Call - "
IST = ZoneInfo("Asia/Kolkata")


def phone_key(phone: Optional[str]) -> Optional[str]:
    """Normalize a phone number to a key for matching."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if not digits:
        return None
    if len(digits) >= 10:
        return digits[-10:]
    return digits


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


def extract_follow_up(text: str, base_at: Optional[datetime] = None) -> Dict[str, Any]:
    """Extract follow-up intent from conversation text."""
    if base_at is None:
        base_at = utcnow()
    base_dt = as_utc(base_at)
    try:
        base_date_ist = base_dt.astimezone(IST).date()
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
        due_local = datetime(due_date.year, due_date.month, due_date.day, hour, minute, tzinfo=IST)
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
        if lead:
            return lead
    if entity_type == "lead" and entity_id:
        lead = session.get(Lead, entity_id)
        if lead:
            return lead
    if to_number:
        key = phone_key(to_number)
        if key:
            leads = session.exec(select(Lead)).all()
            for lead in leads:
                if lead.phone and phone_key(lead.phone) == key:
                    if tenant_id is None or lead.tenant_id == tenant_id or lead.tenant_id is None:
                        return lead
    return None


def apply_call_result(session: Session, call: AICall, lead: Optional[Lead] = None,
                      force_follow_up: bool = False, **kwargs) -> Dict[str, Any]:
    """Apply call results to lead/call - updates follow-ups, activity etc."""
    try:
        call.transcript = normalize_transcript(call.transcript)
    except Exception as e:
        log.error(f"normalize transcript failed: {e}")

    if lead is None and call.lead_id:
        lead = session.get(Lead, call.lead_id)
    if lead and not call.lead_id:
        call.lead_id = lead.id

    result = {"follow_up_needed": False}

    follow_up_needed = bool(call.follow_up_needed or call.followup_needed or force_follow_up)
    follow_up_at = call.follow_up_at
    follow_up_reason = call.follow_up_reason

    if not follow_up_needed and call.transcript:
        text_parts = []
        for t in call.transcript:
            if isinstance(t, dict) and t.get("text"):
                text_parts.append(t.get("text"))
        combined = " ".join(text_parts)
        if combined:
            try:
                extracted = extract_follow_up(combined, base_at=call.ended_at or call.created_at)
                if extracted.get("follow_up_needed"):
                    follow_up_needed = True
                    follow_up_at = extracted.get("follow_up_at")
                    follow_up_reason = extracted.get("follow_up_reason") or follow_up_reason
            except Exception as e:
                log.error(f"extract follow up from transcript failed: {e}")

    if force_follow_up and not follow_up_needed:
        follow_up_needed = True
        if not follow_up_at:
            base = call.ended_at or call.created_at or utcnow()
            try:
                extracted = extract_follow_up("follow up", base_at=base)
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
        call = session.get(AICall, call_id)
        fu = session.get(FollowUp, follow_up_id)
        if call and fu:
            if fu.due_at:
                call.follow_up_at = fu.due_at
                call.follow_up_needed = fu.status == "Pending"
                call.followup_needed = fu.status == "Pending"
            if fu.ai_reason or fu.notes:
                call.follow_up_reason = fu.ai_reason or fu.notes
            session.add(call)
            session.commit()
        return True
    except Exception as e:
        log.error(f"sync_follow_up_record failed: {e}")
        return False
