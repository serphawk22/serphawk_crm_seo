"""One-time e-mail codes (EmailOTP): verification, attempt limits and single use."""
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from database import EmailOTP

MAX_ATTEMPTS = 5                  # wrong guesses before a code is dead
VERIFIED_VALID_MINUTES = 30       # how long a verified e-mail can be used to finish registering


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def check_code(session: Session, *, user_id: Optional[int], email: str, purpose: str, code: str) -> EmailOTP:
    """Mark the newest unused code for this address as verified when ``code`` matches; raise 400 otherwise."""
    q = select(EmailOTP).where(func.lower(EmailOTP.email) == email.strip().lower(), EmailOTP.purpose == purpose,
                               EmailOTP.verified == False)  # noqa: E712
    q = q.where(EmailOTP.user_id == user_id) if user_id is not None else q.where(EmailOTP.user_id.is_(None))
    rec = session.exec(q.order_by(EmailOTP.id.desc())).first()
    invalid = HTTPException(status_code=400, detail="Invalid or expired OTP code.")
    if not rec or as_utc(rec.expires_at) < datetime.now(timezone.utc) or (rec.attempts or 0) >= MAX_ATTEMPTS:
        raise invalid
    if not hmac.compare_digest(rec.otp_code, (code or "").strip()):
        rec.attempts = (rec.attempts or 0) + 1
        session.add(rec)
        session.commit()
        raise invalid
    rec.verified = True
    session.add(rec)
    session.commit()
    return rec


def require_verified(session: Session, email: str, purpose: str = "signup") -> EmailOTP:
    """The verified record that proves the caller controls ``email``; 400 when missing or too old."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=VERIFIED_VALID_MINUTES)
    rows = session.exec(select(EmailOTP).where(func.lower(EmailOTP.email) == email.strip().lower(),
                                               EmailOTP.purpose == purpose, EmailOTP.verified == True)  # noqa: E712
                        .order_by(EmailOTP.id.desc())).all()
    for rec in rows:
        if as_utc(rec.created_at) >= cutoff:
            return rec
    raise HTTPException(status_code=400, detail="Please verify your email before creating the account.")


def consume(session: Session, email: str, purpose: str = "signup") -> None:
    """Delete every code for this address and purpose so a verification cannot be reused."""
    for rec in session.exec(select(EmailOTP).where(func.lower(EmailOTP.email) == email.strip().lower(),
                                                   EmailOTP.purpose == purpose)).all():
        session.delete(rec)
    session.commit()
