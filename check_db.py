from sqlmodel import Session, select
from database import engine, SentEmail

with Session(engine) as session:
    emails = session.exec(select(SentEmail).order_by(SentEmail.id.desc()).limit(5)).all()
    for e in emails:
        print(f"ID: {e.id}, To: {e.to_email}, Status: {e.status}")
