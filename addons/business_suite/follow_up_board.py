"""
The follow-up board: SCM BPO's /follow-ups screens, served from the shared ``follow_ups`` table.

SCM BPO had its own follow-up table shape (owner_id, completion_note, reminder_minutes, capitalised channels). The
product has ONE table and ONE engine (modules/followups_core.py: reminders, auto-send, AI note scan), so this module is
a thin, translated view of it: same URLs and JSON the board page expects, none of its own storage or worker.

  owner_id          <-> assigned_to              channel / priority: "Email" <-> "email" (stored lower case)
  completion_note   <-> outcome                  reminder_minutes    <-> due_at - remind_at
  status "In Progress" is an extra open state (core.OPEN_STATES), overdue / upcoming are derived from due_at

Access is the same as /followups (routers/followups.py): Admin / SuperAdmin / Demo see the whole company, SalesManager
and Employee see what is assigned to or created by them or sits on their leads and clients, other roles get 403. A
follow-up needs a date (the shared table requires one). The reminders and the overdue notice come from the shared
scheduler, and the overdue notice is only sent to tenants that have this feature on.
"""
import html as _html
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import ClientProfile, Contact, ConversationLog, FollowUp, Lead, User
from modules import branding, company_mailer, followup_ai
from modules import followups_core as core
from routers import followups as fu_api
from routers import inbox

router = APIRouter(tags=["follow-up-board"])

get_session = fu_api.get_session
get_viewer = fu_api.get_viewer

CHANNELS = ["Email", "Call", "Meeting", "Webinar", "Walk-in", "Normal Follow-up", "WhatsApp", "Other"]
PRIORITIES = ["Low", "Medium", "High", "Urgent"]
BOARD_STATUSES = ("Pending", "In Progress", "Completed", "Cancelled")
PENDING_WINDOW_HOURS = 24
DEFAULT_REMINDER_MINUTES = 60
_ALIASES = {"webinar": "Webinar", "walk-in": "Walk-in", "walkin": "Walk-in", "normal follow-up": "Normal Follow-up",
            "normal followup": "Normal Follow-up", "normal": "Normal Follow-up", "followup": "Normal Follow-up",
            "call": "Call", "calls": "Call", "meeting": "Meeting", "meetings": "Meeting", "email": "Email",
            "whatsapp": "WhatsApp"}


# ── translation between the board's vocabulary and the shared table ──────────
def _choice(value: Optional[str], allowed: List[str], default: str) -> str:
    """The display form ('Walk-in') of whatever the client sent, or ``default``."""
    if not value:
        return default
    key = value.strip().lower()
    if _ALIASES.get(key) in allowed:
        return _ALIASES[key]
    return next((a for a in allowed if a.lower() == key), default)


def _stored(display: str) -> str:
    return display.lower()


def _shown(stored: Optional[str], allowed: List[str], default: str) -> str:
    return _choice(stored, allowed, default) if stored else default


def _reminder_minutes(f: FollowUp) -> int:
    if not f.remind_at or not f.due_at:
        return 0
    return max(0, round((core.as_utc(f.due_at) - core.as_utc(f.remind_at)).total_seconds() / 60))


def _remind_at(due: datetime, minutes: int) -> datetime:
    return due - timedelta(minutes=minutes) if minutes > 0 else due


def _validate_tz(name: Optional[str]) -> Optional[str]:
    if not name or not name.strip():
        return None
    val = name.strip()
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(val)
        return val
    except Exception:
        return val if ("/" in val or val.upper() in ("UTC", "GMT", "IST")) else "UTC"


def _to_utc(value: Optional[str], tz_name: Optional[str]) -> Optional[datetime]:
    """An ISO date-time (offset or Z honoured; a bare wall-clock time is read in ``tz_name``) -> aware UTC."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date/time")
    if dt.tzinfo is None:
        zone = timezone.utc
        if tz_name:
            try:
                from zoneinfo import ZoneInfo
                zone = ZoneInfo(tz_name)
            except Exception:
                low = tz_name.lower()
                zone = (timezone(timedelta(hours=5, minutes=30)) if ("kolkata" in low or "calcutta" in low or low == "ist")
                        else timezone.utc)
        dt = dt.replace(tzinfo=zone)
    return dt.astimezone(timezone.utc)


def _iso_z(dt: Optional[datetime]) -> Optional[str]:
    dt = core.as_utc(dt)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _local_label(dt: Optional[datetime], tz_name: Optional[str]) -> Optional[str]:
    dt = core.as_utc(dt)
    if not dt:
        return None
    try:
        from zoneinfo import ZoneInfo
        local = dt.astimezone(ZoneInfo(tz_name)) if tz_name else dt
        return local.strftime("%b %d, %Y %I:%M %p") + (f" ({tz_name})" if tz_name else " UTC")
    except Exception:
        return dt.strftime("%b %d, %Y %I:%M %p") + " UTC"


def _bucket(f: FollowUp, now: datetime) -> str:
    """completed / overdue / pending (needs action in the next 24 h) / upcoming, decided on the server."""
    if f.status in (core.DONE, core.CANCELLED):
        return "completed"
    due = core.as_utc(f.due_at)
    if due < now:
        return "overdue"
    return "pending" if due <= now + timedelta(hours=PENDING_WINDOW_HOURS) else "upcoming"


def _contact_name(c: Contact) -> str:
    return (c.full_name or f"{c.first_name or ''} {c.last_name or ''}").strip() or f"Contact #{c.id}"


def _maps(session: Session, rows: List[FollowUp]) -> Dict[str, dict]:
    ids = lambda attr: {getattr(r, attr) for r in rows if getattr(r, attr)}  # noqa: E731
    leads, clients, contacts, users = ids("lead_id"), ids("client_id"), ids("contact_id"), ids("assigned_to")
    return {
        "leads": {x.id: x for x in session.exec(select(Lead).where(Lead.id.in_(leads))).all()} if leads else {},
        "clients": {x.id: x for x in session.exec(select(ClientProfile).where(ClientProfile.id.in_(clients))).all()} if clients else {},
        "contacts": {x.id: x for x in session.exec(select(Contact).where(Contact.id.in_(contacts))).all()} if contacts else {},
        "users": {x.id: x for x in session.exec(select(User).where(User.id.in_(users))).all()} if users else {},
    }


def _dict(f: FollowUp, maps: Dict[str, dict], now: datetime) -> dict:
    lead = maps["leads"].get(f.lead_id) if f.lead_id else None
    client = maps["clients"].get(f.client_id) if f.client_id else None
    contact = maps["contacts"].get(f.contact_id) if f.contact_id else None
    owner = maps["users"].get(f.assigned_to) if f.assigned_to else None
    entity_type = "client" if client else "lead" if lead else "contact" if contact else None
    entity_name = (core.client_label(client) if client else lead.company_name if lead else _contact_name(contact) if contact
                   else f.company_name)
    due = core.as_utc(f.due_at)
    local_str = None
    if due and f.timezone:
        try:
            from zoneinfo import ZoneInfo
            local_str = due.astimezone(ZoneInfo(f.timezone)).strftime("%Y-%m-%dT%H:%M")
        except Exception:
            local_str = due.strftime("%Y-%m-%dT%H:%M")
    return {
        "id": f.id, "title": f.title, "notes": f.notes, "channel": _shown(f.channel, CHANNELS, "Email"),
        "priority": _shown(f.priority, PRIORITIES, "Medium"), "status": f.status, "bucket": _bucket(f, now),
        "due_at": _iso_z(f.due_at), "due_at_local": local_str, "timezone": f.timezone,
        "reminder_minutes": _reminder_minutes(f), "reminder_sent": bool(f.reminder_sent_at),
        "completed_at": _iso_z(f.completed_at), "completion_note": f.outcome,
        "minutes_until_due": int((due - now).total_seconds() // 60) if due else None,
        "lead_id": f.lead_id, "client_id": f.client_id, "contact_id": f.contact_id,
        "entity_type": entity_type, "entity_name": entity_name,
        "owner_id": f.assigned_to, "owner_name": (owner.name or owner.email) if owner else None,
        "last_email_at": _iso_z(f.last_email_at), "created_at": _iso_z(f.created_at), "updated_at": _iso_z(f.updated_at),
    }


def _one(session: Session, f: FollowUp) -> dict:
    return {"follow_up": _dict(f, _maps(session, [f]), core.utcnow())}


def _scoped(session: Session, v: inbox.Viewer, scope: Optional[str]) -> List[FollowUp]:
    stmt = fu_api._scope(select(FollowUp), v)
    if scope == "mine":
        stmt = stmt.where((FollowUp.assigned_to == v.user.id) | (FollowUp.created_by == v.user.id))
    return list(session.exec(stmt).all())


def _contact_in_company(session: Session, v: inbox.Viewer, contact_id: Optional[int]) -> Optional[Contact]:
    if not contact_id:
        return None
    c = session.get(Contact, contact_id)
    if not c or (v.tenant_id is not None and c.tenant_id != v.tenant_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    return c


# ── schemas ──────────────────────────────────────────────────────────────────
class FollowUpBody(BaseModel):
    title: str
    notes: Optional[str] = None
    channel: Optional[str] = "Email"
    priority: Optional[str] = "Medium"
    due_at: Optional[str] = None          # wall-clock in `timezone`, or ISO with an offset / Z
    timezone: Optional[str] = None
    reminder_minutes: Optional[int] = DEFAULT_REMINDER_MINUTES
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    owner_id: Optional[int] = None
    send_notification: Optional[bool] = False
    notify_email: Optional[str] = None


class FollowUpUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    channel: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_at: Optional[str] = None
    timezone: Optional[str] = None
    reminder_minutes: Optional[int] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    owner_id: Optional[int] = None


class StatusUpdateBody(BaseModel):
    status: str
    completion_note: Optional[str] = None


class RescheduleBody(BaseModel):
    due_at: str
    timezone: Optional[str] = None


class CompleteBody(BaseModel):
    note: Optional[str] = None


class EmailDraftBody(BaseModel):
    follow_up_id: Optional[int] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    goal: Optional[str] = None
    tone: Optional[str] = "friendly and professional"


class SendEmailBody(BaseModel):
    follow_up_id: Optional[int] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    to_email: str
    subject: str
    body: str
    mark_complete: Optional[bool] = False


# ── reading ──────────────────────────────────────────────────────────────────
@router.get("/follow-ups/summary")
def summary(scope: Optional[str] = None, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    now = core.utcnow()
    rows = _scoped(session, v, scope)
    counts = {"upcoming": 0, "pending": 0, "overdue": 0, "completed": 0}
    nxt: Optional[FollowUp] = None
    for r in rows:
        b = _bucket(r, now)
        counts[b] += 1
        if b in ("pending", "upcoming") and (nxt is None or core.as_utc(r.due_at) < core.as_utc(nxt.due_at)):
            nxt = r
    return {"counts": counts, "total": len(rows), "open": counts["upcoming"] + counts["pending"] + counts["overdue"],
            "next_due": {"id": nxt.id, "title": nxt.title, "due_at": _iso_z(nxt.due_at)} if nxt else None,
            "server_time": _iso_z(now)}


@router.get("/follow-ups")
def list_followups(bucket: Optional[str] = None, scope: Optional[str] = None, lead_id: Optional[int] = None,
                   client_id: Optional[int] = None, contact_id: Optional[int] = None, q: Optional[str] = None,
                   v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    now = core.utcnow()
    rows = _scoped(session, v, scope)
    if lead_id:
        rows = [r for r in rows if r.lead_id == lead_id]
    if client_id:
        rows = [r for r in rows if r.client_id == client_id]
    if contact_id:
        rows = [r for r in rows if r.contact_id == contact_id]
    counts = {"upcoming": 0, "pending": 0, "overdue": 0, "completed": 0}
    for r in rows:
        counts[_bucket(r, now)] += 1
    if bucket:
        rows = [r for r in rows if _bucket(r, now) == bucket]
    maps = _maps(session, rows)
    items = [_dict(r, maps, now) for r in rows]
    if q:
        needle = q.strip().lower()
        items = [i for i in items if needle in (i["title"] or "").lower() or needle in (i["entity_name"] or "").lower()
                 or needle in (i["notes"] or "").lower()]
    if bucket == "completed":
        items.sort(key=lambda i: i["completed_at"] or "", reverse=True)
    else:
        items.sort(key=lambda i: i["due_at"] or "9999")
    return {"follow_ups": items, "counts": counts, "server_time": _iso_z(now)}


# ── writing ──────────────────────────────────────────────────────────────────
def _email_html(brand: str, heading: str, rows: List[tuple], footer: str = "") -> str:
    esc = _html.escape
    body_rows = "".join(
        f'<tr><td style="padding:8px 14px;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;font-weight:600;width:110px;'
        f'vertical-align:top">{esc(k)}</td><td style="padding:8px 14px;border-bottom:1px solid #eef2f7;color:#0f172a;'
        f'font-size:14px;font-weight:600">{esc(str(val))}</td></tr>' for k, val in rows if val)
    return (f'<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px">'
            f'<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#2563eb">{esc(brand)}</p>'
            f'<p style="margin:6px 0 14px;font-size:20px;font-weight:800;color:#0f172a">{esc(heading)}</p>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;'
            f'border-radius:12px;overflow:hidden">{body_rows}</table>'
            f'<p style="margin:16px 0 0;color:#64748b;font-size:12px">{esc(footer)}</p></div>')


def _notify_by_email(session: Session, v: inbox.Viewer, f: FollowUp, extra_to: Optional[str]) -> dict:
    """The "send me and the contact a scheduled-follow-up email" option. Failures are reported, never fatal."""
    brand = branding.current_brand(f.tenant_id).name
    owner = session.get(User, f.assigned_to) if f.assigned_to else None
    label = _local_label(f.due_at, f.timezone)
    reminder = _reminder_minutes(f)
    rows = [("Follow-up", f.title), ("Scheduled for", label), ("Channel", _shown(f.channel, CHANNELS, "Email")),
            ("Reason / notes", f.notes or "Scheduled follow-up"),
            ("Reminder", f"An email reminder {reminder} min before it is due" if reminder else "None")]
    html = _email_html(brand, "Follow-up scheduled", rows)
    out = {"sent": 0, "errors": []}
    targets = []
    if extra_to and "@" in extra_to:
        targets.append((extra_to.strip(), False))           # an outside contact: only from a mailbox the company owns
    if owner and owner.email and owner.email.lower() not in {t[0].lower() for t in targets}:
        targets.append((owner.email, True))                 # the colleague: the server mailbox is acceptable
    for to, internal in targets:
        try:
            account = company_mailer.resolve_account(session, v.user.id, f.tenant_id, allow_server_fallback=internal)
            company_mailer.send_via(account, to=to, subject=f"Follow-up scheduled: {f.title}"[:300], body=html)
            out["sent"] += 1
        except Exception as e:
            out["errors"].append(f"{to}: {company_mailer.friendly_smtp_error(e) if not isinstance(e, company_mailer.MailAccountError) else str(e)}")
    return out


@router.post("/follow-ups")
def create_followup(body: FollowUpBody, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    if not (body.title or "").strip():
        raise HTTPException(status_code=400, detail="Title is required")
    info = fu_api._check_record(session, v, body.lead_id if not body.client_id else None, body.client_id)
    contact = _contact_in_company(session, v, body.contact_id)
    tz_name = _validate_tz(body.timezone) or getattr(v.user, "timezone", None)
    due = _to_utc(body.due_at, tz_name)
    if due is None:
        raise HTTPException(status_code=400, detail="Pick a date and time for the follow-up.")
    minutes = max(0, int(body.reminder_minutes if body.reminder_minutes is not None else DEFAULT_REMINDER_MINUTES))
    tenant_id = info.get("tenant_id") or (v.tenant_id if v.tenant_id is not None else v.user.tenant_id)
    assignee = fu_api._check_assignee(session, v, body.owner_id) or info.get("owner_id") or v.user.id
    f = FollowUp(
        tenant_id=tenant_id, title=body.title.strip(), notes=(body.notes or "").strip() or None,
        channel=_stored(_choice(body.channel, CHANNELS, "Email")), priority=_stored(_choice(body.priority, PRIORITIES, "Medium")),
        status=core.OPEN, due_at=due, remind_at=_remind_at(due, minutes), timezone=tz_name,
        lead_id=body.lead_id if not body.client_id else None, client_id=body.client_id, contact_id=body.contact_id,
        contact_name=_contact_name(contact) if contact else info.get("contact_name"),
        contact_email=(contact.email if contact else None) or info.get("contact_email"),
        company_name=info.get("label"), assigned_to=assignee, created_by=v.user.id, source="manual",
    )
    session.add(f)
    core.sync_call_followup(session, f)
    session.flush()
    core.log_activity(session, f, "Follow-up scheduled", f"Due {_local_label(due, tz_name)} via {_shown(f.channel, CHANNELS, 'Email')}", v.user.id)
    if assignee != v.user.id:
        core.notify(session, assignee, tenant_id, "New follow-up assigned",
                    f"{v.user.name or 'A teammate'} assigned you: {f.title} (due {_local_label(due, tz_name)})", "/follow-ups")
    session.commit()
    session.refresh(f)
    out = _one(session, f)
    if body.send_notification:
        target = (body.notify_email or "").strip() or f.contact_email or info.get("contact_email")
        out["notification"] = _notify_by_email(session, v, f, target)
    return out


@router.put("/follow-ups/{follow_up_id}")
def update_followup(follow_up_id: int, body: FollowUpUpdate, v: inbox.Viewer = Depends(get_viewer),
                    session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and not (data["title"] or "").strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if "lead_id" in data or "client_id" in data:
        lead_id = data.get("lead_id", f.lead_id)
        client_id = data.get("client_id", f.client_id)
        fu_api._check_record(session, v, lead_id if not client_id else None, client_id)
        f.lead_id, f.client_id = (lead_id if not client_id else None), client_id
    if "contact_id" in data:
        _contact_in_company(session, v, data["contact_id"])
        f.contact_id = data["contact_id"]
    if "owner_id" in data:
        f.assigned_to = fu_api._check_assignee(session, v, data["owner_id"]) or v.user.id
    tz_name = _validate_tz(data["timezone"]) if "timezone" in data else f.timezone
    minutes = _reminder_minutes(f)
    if data.get("reminder_minutes") is not None:
        minutes = max(0, int(data["reminder_minutes"]))
    if "title" in data:
        f.title = data["title"].strip()
    if "notes" in data:
        f.notes = (data["notes"] or "").strip() or None
    if "channel" in data:
        f.channel = _stored(_choice(data["channel"], CHANNELS, _shown(f.channel, CHANNELS, "Email")))
    if "priority" in data:
        f.priority = _stored(_choice(data["priority"], PRIORITIES, _shown(f.priority, PRIORITIES, "Medium")))
    f.timezone = tz_name
    if data.get("due_at"):
        f.due_at = _to_utc(data["due_at"], tz_name)
        f.reminder_sent_at = f.overdue_notified_at = None      # a new due date re-arms both notices
    f.remind_at = _remind_at(core.as_utc(f.due_at), minutes)
    if data.get("status"):
        st = data["status"].strip().title()
        if st == "Completed":
            f.status, f.completed_at, f.completed_by = core.DONE, f.completed_at or core.utcnow(), v.user.id
        elif st in BOARD_STATUSES:
            f.status, f.completed_at, f.completed_by = st, None, None
    f.updated_at = core.utcnow()
    session.add(f)
    core.sync_call_followup(session, f)
    session.commit()
    session.refresh(f)
    return _one(session, f)


@router.put("/follow-ups/{follow_up_id}/status")
@router.patch("/follow-ups/{follow_up_id}/status")
def change_status(follow_up_id: int, body: StatusUpdateBody, v: inbox.Viewer = Depends(get_viewer),
                  session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    st = (body.status or "Pending").strip().title()
    st = st if st in BOARD_STATUSES else core.OPEN
    f.status = st
    if st == core.DONE:
        f.completed_at, f.completed_by = core.utcnow(), v.user.id
        if body.completion_note:
            f.outcome = body.completion_note
    else:
        f.completed_at = f.completed_by = None
    f.updated_at = core.utcnow()
    session.add(f)
    core.sync_call_followup(session, f)
    core.log_activity(session, f, f"Follow-up marked {st}", f.outcome or "", v.user.id)
    session.commit()
    session.refresh(f)
    return _one(session, f)


@router.post("/follow-ups/{follow_up_id}/reschedule")
def reschedule(follow_up_id: int, body: RescheduleBody, v: inbox.Viewer = Depends(get_viewer),
               session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    tz_name = _validate_tz(body.timezone) or f.timezone
    due = _to_utc(body.due_at, tz_name)
    if due is None:
        raise HTTPException(status_code=400, detail="Pick a date and time.")
    minutes = _reminder_minutes(f)
    f.due_at, f.timezone, f.remind_at = due, tz_name, _remind_at(due, minutes)
    f.schedule_status = "confirmed"
    f.requested_window = f.requested_at_text = None
    f.reschedule_count = int(f.reschedule_count or 0) + 1
    f.rescheduled_at = core.utcnow()
    f.status, f.completed_at, f.completed_by = core.OPEN, None, None
    f.reminder_sent_at = f.overdue_notified_at = None
    f.updated_at = core.utcnow()
    session.add(f)
    core.sync_call_followup(session, f)
    core.log_activity(session, f, "Follow-up rescheduled", f"Now due {_local_label(due, tz_name)}", v.user.id)
    session.commit()
    session.refresh(f)
    return _one(session, f)


@router.post("/follow-ups/{follow_up_id}/complete")
def complete(follow_up_id: int, body: Optional[CompleteBody] = None, v: inbox.Viewer = Depends(get_viewer),
             session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    now = core.utcnow()
    f.status, f.completed_at, f.completed_by, f.updated_at = core.DONE, now, v.user.id, now
    if body and body.note:
        f.outcome = body.note
    session.add(f)
    core.sync_call_followup(session, f)
    core.log_activity(session, f, "Follow-up completed", f.outcome or "", v.user.id)
    session.commit()
    session.refresh(f)
    return _one(session, f)


@router.post("/follow-ups/{follow_up_id}/reopen")
def reopen(follow_up_id: int, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    f.status, f.completed_at, f.completed_by, f.updated_at = core.OPEN, None, None, core.utcnow()
    session.add(f)
    core.sync_call_followup(session, f)
    core.log_activity(session, f, "Follow-up reopened", "", v.user.id)
    session.commit()
    session.refresh(f)
    return _one(session, f)


@router.delete("/follow-ups/{follow_up_id}")
def delete_followup(follow_up_id: int, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    f = fu_api._load(session, v, follow_up_id)
    core.sync_call_followup(session, f, deleted=True)
    session.delete(f)
    session.commit()
    return {"ok": True}


# ── personalised follow-up email ─────────────────────────────────────────────
def _resolve_target(session: Session, v: inbox.Viewer, follow_up_id, lead_id, client_id, contact_id):
    """(follow-up or None, lead_id, client_id, contact). A contact brings its lead / client with it."""
    f = fu_api._load(session, v, follow_up_id) if follow_up_id else None
    if f:
        lead_id, client_id, contact_id = lead_id or f.lead_id, client_id or f.client_id, contact_id or f.contact_id
    contact = _contact_in_company(session, v, contact_id)
    if contact:
        lead_id = lead_id or contact.lead_id
        client_id = client_id or contact.client_id
    return f, lead_id, client_id, contact


@router.post("/follow-ups/email-draft")
def email_draft(body: EmailDraftBody, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    f, lead_id, client_id, contact = _resolve_target(session, v, body.follow_up_id, body.lead_id, body.client_id, body.contact_id)
    if not (lead_id or client_id):
        raise HTTPException(status_code=400, detail="Link the follow-up to a lead, client or contact first so previous discussions can be used.")
    kind = "clients" if client_id else "leads"
    rec = inbox._record(session, v, kind, client_id or lead_id)
    info = core.record_info(session, rec.id if kind == "leads" else None, rec.id if kind == "clients" else None)
    context_text, latest = fu_api._record_context(session, v, kind, rec, exclude_followup=f.id if f else None)
    goal = body.goal or (f.title if f else None) or "continue the conversation and agree next steps"
    tone = (body.tone or "professional").lower()
    if os.getenv("OPENAI_API_KEY"):
        inbox._charge_trial(session, v, "emails")
    inbox._release(session)
    draft = followup_ai.draft_followup_email(
        contact_name=(_contact_name(contact) if contact else info.get("contact_name")) or "", company=info.get("label") or "",
        record_label=info.get("label") or "", title=goal, reason=(f.notes if f else "") or "", context_text=context_text,
        sender_name=v.user.name or "", sender_company=fu_api._company_name(session, rec.tenant_id), tone=tone,
        instructions=body.goal or "", last_discussion=(latest[0][1][:300] if latest else ""))
    return {"subject": draft["subject"], "body": draft["body"], "ai": draft.get("engine") == "ai",
            "to_email": (contact.email if contact else None) or info.get("contact_email"),
            "to_name": (_contact_name(contact) if contact else info.get("contact_name")), "company": info.get("label"),
            "context_used": {"Notes and conversations": len(latest)}, "context_total": len(latest)}


@router.post("/follow-ups/send-email")
def send_email(body: SendEmailBody, v: inbox.Viewer = Depends(get_viewer), session: Session = Depends(get_session)):
    to = (body.to_email or "").strip()
    if not inbox._valid_email(to):
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Subject and message are required")
    f, lead_id, client_id, _ = _resolve_target(session, v, body.follow_up_id, body.lead_id, body.client_id, body.contact_id)
    if lead_id or client_id:
        fu_api._check_record(session, v, lead_id if not client_id else None, client_id)
    tenant_id = f.tenant_id if f and f.tenant_id is not None else (v.tenant_id if v.tenant_id is not None else v.user.tenant_id)
    try:
        account = company_mailer.resolve_account(session, v.user.id, tenant_id)
    except company_mailer.MailAccountError as e:
        raise HTTPException(status_code=503, detail=str(e))
    text = company_mailer.apply_signature(body.body, company_mailer.user_signature(session, v.user.id))
    try:
        sent = company_mailer.send_and_record(
            session, account, tenant_id=tenant_id, to=to, subject=body.subject.strip(), body=text,
            lead_id=lead_id, client_id=client_id,
            meta={"source": "follow_up_board", "follow_up_id": f.id if f else None, "sent_by_user_id": v.user.id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"The mail server did not accept the email: {company_mailer.friendly_smtp_error(e)}")
    now = core.utcnow()
    if f:
        f = session.get(FollowUp, f.id)
        core.mark_email_sent(session, f, sent, actor_id=v.user.id, actor_name=v.user.name or v.user.email,
                             complete=bool(body.mark_complete) and f.status in core.OPEN_STATES)
        f.last_email_at = now
        session.add(f)
    elif lead_id or client_id:
        session.add(ConversationLog(tenant_id=tenant_id, lead_id=lead_id, client_id=client_id, title=body.subject.strip()[:500],
                                    type="email", description=text[:4000], author_id=v.user.id, author_name=v.user.name))
    session.commit()
    out = {"ok": True, "from": account.email, "sent_email_id": sent.id, "follow_up": None}
    if f:
        session.refresh(f)
        out["follow_up"] = _one(session, f)["follow_up"]
    return out
