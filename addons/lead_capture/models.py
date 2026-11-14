from datetime import datetime
from typing import Optional
from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import SQLModel, Field
from database import _utcnow


class Enquiry(SQLModel, table=True):
    __tablename__ = "lead_enquiries"
    __table_args__ = (UniqueConstraint("tenant_id", "submission_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    lead_id: Optional[int] = Field(default=None, foreign_key="leads.id", index=True)
    submission_id: str = Field(max_length=36)
    fingerprint: str = Field(max_length=64)
    receipt: str = Field(max_length=64, unique=True)
    receiving_company_name: str = Field(max_length=255)
    hostname: str = Field(max_length=255)
    revision: str = Field(max_length=36)
    state: str = Field(default="linked", index=True)
    new_lead: bool = Field(default=False)
    fields: dict = Field(default_factory=dict, sa_column=Column(JSON))
    attribution: dict = Field(default_factory=dict, sa_column=Column(JSON))
    consent: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_utcnow, index=True)


class IntakeCounter(SQLModel, table=True):
    __tablename__ = "lead_intake_counters"
    __table_args__ = (UniqueConstraint("tenant_id", "key"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    key: str = Field(max_length=100)
    minute: int = Field(default=0)
    minute_count: int = Field(default=0)
    hour: int = Field(default=0)
    hour_count: int = Field(default=0)
