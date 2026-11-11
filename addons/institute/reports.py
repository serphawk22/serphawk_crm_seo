"""SCMHB institute decision reports, adapted to authenticated tenant scope."""
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Dict
from collections import Counter, defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import Lead, CallLog, Meeting, LeadNote, ActivityLog, User, ConversationLog
from addons.institute.models import LeadTransferHistory, Student, Enrollment, PaymentRecord, Instructor, Batch, Course, LeadDemoSession, InstructorFeedback, Attendance, InstituteSession
from addons.institute.routes import get_session, _require_roles, _normalize_role
from modules.tenant_scope import current_tenant_id
router = APIRouter()

@router.get("/dashboard-b2c/stats")
def dashboard_b2c(session: Session = Depends(get_session)):
    _require_roles(session, ["Admin", "SalesManager", "Sales", "Employee", "Demo"])
    from modules import features, dashboard
    tid = current_tenant_id.get()
    if not tid or not features.is_enabled(tid, "institute"):
        raise HTTPException(status_code=403, detail="An institute company is required")
    enabled = features.effective_features(tid)
    settings = dict(enabled)
    for section in dashboard.SECTIONS:
        settings[f"dashboard_{section}"] = enabled.get(f"dashboard_b2c_{section}", True)
    return {"operations": dashboard.operations(session, tid, settings)}

def _report_date(value, fallback):
    if not value:
        return fallback
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Dates must use YYYY-MM-DD")

def _in_report_range(value, start, end):
    return bool(value and start <= value.date() <= end)

def _to_naive_dt(value):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value and value.tzinfo else value

@router.get("/institute/reports")
def institute_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    salesperson_id: Optional[int] = None,
    course_id: Optional[int] = None,
    all_time: Optional[bool] = False,
    session: Session = Depends(get_session),
):
    current_user = _require_roles(session, ["Admin", "SuperAdmin", "SalesManager", "Demo", "Employee"])
    user_role = _normalize_role(current_user.role)
    if user_role in {"Employee", "SalesManager", "Sales"}:
        salesperson_id = current_user.id
    if not current_tenant_id.get():
        raise HTTPException(status_code=403, detail="Select a company")
    today = datetime.now(timezone.utc).date()

    is_all_time = bool(all_time or start_date == "all")
    if is_all_time:
        start = date(2020, 1, 1)
        end = date(2035, 12, 31)
    else:
        start = _report_date(start_date, today - timedelta(days=29))
        end = _report_date(end_date, today)
        if start > end:
            raise HTTPException(status_code=400, detail="start_date must be before end_date")

    def scoped(model):
        query = select(model)
        tenant_id = current_tenant_id.get()
        if tenant_id and hasattr(model, "tenant_id"):
            query = query.where(model.tenant_id == tenant_id)
        if salesperson_id:
            from sqlalchemy import or_
            assigned_students = select(Student.id).where(Student.tenant_id == tenant_id,
                or_(Student.assigned_salesperson_id == salesperson_id,
                    Student.lead_id.in_(select(Lead.id).where(Lead.tenant_id == tenant_id, Lead.owner_id == salesperson_id))))
            if model is Student:
                query = query.where(Student.id.in_(assigned_students))
            elif model is Enrollment:
                query = query.where(Enrollment.student_id.in_(assigned_students))
            elif model is PaymentRecord:
                query = query.where(PaymentRecord.student_id.in_(assigned_students))
            elif model is Attendance:
                query = query.where(Attendance.student_id.in_(assigned_students))
        return session.exec(query).all()

    # Query all core tables
    all_leads = scoped(Lead)
    all_students = scoped(Student)
    all_enrollments = scoped(Enrollment)
    all_payments = scoped(PaymentRecord)
    all_instructors = scoped(Instructor)
    all_batches = scoped(Batch)
    all_courses = scoped(Course)
    all_calls = scoped(CallLog)
    all_meetings = scoped(Meeting)
    all_demos = scoped(LeadDemoSession)
    all_notes = scoped(LeadNote)
    all_activities = scoped(ActivityLog)
    all_users = scoped(User)
    all_feedback = scoped(InstructorFeedback)
    all_attendance = scoped(Attendance)
    all_sessions = scoped(InstituteSession)

    user_map = {u.id: u for u in all_users}
    course_map = {c.id: c for c in all_courses}
    batch_map = {b.id: b for b in all_batches}
    student_map = {s.id: s for s in all_students}
    lead_map = {l.id: l for l in all_leads}

    # Range filtered subsets
    leads_in_range = [l for l in all_leads if is_all_time or _in_report_range(l.created_at, start, end)]
    students_in_range = [s for s in all_students if is_all_time or _in_report_range(s.created_at, start, end)]
    enrollments_in_range = [e for e in all_enrollments if is_all_time or _in_report_range(e.enrollment_date, start, end)]
    payments_in_range = [p for p in all_payments if is_all_time or _in_report_range(p.payment_date, start, end)]
    calls_in_range = [c for c in all_calls if is_all_time or _in_report_range(c.createdAt, start, end)]
    meetings_in_range = [m for m in all_meetings if m.scheduled_at and (is_all_time or _in_report_range(m.scheduled_at, start, end))]
    demos_in_range = [d for d in all_demos if is_all_time or _in_report_range(d.scheduled_at, start, end)]
    notes_in_range = [n for n in all_notes if is_all_time or _in_report_range(n.created_at, start, end)]
    activities_in_range = [a for a in all_activities if is_all_time or _in_report_range(a.createdAt, start, end)]

    # Filters
    if course_id:
        enrollments_in_range = [e for e in enrollments_in_range if e.course_id == course_id]
        leads_in_range = [l for l in leads_in_range if l.course_interest_id == course_id]
        students_in_range = [s for s in students_in_range if s.course_interest_id == course_id]

    rep_student_ids = set()
    if salesperson_id:
        leads_in_range = [l for l in leads_in_range if l.owner_id == salesperson_id]
        students_in_range = [
            s for s in students_in_range
            if s.assigned_salesperson_id == salesperson_id
            or (s.lead_id in lead_map and lead_map[s.lead_id].owner_id == salesperson_id)
        ]
        rep_student_ids = {
            s.id for s in all_students
            if s.assigned_salesperson_id == salesperson_id
            or (s.lead_id in lead_map and lead_map[s.lead_id].owner_id == salesperson_id)
        }
        enrollments_in_range = [
            e for e in enrollments_in_range
            if e.enrolled_by == salesperson_id or e.student_id in rep_student_ids
        ]
        rep_enrollment_ids = {e.id for e in enrollments_in_range}
        payments_in_range = [
            p for p in payments_in_range
            if p.enrollment_id in rep_enrollment_ids or p.student_id in rep_student_ids
        ]
        u_obj = user_map.get(salesperson_id)
        u_name = u_obj.name.lower() if u_obj and u_obj.name else ""
        u_email = u_obj.email.lower() if u_obj and u_obj.email else ""
        calls_in_range = [
            c for c in calls_in_range
            if c.assigned_to and (
                str(salesperson_id) == c.assigned_to
                or (u_name and u_name in c.assigned_to.lower())
                or (u_email and u_email in c.assigned_to.lower())
            )
        ]
        meetings_in_range = [m for m in meetings_in_range if m.host_id == salesperson_id]
        demos_in_range = [d for d in demos_in_range if d.created_by == salesperson_id]
        notes_in_range = [n for n in notes_in_range if n.author_id == salesperson_id]
        activities_in_range = [a for a in activities_in_range if a.userId == salesperson_id]

    # Financials
    total_tuition_val = round(sum(float(e.total_fee or 0) for e in enrollments_in_range), 2)
    advance_from_payments = sum(float(p.amount or 0) for p in payments_in_range)
    advance_from_enrollments = sum(float(e.amount_paid or 0) for e in enrollments_in_range)
    advance_collected = round(max(advance_from_payments, advance_from_enrollments), 2)
    total_due = round(max(0.0, total_tuition_val - advance_collected), 2)
    collection_percentage = round((advance_collected / total_tuition_val * 100), 1) if total_tuition_val > 0 else 100.0

    # Demos
    demo_leads = [l for l in leads_in_range if l.status in ("Demo", "Demo Scheduled", "Demo Completed")]
    demos_scheduled = len(demo_leads) + len(demos_in_range) + sum(1 for m in meetings_in_range if m.meeting_type == "Demo")
    demos_successful = (
        sum(1 for l in demo_leads if l.is_converted or l.status in ("Demo Completed", "Enrolled") or l.converted_student_id)
        + sum(1 for d in demos_in_range if d.status == "Completed")
        + sum(1 for m in meetings_in_range if m.meeting_type == "Demo" and m.status == "Completed")
    )
    demo_conversion_rate = round((demos_successful / demos_scheduled * 100), 1) if demos_scheduled > 0 else 0.0

    # Overall Lead Conversion
    converted_leads = [l for l in leads_in_range if l.is_converted or l.status == "Enrolled" or l.converted_student_id]
    overall_conversion_rate = round((len(converted_leads) / len(leads_in_range) * 100), 1) if leads_in_range else 0.0
    total_followups = len(calls_in_range) + len(meetings_in_range) + len(notes_in_range) + len(activities_in_range)

    all_leads_rep = [l for l in all_leads if l.owner_id == salesperson_id] if salesperson_id else all_leads
    all_students_rep = [s for s in all_students if s.id in rep_student_ids] if salesperson_id else all_students
    all_enrollments_rep = [
        e for e in all_enrollments
        if e.enrolled_by == salesperson_id or e.student_id in rep_student_ids
    ] if salesperson_id else all_enrollments

    # 1. COMPANY OVERVIEW
    company_overview = {
        "total_leads_in_range": len(leads_in_range),
        "total_leads_all_time": len(all_leads_rep),
        "leads_assigned": len(leads_in_range),
        "total_students_enrolled_in_range": len(enrollments_in_range),
        "students_enrolled": len(enrollments_in_range),
        "total_students_all_time": len(all_students_rep),
        "active_students": sum(1 for s in all_students_rep if s.status == "Active"),
        "total_tuition_value": total_tuition_val,
        "tuition_booked": total_tuition_val,
        "advance_collected": advance_collected,
        "total_collected_all_time": round(sum(float(e.amount_paid or 0) for e in all_enrollments_rep), 2),
        "total_pending_due": total_due,
        "pending_due": total_due,
        "collection_percentage": collection_percentage,
        "demos_scheduled": demos_scheduled,
        "demos_successful": demos_successful,
        "demo_conversion_rate": demo_conversion_rate,
        "demo_success_rate": demo_conversion_rate,
        "overall_conversion_rate": overall_conversion_rate,
        "conversion_rate": overall_conversion_rate,
        "total_followups": total_followups,
        "followups_count": total_followups,
        "active_batches_count": sum(1 for b in all_batches if b.status in ("Active", "Upcoming")),
        "instructors_count": len(all_instructors),
        "courses_count": len(all_courses),
    }

    # 2. SALES PERFORMANCE ("Which sales done what")
    # Identify relevant sales representatives
    sales_rep_ids = set()
    if salesperson_id:
        sales_rep_ids.add(salesperson_id)
    else:
        for l in all_leads:
            if l.owner_id:
                sales_rep_ids.add(l.owner_id)
        for s in all_students:
            if s.assigned_salesperson_id:
                sales_rep_ids.add(s.assigned_salesperson_id)
        for e in all_enrollments:
            if e.enrolled_by:
                sales_rep_ids.add(e.enrolled_by)
        for u in all_users:
            if u.role in ("Sales", "SalesManager", "Employee", "Demo") or (u.role == "Admin" and any(e.enrolled_by == u.id for e in all_enrollments)):
                sales_rep_ids.add(u.id)

    sales_performance = []
    for uid in sorted(sales_rep_ids):
        user = user_map.get(uid)
        if not user:
            continue
        rep_name = user.name or user.email.split("@")[0]

        # Rep's leads in range & all time
        rep_leads_range = [l for l in leads_in_range if l.owner_id == uid]
        rep_leads_all = [l for l in all_leads if l.owner_id == uid]

        # Rep's demos
        rep_demo_leads = [l for l in rep_leads_range if l.status in ("Demo", "Demo Scheduled", "Demo Completed")]
        rep_demos_sched = len(rep_demo_leads) + sum(1 for d in demos_in_range if d.created_by == uid) + sum(1 for m in meetings_in_range if m.host_id == uid and m.meeting_type == "Demo")
        rep_demos_succ = (
            sum(1 for l in rep_demo_leads if l.is_converted or l.status in ("Demo Completed", "Enrolled") or l.converted_student_id)
            + sum(1 for d in demos_in_range if d.created_by == uid and d.status == "Completed")
            + sum(1 for m in meetings_in_range if m.host_id == uid and m.meeting_type == "Demo" and m.status == "Completed")
        )
        rep_demo_rate = round((rep_demos_succ / rep_demos_sched * 100), 1) if rep_demos_sched > 0 else 0.0

        # Rep's followups
        rep_followups = (
            sum(1 for c in calls_in_range if c.assigned_to and (c.assigned_to.lower() in (rep_name.lower(), user.email.lower()) or str(uid) == c.assigned_to))
            + sum(1 for m in meetings_in_range if m.host_id == uid)
            + sum(1 for n in notes_in_range if n.author_id == uid)
            + sum(1 for a in activities_in_range if a.userId == uid)
        )

        # Rep's students and enrollments
        # Attributed if enrolled_by == uid, or assigned_salesperson_id == uid, or lead owner == uid
        rep_enrollments = [
            e for e in enrollments_in_range
            if e.enrolled_by == uid
            or (e.student_id in student_map and student_map[e.student_id].assigned_salesperson_id == uid)
            or (e.student_id in student_map and student_map[e.student_id].lead_id in lead_map and lead_map[student_map[e.student_id].lead_id].owner_id == uid)
        ]
        rep_students_count = len({e.student_id for e in rep_enrollments})
        if rep_students_count == 0:
            rep_students_count = sum(1 for l in rep_leads_range if l.is_converted or l.status == "Enrolled" or l.converted_student_id)

        rep_tuition = round(sum(float(e.total_fee or 0) for e in rep_enrollments), 2)
        rep_advance = round(sum(float(e.amount_paid or 0) for e in rep_enrollments), 2)
        rep_pending = round(max(0.0, rep_tuition - rep_advance), 2)

        leads_count_for_conv = len(rep_leads_range) if rep_leads_range else len(rep_leads_all)
        rep_conversion_rate = round((rep_students_count / leads_count_for_conv * 100), 1) if leads_count_for_conv > 0 else (100.0 if rep_students_count > 0 else 0.0)

        # Recent converted students list
        recent_conversions = []
        for e in rep_enrollments[:5]:
            st = student_map.get(e.student_id)
            c = course_map.get(e.course_id)
            b = batch_map.get(e.batch_id)
            recent_conversions.append({
                "student_id": e.student_id,
                "student_name": st.name if st else "Student",
                "course_name": c.title if c else "Course",
                "batch_name": b.batch_name if b else "Batch",
                "total_fee": float(e.total_fee or 0),
                "amount_paid": float(e.amount_paid or 0),
                "amount_due": float(e.amount_due or 0),
                "payment_status": e.payment_status,
                "slip_number": e.slip_number,
                "enrollment_date": e.enrollment_date.isoformat() if e.enrollment_date else "",
            })

        sales_performance.append({
            "user_id": uid,
            "name": rep_name,
            "email": user.email,
            "role": user.role,
            "leads_assigned": len(rep_leads_range),
            "total_leads_all_time": len(rep_leads_all),
            "demos_scheduled": rep_demos_sched,
            "demos_successful": rep_demos_succ,
            "demo_success_rate": rep_demo_rate,
            "followups_count": rep_followups,
            "students_enrolled": rep_students_count,
            "conversion_rate": rep_conversion_rate,
            "tuition_booked": rep_tuition,
            "advance_collected": rep_advance,
            "pending_due": rep_pending,
            "recent_conversions": recent_conversions,
        })

    # Sort sales performance by advance collected and students enrolled
    sales_performance.sort(key=lambda s: (s["advance_collected"], s["students_enrolled"], s["leads_assigned"]), reverse=True)

    # 3. LEAD SOURCES PERFORMANCE
    source_stats: dict[str, dict] = {}
    for l in leads_in_range:
        src = (l.source or "Unknown").strip() or "Unknown"
        item = source_stats.setdefault(src, {
            "source": src,
            "total_leads": 0,
            "demos_scheduled": 0,
            "converted_students": 0,
            "tuition_booked": 0.0,
            "advance_collected": 0.0,
            "pending_due": 0.0,
        })
        item["total_leads"] += 1
        if l.status in ("Demo", "Demo Scheduled", "Demo Completed") or any(d.lead_id == l.id for d in demos_in_range):
            item["demos_scheduled"] += 1
        if l.is_converted or l.status == "Enrolled" or l.converted_student_id:
            item["converted_students"] += 1

    # Include direct students without lead record
    for st in students_in_range:
        src = (st.source or "Direct / Walk-in").strip() or "Direct / Walk-in"
        item = source_stats.setdefault(src, {
            "source": src,
            "total_leads": 0,
            "demos_scheduled": 0,
            "converted_students": 0,
            "tuition_booked": 0.0,
            "advance_collected": 0.0,
            "pending_due": 0.0,
        })
        if not st.lead_id:
            item["total_leads"] += 1
            item["converted_students"] += 1

    # Connect enrollments to source
    for e in enrollments_in_range:
        st = student_map.get(e.student_id)
        src = (st.source if st and st.source else "Direct / Walk-in").strip() or "Direct / Walk-in"
        if src in source_stats:
            source_stats[src]["tuition_booked"] += float(e.total_fee or 0)
            source_stats[src]["advance_collected"] += float(e.amount_paid or 0)
            source_stats[src]["pending_due"] += float(e.amount_due or 0)

    lead_sources = []
    for src_data in source_stats.values():
        total_l = src_data["total_leads"]
        conv_s = src_data["converted_students"]
        src_data["conversion_rate"] = round((conv_s / total_l * 100), 1) if total_l > 0 else 0.0
        src_data["tuition_booked"] = round(src_data["tuition_booked"], 2)
        src_data["advance_collected"] = round(src_data["advance_collected"], 2)
        src_data["pending_due"] = round(src_data["pending_due"], 2)
        lead_sources.append(src_data)

    lead_sources.sort(key=lambda x: (x["advance_collected"], x["total_leads"]), reverse=True)

    # 4. LEAD PIPELINE STAGES
    stage_counts = {
        "New": 0, "Contacted": 0, "Follow Up": 0,
        "Demo Scheduled": 0, "Demo Completed": 0,
        "Enrolled": 0, "Cold": 0, "Lost": 0
    }
    # Alias map for non-standard statuses saved in DB
    _stage_alias = {
        "interested": "Contacted",
        "follow up": "Follow Up",
        "followup": "Follow Up",
        "demo": "Demo Scheduled",
        "demo scheduled": "Demo Scheduled",
        "demo completed": "Demo Completed",
        "enrolled": "Enrolled",
        "new": "New",
        "contacted": "Contacted",
        "cold": "Cold",
        "lost": "Lost",
    }
    for l in leads_in_range:
        stg = l.status or "New"
        if l.is_converted or l.converted_student_id:
            stage_counts["Enrolled"] += 1
        elif stg in stage_counts:
            stage_counts[stg] += 1
        else:
            # Normalize via alias map
            normalized = _stage_alias.get(stg.lower().strip())
            if normalized:
                stage_counts[normalized] += 1
            elif "demo" in stg.lower():
                stage_counts["Demo Scheduled"] += 1
            elif "follow" in stg.lower():
                stage_counts["Follow Up"] += 1
            else:
                stage_counts["Contacted"] += 1

    total_pipeline = len(leads_in_range) or 1
    lead_pipeline_stages = [
        {"stage": stage, "count": count, "percentage": round((count / total_pipeline) * 100, 1)}
        for stage, count in stage_counts.items()
    ]

    # 5. COURSE PERFORMANCE
    course_performance = []
    for c in all_courses:
        c_enrollments = [e for e in enrollments_in_range if e.course_id == c.id]
        c_tuition = round(sum(float(e.total_fee or 0) for e in c_enrollments), 2)
        c_advance = round(sum(float(e.amount_paid or 0) for e in c_enrollments), 2)
        c_due = round(max(0.0, c_tuition - c_advance), 2)
        course_performance.append({
            "course_id": c.id,
            "title": c.title,
            "category": c.category or "General",
            "price": float(c.price or 0),
            "advance_amount": float(c.advance_amount or 0),
            "students_enrolled": len(c_enrollments),
            "tuition_booked": c_tuition,
            "advance_collected": c_advance,
            "pending_due": c_due,
            "collection_percentage": round((c_advance / c_tuition * 100), 1) if c_tuition > 0 else 100.0,
        })
    course_performance.sort(key=lambda x: (x["advance_collected"], x["students_enrolled"]), reverse=True)

    # 6. INSTRUCTOR PERFORMANCE
    instructor_performance = []
    for inst in all_instructors:
        inst_batches = [b for b in all_batches if b.instructor_id == inst.id]
        inst_batch_ids = {b.id for b in inst_batches}
        inst_enrollments = [e for e in all_enrollments if e.batch_id in inst_batch_ids]
        inst_students_count = len({e.student_id for e in inst_enrollments})
        inst_attendance = [a for a in all_attendance if a.batch_id in inst_batch_ids]

        if inst_attendance:
            present_c = sum(1 for a in inst_attendance if a.status == "Present")
            att_rate = round((present_c / len(inst_attendance)) * 100, 1)
        else:
            att_rate = 0.0

        batches_list = []
        for b in inst_batches:
            c = course_map.get(b.course_id)
            b_enrolls = [e for e in all_enrollments if e.batch_id == b.id]
            batches_list.append({
                "batch_id": b.id,
                "batch_name": b.batch_name,
                "course_title": c.title if c else "Course",
                "enrolled_count": len(b_enrolls),
                "max_seats": b.max_seats,
                "status": b.status,
                "progress_percent": round(100 * sum(1 for item in all_sessions if item.batch_id == b.id and item.status == "Completed") /
                    max(1, sum(1 for item in all_sessions if item.batch_id == b.id)), 1),
            })

        instructor_performance.append({
            "instructor_id": inst.id,
            "name": inst.name,
            "email": inst.email,
            "phone": inst.phone,
            "specialization": inst.expertise or "Faculty",
            "avg_rating": round(sum(item.rating for item in all_feedback if item.instructor_id == inst.id) /
                max(1, sum(1 for item in all_feedback if item.instructor_id == inst.id)), 1),
            "batches_count": len(inst_batches),
            "active_batches_count": sum(1 for b in inst_batches if b.status in ("Active", "Upcoming")),
            "total_students": inst_students_count,
            "attendance_rate": att_rate,
            "sessions_count": sum(1 for item in all_sessions if item.batch_id in inst_batch_ids),
            "batches": batches_list,
        })
    instructor_performance.sort(key=lambda x: (x["total_students"], x["batches_count"]), reverse=True)

    # 7. DAILY AND MONTHLY TRENDS
    daily_map: dict[str, dict] = {}
    total_days = max(1, (end - start).days + 1)
    # If range is huge, limit daily slots to 31 days or recent
    daily_days = min(total_days, 31)
    daily_start = end - timedelta(days=daily_days - 1)

    for offset in range(daily_days):
        d_str = (daily_start + timedelta(days=offset)).isoformat()
        daily_map[d_str] = {
            "date": d_str,
            "leads": 0,
            "demos": 0,
            "enrollments": 0,
            "advance_collected": 0.0,
            "followups": 0,
        }

    for l in all_leads:
        d_str = l.created_at.date().isoformat()
        if d_str in daily_map:
            daily_map[d_str]["leads"] += 1
            if l.status in ("Demo", "Demo Scheduled", "Demo Completed"):
                daily_map[d_str]["demos"] += 1

    for d in all_demos:
        d_str = d.scheduled_at.date().isoformat()
        if d_str in daily_map:
            daily_map[d_str]["demos"] += 1

    for e in all_enrollments:
        d_str = e.enrollment_date.date().isoformat() if e.enrollment_date else ""
        if d_str in daily_map:
            daily_map[d_str]["enrollments"] += 1
            daily_map[d_str]["advance_collected"] += float(e.amount_paid or 0)

    for c in all_calls:
        d_str = c.createdAt.date().isoformat()
        if d_str in daily_map:
            daily_map[d_str]["followups"] += 1

    # Monthly trends
    monthly_map: dict[str, dict] = {}
    for d_item in daily_map.values():
        m_key = d_item["date"][:7]
        m_bucket = monthly_map.setdefault(m_key, {
            "month": m_key,
            "leads": 0,
            "demos": 0,
            "enrollments": 0,
            "advance_collected": 0.0,
        })
        m_bucket["leads"] += d_item["leads"]
        m_bucket["demos"] += d_item["demos"]
        m_bucket["enrollments"] += d_item["enrollments"]
        m_bucket["advance_collected"] += d_item["advance_collected"]

    # 8. RECENT ADMISSIONS AUDIT LIST
    recent_admissions = []
    for e in enrollments_in_range[:25]:
        st = student_map.get(e.student_id)
        c = course_map.get(e.course_id)
        b = batch_map.get(e.batch_id)
        sales_rep = user_map.get(e.enrolled_by) or (user_map.get(st.assigned_salesperson_id) if st and st.assigned_salesperson_id else None)
        recent_admissions.append({
            "id": e.id,
            "student_id": e.student_id,
            "student_name": st.name if st else "Student",
            "course_title": c.title if c else "Course",
            "batch_name": b.batch_name if b else "Batch",
            "salesperson_name": sales_rep.name if sales_rep else "Direct",
            "total_fee": float(e.total_fee or 0),
            "amount_paid": float(e.amount_paid or 0),
            "amount_due": float(e.amount_due or 0),
            "payment_status": e.payment_status,
            "slip_number": e.slip_number or f"ADM-{e.id:04d}",
            "enrollment_date": e.enrollment_date.isoformat() if e.enrollment_date else "",
        })

    # 9. DEMO AND FOLLOWUP LOGS
    demo_logs = []
    for d in demos_in_range[:20]:
        ld = lead_map.get(d.lead_id)
        rep = user_map.get(d.created_by)
        demo_logs.append({
            "id": d.id,
            "lead_name": ld.company_name if ld else "Lead",
            "salesperson": rep.name if rep else "Sales Rep",
            "course": ld.industry if ld else "Course Demo",
            "status": d.status,
            "scheduled_at": d.scheduled_at.isoformat() if d.scheduled_at else "",
            "meeting_url": d.meeting_url,
            "notes": d.notes,
        })

    followup_logs = []
    for c in calls_in_range[:20]:
        followup_logs.append({
            "id": c.id,
            "phone_number": c.phone_number,
            "lead_name": c.phone_number,
            "agent": c.assigned_to or "Agent",
            "date": c.createdAt.isoformat(),
            "duration": c.duration_seconds or 0,
            "followup_needed": c.followup_needed,
            "followup_date": c.followup_date,
            "summary": c.summary or "",
        })

    # Return structured institute decision center report + backwards-compatible fields
    return {
        "range": {
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "is_all_time": is_all_time,
        },
        "company_overview": company_overview,
        "sales_performance": sales_performance,
        "lead_sources": lead_sources,
        "lead_pipeline_stages": lead_pipeline_stages,
        "course_performance": course_performance,
        "instructor_performance": instructor_performance,
        "daily_trends": list(daily_map.values()),
        "monthly_trends": sorted(monthly_map.values(), key=lambda x: x["month"]),
        "recent_admissions": recent_admissions,
        "demo_logs": demo_logs,
        "followup_logs": followup_logs,

        # Backwards compatibility fields for any legacy widgets
        "summary": {
            "leads": len(leads_in_range),
            "students_enrolled": len(enrollments_in_range),
            "total_students": len(all_students),
            "tuition_value": total_tuition_val,
            "advance_collected": advance_collected,
            "amount_due": total_due,
            "conversion_percentage": overall_conversion_rate,
            "demos_scheduled": demos_scheduled,
            "demos_successful": demos_successful,
            "calls": len(calls_in_range),
            "meetings": len(meetings_in_range),
        },
        "sales": {
            "deals": [],
            "won_value": advance_collected,
        },
        "daily": list(daily_map.values()),
        "monthly": sorted(monthly_map.values(), key=lambda x: x["month"]),
        "staff_performance": sales_performance,
        "calls": followup_logs,
        "meetings": demo_logs,
        "onboarding": {
            "total_students": len(all_students),
            "active": sum(1 for s in all_students if s.status == "Active"),
        },
    }



@router.get("/reports/lead-transfers")
def lead_transfer_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    all_time: Optional[bool] = False,
    session: Session = Depends(get_session),
):
    actor = _require_roles(session, ["Admin", "SuperAdmin", "Demo"])
    if not current_tenant_id.get():
        raise HTTPException(status_code=403, detail="Select a company")
    today = datetime.now(timezone.utc).date()
    start = date(2020, 1, 1) if all_time else _report_date(start_date, today - timedelta(days=29))
    end = date(2035, 12, 31) if all_time else _report_date(end_date, today)
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    query = select(LeadTransferHistory).order_by(LeadTransferHistory.transferred_at.desc())
    if current_tenant_id.get():
        query = query.where(LeadTransferHistory.tenant_id == current_tenant_id.get())
    transfers = [
        item for item in session.exec(query).all()
        if _in_report_range(item.transferred_at, start, end)
    ]
    lead_ids = {item.lead_id for item in transfers}
    user_ids = {
        user_id for item in transfers
        for user_id in (item.from_user_id, item.to_user_id, item.transferred_by)
    }
    leads = {
        lead.id: lead
        for lead in session.exec(select(Lead).where(Lead.id.in_(lead_ids))).all()
    } if lead_ids else {}
    users = {
        user.id: user for user in session.exec(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    return {
        "total": len(transfers),
        "transfers": [
            {
                "id": item.id,
                "lead_id": item.lead_id,
                "lead_name": leads[item.lead_id].company_name if item.lead_id in leads else "Deleted lead",
                "lead_stage": item.lead_stage,
                "from_user_id": item.from_user_id,
                "from_name": users[item.from_user_id].name if item.from_user_id in users else "Unknown",
                "to_user_id": item.to_user_id,
                "to_name": users[item.to_user_id].name if item.to_user_id in users else "Unknown",
                "transferred_by_name": users[item.transferred_by].name if item.transferred_by in users else "Unknown",
                "reason": item.reason,
                "transferred_at": item.transferred_at.isoformat(),
            }
            for item in transfers[:1000]
        ],
    }


@router.get("/reports/sales-contribution")
def sales_contribution_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    all_time: Optional[bool] = False,
    session: Session = Depends(get_session),
):
    actor = _require_roles(session, ["Admin", "SuperAdmin", "Demo"])
    if not current_tenant_id.get():
        raise HTTPException(status_code=403, detail="Select a company")
    from addons.institute.models import LeadDemoSession, LeadFollowUp, LeadWalkIn, LeadWebinar
    from database import Meeting

    today = datetime.now(timezone.utc).date()
    start = date(2020, 1, 1) if all_time else _report_date(start_date, today - timedelta(days=29))
    end = date(2035, 12, 31) if all_time else _report_date(end_date, today)
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    lead_query = select(Lead)
    if current_tenant_id.get():
        lead_query = lead_query.where(Lead.tenant_id == current_tenant_id.get())
    leads = session.exec(lead_query).all()
    leads_by_id = {lead.id: lead for lead in leads}
    lead_ids = set(leads_by_id)
    user_query = select(User).where(User.role.in_(["SalesManager", "Employee", "Sales"]))
    if current_tenant_id.get():
        user_query = user_query.where(User.tenant_id == current_tenant_id.get())
    users = session.exec(user_query).all()
    counts: Dict[int, Dict[str, int]] = {
        user.id: {
            "communications": 0,
            "follow_ups": 0,
            "meetings": 0,
            "walk_ins": 0,
            "webinars": 0,
            "demos": 0,
        }
        for user in users
    }

    def add_event(user_id: Optional[int], category: str, occurred_at: Optional[datetime]):
        if (
            user_id in counts
            and _in_report_range(occurred_at, start, end)
        ):
            counts[user_id][category] += 1

    if lead_ids:
        conversations = session.exec(
            select(ConversationLog).where(ConversationLog.lead_id.in_(lead_ids))
        ).all()
        for item in conversations:
            add_event(item.author_id, "communications", item.created_at)

        followups = session.exec(
            select(LeadFollowUp).where(LeadFollowUp.lead_id.in_(lead_ids))
        ).all()
        for item in followups:
            if (item.status or "").lower() in ("done", "completed"):
                add_event(item.created_by, "follow_ups", item.updated_at or item.created_at)

        meetings = session.exec(
            select(Meeting).where(Meeting.lead_id.in_(lead_ids))
        ).all()
        for item in meetings:
            if (item.status or "").lower() == "completed":
                add_event(item.host_id, "meetings", item.updated_at or item.scheduled_at)

        walk_ins = session.exec(
            select(LeadWalkIn).where(LeadWalkIn.lead_id.in_(lead_ids))
        ).all()
        for item in walk_ins:
            if (item.status or "").lower() in ("completed", "attended", "done"):
                add_event(item.created_by, "walk_ins", item.updated_at or item.created_at)

        webinars = session.exec(
            select(LeadWebinar).where(LeadWebinar.lead_id.in_(lead_ids))
        ).all()
        for item in webinars:
            if (item.status or "").lower() in ("completed", "attended", "done"):
                add_event(item.created_by, "webinars", item.updated_at or item.created_at)

        demos = session.exec(
            select(LeadDemoSession).where(LeadDemoSession.lead_id.in_(lead_ids))
        ).all()
        for item in demos:
            if (item.status or "").lower() in ("completed", "attended", "done"):
                add_event(item.created_by, "demos", item.updated_at or item.created_at)

    result = []
    for user in users:
        activity_counts = counts[user.id]
        total = sum(activity_counts.values())
        result.append({
            "user_id": user.id,
            "name": user.name or user.email,
            "total_activities": total,
            "contribution_percentage": 0,
            **activity_counts,
        })
    total_activities = sum(item["total_activities"] for item in result)
    for item in result:
        item["contribution_percentage"] = (
            round(item["total_activities"] / total_activities * 100, 1)
            if total_activities else 0
        )
    result.sort(key=lambda item: (-item["total_activities"], item["name"].lower()))
    return {
        "total_activities": total_activities,
        "methodology": "Each logged conversation and completed follow-up, meeting, walk-in, webinar, or demo counts equally.",
        "salespeople": result,
    }
