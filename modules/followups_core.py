"""
Follow-up engine shared by routers/followups.py. Scheduled processing is disabled;
the functions below remain available to explicit/manual workflows.

  1. reminders   — Pending follow-ups whose remind_at (or due_at) has passed get one in-app
                   notification + one reminder email to the assigned salesperson
  2. auto-send   — Pending follow-ups marked auto_send send their prepared email to the
                   contact when due, from the company's configured mailbox
  3. AI scan     — new notes, conversation logs, remarks and linked inbound emails are read
                   once each; when one implies a follow-up ("they'll discuss internally and
                   respond next week") a dated follow-up is created on that lead/client
  4. campaigns   — resumes Excel email campaigns interrupted by a restart

  Every "do this once" step claims its row with a conditional UPDATE (or a unique insert)
  before acting. These functions are not scheduled at startup. They run only when an
  explicit workflow invokes them; each query filters tenant_id and each new row gets
  tenant_id explicitly.
"""
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, or_, update, cast, String, exists, literal
from modules.job_runtime import assert_ownership, tally, OwnershipLost
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

import database
from database import (
    ActivityLog, ClientNote, ClientProfile, Contact, ConversationLog, ConversationReply, FollowUp,
    FollowUpNoteScan, InboxMessage, Lead, LeadNote, Notification, Remark, SentEmail, User,
)

OPEN = "Pending"
IN_PROGRESS = "In Progress"          # only the follow-up board sets this
DONE = "Completed"
CANCELLED = "Cancelled"
OPEN_STATES = (OPEN, IN_PROGRESS)    # a follow-up in either state still needs doing
STATUSES = (OPEN, IN_PROGRESS, DONE, CANCELLED)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def default_tz_offset_minutes() -> int:
    """Minutes EAST of UTC used when a date has no time (AI-created follow-ups). Default IST (+5:30)."""
    try:
        return int(os.getenv("FOLLOWUP_DEFAULT_TZ_OFFSET_MINUTES", "330"))
    except ValueError:
        return 330


def at_local_hour(d: date, east_offset_minutes: Optional[int] = None, hour: Optional[int] = None) -> datetime:
    """`d` at the default follow-up hour in a fixed UTC offset, as aware UTC."""
    offset = default_tz_offset_minutes() if east_offset_minutes is None else east_offset_minutes
    hour = int(os.getenv("FOLLOWUP_DEFAULT_HOUR", "10")) if hour is None else hour
    local = datetime(d.year, d.month, d.day, hour, 0, tzinfo=timezone(timedelta(minutes=offset)))
    return local.astimezone(timezone.utc)


def frontend_url() -> str:
    return (os.getenv("FRONTEND_URL") or "https://crm-seo.allytechcourses.com").rstrip("/")


def record_path(lead_id: Optional[int], client_id: Optional[int], tab: str = "followups") -> str:
    if client_id:
        return f"/admin/clients/{client_id}?tab={tab}"
    if lead_id:
        return f"/leads/{lead_id}?tab={tab}"
    return "/followups"


# ── Records ──────────────────────────────────────────────────────────────────
def client_label(cp: ClientProfile) -> str:
    sd = (cp.customFields or {}).get("sheet_data") or {} if isinstance(cp.customFields, dict) else {}
    return cp.companyName or cp.projectName or sd.get("Client Name") or cp.websiteUrl or f"Client #{cp.id}"


def record_info(session: Session, lead_id: Optional[int], client_id: Optional[int]) -> dict:
    """Label, owner and best contact for a lead / client (empty dict when neither exists)."""
    if client_id:
        cp = session.get(ClientProfile, client_id)
        if cp:
            cf = cp.customFields if isinstance(cp.customFields, dict) else {}
            user = session.get(User, cp.userId) if cp.userId else None
            contact = session.exec(select(Contact).where(Contact.client_id == cp.id, Contact.email.is_not(None))
                                   .execution_options(skip_tenant=True).limit(1)).first()
            return {
                "kind": "client", "id": cp.id, "tenant_id": cp.tenant_id, "label": client_label(cp),
                "owner_id": cp.assignedEmployeeId, "status": cp.status,
                "contact_name": cp.contact_person or (contact.full_name or contact.first_name if contact else None)
                                or (user.name if user else None),
                "contact_email": (user.email if user else None) or cf.get("email") or (contact.email if contact else None),
            }
    if lead_id:
        lead = session.get(Lead, lead_id)
        if lead:
            contact = session.exec(select(Contact).where(Contact.lead_id == lead.id)
                                   .execution_options(skip_tenant=True).limit(1)).first()
            name = (contact.full_name or " ".join(x for x in [contact.first_name, contact.last_name] if x)) if contact else None
            return {
                "kind": "lead", "id": lead.id, "tenant_id": lead.tenant_id, "label": lead.company_name or f"Lead #{lead.id}",
                "owner_id": lead.owner_id, "status": lead.status,
                "contact_name": name, "contact_email": lead.email or (contact.email if contact else None),
            }
    return {}


def log_activity(session: Session, fu: FollowUp, action: str, details: str = "", user_id: Optional[int] = None):
    if not (fu.lead_id or fu.client_id):
        return
    session.add(ActivityLog(
        tenant_id=fu.tenant_id, userId=user_id, clientId=fu.client_id, lead_id=fu.lead_id,
        action=action[:255], method="Follow-up", content=fu.title[:500], details=(details or "")[:1000],
    ))


def sync_call_followup(session: Session, fu: FollowUp, deleted=False):
    src = fu.source_ref or ""
    if fu.conversation_id or src.startswith("ai_call:"):
        from modules.lead_calls import sync_task_state
        sync_task_state(session, fu, deleted)
    if src.startswith("call_log:"):
        try:
            call_log_id = int(src.split(":", 1)[1])
        except ValueError:
            call_log_id = None
        if call_log_id:
            from database import CallLog
            cl = session.get(CallLog, call_log_id)
            if cl and (fu.tenant_id is None or cl.tenant_id == fu.tenant_id):
                needed = not deleted and fu.status in OPEN_STATES
                cl.followup_needed = needed
                cl.followup_date = as_utc(fu.due_at).date().isoformat() if (needed and fu.due_at) else None
                session.add(cl)
    elif src.startswith("call_question:"):
        try:
            q_id = int(src.split(":", 1)[1])
        except ValueError:
            q_id = None
        if q_id:
            from database import CallQuestion
            q = session.get(CallQuestion, q_id)
            if q and (fu.tenant_id is None or q.tenant_id == fu.tenant_id):
                if not deleted and fu.status == DONE:
                    q.status = "resolved"
                    q.resolved_at = q.resolved_at or utcnow()
                elif not deleted and fu.status in OPEN_STATES:
                    if q.status == "resolved":
                        q.status = "open"
                        q.resolved_at = None
                    if fu.due_at:
                        q.follow_up_date = as_utc(fu.due_at).date().isoformat()
                session.add(q)
    elif src.startswith("scheduled_call:"):
        try:
            sc_id = int(src.split(":", 1)[1])
        except ValueError:
            sc_id = None
        if sc_id:
            from database import ScheduledCall
            sc = session.get(ScheduledCall, sc_id)
            if sc and (fu.tenant_id is None or sc.tenant_id == fu.tenant_id):
                if deleted:
                    sc.status = "cancelled"
                elif fu.status == DONE:
                    sc.status = "completed"
                elif fu.status in OPEN_STATES:
                    if sc.status in ("completed", "cancelled"):
                        sc.status = "scheduled"
                    if fu.due_at:
                        sc.scheduled_at = as_utc(fu.due_at)
                session.add(sc)
    elif src.startswith("lead_followup:") and fu.lead_id:
        lead = session.get(Lead, fu.lead_id)
        if lead and (fu.tenant_id is None or lead.tenant_id == fu.tenant_id):
            needed = not deleted and fu.status in OPEN_STATES
            lead.follow_up_needed = needed
            lead.next_follow_up_at = as_utc(fu.due_at) if (needed and fu.due_at) else None
            lead.follow_up_reason = (fu.ai_reason or fu.notes) if needed else None
            session.add(lead)


def parse_due_datetime(value, tenant_id: Optional[int] = None) -> Optional[datetime]:
    """Parse a date/datetime/ISO string into aware UTC using the tenant's CRM timezone for naive values."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc)
        from modules import followup_ai
        tz = followup_ai._crm_tz(tenant_id)[0]
        return value.replace(tzinfo=tz).astimezone(timezone.utc)
    raw = str(value).strip()
    if not raw:
        return None
    from modules import followup_ai
    tz = followup_ai._crm_tz(tenant_id)[0]
    try:
        if len(raw) == 10:
            d = date.fromisoformat(raw)
            return datetime(d.year, d.month, d.day, 10, 0, tzinfo=tz).astimezone(timezone.utc)
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(timezone.utc)


def _find_by_keys(session: Session, tenant_id: Optional[int], keys: list) -> Optional[FollowUp]:
    valid_keys = [k for k in keys if k]
    if not valid_keys:
        return None
    stmt = select(FollowUp).where(FollowUp.idempotency_key.in_(valid_keys)).execution_options(skip_tenant=True)
    stmt = stmt.where(FollowUp.tenant_id == tenant_id) if tenant_id is not None else stmt.where(FollowUp.tenant_id.is_(None))
    fu = session.exec(stmt.order_by(FollowUp.id.desc())).first()
    if fu:
        return fu
    stmt2 = select(FollowUp).where(FollowUp.source_ref.in_(valid_keys)).execution_options(skip_tenant=True)
    stmt2 = stmt2.where(FollowUp.tenant_id == tenant_id) if tenant_id is not None else stmt2.where(FollowUp.tenant_id.is_(None))
    return session.exec(stmt2.order_by(FollowUp.id.desc())).first()


def upsert_source_followup(
    session: Session,
    *,
    tenant_id: Optional[int],
    idempotency_key: str,
    source: str = "manual",
    source_ref: Optional[str] = None,
    fallback_keys: tuple = (),
    lead_id: Optional[int] = None,
    client_id: Optional[int] = None,
    contact_id: Optional[int] = None,
    contact_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    company_name: Optional[str] = None,
    title: Optional[str] = None,
    notes: Optional[str] = None,
    ai_reason: Optional[str] = None,
    channel: str = "call",
    priority: str = "medium",
    follow_up_type: Optional[str] = None,
    due_at: Optional[datetime] = None,
    assigned_to: Optional[int] = None,
    created_by: Optional[int] = None,
    conversation_id: Optional[int] = None,
    ai_detected: bool = False,
    schedule_status: str = "confirmed",
    timezone_name: Optional[str] = None,
    completed: bool = False,
    completed_by: Optional[int] = None,
    deleted: bool = False,
) -> tuple:
    """Create, update, complete, or delete a single centralized FollowUp row for a given source key.

    Returns ``(follow_up_or_none, created_bool)``. Never creates duplicates for the same key.
    """
    keys = [idempotency_key, source_ref, *fallback_keys]
    existing = _find_by_keys(session, tenant_id, keys)
    if deleted:
        if existing:
            session.delete(existing)
        return None, False
    if completed:
        if existing and existing.status in OPEN_STATES:
            now = utcnow()
            existing.status = DONE
            existing.completed_at = now
            existing.completed_by = completed_by
            existing.updated_at = now
            session.add(existing)
            log_activity(session, existing, "Follow-up completed", "", completed_by)
        return existing, False

    from modules import followup_ai
    tz_obj, crm_tz_name = followup_ai._crm_tz(tenant_id)
    tz_label = timezone_name or crm_tz_name
    due = as_utc(due_at) if due_at else None
    if due is None:
        local_tomorrow = (utcnow().astimezone(tz_obj) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        due = local_tomorrow.astimezone(timezone.utc)

    info = record_info(session, lead_id if not client_id else None, client_id) if (lead_id or client_id) else {}
    resolved_tenant = info.get("tenant_id") if info.get("tenant_id") is not None else tenant_id
    resolved_assignee = assigned_to or info.get("owner_id") or created_by

    if existing:
        if title and title.strip():
            existing.title = title.strip()[:500]
        if notes is not None:
            existing.notes = (notes or "").strip() or None
        if ai_reason is not None:
            existing.ai_reason = (ai_reason or "").strip() or None
        if channel:
            existing.channel = channel.strip().lower()[:30]
        if priority:
            existing.priority = priority.strip().lower()[:20]
        if follow_up_type:
            existing.follow_up_type = follow_up_type
        if lead_id and not client_id:
            existing.lead_id = lead_id
            existing.client_id = None
        elif client_id:
            existing.client_id = client_id
            existing.lead_id = None
        if contact_id:
            existing.contact_id = contact_id
        if resolved_assignee:
            existing.assigned_to = resolved_assignee
        if conversation_id and not existing.conversation_id:
            existing.conversation_id = conversation_id
        if tz_label and not existing.timezone:
            existing.timezone = tz_label
        if existing.due_at is None or as_utc(existing.due_at) != due:
            existing.due_at = due
            existing.remind_at = due
            existing.reminder_sent_at = None
            existing.overdue_notified_at = None
            existing.schedule_status = schedule_status
        if existing.status not in OPEN_STATES:
            existing.status = OPEN
            existing.completed_at = None
            existing.completed_by = None
        existing.updated_at = utcnow()
        session.add(existing)
        return existing, False

    label = company_name or info.get("label") or contact_name
    fu_title = (title or "").strip()[:500] or f"Follow up with {label or 'contact'}"
    fu = FollowUp(
        tenant_id=resolved_tenant,
        lead_id=lead_id if not client_id else None,
        client_id=client_id,
        contact_id=contact_id,
        contact_name=(contact_name or "").strip() or info.get("contact_name"),
        contact_email=(contact_email or "").strip() or info.get("contact_email"),
        company_name=(company_name or "").strip() or info.get("label"),
        title=fu_title,
        notes=(notes or "").strip() or None,
        ai_reason=(ai_reason or "").strip() or None,
        channel=(channel or "call").strip().lower()[:30],
        priority=(priority or "medium").strip().lower()[:20],
        follow_up_type=follow_up_type,
        status=OPEN,
        due_at=due,
        remind_at=due,
        timezone=tz_label,
        source=source,
        source_ref=source_ref or idempotency_key,
        idempotency_key=idempotency_key,
        conversation_id=conversation_id,
        ai_detected=ai_detected,
        schedule_status=schedule_status,
        assigned_to=resolved_assignee,
        created_by=created_by,
    )
    try:
        with session.begin_nested():
            session.add(fu)
            session.flush()
            log_activity(session, fu, "Follow-up scheduled", f"Due {due.date().isoformat()} via {fu.channel}", created_by)
            if fu.assigned_to and fu.assigned_to != created_by:
                notify(session, fu.assigned_to, fu.tenant_id, f"New follow-up assigned: {fu.title}",
                       fu.notes or f"Scheduled for {due.date().isoformat()}.", record_path(fu.lead_id, fu.client_id))
        return fu, True
    except IntegrityError:
        existing = _find_by_keys(session, resolved_tenant, keys)
        return existing, False


def is_meeting_intent(*texts: Optional[str], outcome: Optional[str] = None) -> bool:
    """Return True when a call outcome or summary/notes indicate a scheduled meeting or demo."""
    if (outcome or "").strip().lower() in ("meeting_booked", "meeting", "demo_booked"):
        return True
    combined = " ".join((t or "") for t in texts).lower()
    if not combined.strip():
        return False
    return any(k in combined for k in ("meeting", "demo", "appointment", "zoom", "google meet", "walk-in", "webinar"))


def sync_existing_call_followups(session: Session, tenant_id: Optional[int], lead_id: Optional[int] = None) -> int:
    """Idempotently backfill existing AI calls, lead follow-up flags, manual call logs, and scheduled calls
    into the centralized ``follow_ups`` table so pre-existing records appear in both the Lead Follow-ups tab
    and the Global Follow-ups section without duplicates or reopening closed items."""
    from modules import features, followup_ai, lead_calls
    if tenant_id is not None and not (
        features.is_enabled(tenant_id, "followups") or features.is_enabled(tenant_id, "followup_board")
    ):
        return 0

    from database import AICall, CallLog, ScheduledCall

    changed = 0
    tz_obj, crm_tz_name = followup_ai._crm_tz(tenant_id)

    # 1. AI Voice Calls with follow-up intent/date
    ai_stmt = select(AICall).where(or_(
        AICall.follow_up_needed.is_(True),
        AICall.followup_needed.is_(True),
        AICall.follow_up_at.is_not(None),
    )).execution_options(skip_tenant=True)
    if tenant_id is not None:
        ai_stmt = ai_stmt.where(AICall.tenant_id == tenant_id)
    if lead_id is not None:
        ai_stmt = ai_stmt.where(or_(
            AICall.lead_id == lead_id,
            and_(AICall.entity_type == "lead", AICall.entity_id == lead_id),
        ))
    ai_calls = session.exec(ai_stmt.order_by(AICall.id.desc()).limit(200)).all()
    if ai_calls:
        call_refs = [f"ai_call:{c.id}" for c in ai_calls]
        convs_stmt = select(ConversationLog).where(ConversationLog.source_ref.in_(call_refs)).execution_options(skip_tenant=True)
        if tenant_id is not None:
            convs_stmt = convs_stmt.where(ConversationLog.tenant_id == tenant_id)
        conv_by_ref = {cv.source_ref: cv for cv in session.exec(convs_stmt).all()}

        for call in ai_calls:
            tid = call.tenant_id if call.tenant_id is not None else tenant_id
            conv = conv_by_ref.get(f"ai_call:{call.id}")
            keys = [f"conv-{conv.id}" if conv else None, f"ai_call:{call.id}"]
            existing = _find_by_keys(session, tid, keys)
            if not existing and conv:
                existing = session.exec(
                    select(FollowUp).where(FollowUp.conversation_id == conv.id)
                    .execution_options(skip_tenant=True)
                ).first()
            lead = lead_calls.resolve_lead(
                session, lead_id=call.lead_id, entity_type=call.entity_type,
                entity_id=call.entity_id, to_number=call.to_number, tenant_id=tid,
            )
            client_id = call.entity_id if call.entity_type == "client" else None
            meeting = is_meeting_intent(
                call.follow_up_reason, call.important_notes, call.next_steps, call.summary,
                outcome=call.outcome,
            )
            if existing:
                updated = False
                if meeting and existing.source == "ai_auto" and existing.channel in ("call", "email", "other"):
                    existing.channel = "meeting"
                    existing.follow_up_type = "Meeting"
                    updated = True
                if lead and not existing.lead_id and not existing.client_id:
                    existing.lead_id = lead.id
                    updated = True
                if updated:
                    existing.updated_at = utcnow()
                    session.add(existing)
                    changed += 1
                continue

            due_utc = as_utc(call.follow_up_at) if call.follow_up_at else parse_due_datetime(call.followup_date, tenant_id=tid)
            sched_status = "confirmed" if due_utc else "needs_confirmation"
            if due_utc is None:
                base_local = as_utc(call.ended_at or call.created_at or utcnow()).astimezone(tz_obj)
                due_utc = (base_local.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)).astimezone(timezone.utc)
            label = call.entity_name or (lead.company_name if lead else None) or call.to_number
            reason_text = (call.follow_up_reason or call.important_notes or call.next_steps or "").strip()
            channel = "meeting" if meeting else "call"
            title = f"Meeting with {label}" if meeting else f"Follow-up call with {label}"
            fu, created = upsert_source_followup(
                session,
                tenant_id=tid,
                idempotency_key=f"conv-{conv.id}" if conv else f"ai_call:{call.id}",
                source="ai_auto",
                source_ref=f"ai_call:{call.id}",
                fallback_keys=(f"ai_call:{call.id}",),
                lead_id=lead.id if lead else None,
                client_id=client_id,
                contact_name=call.to_number if not (lead or client_id) else None,
                title=title,
                notes=reason_text or call.summary,
                ai_reason=reason_text or None,
                channel=channel,
                priority="high" if meeting else "medium",
                follow_up_type="Meeting" if meeting else "Call",
                due_at=due_utc,
                assigned_to=(lead.owner_id if lead else None) or call.started_by,
                created_by=call.started_by,
                conversation_id=conv.id if conv else None,
                ai_detected=True,
                schedule_status=sched_status,
                timezone_name=crm_tz_name,
            )
            if created and fu:
                changed += 1
                if conv:
                    conv.follow_up_date = fu.due_at
                    session.add(conv)

    # 2. Leads flagged follow_up_needed=True with next_follow_up_at that still have no open FollowUp
    lead_stmt = select(Lead).where(
        Lead.follow_up_needed.is_(True),
        Lead.next_follow_up_at.is_not(None),
    ).execution_options(skip_tenant=True)
    if tenant_id is not None:
        lead_stmt = lead_stmt.where(Lead.tenant_id == tenant_id)
    if lead_id is not None:
        lead_stmt = lead_stmt.where(Lead.id == lead_id)
    flagged_leads = session.exec(lead_stmt.limit(200)).all()
    for lead in flagged_leads:
        tid = lead.tenant_id if lead.tenant_id is not None else tenant_id
        has_open = session.exec(
            select(FollowUp.id).where(
                FollowUp.lead_id == lead.id,
                FollowUp.status.in_(OPEN_STATES),
            ).execution_options(skip_tenant=True).limit(1)
        ).first()
        if has_open:
            continue
        if _find_by_keys(session, tid, [f"lead_followup:{lead.id}"]):
            continue
        meeting = is_meeting_intent(lead.follow_up_reason)
        channel = "meeting" if meeting else "call"
        label = lead.company_name or f"Lead #{lead.id}"
        fu, created = upsert_source_followup(
            session,
            tenant_id=tid,
            idempotency_key=f"lead_followup:{lead.id}",
            source="ai_auto",
            source_ref=f"lead_followup:{lead.id}",
            lead_id=lead.id,
            title=f"Meeting with {label}" if meeting else f"Follow-up call with {label}",
            notes=lead.follow_up_reason,
            ai_reason=lead.follow_up_reason,
            channel=channel,
            priority="high" if meeting else "medium",
            follow_up_type="Meeting" if meeting else "Call",
            due_at=as_utc(lead.next_follow_up_at),
            assigned_to=lead.owner_id,
            ai_detected=True,
            schedule_status="confirmed",
            timezone_name=crm_tz_name,
        )
        if created and fu:
            changed += 1

    # 3. Manual CallLogs with followup_needed=True
    if lead_id is None:
        cl_stmt = select(CallLog).where(CallLog.followup_needed.is_(True)).execution_options(skip_tenant=True)
        if tenant_id is not None:
            cl_stmt = cl_stmt.where(CallLog.tenant_id == tenant_id)
        for cl in session.exec(cl_stmt.order_by(CallLog.id.desc()).limit(200)).all():
            tid = cl.tenant_id if cl.tenant_id is not None else tenant_id
            if _find_by_keys(session, tid, [f"call_log:{cl.id}"]):
                continue
            lead = lead_calls.resolve_lead(session, to_number=cl.phone_number, tenant_id=tid) if not cl.client_id else None
            due_utc = parse_due_datetime(cl.followup_date, tenant_id=tid)
            notes = (cl.work_done or cl.description or cl.summary or "").strip() or None
            meeting = is_meeting_intent(notes)
            label = (lead.company_name if lead else None) or cl.phone_number
            assigned_id = int(cl.assigned_to) if (cl.assigned_to and str(cl.assigned_to).isdigit()) else None
            fu, created = upsert_source_followup(
                session,
                tenant_id=tid,
                idempotency_key=f"call_log:{cl.id}",
                source="manual",
                source_ref=f"call_log:{cl.id}",
                lead_id=lead.id if lead else None,
                client_id=cl.client_id,
                contact_name=cl.phone_number if not (lead or cl.client_id) else None,
                title=f"Meeting with {label}" if meeting else f"Follow-up call: {label}",
                notes=notes,
                channel="meeting" if meeting else "call",
                due_at=due_utc,
                assigned_to=assigned_id or (lead.owner_id if lead else None),
                created_by=cl.created_by,
                timezone_name=crm_tz_name,
            )
            if created and fu:
                changed += 1

    # 4. ScheduledCalls with scheduled_at
    sc_stmt = select(ScheduledCall).where(
        ScheduledCall.scheduled_at.is_not(None),
        ScheduledCall.status.notin_(("completed", "cancelled")),
    ).execution_options(skip_tenant=True)
    if tenant_id is not None:
        sc_stmt = sc_stmt.where(ScheduledCall.tenant_id == tenant_id)
    if lead_id is not None:
        sc_stmt = sc_stmt.where(ScheduledCall.entity_type == "lead", ScheduledCall.entity_id == lead_id)
    for sc in session.exec(sc_stmt.order_by(ScheduledCall.id.desc()).limit(200)).all():
        tid = sc.tenant_id if sc.tenant_id is not None else tenant_id
        if _find_by_keys(session, tid, [f"scheduled_call:{sc.id}"]):
            continue
        sc_lead_id = sc.entity_id if sc.entity_type == "lead" else None
        sc_client_id = sc.entity_id if sc.entity_type == "client" else None
        sc_contact_id = sc.entity_id if sc.entity_type == "contact" else None
        assigned_id = int(sc.assigned_to) if (sc.assigned_to and str(sc.assigned_to).isdigit()) else None
        meeting = is_meeting_intent(sc.title, sc.notes)
        fu, created = upsert_source_followup(
            session,
            tenant_id=tid,
            idempotency_key=f"scheduled_call:{sc.id}",
            source="manual",
            source_ref=f"scheduled_call:{sc.id}",
            lead_id=sc_lead_id,
            client_id=sc_client_id,
            contact_id=sc_contact_id,
            contact_name=sc.entity_name if not (sc_lead_id or sc_client_id) else None,
            contact_email=sc.entity_email,
            title=sc.title or f"Scheduled call: {sc.entity_name or 'contact'}",
            notes=(sc.notes or sc.pitch or "").strip() or None,
            channel="meeting" if meeting else "call",
            due_at=parse_due_datetime(sc.scheduled_at, tenant_id=tid),
            assigned_to=assigned_id,
            created_by=sc.created_by,
            timezone_name=crm_tz_name,
        )
        if created and fu:
            changed += 1

    if changed:
        session.commit()
    return changed


def notify(session: Session, user_id: Optional[int], tenant_id: Optional[int], title: str, message: str, link: str):
    if not user_id:
        return
    # notifications.type is a Postgres ENUM in production; "info" is a value every existing caller uses.
    session.add(Notification(tenant_id=tenant_id, user_id=user_id, title=title[:255], message=message,
                             type="info", link=link))


def find_duplicate(session: Session, *, tenant_id, lead_id, client_id, contact_email, due_at: datetime,
                   window_days: int = 3) -> Optional[FollowUp]:
    """An open follow-up on the same record due within ±window_days of due_at."""
    if not (lead_id or client_id or contact_email):
        return None
    stmt = select(FollowUp).where(
        FollowUp.status.in_(OPEN_STATES),
        FollowUp.due_at >= due_at - timedelta(days=window_days),
        FollowUp.due_at <= due_at + timedelta(days=window_days),
    ).execution_options(skip_tenant=True)
    if tenant_id is not None:
        stmt = stmt.where(FollowUp.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(FollowUp.client_id == client_id)
    elif lead_id:
        stmt = stmt.where(FollowUp.lead_id == lead_id)
    else:
        stmt = stmt.where(func.lower(FollowUp.contact_email) == contact_email.strip().lower())
    return session.exec(stmt.order_by(FollowUp.due_at)).first()


def mark_email_sent(session: Session, fu: FollowUp, sent: SentEmail, *, actor_id: Optional[int], actor_name: str,
                    complete: bool, outcome: Optional[str] = None):
    """Bookkeeping after a follow-up email went out: history entries + follow-up state."""
    now = utcnow()
    fu.email_sent_at = now
    fu.sent_email_id = sent.id
    fu.email_subject = sent.subject
    fu.email_body = sent.english_body
    fu.last_error = None
    if complete:
        fu.status = DONE
        fu.completed_at = now
        fu.completed_by = actor_id
        fu.outcome = outcome or f"Follow-up email sent to {sent.to_email}."
    fu.updated_at = now
    session.add(fu)
    if fu.lead_id or fu.client_id:
        session.add(ConversationLog(
            tenant_id=fu.tenant_id, client_id=fu.client_id, lead_id=fu.lead_id, title=(sent.subject or "")[:500],
            type="email", description=(sent.english_body or "")[:4000], author_id=actor_id, author_name=actor_name,
        ))
    log_activity(session, fu, f"Follow-up email sent: {sent.subject}", f"To {sent.to_email}", actor_id)
    if fu.client_id:
        cp = session.get(ClientProfile, fu.client_id)
        if cp:
            cp.last_contact_date = now.date().isoformat()
            session.add(cp)
    if fu.lead_id:
        lead = session.get(Lead, fu.lead_id)
        if lead:
            lead.last_activity = f"Follow-up email sent: {sent.subject}"[:500]
            if (lead.status or "New") in ("New", "Generated"):
                lead.status = "Contacted"
            session.add(lead)


# ── 1. Reminders ─────────────────────────────────────────────────────────────
def _claim(session: Session, fu_id: int, column, now: datetime) -> bool:
    """Atomically set a NULL timestamp column; True only for the one caller that wins."""
    result = session.execute(
        update(FollowUp).where(FollowUp.id == fu_id, column.is_(None), FollowUp.status.in_(OPEN_STATES))
        .values({column.key: now}).execution_options(skip_tenant=True)
    )
    session.commit()
    return result.rowcount == 1


def _fmt_local(dt: datetime) -> str:
    offset = default_tz_offset_minutes()
    local = as_utc(dt).astimezone(timezone(timedelta(minutes=offset)))
    sign = "+" if offset >= 0 else "-"
    return local.strftime("%a %d %b %Y, %H:%M") + f" (UTC{sign}{abs(offset) // 60:02d}:{abs(offset) % 60:02d})"


def reminder_email(fu: FollowUp, user: User, info: dict) -> tuple:
    who = " · ".join(x for x in [fu.contact_name, fu.company_name or info.get("label"), fu.contact_email] if x)
    lines = [f"Hi {(user.name or '').split()[0] if user.name else 'there'},", "",
             f"Your follow-up is due: {fu.title}", ""]
    if who:
        lines.append(f"With: {who}")
    lines += [f"Due: {_fmt_local(fu.due_at)}", f"Channel: {fu.channel}"]
    if fu.notes:
        lines += ["", "Context from previous notes:", fu.notes[:1500]]
    if fu.auto_send and fu.email_body and not fu.email_sent_at:
        lines += ["", "A prepared follow-up email is ready. Use Send due emails in the CRM to send it."]
    lines += ["", f"Open in the CRM: {frontend_url()}{record_path(fu.lead_id, fu.client_id)}"]
    return f"Follow-up due: {fu.title}"[:300], "\n".join(lines)


def process_due_reminders(engine=None, now: Optional[datetime] = None, limit: int = 50, send_email=None,
                          *, tenant_id: Optional[int] = None) -> int:
    """Notify the assignee of every newly-due follow-up exactly once. Returns how many were reminded."""
    from modules import company_mailer
    engine = engine or database.engine
    now = now or utcnow()
    send_email = send_email or company_mailer.send_via
    emails_on = os.getenv("FOLLOWUP_REMINDER_EMAILS", "1") != "0"
    reminded = 0
    with Session(engine) as session:
        due = session.exec(
            select(FollowUp).where(
                FollowUp.status.in_(OPEN_STATES), FollowUp.reminder_sent_at.is_(None),
                func.coalesce(FollowUp.remind_at, FollowUp.due_at) <= now,
            ).where(FollowUp.tenant_id == tenant_id if tenant_id is not None else True)
            .order_by(FollowUp.due_at).limit(limit).execution_options(skip_tenant=True)
        ).all()
        for fu in due:
            assert_ownership()
            if not _claim(session, fu.id, FollowUp.reminder_sent_at, now):
                continue
            session.refresh(fu)
            user_id = fu.assigned_to or fu.created_by
            user = session.get(User, user_id) if user_id else None
            info = record_info(session, fu.lead_id, fu.client_id)
            who = fu.contact_name or fu.company_name or info.get("label") or fu.contact_email or "a contact"
            notify(session, user_id, fu.tenant_id, f"Follow-up due: {fu.title}",
                   f"Your follow-up with {who} is due {_fmt_local(fu.due_at)}.", record_path(fu.lead_id, fu.client_id))
            session.commit()
            reminded += 1
            if emails_on and user and user.email:
                try:
                    account = company_mailer.resolve_account(session, user.id, fu.tenant_id, allow_server_fallback=True)
                    subject, body = reminder_email(fu, user, info)
                    recipient = user.email
                    session.commit()  # don't hold a transaction open across SMTP
                    assert_ownership()
                    send_email(account, to=recipient, subject=subject, body=body)
                except OwnershipLost:
                    raise
                except Exception as e:
                    print(f"[Follow-ups] reminder email for follow-up {fu.id} failed: {company_mailer.friendly_smtp_error(e)}")
    return reminded


def process_overdue_notices(engine=None, now: Optional[datetime] = None, limit: int = 50, send_email=None,
                           *, tenant_id: Optional[int] = None) -> int:
    """
    Tell the assignee, once, that an open follow-up has passed its due time. Only for tenants with the follow-up board
    (the SCM BPO screens), so every other tenant keeps exactly the reminders it had. Returns how many were noticed.
    """
    from modules import company_mailer, features
    engine = engine or database.engine
    now = now or utcnow()
    send_email = send_email or company_mailer.send_via
    emails_on = os.getenv("FOLLOWUP_REMINDER_EMAILS", "1") != "0"
    noticed = 0
    with Session(engine) as session:
        due = session.exec(
            select(FollowUp).where(FollowUp.status.in_(OPEN_STATES), FollowUp.overdue_notified_at.is_(None),
                                   FollowUp.due_at < now)
            .where(FollowUp.tenant_id == tenant_id if tenant_id is not None else True)
            .order_by(FollowUp.due_at).limit(limit)
            .execution_options(skip_tenant=True)
        ).all()
        for fu in due:
            assert_ownership()
            if not features.is_enabled(fu.tenant_id, "followup_board"):
                continue
            if not _claim(session, fu.id, FollowUp.overdue_notified_at, now):
                continue
            session.refresh(fu)
            user_id = fu.assigned_to or fu.created_by
            user = session.get(User, user_id) if user_id else None
            info = record_info(session, fu.lead_id, fu.client_id)
            who = fu.contact_name or fu.company_name or info.get("label") or fu.contact_email or "a contact"
            notify(session, user_id, fu.tenant_id, f"Overdue follow-up: {fu.title}",
                   f"Your follow-up with {who} was due {_fmt_local(fu.due_at)}.", record_path(fu.lead_id, fu.client_id))
            session.commit()
            noticed += 1
            if emails_on and user and user.email:
                try:
                    account = company_mailer.resolve_account(session, user.id, fu.tenant_id, allow_server_fallback=True)
                    body = (f"Hi {(user.name or '').split()[0] if user.name else 'there'},\n\n"
                            f"This follow-up is overdue: {fu.title}\nWith: {who}\nWas due: {_fmt_local(fu.due_at)}\n\n"
                            f"Open in the CRM: {frontend_url()}{record_path(fu.lead_id, fu.client_id)}")
                    recipient, subject = user.email, f"Overdue follow-up: {fu.title}"[:300]
                    session.commit()
                    assert_ownership()
                    send_email(account, to=recipient, subject=subject, body=body)
                except OwnershipLost:
                    raise
                except Exception as e:
                    print(f"[Follow-ups] overdue email for follow-up {fu.id} failed: {company_mailer.friendly_smtp_error(e)}")
    return noticed


# ── 2. Auto-send ─────────────────────────────────────────────────────────────
def process_auto_sends(engine=None, now: Optional[datetime] = None, limit: int = 20, sender=None,
                       *, tenant_id: Optional[int] = None) -> int:
    """Send prepared follow-up emails whose follow-up is due. Returns how many were sent."""
    from modules import company_mailer
    engine = engine or database.engine
    now = now or utcnow()
    sent_count = 0
    with Session(engine) as session:
        due = session.exec(
            select(FollowUp).where(
                FollowUp.status.in_(OPEN_STATES), FollowUp.auto_send.is_(True), FollowUp.email_sent_at.is_(None),
                or_(FollowUp.schedule_status == "confirmed", FollowUp.schedule_status.is_(None)),
                FollowUp.due_at <= now, FollowUp.contact_email.is_not(None), FollowUp.email_body.is_not(None),
            ).where(FollowUp.tenant_id == tenant_id if tenant_id is not None else True)
            .order_by(FollowUp.due_at).limit(limit).execution_options(skip_tenant=True)
        ).all()
        for fu in due:
            assert_ownership()
            if not _claim(session, fu.id, FollowUp.email_sent_at, now):
                continue
            session.refresh(fu)
            actor_id = fu.assigned_to or fu.created_by
            actor = session.get(User, actor_id) if actor_id else None
            follow_up_id = fu.id
            try:
                account = company_mailer.resolve_account(session, actor_id, fu.tenant_id)
                body = company_mailer.apply_signature(fu.email_body, company_mailer.user_signature(session, actor_id))
                subject = fu.email_subject or f"Following up — {fu.company_name or fu.title}"
                sent = company_mailer.send_and_record(
                    session, account, tenant_id=fu.tenant_id, to=fu.contact_email, subject=subject, body=body,
                    lead_id=fu.lead_id, client_id=fu.client_id,
                    meta={"source": "follow_up_auto", "follow_up_id": fu.id, "sent_by_user_id": actor_id},
                    **({"sender": sender} if sender else {}),
                )
                session.refresh(fu)
                mark_email_sent(session, fu, sent, actor_id=actor_id, actor_name=(actor.name if actor else "") or "Follow-up automation",
                                complete=True, outcome=f"Follow-up email sent automatically to {fu.contact_email}.")
                session.commit()
                sent_count += 1
            except OwnershipLost:
                # Ownership is checked before SMTP. Release only our unsent
                # claim, so a replacement scheduler can retry without disabling it.
                session.rollback()
                session.execute(update(FollowUp).where(
                    FollowUp.id == follow_up_id, FollowUp.email_sent_at == now,
                    FollowUp.status.in_(OPEN_STATES),
                ).values(email_sent_at=None).execution_options(skip_tenant=True))
                session.commit()
                raise
            except Exception as e:
                session.rollback()
                fu = session.get(FollowUp, fu.id)
                reason = str(e) if isinstance(e, company_mailer.MailAccountError) else company_mailer.friendly_smtp_error(e)
                fu.email_sent_at = None
                fu.auto_send = False  # don't retry every minute; the user re-enables after fixing it
                fu.last_error = f"Automatic follow-up email failed: {reason}"
                fu.updated_at = utcnow()
                session.add(fu)
                notify(session, actor_id, fu.tenant_id, "Follow-up email was not sent",
                       f"“{fu.title}”: {reason}", record_path(fu.lead_id, fu.client_id))
                session.commit()
                print(f"[Follow-ups] auto-send for follow-up {fu.id} failed: {reason}")
    return sent_count


# ── 3. AI scan of notes / conversations ──────────────────────────────────────
def _is_auto_logged_email(session: Session, conv: ConversationLog) -> bool:
    """ConversationLogs of type email that the CRM wrote itself when it sent mail (our own words)."""
    if (conv.type or "").lower() != "email":
        return False
    created = as_utc(conv.created_at)
    stmt = select(SentEmail.id).where(
        SentEmail.subject == (conv.title or "")[:500],
        SentEmail.sent_at >= created - timedelta(minutes=10), SentEmail.sent_at <= created + timedelta(minutes=10),
    ).execution_options(skip_tenant=True)
    if conv.lead_id:
        stmt = stmt.where(SentEmail.lead_id == conv.lead_id)
    if conv.client_id:
        stmt = stmt.where(SentEmail.client_id == conv.client_id)
    return session.exec(stmt.limit(1)).first() is not None


def _note_items(session: Session, cutoff: datetime, lead_id=None, client_id=None, per_source: int = 40, tenant_id=None) -> list:
    """Candidate texts: [(key, tenant_id, lead_id, client_id, author_id, written_at, text)] newest first."""
    items = []

    def scoped(stmt, model, lead_attr="lead_id", client_attr="client_id"):
        prefix = {ClientNote: "note-", LeadNote: "leadnote-", ConversationLog: "conv-", Remark: "remark-"}[model]
        stmt = pending(stmt, model, prefix)
        if lead_id:
            stmt = stmt.where(getattr(model, lead_attr) == lead_id)
        if client_id:
            stmt = stmt.where(getattr(model, client_attr) == client_id)
        return stmt.execution_options(skip_tenant=True).limit(per_source)

    def pending(stmt, model, prefix, tenant_column=None):
        stmt = stmt.where(~exists(select(FollowUpNoteScan.id).where(
            FollowUpNoteScan.source_key == literal(prefix) + cast(model.id, String))))
        if tenant_id is not None:
            stmt = stmt.where((tenant_column if tenant_column is not None else model.tenant_id) == tenant_id)
        return stmt

    for n in session.exec(scoped(select(ClientNote).where(ClientNote.created_at >= cutoff)
                                 .order_by(ClientNote.created_at.desc()), ClientNote)).all():
        items.append((f"note-{n.id}", n.tenant_id, n.lead_id, n.client_id, n.author_id, n.created_at, n.content))
    if not client_id:
        for n in session.exec(scoped(select(LeadNote).where(LeadNote.created_at >= cutoff)
                                     .order_by(LeadNote.created_at.desc()), LeadNote, client_attr="lead_id")).all():
            items.append((f"leadnote-{n.id}", n.tenant_id, n.lead_id, None, n.author_id, n.created_at, n.content))
    for c in session.exec(scoped(select(ConversationLog).where(ConversationLog.created_at >= cutoff)
                                 .order_by(ConversationLog.created_at.desc()), ConversationLog)).all():
        if _is_auto_logged_email(session, c):
            continue
        text = "\n".join(x for x in [f"[{c.type}] {c.title}", c.description] if x)
        items.append((f"conv-{c.id}", c.tenant_id, c.lead_id, c.client_id, c.author_id, c.created_at, text))
    reply_stmt = select(ConversationReply, ConversationLog).join(
        ConversationLog, ConversationLog.id == ConversationReply.conversation_id
    ).where(ConversationReply.created_at >= cutoff).order_by(ConversationReply.created_at.desc())
    if lead_id:
        reply_stmt = reply_stmt.where(ConversationLog.lead_id == lead_id)
    if client_id:
        reply_stmt = reply_stmt.where(ConversationLog.client_id == client_id)
    reply_stmt = pending(reply_stmt, ConversationReply, "convreply-", func.coalesce(ConversationReply.tenant_id, ConversationLog.tenant_id))
    for r, c in session.exec(reply_stmt.execution_options(skip_tenant=True).limit(per_source)).all():
        items.append((f"convreply-{r.id}", r.tenant_id or c.tenant_id, c.lead_id, c.client_id, r.author_id,
                      r.created_at, f"Reply on “{c.title}”: {r.content}"))
    if not lead_id:
        for r in session.exec(scoped(select(Remark).where(Remark.createdAt >= cutoff, Remark.clientId.is_not(None))
                                     .order_by(Remark.createdAt.desc()), Remark, lead_attr="clientId", client_attr="clientId")).all():
            items.append((f"remark-{r.id}", r.tenant_id, None, r.clientId, r.authorId, r.createdAt, r.content))
    inbox_stmt = select(InboxMessage).where(
        InboxMessage.received_at >= cutoff, or_(InboxMessage.lead_id.is_not(None), InboxMessage.client_id.is_not(None))
    ).order_by(InboxMessage.received_at.desc())
    if lead_id:
        inbox_stmt = inbox_stmt.where(InboxMessage.lead_id == lead_id)
    if client_id:
        inbox_stmt = inbox_stmt.where(InboxMessage.client_id == client_id)
    inbox_stmt = pending(inbox_stmt, InboxMessage, "inbox-")
    for m in session.exec(inbox_stmt.execution_options(skip_tenant=True).limit(per_source)).all():
        if (m.ai_category or "") in ("spam", "promotional"):
            continue
        text = f"Email from {m.from_name or m.from_address}: {m.subject or ''}\n{m.body_text or m.snippet or ''}"
        items.append((f"inbox-{m.id}", m.tenant_id, m.lead_id, m.client_id, None, m.received_at, text))
    items = [i for i in items if (i[6] or "").strip() and (i[2] or i[3])]
    items.sort(key=lambda i: as_utc(i[5]) or utcnow(), reverse=True)
    return items


def _already_scanned(session: Session, keys: list) -> set:
    if not keys:
        return set()
    rows = session.exec(select(FollowUpNoteScan.source_key).where(FollowUpNoteScan.source_key.in_(keys))
                        .execution_options(skip_tenant=True)).all()
    return set(rows)


AUTO_SOURCES = ("campaign", "ai_auto")


def _conversation_id_from_key(key: str) -> Optional[int]:
    if key.startswith("conv-"):
        try:
            return int(key[5:])
        except ValueError:
            return None
    return None


def _scan_schedule_status(s: dict) -> str:
    if s.get("ambiguous") or s.get("requested_window") or s.get("condition") or not s.get("due_time"):
        return "needs_confirmation"
    return "confirmed"


def _suggestion_due_at(due_day: date, s: dict, tenant_id=None) -> datetime:
    """Use an explicitly stated HH:MM; otherwise the CRM default hour."""
    from modules.followup_ai import _crm_tz
    local_tz = _crm_tz(tenant_id)[0]
    due_at = datetime(due_day.year, due_day.month, due_day.day,
                      int(os.getenv("FOLLOWUP_DEFAULT_HOUR", "10")), tzinfo=local_tz).astimezone(timezone.utc)
    parts = str(s.get("due_time") or "").strip().split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        return due_at
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return due_at
    local = datetime(due_day.year, due_day.month, due_day.day, hour, minute,
                     tzinfo=local_tz)
    return local.astimezone(timezone.utc)


def _enrich_existing(session: Session, fu: FollowUp, s: dict, key: str, due_at: datetime, written: datetime):
    """A note confirms a follow-up that is already open: add what was said to it instead of a duplicate.

    Auto-generated ones (campaign reminders, earlier AI follow-ups) also move to the date the
    contact gave and take the AI's more specific title; a follow-up a person scheduled keeps
    its date and title and only gains the context."""
    reason = s.get("reason") or s.get("quote") or ""
    line = f"AI ({written.date().isoformat()}): {reason}".strip()
    if reason and reason not in (fu.notes or ""):
        fu.notes = f"{fu.notes}\n\n{line}" if fu.notes else line
    if s.get("quote") and not fu.ai_reason:
        fu.ai_reason = s["quote"]
    conv_id = _conversation_id_from_key(key)
    if conv_id and not fu.conversation_id:
        fu.conversation_id = conv_id
        fu.ai_detected = True
    if s.get("follow_up_type") and not fu.follow_up_type:
        fu.follow_up_type = s["follow_up_type"]
    if fu.source in AUTO_SOURCES:
        if as_utc(fu.due_at) != due_at:
            fu.due_at = fu.remind_at = due_at
            fu.reminder_sent_at = None
        if s.get("title"):
            fu.title = s["title"]
        fu.source, fu.source_ref = "ai_auto", key
        fu.idempotency_key = fu.idempotency_key or key
        fu.schedule_status = _scan_schedule_status(s)
        fu.requested_window = (s.get("requested_window") or None) if s.get("requested_window") else fu.requested_window
        fu.condition = (s.get("condition") or None) if s.get("condition") else fu.condition
        fu.requested_at_text = (s.get("requested_at_text") or None) if s.get("requested_at_text") else fu.requested_at_text
    fu.updated_at = utcnow()
    session.add(fu)
    log_activity(session, fu, "AI updated a follow-up from a new note", f"{reason} (from {key})", None)


def scan_notes(engine=None, *, lead_id: Optional[int] = None, client_id: Optional[int] = None,
               tenant_id: Optional[int] = None, max_age_days: Optional[int] = None, budget: int = 15,
               extractor=None) -> dict:
    """Read not-yet-scanned notes/conversations and create AI follow-ups. Returns
    {"scanned": n, "created": [follow-up ids], "matched": [existing follow-up ids]}."""
    from modules import followup_ai
    engine = engine or database.engine
    extractor = extractor or followup_ai.extract_from_note
    if max_age_days is None:
        max_age_days = int(os.getenv("FOLLOWUP_AI_SCAN_DAYS", "3"))
    now = utcnow()
    cutoff = now - timedelta(days=max_age_days)
    min_conf = float(os.getenv("FOLLOWUP_AI_MIN_CONFIDENCE", "0.5"))
    result = {"scanned": 0, "created": [], "matched": []}
    with Session(engine) as session:
        items = _note_items(session, cutoff, lead_id=lead_id, client_id=client_id, tenant_id=tenant_id)
        if tenant_id is not None:
            items = [i for i in items if i[1] == tenant_id]
        restrictions = {}
        for key, tid, l_id, c_id, author_id, written_at, text in items:
            assert_ownership()
            from modules.demo_usage import background_restricted
            restriction_key = (tid, author_id)
            if restriction_key not in restrictions:
                restrictions[restriction_key] = background_restricted(session, tid, author_id)
            if restrictions[restriction_key]:
                continue
            if result["scanned"] >= budget:
                break
            # Claim first (unique source_key) so concurrent scanners never analyse the same note twice.
            mark = FollowUpNoteScan(tenant_id=tid, source_key=key, scanned_at=now)
            session.add(mark)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                continue
            result["scanned"] += 1
            info = record_info(session, l_id, c_id)
            written = (as_utc(written_at) or now)
            session.commit()  # release before the AI call
            try:
                assert_ownership()
                s = extractor(text, written.date(), now.date(), info.get("label", ""))
            except OwnershipLost:
                session.delete(mark)
                session.commit()
                raise
            except Exception as e:
                print(f"[Follow-ups] AI scan of {key} failed: {e}")
                continue
            if not s.get("should_follow_up") or not s.get("due_date") or float(s.get("confidence") or 0) < min_conf:
                continue
            due_day = date.fromisoformat(s["due_date"])
            due_at = _suggestion_due_at(due_day, s, tid)
            if due_at < now - timedelta(days=7):
                continue  # an old commitment that has long passed — not worth surfacing
            existing = find_duplicate(session, tenant_id=tid, lead_id=l_id, client_id=c_id, contact_email=None, due_at=due_at)
            if existing:
                _enrich_existing(session, existing, s, key, due_at, written)
                mark.follow_up_id = existing.id
                session.add(mark)
                session.commit()
                result["matched"].append(existing.id)
                continue
            assignee = info.get("owner_id") or author_id
            fu = FollowUp(
                tenant_id=tid, lead_id=l_id, client_id=c_id,
                contact_name=info.get("contact_name"), contact_email=info.get("contact_email"),
                company_name=info.get("label"), title=s.get("title") or f"Follow up with {info.get('label', 'contact')}",
                notes=s.get("reason") or None, ai_reason=s.get("quote") or s.get("reason") or None,
                channel=s.get("channel") or "email", priority=s.get("priority") or "medium",
                follow_up_type=s.get("follow_up_type") or "Other",
                due_at=due_at, remind_at=due_at, source="ai_auto", source_ref=key,
                conversation_id=_conversation_id_from_key(key), ai_detected=_conversation_id_from_key(key) is not None,
                schedule_status=_scan_schedule_status(s),
                requested_window=(s.get("requested_window") or None), condition=(s.get("condition") or None),
                requested_at_text=(s.get("requested_at_text") or None), idempotency_key=key,
                assigned_to=assignee, created_by=author_id,
            )
            session.add(fu)
            try:
                session.flush()
            except IntegrityError:
                session.rollback()
                existing = session.exec(select(FollowUp).where(
                    FollowUp.tenant_id == tid, FollowUp.idempotency_key == key)
                    .execution_options(skip_tenant=True)).first()
                if existing:
                    result["matched"].append(existing.id)
                continue
            mark.follow_up_id = fu.id
            session.add(mark)
            log_activity(session, fu, "AI scheduled a follow-up", f"{s.get('reason') or ''} (from {key})", None)
            notify(session, assignee, tid, f"AI scheduled a follow-up: {fu.title}",
                   f"Based on a recent note about {info.get('label', 'a contact')}, a follow-up is set for {due_day.isoformat()}.",
                   record_path(l_id, c_id))
            try:
                session.commit()
            except IntegrityError:
                # Another worker already owns this source key (conversation detection or a
                # concurrent scan). Keep exactly one row.
                session.rollback()
                existing = session.exec(select(FollowUp).where(FollowUp.idempotency_key == key, FollowUp.tenant_id == tid)
                                        .execution_options(skip_tenant=True)).first()
                if existing:
                    result["matched"].append(existing.id)
                continue
            result["created"].append(fu.id)
    tally(examined=result["scanned"], changed=len(result["created"]) + len(result["matched"]))
    return result


def run_cycle(engine=None) -> dict:
    out = {}
    for name, step in (("reminders", process_due_reminders), ("overdue", process_overdue_notices),
                       ("auto_sent", process_auto_sends)):
        try:
            assert_ownership()
            out[name] = step(engine)
            tally(changed=out[name])
        except OwnershipLost:
            raise
        except Exception as e:
            print(f"[Follow-ups] {name} step failed: {e}")
    if os.getenv("FOLLOWUP_AI_SCAN", "1") != "0":
        try:
            out["scan"] = scan_notes(engine)
        except OwnershipLost:
            raise
        except Exception as e:
            print(f"[Follow-ups] AI scan step failed: {e}")
    try:
        from modules.email_campaign_worker import resume_campaigns
        out["campaigns_resumed"] = resume_campaigns(engine)
    except Exception as e:
        print(f"[Follow-ups] campaign resume failed: {e}")
    return out
