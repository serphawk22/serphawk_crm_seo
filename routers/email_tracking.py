from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from database import engine, SentEmail
import base64
from fastapi.responses import Response
import os

router = APIRouter(prefix="/webhook", tags=["email_tracking"])

def get_session():
    with Session(engine) as session:
        yield session

@router.get("/track-email-open")
def track_email_open(id: int, session: Session = Depends(get_session)):
    """
    Webhook receiver for email tracking pixel.
    Updates the email status to 'Opened' and returns a transparent 1x1 pixel.
    """
    email = session.get(SentEmail, id)
    if email and email.status == "Sent":
        email.status = "Opened"
        session.add(email)
        session.commit()

    # Base64 encoded transparent 1x1 GIF
    pixel = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
    return Response(content=pixel, media_type="image/gif")

@router.post("/track-email-reply")
def track_email_reply(request: Request, session: Session = Depends(get_session)):
    """
    Webhook receiver for email replies (from cron or n8n).
    Expected payload: {"email_id": 123}
    """
    # Just in case they post it as JSON
    # This might need to be adjusted based on the actual payload from the cron
    return {"status": "success", "message": "Reply tracking endpoint ready"}