"""Tables of the institute add-on (ported from the SCM HB deployment): courses, instructors, batches, students,
enrollments and payments, attendance and class sessions, learning resources, and the lead demo / walk-in / webinar /
follow-up tracking used by admissions.

Every table carries a tenant_id, so the shared tenant filter and the optional Postgres RLS cover them.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Column, Text, JSON, DateTime
from sqlmodel import SQLModel, Field, Relationship

from database import _utcnow as utc_now



class Course(SQLModel, table=True):
    """Course catalog entry for the training institute."""
    __tablename__ = "courses"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    title: str = Field(max_length=255)
    slug: Optional[str] = Field(default=None, max_length=255, index=True)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    category: Optional[str] = Field(default=None, max_length=100)
    duration_weeks: Optional[int] = Field(default=None)
    duration_hours: Optional[int] = Field(default=None)
    price: float = Field(default=0.0)
    advance_amount: float = Field(default=0.0)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    syllabus: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    prerequisites: Optional[str] = Field(default=None, sa_column=Column(Text))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Instructor(SQLModel, table=True):
    """Instructor profile linked to a User account."""
    __tablename__ = "instructors"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    bio: Optional[str] = Field(default=None, sa_column=Column(Text))
    expertise: Optional[str] = Field(default=None, max_length=500)
    qualification: Optional[str] = Field(default=None, max_length=255)
    experience_years: Optional[int] = Field(default=None)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    avg_rating: float = Field(default=0.0)
    total_students: int = Field(default=0)
    total_batches: int = Field(default=0)
    created_at: datetime = Field(default_factory=utc_now)


class Batch(SQLModel, table=True):
    """A batch/class run of a course."""
    __tablename__ = "batches"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    instructor_id: Optional[int] = Field(default=None, foreign_key="instructors.id", index=True)
    batch_name: str = Field(max_length=255)
    batch_code: Optional[str] = Field(default=None, max_length=50)
    start_date: Optional[datetime] = Field(default=None)
    end_date: Optional[datetime] = Field(default=None)
    schedule: Optional[str] = Field(default=None, max_length=500)  # e.g. "Mon-Wed-Fri 10am-12pm"
    session_duration_hours: int = Field(default=1)
    assignment_strategy: str = Field(default="manual", max_length=30)
    mode: str = Field(default="Offline", max_length=50)  # Online, Offline, Hybrid
    max_seats: int = Field(default=30)
    enrolled_count: int = Field(default=0)
    status: str = Field(default="Upcoming", max_length=50)  # Upcoming, Active, Completed, Cancelled
    room_or_link: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Student(SQLModel, table=True):
    """A student / prospective student at the institute."""
    __tablename__ = "students"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=255)
    email: Optional[str] = Field(default=None, max_length=255, index=True)
    phone: Optional[str] = Field(default=None, max_length=50)
    course_interest: Optional[str] = Field(default=None, max_length=200)
    course_interest_id: Optional[int] = Field(default=None, foreign_key="courses.id", index=True)
    gpa: Optional[float] = Field(default=None)
    education_level: Optional[str] = Field(default=None, max_length=120)
    academic_background: Optional[str] = Field(default=None, sa_column=Column(Text))
    background_details: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    career_goal: Optional[str] = Field(default=None, sa_column=Column(Text))
    course_plan: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    address: Optional[str] = Field(default=None, max_length=500)
    date_of_birth: Optional[datetime] = Field(default=None)
    gender: Optional[str] = Field(default=None, max_length=20)
    qualification: Optional[str] = Field(default=None, max_length=255)
    guardian_name: Optional[str] = Field(default=None, max_length=255)
    guardian_phone: Optional[str] = Field(default=None, max_length=50)
    source: Optional[str] = Field(default=None, max_length=100)  # walk-in, referral, online, lead
    lead_id: Optional[int] = Field(default=None, foreign_key="leads.id", index=True)
    assigned_salesperson_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    status: str = Field(default="Active", max_length=50)  # Active, Inactive, Dropped, Completed
    drop_reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    improvement_plan: Optional[str] = Field(default=None, sa_column=Column(Text))
    dropped_at: Optional[datetime] = Field(default=None)
    dropped_by: Optional[int] = Field(default=None, foreign_key="users.id")
    photo_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Enrollment(SQLModel, table=True):
    """Enrollment record linking a student to a batch."""
    __tablename__ = "enrollments"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    enrollment_date: datetime = Field(default_factory=utc_now)
    total_fee: float = Field(default=0.0)
    amount_paid: float = Field(default=0.0)
    amount_due: float = Field(default=0.0)
    payment_mode: Optional[str] = Field(default=None, max_length=50)  # Cash, UPI, Card, Bank Transfer
    payment_status: str = Field(default="Pending", max_length=50)  # Pending, Partial, Paid
    status: str = Field(default="Active", max_length=50)  # Active, Completed, Dropped
    admission_slip_generated: bool = Field(default=False)
    advance_slip_generated: bool = Field(default=False)
    slip_number: Optional[str] = Field(default=None, max_length=100)
    discount: float = Field(default=0.0)
    discount_reason: Optional[str] = Field(default=None, max_length=255)
    enrolled_by: Optional[int] = Field(default=None, foreign_key="users.id")  # salesperson
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PaymentRecord(SQLModel, table=True):
    """Individual payment transactions for an enrollment."""
    __tablename__ = "payment_records"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    enrollment_id: int = Field(foreign_key="enrollments.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    amount: float = Field(default=0.0)
    payment_mode: str = Field(default="Cash", max_length=50)
    payment_date: datetime = Field(default_factory=utc_now)
    receipt_number: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    recorded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)


class InstructorFeedback(SQLModel, table=True):
    """Student feedback on an instructor for a batch."""
    __tablename__ = "instructor_feedback"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    instructor_id: int = Field(foreign_key="instructors.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    student_id: Optional[int] = Field(default=None, foreign_key="students.id")
    rating: int = Field(default=5)  # 1-5
    teaching_quality: Optional[int] = Field(default=None)
    punctuality: Optional[int] = Field(default=None)
    communication: Optional[int] = Field(default=None)
    feedback_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)


class InstituteSession(SQLModel, table=True):
    """A scheduled class session within a course batch."""
    __tablename__ = "institute_sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    session_number: int
    title: str = Field(max_length=255)
    topic: Optional[str] = Field(default=None, max_length=500)
    scheduled_start: datetime = Field(index=True)
    scheduled_end: Optional[datetime] = Field(default=None)
    status: str = Field(default="Scheduled", max_length=30)
    meeting_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Attendance(SQLModel, table=True):
    """Daily attendance for students in a batch."""
    __tablename__ = "attendance"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="institute_sessions.id", index=True)
    date: datetime = Field(default_factory=utc_now)
    status: str = Field(default="Present", max_length=20)  # Present, Absent, Late
    marked_by: Optional[int] = Field(default=None, foreign_key="users.id")
    notes: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=utc_now)


class StudentSessionProgress(SQLModel, table=True):
    """A student's completion and assessment state for one class session."""
    __tablename__ = "student_session_progress"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    session_id: int = Field(foreign_key="institute_sessions.id", index=True)
    status: str = Field(default="Not Started", max_length=30)
    completion_percent: int = Field(default=0)
    score: Optional[float] = Field(default=None)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=utc_now)


class StudentNote(SQLModel, table=True):
    """Staff comments and follow-up notes on a student record."""
    __tablename__ = "student_notes"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    author_id: Optional[int] = Field(default=None, foreign_key="users.id")
    content: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utc_now)


class StudentUpload(SQLModel, table=True):
    """Private student file metadata; file contents remain outside the public static directory."""
    __tablename__ = "student_uploads"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    student_id: int = Field(foreign_key="students.id", index=True)
    uploaded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    filename: str = Field(max_length=255)
    storage_key: str = Field(max_length=255, unique=True)
    content_type: Optional[str] = Field(default=None, max_length=150)
    size_bytes: int = Field(default=0)
    description: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=utc_now)


class InstituteResource(SQLModel, table=True):
    """Course or batch resource shared with enrolled students."""
    __tablename__ = "institute_resources"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    filename: str = Field(max_length=255)
    storage_key: str = Field(max_length=255, unique=True)
    content_type: Optional[str] = Field(default=None, max_length=150)
    size_bytes: int = Field(default=0)
    uploaded_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)


class LeadDemoSession(SQLModel, table=True):
    __tablename__ = "lead_demo_sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    lead_id: int = Field(foreign_key="leads.id", index=True)
    scheduled_at: datetime = Field(index=True)
    status: str = Field(default="Scheduled", max_length=30, index=True)
    meeting_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class LeadFollowUp(SQLModel, table=True):
    """A scheduled follow-up (call/message) for a lead"""
    __tablename__ = "lead_follow_ups"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    lead_id: int = Field(foreign_key="leads.id", index=True)
    scheduled_at: datetime = Field(index=True)
    status: str = Field(default="Pending", max_length=30, index=True)  # Pending / Done / Cancelled
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class LeadWalkIn(SQLModel, table=True):
    """A scheduled in-person walk-in / branch visit for a lead"""
    __tablename__ = "lead_walk_ins"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    lead_id: int = Field(foreign_key="leads.id", index=True)
    scheduled_at: datetime = Field(index=True)
    status: str = Field(default="Scheduled", max_length=30, index=True)  # Scheduled / Attended / Not Attended / Cancelled
    location: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class LeadWebinar(SQLModel, table=True):
    """A scheduled webinar for a lead"""
    __tablename__ = "lead_webinars"
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    lead_id: int = Field(foreign_key="leads.id", index=True)
    scheduled_at: datetime = Field(index=True)
    status: str = Field(default="Scheduled", max_length=30, index=True)  # Scheduled / Attended / Not Attended / Cancelled
    meeting_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
