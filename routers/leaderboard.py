from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from typing import List, Literal, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from database import engine, User, Deal, ConversationLog, Lead, ClientProfile, ProjectTicket
from modules.api_tracker import current_salesperson_id
from modules.tenant_scope import current_tenant_id

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
    tickets_assigned: int = 0
    tickets_in_production: int = 0
    tickets_completed: int = 0

@router.get("", response_model=List[LeaderboardEntry])
def get_leaderboard(
    kind: Optional[Literal["sales", "tickets"]] = None,
    period: Optional[Literal["today", "week", "month", "all"]] = "all",
    session: Session = Depends(get_session)
):
    roles = (["Employee", "SalesManager", "Sales"] if kind == "sales" else
             ["ProjectMember", "Intern", "Developer"] if kind == "tickets" else
             ["Employee", "SalesManager", "Sales", "ProjectMember", "Intern"])
    query = select(User).where(User.role.in_(roles))
    requester_id = current_salesperson_id.get()
    if requester_id:
        requester = session.get(User, requester_id)
        if requester and current_tenant_id.get():
            query = query.where(User.tenant_id == current_tenant_id.get())
    users = session.exec(query).all()

    now = datetime.now(timezone.utc)
    since = None
    if period == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)
    
    leaderboard = []
    
    for user in users:
        # Get deals closed (Closed Won)
        deals_query = select(Deal).where(Deal.assigned_to == user.id, Deal.stage == "Closed Won")
        if since is not None:
            deals_query = deals_query.where(
                (Deal.won_at >= since) | ((Deal.won_at == None) & (Deal.created_at >= since))
            )
        deals = session.exec(deals_query).all()
        deals_closed = len(deals)
        revenue_closed = sum((deal.final_value if deal.final_value is not None else deal.value) for deal in deals)
        
        # Get meetings booked
        meetings_query = select(ConversationLog).where(ConversationLog.author_id == user.id, ConversationLog.type == "meeting")
        if since is not None:
            meetings_query = meetings_query.where(ConversationLog.conversation_at >= since)
        meetings = session.exec(meetings_query).all()
        meetings_booked = len(meetings)
        
        # Get calls made
        calls_query = select(ConversationLog).where(ConversationLog.author_id == user.id, ConversationLog.type == "call")
        if since is not None:
            calls_query = calls_query.where(ConversationLog.conversation_at >= since)
        calls = session.exec(calls_query).all()
        calls_made = len(calls)

        leads_query = select(Lead).where(Lead.owner_id == user.id)
        if since is not None:
            leads_query = leads_query.where(Lead.created_at >= since)
        leads_managed = len(session.exec(leads_query).all())

        clients_managed = len(session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).all())
        all_tickets = session.exec(select(ProjectTicket)).all()
        owner_name = (user.name or "").strip().lower()
        assigned_tickets = [ticket for ticket in all_tickets if owner_name and (ticket.current_owner or "").strip().lower() == owner_name]
        tickets_in_production = sum(1 for ticket in assigned_tickets if ticket.current_state == "Prod Release")
        tickets_completed = sum(1 for ticket in assigned_tickets if ticket.date_release_prod or ticket.current_state == "Prod Release")

        leaderboard.append(LeaderboardEntry(
            user_id=user.id,
            name=user.name or user.email.split('@')[0],
            role=user.role,
            deals_closed=deals_closed,
            revenue_closed=revenue_closed,
            meetings_booked=meetings_booked,
            calls_made=calls_made
            , leads_managed=leads_managed
            , clients_managed=clients_managed
            , tickets_assigned=len(assigned_tickets)
            , tickets_in_production=tickets_in_production
            , tickets_completed=tickets_completed
        ))
        
    # Sort by revenue as primary metric
    leaderboard.sort(key=lambda x: x.revenue_closed, reverse=True)
    
    return leaderboard
