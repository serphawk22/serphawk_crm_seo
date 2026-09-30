from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from database import engine, SentEmail
import base64
from fastapi.responses import Response
import os

router = APIRouter(prefix="/webhook", tags=["email_tracking"])

# Gmail (and most webmail) pre-fetch every image within seconds of delivery to
# cache it, regardless of whether a human has opened the email yet — so the
# very first pixel hit is almost never a real "open". We use timing as a
# heuristic (not proof) to give a more honest status than a single Sent->Opened
# flip on that first automated fetch:
#   - a hit within PIXEL_PREFETCH_WINDOW_SECONDS of sending -> "Delivered"
#     (still genuinely useful: confirms the mail wasn't bounced/blocked and the
#     provider rendered it enough to fetch images)
#   - a hit at/after PIXEL_OPEN_THRESHOLD_SECONDS -> "Opened" (provider caches
#     have long since expired, so a later fetch is a much stronger signal of an
#     actual later view)
#   - a hit in between the two thresholds doesn't downgrade or upgrade status;
#     we'd rather under-claim than fabricate confidence we don't have.
PIXEL_PREFETCH_WINDOW_SECONDS = int(os.getenv("PIXEL_PREFETCH_WINDOW_SECONDS", "90"))
PIXEL_OPEN_THRESHOLD_SECONDS = int(os.getenv("PIXEL_OPEN_THRESHOLD_SECONDS", "180"))

def get_session():
    with Session(engine) as session:
        yield session

@router.get("/track-email-open")
def track_email_open(id: int, session: Session = Depends(get_session)):
    """
    Webhook receiver for email tracking pixel.
    Updates status using the Delivered/Opened timing heuristic above (never
    downgrades a 'Replied' email), and records hit count + timestamps, then
    returns a transparent 1x1 pixel.

    This is hit by mail-provider image proxies (Gmail, Outlook, etc.) with no
    auth headers at all. main.py's APIIntelligenceMiddleware treats any
    unauthenticated request as tenant_id=-1 and a global do_orm_execute
    listener silently rewrites every query to filter on that tenant_id — so
    without `skip_tenant`, this lookup would always find nothing (and still
    return 200 with the pixel, making the failure invisible).
    """
    email = session.get(SentEmail, id, execution_options={"skip_tenant": True})
    if email:
        # This codebase's own _utcnow() (database.py) writes timezone-aware
        # UTC datetimes, so we match that convention here rather than using
        # naive datetime.utcnow(). sent_at is still normalized defensively
        # below in case the live column round-trips it as naive — subtracting
        # a naive and an aware datetime raises "can't subtract offset-naive
        # and offset-aware datetimes" on every single pixel hit, silently
        # rolling back the whole update.
        now = datetime.now(timezone.utc)
        if not email.opened_at:
            email.opened_at = now
        email.last_opened_at = now
        email.open_count = (email.open_count or 0) + 1

        if email.status != "Replied":
            sent_at = email.sent_at
            if sent_at.tzinfo is None:
                sent_at = sent_at.replace(tzinfo=timezone.utc)
            elapsed_seconds = (now - sent_at).total_seconds()
            if elapsed_seconds >= PIXEL_OPEN_THRESHOLD_SECONDS:
                email.status = "Opened"
            elif elapsed_seconds <= PIXEL_PREFETCH_WINDOW_SECONDS and email.status == "Sent":
                email.status = "Delivered"
            # else: in the ambiguous gap between the two windows — leave status as-is.

        session.add(email)
        session.commit()

    # Base64 encoded transparent 1x1 GIF
    pixel = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
    return Response(
        content=pixel,
        media_type="image/gif",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@router.post("/check-replies-now")
def check_replies_now():
    """
    Manually trigger an immediate IMAP inbox scan for replies, instead of
    waiting for the background poller's next cycle. Useful for testing.
    """
    from modules.email_sender import check_email_replies
    updated = check_email_replies()
    return {"status": "ok", "updated": updated}


@router.post("/backfill-reply-content")
def backfill_reply_content_now(days_back: int = 60):
    """
    One-time catch-up: fills reply_from/reply_subject/reply_body on
    SentEmail rows that were already marked "Replied" by the old
    header-only poller, by re-scanning the inbox over a wider window.
    """
    from modules.email_sender import backfill_reply_content
    filled = backfill_reply_content(days_back=days_back)
    return {"status": "ok", "filled": filled}

from pydantic import BaseModel
from typing import Optional

class EmailReplyPayload(BaseModel):
    email: Optional[str] = None
    email_id: Optional[int] = None
    reply_subject: Optional[str] = None
    reply_body: Optional[str] = None

@router.post("/track-email-reply")
def track_email_reply(payload: EmailReplyPayload, session: Session = Depends(get_session)):
    """
    Webhook receiver for email replies (from cron or n8n).
    Expected payload: {"email": "user@example.com"} or {"email_id": 123}

    Same unauthenticated-webhook / tenant_id=-1 issue as track_email_open
    above — `skip_tenant` is required or these lookups silently find nothing.
    """
    if payload.email_id:
        email_record = session.get(SentEmail, payload.email_id, execution_options={"skip_tenant": True})
        if email_record:
            email_record.status = "Replied"
            email_record.replied_at = datetime.now(timezone.utc)
            if payload.reply_subject:
                email_record.reply_subject = payload.reply_subject[:500]
            if payload.reply_body:
                email_record.reply_body = payload.reply_body
            session.add(email_record)
            session.commit()
            return {"status": "success", "message": f"Email ID {payload.email_id} marked as replied"}

    if payload.email:
        from sqlmodel import select, desc
        stmt = (
            select(SentEmail)
            .where(SentEmail.to_email == payload.email)
            .order_by(desc(SentEmail.sent_at))
            .execution_options(skip_tenant=True)
        )
        email_record = session.exec(stmt).first()
        if email_record:
            email_record.status = "Replied"
            email_record.replied_at = datetime.now(timezone.utc)
            if payload.reply_subject:
                email_record.reply_subject = payload.reply_subject[:500]
            if payload.reply_body:
                email_record.reply_body = payload.reply_body
            session.add(email_record)
            session.commit()
            return {"status": "success", "message": f"Most recent email to {payload.email} marked as replied"}
            
    return {"status": "error", "message": "Email record not found or no valid identifier provided"}