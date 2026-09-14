from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from typing import List, Optional
from pydantic import BaseModel
from database import engine, User, Deal, ConversationLog, ClientProfile, Lead, ProjectTicket

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
    leads_managed: int = 0
    clients_managed: int = 0
    prod_tickets: int = 0

@router.get("", response_model=List[LeaderboardEntry])
def get_leaderboard(
    filter_type: Optional[str] = Query(None, description="'sales' or 'employee'"),
    session: Session = Depends(get_session)
):
    users = session.exec(select(User).where(User.role.in_(["Employee", "SalesManager", "Admin"]))).all()
    
    leaderboard = []
    
    for user in users:
        uname = user.name or user.email.split('@')[0]
        
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
        
        # Leads managed
        leads_managed = session.exec(select(func.count(Lead.id)).where(Lead.owner_id == user.id)).one_or_none() or 0
        
        # Clients managed
        clients_managed = session.exec(select(func.count(ClientProfile.id)).where(ClientProfile.assignedEmployeeId == user.id)).one_or_none() or 0
        
        # Prod tickets
        prod_tickets = session.exec(
            select(func.count(ProjectTicket.id)).where(
                ProjectTicket.current_owner == uname,
                ProjectTicket.current_state == "Prod Release"
            )
        ).one_or_none() or 0
        
        leaderboard.append(LeaderboardEntry(
            user_id=user.id,
            name=uname,
            role=user.role,
            deals_closed=deals_closed,
            revenue_closed=revenue_closed,
            meetings_booked=meetings_booked,
            calls_made=calls_made,
            leads_managed=leads_managed,
            clients_managed=clients_managed,
            prod_tickets=prod_tickets
        ))
        
    if filter_type == "sales":
        leaderboard.sort(key=lambda x: (x.clients_managed + x.leads_managed), reverse=True)
    elif filter_type == "employee":
        leaderboard.sort(key=lambda x: x.prod_tickets, reverse=True)
    else:
        # Default sort by revenue as primary metric
        leaderboard.sort(key=lambda x: x.revenue_closed, reverse=True)
    
    return leaderboard
