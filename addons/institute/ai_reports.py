"""Institute facts for the shared AI reporting endpoint; no deal/revenue proxies."""
from datetime import datetime, timezone

from addons.institute.reports import institute_report


def report_data(session, start_date=None, end_date=None, rep_id=None, course_id=None):
    # Reuse the report service's tenant, role and salesperson ownership rules.
    return institute_report(start_date=start_date, end_date=end_date,
        salesperson_id=rep_id, course_id=course_id, all_time=not (start_date or end_date), session=session)


def quick_prompts(session):
    data = report_data(session)
    return {
        "prompts": [
            {"category": "Admissions performance", "prompt": "Compare admissions, lead conversions and collections across the sales team", "badge": "Admissions"},
            {"category": "Fee collections", "prompt": "Analyze tuition booked, fees collected and outstanding balances", "badge": "Collections"},
            {"category": "Course performance", "prompt": "Compare course enrollments and identify courses with outstanding fees", "badge": "Courses"},
            {"category": "Lead conversion", "prompt": "Review the lead conversion funnel and recommend follow-up priorities", "badge": "Funnel"},
        ],
        "reps": [{"id": rep["user_id"], "name": rep["name"], "role": rep["role"]}
                 for rep in data["sales_performance"]],
    }


def build_report(session, prompt, start_date, end_date, rep_id, currency, course_id=None):
    data = report_data(session, start_date, end_date, rep_id, course_id)
    overview = data["company_overview"]
    reps = data["sales_performance"]
    money = lambda value: f"{currency} {float(value or 0):,.2f}"
    title = "Admissions and collections report"
    summary = (f"{overview['total_leads_in_range']} leads and "
        f"{overview['total_students_enrolled_in_range']} enrollments were recorded in this period. "
        f"Tuition booked is {money(overview['total_tuition_value'])}; "
        f"collections total {money(overview['advance_collected'])} and "
        f"outstanding fees total {money(overview['total_pending_due'])}.")
    headers = ["Salesperson", "Leads", "Enrollments", "Conversion %", "Tuition booked", "Collected", "Outstanding"]
    rows = [[rep["name"], str(rep["leads_assigned"]), str(rep["students_enrolled"]),
        f"{rep['conversion_rate']}%", money(rep["tuition_booked"]), money(rep["advance_collected"]),
        money(rep["pending_due"])] for rep in reps]
    insights = [f"Lead conversion in this period is {overview['overall_conversion_rate']}%.",
        f"{overview['demos_successful']} of {overview['demos_scheduled']} scheduled demos were successful.",
        f"{overview['active_batches_count']} active/upcoming batches and {overview['courses_count']} courses are recorded."]
    recommendations = ["Review outstanding student balances and agree collection follow-ups.",
        "Review leads awaiting follow-up and compare each salesperson's enrollment conversion."]
    markdown = "\n\n".join([f"# {title}", f"Requested analysis: {prompt}", summary,
        "## Findings\n" + "\n".join(f"- {item}" for item in insights),
        "## Recommendations\n" + "\n".join(f"- {item}" for item in recommendations)])
    report = {
        "report_type": "institute", "title": title, "summary": summary,
        "target_reps": [{"id": rep["user_id"], "name": rep["name"]} for rep in reps],
        "kpis": [{"label": label, "value": str(value)} for label, value in (
            ("Leads", overview["total_leads_in_range"]), ("Enrollments", overview["total_students_enrolled_in_range"]),
            ("Tuition booked", money(overview["total_tuition_value"])), ("Collected", money(overview["advance_collected"])),
            ("Outstanding", money(overview["total_pending_due"])) )],
        "comparison_table": {"headers": headers, "rows": rows},
        "insights": insights, "recommendations": recommendations,
        "detailed_markdown": markdown, "generated_at": datetime.now(timezone.utc).isoformat(),
        "ai_engine": "institute-intelligence (offline fallback)",
    }
    context = {"user_prompt": prompt, "currency": currency, "period": data["range"],
        "company_overview": overview, "sales_performance": reps,
        "course_performance": data["course_performance"], "lead_sources": data["lead_sources"],
        "lead_pipeline_stages": data["lead_pipeline_stages"]}
    return report, context
