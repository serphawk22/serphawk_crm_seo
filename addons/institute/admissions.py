"""Admissions assignments and audited lead transfers adapted from SCMHB."""
import secrets
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, and_
from sqlmodel import Session, select
from database import User, Lead, Invoice
from addons.institute.models import Student, Enrollment, PaymentRecord, Course, LeadTransferHistory
from addons.institute.routes import get_session, _require_roles, _normalize_role, _utcnow
from modules.tenant_scope import current_tenant_id
router = APIRouter()


@router.get("/admissions/invoices/{invoice_id}/pdf")
def admissions_invoice_pdf(invoice_id: int, session: Session = Depends(get_session)):
    actor = _admissions_actor(session)
    invoice = session.get(Invoice, invoice_id)
    student = session.get(Student, invoice.student_id) if invoice and invoice.student_id else None
    if not invoice or not student or student.tenant_id != current_tenant_id.get() or (actor.role == "Admissions" and student.admissions_assignee_id != actor.id):
        raise HTTPException(status_code=404, detail="Invoice not found")
    from fastapi.responses import Response
    from modules.pdf_export import invoice_pdf
    pdf = invoice_pdf({"invoice_number": invoice.invoice_number, "client_name": student.name,
        "currency": invoice.currency, "amount": invoice.amount, "tax": invoice.tax, "total": invoice.total,
        "status": invoice.status, "due_date": invoice.due_date, "notes": invoice.notes,
        "line_items": invoice.line_items or []})
    return Response(pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'})

class LeadTransferRequest(BaseModel):
    lead_ids: List[int]
    employee_id: int
    source_employee_id: Optional[int] = None
    reason: str

def _validate_salesperson(session, uid):
    user = session.get(User, uid)
    return user if user and user.is_active and user.tenant_id == current_tenant_id.get() else None

def _admissions_actor(session, manage=False):
    actor = _require_roles(session, ["Admin", "Demo"] if manage else ["Admin", "Admissions", "Demo"])
    if not current_tenant_id.get():
        raise HTTPException(status_code=403, detail="Select a company")
    return actor

def choose_admissions_assignee(session, tenant_id):
    users = session.exec(select(User).where(User.tenant_id == tenant_id, User.role == "Admissions", User.is_active == True)).all()
    if not users:
        return None
    workloads = {u.id: session.exec(select(func.count(Student.id)).where(Student.tenant_id == tenant_id, Student.admissions_assignee_id == u.id)).one() for u in users}
    return min(users, key=lambda u: (workloads[u.id], u.id))


class AdmissionsInvoiceRequest(BaseModel):
    enrollment_id: int
    due_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/admissions/students/{student_id}/invoices")
def create_admissions_invoice(student_id: int, body: AdmissionsInvoiceRequest, session: Session = Depends(get_session)):
    actor = _admissions_actor(session)
    student = session.get(Student, student_id)
    if not student or student.tenant_id != current_tenant_id.get() or (actor.role == "Admissions" and student.admissions_assignee_id != actor.id):
        raise HTTPException(status_code=404, detail="Student not found")
    enrollment = session.exec(select(Enrollment).where(Enrollment.id == body.enrollment_id,
        Enrollment.student_id == student.id, Enrollment.tenant_id == student.tenant_id).with_for_update()).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    existing = session.exec(select(Invoice).where(Invoice.enrollment_id == enrollment.id)).first()
    if existing:
        return {"invoice": {"id": existing.id, "invoice_number": existing.invoice_number, "status": existing.status}}
    if body.due_date:
        try:
            datetime.strptime(body.due_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="Due date must use YYYY-MM-DD")
    from modules.tenant_settings import get_setting
    course = session.get(Course, enrollment.course_id)
    total = max(0, enrollment.total_fee - enrollment.discount)
    invoice = Invoice(tenant_id=student.tenant_id, student_id=student.id, enrollment_id=enrollment.id,
        invoice_number=f"ADM-{secrets.token_hex(6).upper()}", amount=total, total=total,
        currency=get_setting(student.tenant_id, "default_currency", "USD"),
        status="Paid" if enrollment.amount_due <= 0 else "Partial" if enrollment.amount_paid > 0 else "Draft",
        paid_at=_utcnow() if enrollment.amount_due <= 0 else None, due_date=body.due_date, notes=body.notes,
        line_items=[{"description": course.title if course else "Course tuition", "amount": total}])
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return {"invoice": {"id": invoice.id, "invoice_number": invoice.invoice_number, "status": invoice.status}}

@router.get("/admissions/students")
def list_admissions_students(session: Session = Depends(get_session)):
    actor = _admissions_actor(session)
    actor_role = _normalize_role(actor.role)
    query = select(Student)
    if current_tenant_id.get():
        query = query.where(Student.tenant_id == current_tenant_id.get())
    if actor_role == "Admissions":
        admissions_scope = Student.admissions_assignee_id == actor.id
        if current_tenant_id.get() is not None:
            admissions_scope = or_(
                admissions_scope,
                and_(
                    Student.tenant_id == current_tenant_id.get(),
                    Student.admissions_assignee_id == None,
                ),
            )
        query = query.where(admissions_scope)
    students = session.exec(query.order_by(Student.created_at.desc())).all()
    student_ids = [student.id for student in students if student.id is not None]
    enrollments = (
        session.exec(select(Enrollment).where(Enrollment.student_id.in_(student_ids))).all()
        if student_ids
        else []
    )
    invoices = (
        session.exec(select(Invoice).where(Invoice.student_id.in_(student_ids))).all()
        if student_ids
        else []
    )
    enrollment_ids = [enrollment.id for enrollment in enrollments if enrollment.id is not None]
    payments = (
        session.exec(
            select(PaymentRecord)
            .where(PaymentRecord.enrollment_id.in_(enrollment_ids))
            .order_by(PaymentRecord.payment_date.desc())
        ).all()
        if enrollment_ids
        else []
    )
    users_query = select(User).where(
        User.role == "Admissions",
        User.is_active == True,
        User.tenant_id == current_tenant_id.get(),
    )
    users = session.exec(users_query).all()
    user_map = {user.id: user for user in users}
    invoice_map = {invoice.enrollment_id: invoice for invoice in invoices if invoice.enrollment_id}
    enrollment_map: dict[int, list[Enrollment]] = {}
    payment_map: dict[int, list[PaymentRecord]] = {}
    for enrollment in enrollments:
        enrollment_map.setdefault(enrollment.student_id, []).append(enrollment)
    for payment in payments:
        payment_map.setdefault(payment.enrollment_id, []).append(payment)

    return {
        "admissions_users": [
            {"id": user.id, "name": user.name, "email": user.email}
            for user in users
        ],
        "students": [
            {
                "id": student.id,
                "name": student.name,
                "email": student.email,
                "phone": student.phone,
                "course_interest": student.course_interest,
                "status": student.status,
                "created_at": student.created_at.isoformat(),
                "assigned_salesperson_id": student.assigned_salesperson_id,
                "admissions_assignee_id": student.admissions_assignee_id,
                "admissions_assignee_name": (
                    user_map[student.admissions_assignee_id].name
                    if student.admissions_assignee_id in user_map
                    else None
                ),
                "enrollments": [
                    {
                        "id": enrollment.id,
                        "course_id": enrollment.course_id,
                        "batch_id": enrollment.batch_id,
                        "total_fee": enrollment.total_fee,
                        "amount_paid": enrollment.amount_paid,
                        "amount_due": enrollment.amount_due,
                        "payment_status": enrollment.payment_status,
                        "payments": [
                            {
                                "id": payment.id,
                                "amount": payment.amount,
                                "payment_mode": payment.payment_mode,
                                "payment_date": payment.payment_date.isoformat(),
                                "receipt_number": payment.receipt_number,
                            }
                            for payment in payment_map.get(enrollment.id, [])
                        ],
                        "invoice": (
                            {
                                "id": invoice_map[enrollment.id].id,
                                "invoice_number": invoice_map[enrollment.id].invoice_number,
                                "status": invoice_map[enrollment.id].status,
                            }
                            if enrollment.id in invoice_map
                            else None
                        ),
                    }
                    for enrollment in enrollment_map.get(student.id, [])
                ],
            }
            for student in students
        ],
    }


class AdmissionsAssigneeRequest(BaseModel):
    admissions_assignee_id: Optional[int] = None


@router.post("/admissions/students/auto-assign")
def auto_assign_admissions_students(session: Session = Depends(get_session)):
    actor = _admissions_actor(session, manage=True)
    query = select(Student).where(Student.admissions_assignee_id == None)
    if current_tenant_id.get():
        query = query.where(Student.tenant_id == current_tenant_id.get())
    unassigned = session.exec(query.order_by(Student.created_at, Student.id)).all()
    if not unassigned:
        return {"ok": True, "assigned": 0}

    user_query = select(User).where(User.role == "Admissions", User.is_active == True)
    if current_tenant_id.get():
        user_query = user_query.where(User.tenant_id == current_tenant_id.get())
    admissions_users = session.exec(user_query).all()
    if not admissions_users:
        raise HTTPException(status_code=409, detail="Add an active Admissions team member before assigning students")

    workloads = {
        user.id: session.exec(
            select(func.count(Student.id)).where(Student.admissions_assignee_id == user.id)
        ).one()
        for user in admissions_users
        if user.id is not None
    }
    for student in unassigned:
        assignee = min(
            (user for user in admissions_users if user.id is not None),
            key=lambda user: (workloads[user.id], user.id),
        )
        student.admissions_assignee_id = assignee.id
        workloads[assignee.id] += 1
        session.add(student)
    session.commit()
    return {"ok": True, "assigned": len(unassigned)}


@router.patch("/admissions/students/{student_id}/assign")
def assign_admissions_student(
    student_id: int,
    body: AdmissionsAssigneeRequest,
    session: Session = Depends(get_session),
):
    actor = _admissions_actor(session, manage=True)
    student = session.get(Student, student_id)
    if not student or (
        student.tenant_id and current_tenant_id.get() and student.tenant_id != current_tenant_id.get()
    ):
        raise HTTPException(status_code=404, detail="Student not found")
    assignee = None
    if body.admissions_assignee_id is not None:
        assignee = session.get(User, body.admissions_assignee_id)
        if (
            not assignee
            or not assignee.is_active
            or assignee.role != "Admissions"
            or (current_tenant_id.get() and assignee.tenant_id != current_tenant_id.get())
        ):
            raise HTTPException(status_code=422, detail="Choose an active Admissions team member")
    student.admissions_assignee_id = assignee.id if assignee else None
    student.updated_at = _utcnow()
    session.add(student)
    session.commit()
    return {"ok": True, "admissions_assignee_id": student.admissions_assignee_id}



@router.post("/leads/transfer")
def transfer_leads(body: LeadTransferRequest, session: Session = Depends(get_session)):
    actor = _require_roles(
        session, ["Admin", "SuperAdmin", "Demo", "SalesManager", "Sales", "Employee", "Intern"]
    )
    reason = body.reason.strip()
    lead_ids = list(dict.fromkeys(body.lead_ids))
    if not reason:
        raise HTTPException(status_code=422, detail="A transfer reason is required")
    if len(reason) > 1000:
        raise HTTPException(status_code=422, detail="Transfer reason must be 1000 characters or fewer")
    if not lead_ids or len(lead_ids) > 500:
        raise HTTPException(status_code=422, detail="Select between 1 and 500 leads")

    actor_role = _normalize_role(actor.role)
    is_admin = actor_role in ("Admin", "SuperAdmin", "Demo")
    source_id = body.source_employee_id if is_admin else actor.id
    if source_id is None:
        raise HTTPException(status_code=422, detail="Choose a source salesperson")
    if not is_admin and body.source_employee_id not in (None, actor.id):
        raise HTTPException(status_code=403, detail="You can only transfer leads assigned to you")

    source = _validate_salesperson(session, source_id)
    if source is None or _normalize_role(source.role) not in ("SalesManager", "Employee", "Sales") or (
        current_tenant_id.get() and source.tenant_id != current_tenant_id.get()
    ):
        raise HTTPException(status_code=404, detail="Source salesperson not found")
    destination = _validate_salesperson(session, body.employee_id)
    if destination is None or _normalize_role(destination.role) not in ("SalesManager", "Employee", "Sales") or (
        current_tenant_id.get() and destination.tenant_id != current_tenant_id.get()
    ):
        raise HTTPException(status_code=422, detail="Choose an active salesperson in your team")
    if source.id == destination.id:
        raise HTTPException(status_code=422, detail="Choose a different destination salesperson")

    query = select(Lead).where(
        Lead.id.in_(lead_ids),
        Lead.owner_id == source.id,
    )
    if current_tenant_id.get():
        query = query.where(Lead.tenant_id == current_tenant_id.get())
    leads = session.exec(query).all()
    if len(leads) != len(lead_ids):
        raise HTTPException(
            status_code=409,
            detail="Some selected leads are not assigned to the selected source salesperson",
        )
    if any(
        lead.tenant_id is not None
        and (source.tenant_id != lead.tenant_id or destination.tenant_id != lead.tenant_id)
        for lead in leads
    ):
        raise HTTPException(status_code=404, detail="Salesperson not found for one or more leads")

    session.info["authorized_lead_transfers"] = {lead.id: (source.id, destination.id) for lead in leads}
    for lead in leads:
        session.add(LeadTransferHistory(
            tenant_id=lead.tenant_id or current_tenant_id.get(),
            lead_id=lead.id,
            from_user_id=source.id,
            to_user_id=destination.id,
            transferred_by=actor.id,
            lead_stage=lead.status or "New",
            reason=reason,
        ))
        lead.owner_id = destination.id
        session.add(lead)
        if lead.converted_student_id:
            student = session.get(Student, lead.converted_student_id)
            if student:
                student.assigned_salesperson_id = destination.id
                session.add(student)

    session.commit()
    return {
        "ok": True,
        "transferred": len(leads),
        "source_employee_id": source.id,
        "employee_id": destination.id,
    }


@router.get("/leads/{lead_id}/transfers")
def get_lead_transfers(lead_id: int, session: Session = Depends(get_session)):
    actor = _require_roles(
        session, ["Admin", "SuperAdmin", "Demo", "SalesManager", "Sales", "Employee", "Intern"]
    )
    lead = session.get(Lead, lead_id)
    if not lead or (
        current_tenant_id.get() and lead.tenant_id != current_tenant_id.get()
    ):
        raise HTTPException(status_code=404, detail="Lead not found")
    actor_role = _normalize_role(actor.role)
    if actor_role not in ("Admin", "SuperAdmin", "Demo") and lead.owner_id != actor.id:
        raise HTTPException(status_code=404, detail="Lead not found")
    history = session.exec(
        select(LeadTransferHistory)
        .where(LeadTransferHistory.lead_id == lead_id)
        .order_by(LeadTransferHistory.transferred_at.desc())
    ).all()
    user_ids = {
        user_id
        for item in history
        for user_id in (item.from_user_id, item.to_user_id, item.transferred_by)
    }
    users = {
        user.id: user for user in session.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    return {
        "transfers": [
            {
                "id": item.id,
                "from_user_id": item.from_user_id,
                "from_name": users[item.from_user_id].name if item.from_user_id in users else "Unknown",
                "to_user_id": item.to_user_id,
                "to_name": users[item.to_user_id].name if item.to_user_id in users else "Unknown",
                "transferred_by": item.transferred_by,
                "transferred_by_name": users[item.transferred_by].name if item.transferred_by in users else "Unknown",
                "lead_stage": item.lead_stage,
                "reason": item.reason,
                "transferred_at": item.transferred_at.isoformat(),
            }
            for item in history
        ]
    }
