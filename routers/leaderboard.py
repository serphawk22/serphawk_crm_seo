from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from typing import List
from pydantic import BaseModel
from database import engine, User, Deal, ConversationLog

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])

def get_session():
    with Session(engine) as session:
        yield session

class LeaderboardEntry(BaseModel):
    user_id: int
    name: str
    role: str
    deals_closed: int
    revenue_closed: float
    meetings_booked: int
    calls_made: int

@router.get("", response_model=List[LeaderboardEntry])
def get_leaderboard(session: Session = Depends(get_session)):
    users = session.exec(select(User).where(User.role.in_(["Employee", "SalesManager", "Admin"]))).all()
    
    leaderboard = []
    
    for user in users:
        # Get deals closed (Closed Won)
        deals = session.exec(select(Deal).where(Deal.assigned_to == user.id, Deal.stage == "Closed Won")).all()
        deals_closed = len(deals)
        revenue_closed = sum(deal.value for deal in deals)
        
        # Get meetings booked
        meetings = session.exec(select(ConversationLog).where(ConversationLog.author_id == user.id, ConversationLog.type == "meeting")).all()
        meetings_booked = len(meetings)
        
        # Get calls made
        calls = session.exec(select(ConversationLog).where(ConversationLog.author_id == user.id, ConversationLog.type == "call")).all()
        calls_made = len(calls)
        
        leaderboard.append(LeaderboardEntry(
            user_id=user.id,
            name=user.name or user.email.split('@')[0],
            role=user.role,
            deals_closed=deals_closed,
            revenue_closed=revenue_closed,
            meetings_booked=meetings_booked,
            calls_made=calls_made
        ))
        
    # Sort by revenue as primary metric
    leaderboard.sort(key=lambda x: x.revenue_closed, reverse=True)
    
    return leaderboard
