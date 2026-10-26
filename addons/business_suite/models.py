"""Tables of the business_suite add-on (ported from the SCM BPO deployment).

Every table has a tenant_id, so the shared tenant filter and the optional Postgres RLS cover them. They are
created by SQLModel.metadata.create_all at startup like every other table (this module is imported by
addons/__init__.py before startup runs).
"""
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text

from database import _utcnow as utc_now



class LeadSource(SQLModel, table=True):
    """SCM2-62/63: Configurable lead sources (Facebook, Google, LinkedIn, Referral, Conference...)."""
    __tablename__ = "lead_sources"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=120)
    channel: str = Field(default="Other", max_length=50)  # Social, Paid, Referral, Event, Organic, Direct, Other
    utm_key: Optional[str] = Field(default=None, max_length=120)  # matched against utm_source (lower-case)
    color: Optional[str] = Field(default="#6366f1", max_length=20)
    monthly_cost: float = Field(default=0.0)  # marketing spend, used for cost-per-lead / ROI
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)


class BusinessCost(SQLModel, table=True):
    """SCM2-59: Salaries and other business costs."""
    __tablename__ = "business_costs"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=255)
    category: str = Field(default="Other", max_length=50)  # Salary, Rent, Software, Marketing, Utilities, Travel, Other
    amount: float = Field(default=0.0)
    currency: str = Field(default="INR", max_length=10)
    cost_date: str = Field(max_length=10, index=True)  # YYYY-MM-DD (month the cost applies to)
    is_recurring: bool = Field(default=False)  # monthly recurring: counted every month from cost_date (until end_date)
    end_date: Optional[str] = Field(default=None, max_length=10)
    employee_id: Optional[int] = Field(default=None)  # for salary rows
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class DealNegotiation(SQLModel, table=True):
    """SCM2-56: Negotiation rounds / pricing changes for a deal."""
    __tablename__ = "deal_negotiations"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    deal_id: int = Field(index=True)
    round_no: int = Field(default=1)
    party: str = Field(default="us", max_length=20)  # us (our offer) | client (counter-offer)
    price: float = Field(default=0.0)
    discount_pct: float = Field(default=0.0)
    status: str = Field(default="Proposed", max_length=30)  # Proposed, Countered, Accepted, Rejected
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    author_id: Optional[int] = Field(default=None)
    author_name: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=utc_now)


class OwnershipHistory(SQLModel, table=True):
    """SCM2-52/53: Ownership changes for leads and clients."""
    __tablename__ = "ownership_history"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str = Field(max_length=20, index=True)  # lead | client
    entity_id: int = Field(index=True)
    entity_name: Optional[str] = Field(default=None, max_length=255)
    from_user_id: Optional[int] = Field(default=None)
    to_user_id: Optional[int] = Field(default=None)
    from_user_name: Optional[str] = Field(default=None, max_length=200)
    to_user_name: Optional[str] = Field(default=None, max_length=200)
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    changed_by: Optional[int] = Field(default=None)
    changed_by_name: Optional[str] = Field(default=None, max_length=200)
    changed_at: datetime = Field(default_factory=utc_now)


class StockMovement(SQLModel, table=True):
    """SCM2-54: Stock in/out log for inventory items."""
    __tablename__ = "stock_movements"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    item_id: int = Field(index=True)
    change: float = Field(default=0.0)  # +in / -out
    reason: str = Field(default="Adjustment", max_length=50)  # Purchase, Sale, Adjustment, Return, Damage
    reference: Optional[str] = Field(default=None, max_length=255)
    balance_after: Optional[float] = Field(default=None)
    author_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class SalespersonHistory(SQLModel, table=True):
    """Tracks salesperson reassignments for clients."""
    __tablename__ = "salesperson_history"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    client_id: int
    from_user_id: Optional[int] = Field(default=None)
    to_user_id: Optional[int] = Field(default=None)
    from_user_name: Optional[str] = Field(default=None, max_length=200)
    to_user_name: Optional[str] = Field(default=None, max_length=200)
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    reassigned_by: Optional[int] = Field(default=None)
    reassigned_at: Optional[datetime] = Field(default_factory=utc_now)
    created_at: Optional[datetime] = Field(default_factory=utc_now)


class DroppedClient(SQLModel, table=True):
    """Records of clients who have discontinued their relationship."""
    __tablename__ = "dropped_clients"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    client_id: Optional[int] = Field(default=None)
    company_name: str = Field(max_length=255)
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    reason_category: Optional[str] = Field(default="Other", max_length=100)
    dropped_by: Optional[int] = Field(default=None)
    last_revenue: Optional[float] = Field(default=0)
    relationship_months: Optional[int] = Field(default=0)
    reactivation_potential: Optional[str] = Field(default="Low", max_length=50)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    previous_status: Optional[str] = Field(default=None, max_length=100)   # restored when the client is reactivated
    dropped_at: Optional[datetime] = Field(default_factory=utc_now)
    reactivated_at: Optional[datetime] = Field(default=None)               # set instead of deleting the record
    created_at: Optional[datetime] = Field(default_factory=utc_now)


class ProposalComment(SQLModel, table=True):
    """Chat messages/negotiations for a specific quote/proposal"""
    __tablename__ = "proposal_comments"
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    id: Optional[int] = Field(default=None, primary_key=True)
    quote_id: Optional[int] = Field(default=None, foreign_key="quotes.id", index=True)
    proposal_id: Optional[int] = Field(default=None, foreign_key="proposals.id", index=True)
    author_name: str = Field(max_length=255)
    author_type: str = Field(default="client", max_length=50) # 'client' or 'internal'
    content: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)
