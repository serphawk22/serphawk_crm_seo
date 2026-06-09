"""
Database Models and Engine Setup for Cold Outreach CRM
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, create_engine, Session, JSON
from sqlalchemy import Column, String, Index, DateTime, select, func, Text
from sqlalchemy.dialects.postgresql import JSONB
import os
from dotenv import load_dotenv

load_dotenv(override=True)

# Database URL from environment
# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

# Windows compatibility fix for psycopg2 and Neon SSL DLLs
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# Create engine with SSL mode for Neon PostgreSQL
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=False,          # disable: was causing 1 extra RTT per request
    pool_size=10,
    max_overflow=20,
    pool_recycle=300,             # recycle connections every 5 min to keep them fresh
    connect_args={
        "connect_timeout": 10,    # fail fast instead of hanging
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
)


class ClientStatus(SQLModel, table=True):
    """
    Dynamic Status configuration for Clients
    """
    __tablename__ = "client_statuses"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, max_length=100)
    color: str = Field(default="bg-gray-500", max_length=50) # Tailwind class
    created_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    """
    User model for authentication and role management
    """
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password: str
    hashed_password: str = Field(default="")
    name: Optional[str] = None
    role: str = Field(default="Client") # Admin, Employee, Client
    is_active: bool = Field(default=True)
    status: str = Field(default="Active")
    createdAt: datetime = Field(default_factory=datetime.utcnow, sa_column=Column("created_at", DateTime))
    updatedAt: datetime = Field(default_factory=datetime.utcnow, sa_column=Column("updated_at", DateTime))
    
    # Relationships
    # Relationships
    profile: Optional["ClientProfile"] = Relationship(back_populates="user")
    activities: List["ActivityLog"] = Relationship(back_populates="user")
    assigned_requests: List["ServiceRequest"] = Relationship(back_populates="assigned_employee")
    deals: List["Deal"] = Relationship(back_populates="assigned_user")

class MarketplaceService(SQLModel, table=True):
    """
    Central B2B Marketplace catalog entry.
    Can be populated manually by admins or automatically by the customer web scraper.
    """
    __tablename__ = "marketplace_services"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Service identity
    service_name: str = Field(max_length=255)
    normalized_name: Optional[str] = Field(default=None, max_length=255)  # AI-standardized
    category: Optional[str] = Field(default=None, max_length=100, index=True)  # e.g. "Plumbing", "SEO", "Legal"
    description: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Pricing
    estimated_cost: float = Field(default=0.0)
    cost_is_estimated: bool = Field(default=False)  # True if AI guessed the cost

    # Provider info (linked CRM client)
    provider_name: Optional[str] = Field(default=None, max_length=255)
    provider_client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id", index=True)
    provider_industry: Optional[str] = Field(default=None, max_length=200)
    provider_address: Optional[str] = Field(default=None, max_length=500)

    # Meta
    source: str = Field(default="manual", max_length=50)  # "manual" or "scraper"
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationship back to client profile
    provider: Optional["ClientProfile"] = Relationship(back_populates="marketplace_services")


class ServiceCatalog(SQLModel, table=True):

    """
    Admin-defined list of services available for clients to purchase or request.
    """
    __tablename__ = "service_catalog"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    cost: float = Field(default=0.0)
    intro_description: str = Field(sa_column=Column(Text))
    full_description: Optional[str] = Field(default=None, sa_column=Column(Text))
    handler_role: str = Field(default="Employee") # Admin, Employee, "SEO Specialist"
    image_url: Optional[str] = None
    past_results: Optional[str] = Field(default=None, sa_column=Column(Text))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationship
    requests: List["ServiceRequest"] = Relationship(back_populates="service")

class ServiceRequest(SQLModel, table=True):
    """
    Client's request for a specific service from the catalog.
    """
    __tablename__ = "service_requests"
    id: Optional[int] = Field(default=None, primary_key=True)
    service_id: int = Field(foreign_key="service_catalog.id")
    client_id: int = Field(foreign_key="client_profiles.id")
    assigned_employee_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    status: str = Field(default="Pending") # Pending, Quoted, Accepted, In Progress, Delivered
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Quote fields — Admin fills these in when replying
    quoted_amount: Optional[float] = None
    quote_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    quote_doc_url: Optional[str] = None  # URL to uploaded proposal/document
    team_info: Optional[str] = Field(default=None, sa_column=Column(Text))
    quote_sent_at: Optional[datetime] = None
    client_accepted_quote: bool = Field(default=False)

    # Link to messaging
    threads: List["MessageThread"] = Relationship(back_populates="service_request")

    # Bi-directional relationships
    service: Optional[ServiceCatalog] = Relationship(back_populates="requests")
    client: Optional["ClientProfile"] = Relationship(back_populates="service_requests")
    assigned_employee: Optional[User] = Relationship(back_populates="assigned_requests")


class MessageThread(SQLModel, table=True):
    __tablename__ = "message_threads"
    id: Optional[int] = Field(default=None, primary_key=True)
    service_request_id: int = Field(foreign_key="service_requests.id")
    client_id: int = Field(foreign_key="client_profiles.id")
    employee_id: Optional[int] = Field(default=None, foreign_key="users.id")
    status: str = Field(default="Active") # Active, Closed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    service_request: "ServiceRequest" = Relationship(back_populates="threads")
    messages: List["ChatMessage"] = Relationship(back_populates="thread")

class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    id: Optional[int] = Field(default=None, primary_key=True)
    thread_id: int = Field(foreign_key="message_threads.id")
    sender_id: int = Field(foreign_key="users.id")
    content: str = Field(sa_column=Column(Text))
    is_system: bool = Field(default=False)
    is_read: bool = Field(default=False)
    read_at: Optional[datetime] = Field(default=None)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    thread: "MessageThread" = Relationship(back_populates="messages")



class Project(SQLModel, table=True):
    """
    Dedicated model for managing client projects, team assignments, and progress.
    """
    __tablename__ = "projects"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="Planning") # Planning, Active, Completed, Hold
    progress: int = Field(default=0) # 0-100
    
    # Team assignments stored as JSONB list of IDs for flexibility
    # In a larger app, these would be junction tables
    employeeIds: Optional[List[int]] = Field(default_factory=list, sa_column=Column(JSON))
    internIds: Optional[List[int]] = Field(default_factory=list, sa_column=Column(JSON))
    clientIds: Optional[List[int]] = Field(default_factory=list, sa_column=Column(JSON))
    
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    remarks: List["Remark"] = Relationship(back_populates="project")


class ClientProfile(SQLModel, table=True):
    """
    Detailed profile for clients
    """
    __tablename__ = "client_profiles"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    userId: Optional[int] = Field(default=None, foreign_key="users.id")
    projectId: Optional[int] = Field(default=None, foreign_key="projects.id")
    companyName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: str = Field(default="Active") # Active, Hold, Pending
    customFields: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    assignedEmployeeId: Optional[int] = None
    projectName: Optional[str] = None
    gmbName: Optional[str] = None
    seoStrategy: Optional[str] = None
    tagline: Optional[str] = None
    targetKeywords: Optional[List[str]] = Field(default_factory=list, sa_column=Column(JSON))
    websiteUrl: Optional[str] = None
    recommended_services: Optional[str] = Field(default=None, max_length=1000)
    nextMilestone: Optional[str] = None
    nextMilestoneDate: Optional[str] = None
    lastActivity: Optional[str] = None
    lastActivityDate: Optional[str] = None
    
    # SEO Client Management Tool Workflow fields
    payment_status: str = Field(default="Pending") # Pending, Paid, Failed
    sitemap_url: Optional[str] = None
    cms_type: Optional[str] = None
    
    # Service Tracking
    services_offered: Optional[str] = Field(default=None, sa_column=Column(Text))
    services_requested: Optional[str] = Field(default=None, sa_column=Column(Text))
    outbound_email_sent: bool = Field(default=False)
    inbound_email_sent: bool = Field(default=False)

    # CRM Sales Intelligence Fields
    lead_score: Optional[int] = Field(default=None)  # 0-100
    lead_source: Optional[str] = Field(default=None, max_length=100)  # Cold Email, Referral, Inbound, etc.
    deal_value: Optional[float] = Field(default=None)
    industry: Optional[str] = Field(default=None, max_length=200)
    employee_count: Optional[str] = Field(default=None, max_length=100)
    revenue_range: Optional[str] = Field(default=None, max_length=100)
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    contact_person: Optional[str] = Field(default=None, max_length=255)
    last_contact_date: Optional[str] = Field(default=None, max_length=50)
    next_followup_date: Optional[str] = Field(default=None, max_length=50)
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="profile")
    remarks: List["Remark"] = Relationship(back_populates="client")
    documents: List["Document"] = Relationship(back_populates="client")
    
    # New relationships for SEO Workflow
    social_profiles: List["SocialProfile"] = Relationship(back_populates="client")
    seo_audits: List["SEOAudit"] = Relationship(back_populates="client")
    competitor_analyses: List["CompetitorAnalysis"] = Relationship(back_populates="client")
    ranking_records: List["RankingTracker"] = Relationship(back_populates="client")
    analytics_data: List["AnalyticsData"] = Relationship(back_populates="client")
    
    # Store requests
    service_requests: List["ServiceRequest"] = Relationship(back_populates="client")

    # New feature relationships
    file_uploads: List["ClientFileUpload"] = Relationship(back_populates="client")
    milestones: List["Milestone"] = Relationship(back_populates="client")
    marketplace_services: List["MarketplaceService"] = Relationship(back_populates="provider")
    nps_surveys: List["NPSSurvey"] = Relationship(back_populates="client")
    deals: List["Deal"] = Relationship(back_populates="client")
    invoices: List["Invoice"] = Relationship(back_populates="client")
    proposals: List["Proposal"] = Relationship(back_populates="client")
    keyword_ranks: List["KeywordRankEntry"] = Relationship(back_populates="client")


class Remark(SQLModel, table=True):
    """
    Internal or client-facing remarks/comments
    """
    __tablename__ = "remarks"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str = Field(sa_column=Column(Text))
    authorId: Optional[int] = Field(default=None, foreign_key="users.id")
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    projectId: Optional[int] = Field(default=None, foreign_key="projects.id")
    isInternal: bool = Field(default=True)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    client: Optional[ClientProfile] = Relationship(back_populates="remarks")
    project: Optional[Project] = Relationship(back_populates="remarks")


class Document(SQLModel, table=True):
    """
    Documents and OCR results
    """
    __tablename__ = "documents"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    fileUrl: str
    ocrText: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="Pending")
    uploaderId: Optional[int] = Field(default=None, foreign_key="users.id")
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    client: Optional[ClientProfile] = Relationship(back_populates="documents")


class ActivityLog(SQLModel, table=True):
    """
    Logs of user actions and manual client activities
    """
    __tablename__ = "activity_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    userId: Optional[int] = Field(default=None, foreign_key="users.id")
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    action: str # e.g., "Manual Activity", "Login", "Profile Update"
    method: Optional[str] = None # Email, Phone, In-person, WhatsApp, Website
    content: Optional[str] = Field(default=None, sa_column=Column(Text))
    details: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional[User] = Relationship(back_populates="activities")
    client: Optional[ClientProfile] = Relationship()


class Company(SQLModel, table=True):
    """
    Company model - stores prospect information
    """
    __tablename__ = "companies"
    
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True
    )
    company_name: str = Field(max_length=255)
    website_url: str = Field(
        max_length=500,
        sa_column=Column(String(500), unique=True, index=True, nullable=False)
    )
    primary_email: str = Field(max_length=255)
    email_sender: str = Field(default="padilla@dapros.com", max_length=255)
    email_sent_status: bool = Field(default=False)
    recommended_services: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationship to EmailLog
    email_logs: List["EmailLog"] = Relationship(back_populates="company")


class EmailLog(SQLModel, table=True):
    """
    EmailLog model - tracks all sent emails for rate limiting
    """
    __tablename__ = "email_logs"
    __table_args__ = (
        Index('ix_email_logs_sender_sent_at', 'sender_email', 'sent_at'),
    )
    
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True
    )
    company_id: uuid.UUID = Field(foreign_key="companies.id")
    sender_email: str = Field(max_length=255)
    sent_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False
    )
    subject: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = Field(default=None, sa_column=Column(Text))
    
    # Relationship back to Company
    company: Optional[Company] = Relationship(back_populates="email_logs")


class CallLog(SQLModel, table=True):
    """
    Logs incoming/outgoing calls with duration and optional summary
    """
    __tablename__ = "call_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    phone_number: str = Field(max_length=50)
    received_at: datetime = Field(default_factory=datetime.utcnow)
    duration_seconds: Optional[int] = Field(default=None)
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    work_done: Optional[str] = Field(default=None, sa_column=Column(Text))
    assigned_to: Optional[str] = Field(default=None, max_length=255)
    followup_needed: bool = Field(default=False)
    followup_date: Optional[str] = Field(default=None, max_length=50)
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    createdAt: datetime = Field(default_factory=datetime.utcnow)


class SentEmail(SQLModel, table=True):
    """
    Stores all sent emails with bilingual body content
    """
    __tablename__ = "sent_emails"

    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    to_email: str = Field(max_length=255)
    subject: str = Field(max_length=500)
    english_body: Optional[str] = Field(default=None, sa_column=Column(Text))
    spanish_body: Optional[str] = Field(default=None, sa_column=Column(Text))
    recommended_services: Optional[str] = Field(default=None, sa_column=Column(Text))
    manual: Optional[bool] = Field(default=False)
    draft_json: Optional[str] = Field(default=None, sa_column=Column(Text))  # Store the whole draft as JSON
    sent_at: datetime = Field(default_factory=datetime.utcnow)


class SocialProfile(SQLModel, table=True):
    __tablename__ = "social_profiles"
    id: Optional[int] = Field(default=None, primary_key=True)
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    platform: str # Facebook, Instagram, LinkedIn, YouTube
    profile_url: Optional[str] = None
    access_token: Optional[str] = None
    is_connected: bool = Field(default=False)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    
    client: Optional[ClientProfile] = Relationship(back_populates="social_profiles")

class SEOAudit(SQLModel, table=True):
    __tablename__ = "seo_audits"
    id: Optional[int] = Field(default=None, primary_key=True)
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    health_score: Optional[int] = None
    page_speed_desktop: Optional[int] = None
    page_speed_mobile: Optional[int] = None
    core_web_vitals_passed: bool = Field(default=False)
    on_page_issues: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    tech_seo_issues: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    last_run: datetime = Field(default_factory=datetime.utcnow)
    
    client: Optional[ClientProfile] = Relationship(back_populates="seo_audits")

class CompetitorAnalysis(SQLModel, table=True):
    __tablename__ = "competitor_analyses"
    id: Optional[int] = Field(default=None, primary_key=True)
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    competitor_domain: str
    keyword_gap_data: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    backlink_comparison: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    content_benchmarks: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    
    client: Optional[ClientProfile] = Relationship(back_populates="competitor_analyses")

class RankingTracker(SQLModel, table=True):
    __tablename__ = "ranking_tracker"
    id: Optional[int] = Field(default=None, primary_key=True)
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    keyword: str
    position: int
    url: str
    serp_features: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    tracked_date: datetime = Field(default_factory=datetime.utcnow)
    
    client: Optional[ClientProfile] = Relationship(back_populates="ranking_records")

class AnalyticsData(SQLModel, table=True):
    __tablename__ = "analytics_data"
    id: Optional[int] = Field(default=None, primary_key=True)
    clientId: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    date: str # YYYY-MM-DD
    sessions: int = Field(default=0)
    pageviews: int = Field(default=0)
    bounce_rate: float = Field(default=0.0)
    traffic_sources: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    gsc_impressions: int = Field(default=0)
    gsc_clicks: int = Field(default=0)
    gsc_ctr: float = Field(default=0.0)
    gsc_position: float = Field(default=0.0)
    google_ads_spend: float = Field(default=0.0)  # New field for Google Ads spend
    meta_ads_spend: float = Field(default=0.0)    # New field for Meta Ads spend
    google_ads_conversions: int = Field(default=0) # New field for Google Ads conversions
    meta_ads_conversions: int = Field(default=0)   # New field for Meta Ads conversions
    last_synced: datetime = Field(default_factory=datetime.utcnow)

    client: Optional[ClientProfile] = Relationship(back_populates="analytics_data")


# ─────────────────────────────────────────────────────────────────────────────
# New Feature Models
# ─────────────────────────────────────────────────────────────────────────────

class Task(SQLModel, table=True):
    """Task/Kanban item for tracking work"""
    __tablename__ = "tasks"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=500)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="Todo")  # Todo, InProgress, Done
    priority: str = Field(default="Medium")  # Low, Medium, High, Urgent
    due_date: Optional[str] = None
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id")
    assigned_to: Optional[int] = Field(default=None, foreign_key="users.id")
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    comments: List["TaskComment"] = Relationship(back_populates="task")


class TaskComment(SQLModel, table=True):
    """Comments on tasks"""
    __tablename__ = "task_comments"
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="tasks.id")
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    content: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    task: Optional["Task"] = Relationship(back_populates="comments")


class Invoice(SQLModel, table=True):
    """Invoice for billing clients"""
    __tablename__ = "invoices"
    id: Optional[int] = Field(default=None, primary_key=True)
    invoice_number: str = Field(max_length=50, index=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    service_request_id: Optional[int] = Field(default=None, foreign_key="service_requests.id")
    amount: float = Field(default=0.0)
    tax: float = Field(default=0.0)
    total: float = Field(default=0.0)
    status: str = Field(default="Draft")  # Draft, Sent, Paid, Overdue, Partial, Cancelled
    due_date: Optional[str] = None
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    line_items: Optional[List] = Field(default_factory=list, sa_column=Column(JSON))
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    client: Optional[ClientProfile] = Relationship(back_populates="invoices")


class Notification(SQLModel, table=True):
    """In-app notifications for users"""
    __tablename__ = "notifications"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    title: str = Field(max_length=255)
    message: str = Field(sa_column=Column(Text))
    type: str = Field(default="info")  # info, success, warning, error
    link: Optional[str] = None
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Milestone(SQLModel, table=True):
    """Project/client milestones for tracking deliverables"""
    __tablename__ = "milestones"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=500)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    project_id: Optional[int] = Field(default=None, foreign_key="projects.id")
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    due_date: Optional[str] = None
    status: str = Field(default="Pending")  # Pending, InProgress, Achieved
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    client: Optional[ClientProfile] = Relationship(back_populates="milestones")


class NPSSurvey(SQLModel, table=True):
    """NPS satisfaction surveys"""
    __tablename__ = "nps_surveys"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    score: Optional[int] = None  # 0-10
    feedback: Optional[str] = Field(default=None, sa_column=Column(Text))
    triggered_by: Optional[str] = None  # "project_complete", "manual"
    responded_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    client: Optional[ClientProfile] = Relationship(back_populates="nps_surveys")


class Proposal(SQLModel, table=True):
    """Proposals and contracts"""
    __tablename__ = "proposals"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=500)
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id")
    service_request_id: Optional[int] = Field(default=None, foreign_key="service_requests.id")
    content: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="Draft")  # Draft, Sent, Accepted, Rejected, Demo Requested
    valid_until: Optional[str] = None
    total_value: Optional[float] = None
    signed_at: Optional[datetime] = None
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    client: Optional[ClientProfile] = Relationship(back_populates="proposals")


class ClientFileUpload(SQLModel, table=True):
    """Files uploaded by clients or on their behalf"""
    __tablename__ = "client_file_uploads"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    uploaded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    filename: str = Field(max_length=500)
    file_url: str = Field(max_length=1000)
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    client: Optional[ClientProfile] = Relationship(back_populates="file_uploads")


class KeywordRankEntry(SQLModel, table=True):
    """Manual/tracked keyword ranking entries per client"""
    __tablename__ = "keyword_rank_entries"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    keyword: str = Field(max_length=500)
    position: Optional[int] = None
    url: Optional[str] = None
    search_engine: str = Field(default="Google")
    notes: Optional[str] = Field(default=None, max_length=500)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)
    recorded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    client: Optional[ClientProfile] = Relationship(back_populates="keyword_ranks")


class ClientNote(SQLModel, table=True):
    """Rich notes with tags and pinning for a client"""
    __tablename__ = "client_notes"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    content: str = Field(sa_column=Column(Text))
    tags: Optional[List[str]] = Field(default_factory=list, sa_column=Column(JSON))
    is_pinned: bool = Field(default=False)
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    author_name: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Deal(SQLModel, table=True):
    """Sales Pipeline Deal / Opportunity"""
    __tablename__ = "deals"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=500)
    value: float = Field(default=0.0)
    client_id: int = Field(foreign_key="client_profiles.id")
    assigned_to: Optional[int] = Field(default=None, foreign_key="users.id")
    stage: str = Field(default="Lead") # Lead, Discovery, Demo, Negotiation, Closed Won, Closed Lost
    expected_close_date: Optional[str] = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    client: Optional[ClientProfile] = Relationship(back_populates="deals")
    assigned_user: Optional["User"] = Relationship(back_populates="deals")


class ConversationLog(SQLModel, table=True):
    """Call/meeting/WhatsApp/email/visit conversation logs"""
    __tablename__ = "conversation_logs"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    title: str = Field(max_length=500)
    type: str = Field(default="call")  # call, meeting, email, whatsapp, visit, other
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    author_name: Optional[str] = Field(default=None, max_length=255)
    attachment_urls: Optional[List[str]] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    replies: List["ConversationReply"] = Relationship(back_populates="conversation")


class ConversationReply(SQLModel, table=True):
    """Threaded replies on conversation logs"""
    __tablename__ = "conversation_replies"
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation_logs.id")
    content: str = Field(sa_column=Column(Text))
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    author_name: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    conversation: Optional[ConversationLog] = Relationship(back_populates="replies")


class ClientResearch(SQLModel, table=True):
    """Pre-sales research data for a client"""
    __tablename__ = "client_research"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id", unique=True)
    company_overview: Optional[str] = Field(default=None, sa_column=Column(Text))
    competitors: Optional[str] = Field(default=None, sa_column=Column(Text))
    tech_stack: Optional[str] = Field(default=None, sa_column=Column(Text))
    recent_news: Optional[str] = Field(default=None, sa_column=Column(Text))
    pain_points: Optional[str] = Field(default=None, sa_column=Column(Text))
    business_goals: Optional[str] = Field(default=None, sa_column=Column(Text))
    key_decision_makers: Optional[str] = Field(default=None, sa_column=Column(Text))
    email_agent_data: Optional[str] = Field(default=None, sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ClientTicket(SQLModel, table=True):
    """Internal support tickets raised by Salesperson to Admin"""
    __tablename__ = "client_tickets"
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client_profiles.id")
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="Pending")  # Pending, Done, Not Done
    created_at: datetime = Field(default_factory=datetime.utcnow)


def create_db_and_tables():
    """
    Create all database tables (drops existing tables first to ensure schema matches)
    """
    # Create all tables if they don't exist
    SQLModel.metadata.create_all(engine)
    
    # Run migrations (SQLite safe)
    from sqlalchemy import text
    
    # List of migration queries (removed IF NOT EXISTS for SQLite compatibility)
    migrations = [
        "ALTER TABLE client_profiles ADD COLUMN \"nextMilestone\" VARCHAR(255)",
        "ALTER TABLE client_profiles ADD COLUMN \"nextMilestoneDate\" VARCHAR(255)",
        "ALTER TABLE client_profiles ADD COLUMN \"lastActivity\" VARCHAR(500)",
        "ALTER TABLE client_profiles ADD COLUMN \"lastActivityDate\" VARCHAR(255)",
        "ALTER TABLE client_profiles ADD COLUMN \"services_offered\" TEXT",
        "ALTER TABLE client_profiles ADD COLUMN \"services_requested\" TEXT",
        "ALTER TABLE client_profiles ADD COLUMN \"outbound_email_sent\" BOOLEAN DEFAULT FALSE",
        "ALTER TABLE client_profiles ADD COLUMN \"inbound_email_sent\" BOOLEAN DEFAULT FALSE",
        "ALTER TABLE client_profiles ADD COLUMN \"payment_status\" VARCHAR(50) DEFAULT 'Pending'",
        "ALTER TABLE client_profiles ADD COLUMN \"sitemap_url\" VARCHAR(500)",
        "ALTER TABLE client_profiles ADD COLUMN \"cms_type\" VARCHAR(100)",
        "ALTER TABLE email_logs ADD COLUMN \"subject\" VARCHAR(500)",
        "ALTER TABLE email_logs ADD COLUMN \"content\" TEXT",
        "ALTER TABLE analytics_data ADD COLUMN \"google_ads_spend\" FLOAT DEFAULT 0.0",
        "ALTER TABLE analytics_data ADD COLUMN \"meta_ads_spend\" FLOAT DEFAULT 0.0",
        "ALTER TABLE analytics_data ADD COLUMN \"google_ads_conversions\" INTEGER DEFAULT 0",
        "ALTER TABLE analytics_data ADD COLUMN \"meta_ads_conversions\" INTEGER DEFAULT 0",
        "ALTER TABLE client_profiles ADD COLUMN lead_score INTEGER",
        "ALTER TABLE client_profiles ADD COLUMN lead_source VARCHAR(100)",
        "ALTER TABLE client_profiles ADD COLUMN deal_value FLOAT",
        "ALTER TABLE client_profiles ADD COLUMN industry VARCHAR(200)",
        "ALTER TABLE client_profiles ADD COLUMN employee_count VARCHAR(100)",
        "ALTER TABLE client_profiles ADD COLUMN revenue_range VARCHAR(100)",
        "ALTER TABLE client_profiles ADD COLUMN linkedin_url VARCHAR(500)",
        "ALTER TABLE client_profiles ADD COLUMN contact_person VARCHAR(255)",
        "ALTER TABLE client_profiles ADD COLUMN last_contact_date VARCHAR(50)",
        "ALTER TABLE client_profiles ADD COLUMN next_followup_date VARCHAR(50)",
        # Marketplace indexes (table created by SQLModel.metadata.create_all)
        "CREATE INDEX IF NOT EXISTS ix_marketplace_services_category ON marketplace_services (category)",
        "CREATE INDEX IF NOT EXISTS ix_marketplace_services_provider ON marketplace_services (provider_client_id)",
    ]
    
    with engine.connect() as conn:
        for query in migrations:
            try:
                conn.execute(text(query))
                conn.commit()
            except Exception:
                # Column likely already exists
                pass
        
    # Seed default statuses if none exist
    try:
        with Session(engine) as session:
            existing_count = session.exec(select(func.count(ClientStatus.id))).one()
            if existing_count == 0:
                print("Seeding default client statuses...")
                defaults = [
                    ClientStatus(name="Active", color="bg-green-500"),
                    ClientStatus(name="Hold", color="bg-orange-500"),
                    ClientStatus(name="Pending", color="bg-blue-500")
                ]
                session.add_all(defaults)
                session.commit()
    except Exception as e:
         print(f"Status seed note: {e}")






# ─── API Intelligence Center Models ──────────────────────────────────────────

class ApiRequest(SQLModel, table=True):
    """
    Tracks every AI API call made in the platform.
    Single source of truth for token usage, cost, and performance.
    """
    __tablename__ = "api_requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    salesperson_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client_profiles.id", index=True)
    endpoint: Optional[str] = Field(default=None, max_length=255, index=True)
    model: Optional[str] = Field(default=None, max_length=100)
    provider: Optional[str] = Field(default=None, max_length=50, index=True)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    reasoning_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)
    input_cost: float = Field(default=0.0)
    output_cost: float = Field(default=0.0)
    total_cost: float = Field(default=0.0)
    response_time_ms: int = Field(default=0)
    status_code: int = Field(default=200)
    success: bool = Field(default=True)
    content_type: Optional[str] = Field(default=None, max_length=100)
    request_meta: Optional[dict] = Field(default=None, sa_column=Column("request_meta", JSON))
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)


class ApiUsageDaily(SQLModel, table=True):
    """Pre-aggregated daily rollups for fast analytics queries."""
    __tablename__ = "api_usage_daily"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: str = Field(index=True)
    salesperson_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    provider: Optional[str] = Field(default=None, max_length=50)
    endpoint: Optional[str] = Field(default=None, max_length=255)
    total_calls: int = Field(default=0)
    total_tokens: int = Field(default=0)
    total_cost: float = Field(default=0.0)
    avg_response_time: float = Field(default=0.0)
    error_count: int = Field(default=0)


class ApiAlert(SQLModel, table=True):
    """Alert configuration for API cost and usage thresholds."""
    __tablename__ = "api_alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    alert_type: str = Field(max_length=50)
    threshold: float = Field(default=0.0)
    period: str = Field(default="daily", max_length=20)
    target: Optional[str] = Field(default="global", max_length=100)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


def get_session():
    """
    Dependency to get database session
    """
    with Session(engine) as session:
        yield session


if __name__ == "__main__":
    print("Creating database tables...")
    create_db_and_tables()
    print("Database tables created successfully!")
