"""Dashboard sections and tenant-scoped operations data. No illustrative/fake values."""
from collections import Counter
from datetime import datetime, timezone

from sqlmodel import select

from database import Lead, Project, TaskSheetEntry, User


SECTIONS = {
    "revenue": "Revenue KPI", "clients": "Clients KPI", "proposals": "Proposal value KPI",
    "tasks": "Pending tasks KPI", "followups": "Follow-up summary", "call_pitch": "Call pitch",
    "financial_chart": "Financial overview", "lead_stages": "Lead stages",
    "lead_sources": "Acquisition sources", "admissions": "Course admissions",
    "fee_health": "Fee collection", "sales_workload": "Sales workload",
    "task_health": "Task execution", "operations": "Management shortcuts",
    "source_conversion": "Source conversion", "projects": "Project progress",
    "engagement": "Team engagement", "recent_activity": "Recent activity",
    "leads": "Assigned leads KPI", "contacts": "Assigned contacts KPI", "sales_metrics": "Sales conversion KPIs",
    "onboarding": "Setup checklist", "quick_links": "Quick links",
    "client_metrics": "Client KPIs", "client_services": "Client services and quotes",
    "client_strategy": "Client strategy", "client_profile": "Client company profile",
    "developer_work": "Developer work overview",
}

SECTION_MODULES = {
    "revenue": ("invoices", "institute"), "clients": ("clients", "institute"),
    "proposals": ("proposals", "institute"), "financial_chart": ("invoices", "institute"),
    "tasks": ("task_sheet",), "followups": ("followups",), "call_pitch": ("calls",),
    "lead_stages": ("leads",), "lead_sources": ("leads",), "source_conversion": ("leads",),
    "admissions": ("institute",), "fee_health": ("institute",), "sales_workload": ("teams",),
    "task_health": ("task_sheet",), "projects": ("projects",), "contacts": ("contacts",),
    "leads": ("leads",), "sales_metrics": ("leads",), "developer_work": ("projects",),
}


def operations(session, tenant_id, enabled):
    """Aggregate inputs in SQL; never materialize entire tenant tables."""
    from sqlalchemy import func, case, or_, and_
    from collections import Counter
    result = {}
    def on(section, module=None):
        return enabled.get(f"dashboard_{section}", True) and (not module or enabled.get(module, False))
    def series(counter):
        return [{"name": name, "value": value} for name, value in counter.items()]
    leads = []
    if enabled.get("leads") and any(on(key, "leads") for key in ("lead_stages", "lead_sources", "source_conversion", "sales_workload")):
        converted = or_(Lead.is_converted.is_(True), and_(Lead.converted_student_id.is_not(None), Lead.converted_student_id != 0))
        leads = session.exec(select(Lead.status, Lead.source, Lead.owner_id, converted, func.count(Lead.id))
            .where(Lead.tenant_id == tenant_id).group_by(Lead.status, Lead.source, Lead.owner_id, converted)).all()
    if on("lead_stages", "leads"):
        counts = Counter()
        for status, source, owner, converted, count in leads:
            counts[status or "New"] += count
        result["leadStages"] = series(counts)
    sources, conversions = Counter(), Counter()
    for status, source, owner, converted, count in leads:
        sources[source or "Unknown"] += count
        if converted:
            conversions[source or "Unknown"] += count
    if on("lead_sources", "leads"):
        result["leadSources"] = series(sources)
    if on("source_conversion", "leads"):
        result["sourceConversion"] = [{"name": name, "total": count, "converted": conversions[name],
            "rate": round(conversions[name] / count * 100, 1)} for name, count in sources.items()]
    if on("sales_workload", "leads") and enabled.get("teams"):
        users = dict(session.exec(select(User.id, User.name).where(User.tenant_id == tenant_id)).all())
        counts = Counter()
        for status, source, owner, converted, count in leads:
            counts[users.get(owner, "Unassigned")] += count
        result["salesWorkload"] = series(counts)
    if on("task_health", "task_sheet") or on("tasks", "task_sheet"):
        counts = Counter()
        for status, count in session.exec(select(TaskSheetEntry.status, func.count(TaskSheetEntry.id))
                .where(TaskSheetEntry.tenant_id == tenant_id).group_by(TaskSheetEntry.status)).all():
            counts[status or "Pending"] += count
        result["taskHealth"] = series(counts)
        result["pendingTasks"] = sum(count for status, count in counts.items() if status.lower() not in {"done", "completed"})
    if on("projects", "projects"):
        result["projectProgress"] = [{"id": row.id, "name": row.name, "status": row.status, "progress": row.progress or 0}
            for row in session.exec(select(Project.id, Project.name, Project.status, Project.progress).where(Project.tenant_id == tenant_id)).all()]
    if enabled.get("institute"):
        from addons.institute.models import Course, Enrollment, PaymentRecord, Student
        from modules.sales_access import actor
        person = actor.get()
        ef, sf = [Enrollment.tenant_id == tenant_id], [Student.tenant_id == tenant_id]
        if person and person[1] not in {"Admin", "SuperAdmin", "Demo"}:
            ef.append(Enrollment.enrolled_by == person[0])
            sf.append(Student.assigned_salesperson_id == person[0])
        enrollments = session.exec(select(Enrollment.course_id, func.count(Enrollment.id),
            func.coalesce(func.sum(Enrollment.total_fee), 0), func.coalesce(func.sum(Enrollment.amount_paid), 0),
            func.coalesce(func.sum(Enrollment.amount_due), 0)).where(*ef).group_by(Enrollment.course_id)).all()
        students, active = session.exec(select(func.count(Student.id), func.coalesce(func.sum(case((Student.status == "Active", 1), else_=0)), 0)).where(*sf)).one()
        collected, due = sum(row[3] for row in enrollments), sum(row[4] for row in enrollments)
        result["instituteSummary"] = {"students": students, "activeStudents": active,
            "booked": sum(row[2] for row in enrollments), "collected": collected, "due": due}
        if on("admissions"):
            courses = dict(session.exec(select(Course.id, Course.title).where(Course.tenant_id == tenant_id)).all())
            counts = Counter()
            for course, count, *_ in enrollments:
                counts[courses.get(course, "Unknown")] += count
            result["courseAdmissions"] = series(counts)
        if on("fee_health"):
            result["feeHealth"] = [{"name": "Collected", "value": collected}, {"name": "Outstanding", "value": due}]
        if on("financial_chart"):
            from sqlalchemy import extract
            now = datetime.now(timezone.utc)
            first_index = now.year * 12 + now.month - 1 - 5
            first = datetime(first_index // 12, first_index % 12 + 1, 1, tzinfo=timezone.utc)
            payment_day = func.timezone("UTC", PaymentRecord.payment_date) if session.get_bind().dialect.name == "postgresql" else PaymentRecord.payment_date
            year, month = extract("year", payment_day), extract("month", payment_day)
            payments = {(int(y), int(m)): amount for y, m, amount in session.exec(select(year, month,
                func.coalesce(func.sum(PaymentRecord.amount), 0)).join(Enrollment, Enrollment.id == PaymentRecord.enrollment_id)
                .where(PaymentRecord.tenant_id == tenant_id, *ef, PaymentRecord.payment_date >= first).group_by(year, month)).all()}
            result["feeRevenue"] = []
            for index in range(first_index, first_index + 6):
                y, m = index // 12, index % 12 + 1
                result["feeRevenue"].append({"name": f"{y}-{m:02d}", "revenue": payments.get((y, m), 0), "expenses": 0})
    return result


def admin_summary(session, tenant_id, enabled):
    """Preserve the legacy dashboard contract and billing formulas using aggregate queries."""
    import calendar
    from datetime import timedelta
    from sqlalchemy import func, case, extract
    from database import (ClientProfile, ActivityLog, CallLog, AICall, SentEmail, MarketplaceService,
                          Invoice, CRMQuote, SalesOrder, PurchaseOrder, ServiceRequest, Proposal)
    def count(model, *conditions):
        return session.exec(select(func.count(model.id)).where(model.tenant_id == tenant_id, *conditions)).one()
    def by_status(model):
        return dict(session.exec(select(model.status, func.count(model.id)).where(model.tenant_id == tenant_id).group_by(model.status)).all())
    def utc(column):
        return func.timezone("UTC", column) if session.get_bind().dialect.name == "postgresql" else column
    def value(model):
        total = getattr(model, "total", 0)
        grand = getattr(model, "grand_total", None)
        return func.coalesce(func.nullif(grand, 0), total, 0) if grand is not None else func.coalesce(total, 0)
    clients = by_status(ClientProfile)
    roles = dict(session.exec(select(User.role, func.count(User.id)).where(User.tenant_id == tenant_id).group_by(User.role)).all())
    services = by_status(ServiceRequest)
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    day_end = day_start + timedelta(days=7)
    daily, totals = {}, {}
    for key, model, column in (("activity", ActivityLog, ActivityLog.createdAt), ("email", SentEmail, SentEmail.sent_at),
                                ("call", CallLog, CallLog.createdAt), ("ai_call", AICall, AICall.created_at)):
        totals[key] = count(model)
        day = func.date(utc(column))
        daily[key] = {str(d): n for d, n in session.exec(select(day, func.count(model.id)).where(
            model.tenant_id == tenant_id, column >= day_start, column < day_end).group_by(day)).all()}
    first_index = now.year * 12 + now.month - 1 - 5
    first_month = datetime(first_index // 12, first_index % 12 + 1, 1, tzinfo=timezone.utc)
    billing, monthly = {}, {}
    for key, model in (("quotes", CRMQuote), ("sales", SalesOrder), ("purchase", PurchaseOrder), ("invoices", Invoice)):
        amount = value(model)
        billing[key] = session.exec(select(func.count(model.id), func.coalesce(func.sum(amount), 0),
            *[func.coalesce(func.sum(case((model.status == status, amount), else_=0)), 0) for status in ("Accepted", "Paid", "Sent", "Overdue", "Partial")],
            func.coalesce(func.sum(case((model.status == "Accepted", 1), else_=0)), 0),
            func.coalesce(func.sum(case((model.status == "Paid", 1), else_=0)), 0),
            func.coalesce(func.sum(case((model.status.in_(("Fulfilled", "Paid", "Completed")), amount), else_=0)), 0),
            func.coalesce(func.sum(case((model.status.in_(("Fulfilled", "Paid", "Completed")), 1), else_=0)), 0),
            func.coalesce(func.sum(case((model.status.in_(("Received", "Completed")), amount), else_=0)), 0),
            func.coalesce(func.sum(case((model.status.in_(("Received", "Completed")), 1), else_=0)), 0)
            ).where(model.tenant_id == tenant_id)).one()
        year, month = extract("year", utc(model.created_at)), extract("month", utc(model.created_at))
        filters = [model.tenant_id == tenant_id, model.created_at >= first_month]
        if key == "invoices":
            filters.append(model.status == "Paid")
        monthly[key] = {(int(y), int(m)): total for y, m, total in session.exec(select(year, month,
            func.coalesce(func.sum(amount), 0)).where(*filters).group_by(year, month)).all()}
    q, so, po, inv = (billing[k] for k in ("quotes", "sales", "purchase", "invoices"))
    pipeline = session.exec(select(func.coalesce(func.sum(Proposal.total_value), 0)).where(
        Proposal.tenant_id == tenant_id, (Proposal.status.notin_(("Accepted", "Declined")) | Proposal.status.is_(None)))).one()
    recent = session.exec(select(ActivityLog).where(ActivityLog.tenant_id == tenant_id).order_by(ActivityLog.createdAt.desc()).limit(10)).all()
    result = {"operations": operations(session, tenant_id, enabled), "revenue": inv[3], "pipelineValue": pipeline,
        "totalQuotesValue": q[1], "acceptedQuotesValue": q[2], "totalQuotesCount": q[0], "acceptedQuotesCount": q[7],
        "totalSalesOrdersValue": so[1], "fulfilledSalesOrdersValue": so[9], "totalSalesOrdersCount": so[0], "fulfilledSalesOrdersCount": so[10],
        "totalPurchaseOrdersValue": po[1], "receivedPurchaseOrdersValue": po[11], "totalPurchaseOrdersCount": po[0], "receivedPurchaseOrdersCount": po[12],
        "totalInvoicesValue": inv[1], "paidInvoicesValue": inv[3], "sentInvoicesValue": inv[4], "overdueInvoicesValue": inv[5],
        "partialInvoicesValue": inv[6], "paidInvoicesCount": inv[8], "totalInvoicesCount": inv[0],
        "total": sum(clients.values()), "active": clients.get("Active", 0), "pending": clients.get("Pending", 0), "hold": clients.get("Hold", 0),
        "totalProjects": count(Project), "totalEmployees": roles.get("Employee", 0), "totalInterns": roles.get("Intern", 0),
        "totalActivities": totals["activity"], "totalCalls": totals["call"] + totals["ai_call"], "totalEmailsSent": totals["email"],
        "totalMarketplaceServices": count(MarketplaceService), "recentActivities": [{"id": a.id, "action": a.action,
            "method": a.method, "content": a.content, "createdAt": a.createdAt.isoformat() if a.createdAt else None} for a in recent],
        "chartLabels": [], "activityChart": [], "emailChart": [], "callChart": [], "revenueData": [],
        "pipelineData": [{"stage": name, "count": number} for name, number in (("Prospecting", clients.get("Pending", 0)),
            ("Qualification", services.get("Pending", 0)), ("Proposal", services.get("Quoted", 0)),
            ("Negotiation", services.get("In Progress", 0)), ("Closed Won", services.get("Accepted", 0)))]}
    for offset in range(7):
        day = day_start + timedelta(days=offset)
        key = day.date().isoformat()
        result["chartLabels"].append(day.strftime("%b %d"))
        result["activityChart"].append(daily["activity"].get(key, 0))
        result["emailChart"].append(daily["email"].get(key, 0))
        result["callChart"].append(daily["call"].get(key, 0) + daily["ai_call"].get(key, 0))
    for index in range(first_index, first_index + 6):
        key = index // 12, index % 12 + 1
        result["revenueData"].append({"name": calendar.month_abbr[key[1]],
            "revenue": sum(monthly[k].get(key, 0) for k in ("quotes", "sales", "invoices")), "expenses": monthly["purchase"].get(key, 0)})
    return result
