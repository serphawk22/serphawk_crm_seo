"""Ticket workflows: tenant isolation, admissions ownership and demo allowances."""
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from fastapi import HTTPException
from sqlmodel import SQLModel
from sqlmodel import Session, select
from tests.test_institute import InstituteBase
from tests import _support as S
from database import User, Lead, Tenant
from addons.institute.models import Student, LeadTransferHistory
from modules import features, presets, tenant_settings


class TicketWorkflows(InstituteBase):
    def admission_user(self, name="Admissions"):
        with Session(S.ENGINE) as session:
            user = User(tenant_id=2, email=f"{name}@example.test", name=name, role="Admissions", password="x")
            session.add(user)
            session.commit()
            return user.id

    def test_institute_reports_use_tenant_one_scope_and_real_enrollments(self):
        course = self.make_course()
        batch = self.make_batch(course)
        student = self.make_student()
        response = self.post("/enrollments", {"student_id": student, "batch_id": batch, "course_id": course, "total_fee": 1000, "amount_paid": 100})
        self.assertEqual(response.status_code, 200, response.text)
        report = self.get("/institute/reports?all_time=true")
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()["company_overview"]["total_tuition_value"], 1000)
        self.assertEqual(self.get("/reports/lead-transfers").status_code, 200)
        self.assertEqual(self.get("/reports/sales-contribution").status_code, 200)
        with Session(S.ENGINE) as session:
            tenant_settings.update_settings(session, 2, {"sales_module_access": {"reports": True}})
        self.assertEqual(self.get("/institute/reports", uid=self.sales).status_code, 200)

    def test_admissions_assignment_and_payments_are_ownership_scoped(self):
        first = self.admission_user("First")
        second = self.admission_user("Second")
        student = self.make_student()
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(Student, student).admissions_assignee_id, first)
        self.assertEqual(self.get(f"/students/{student}", uid=second).status_code, 404)
        self.assertEqual(self.post("/admissions/students/auto-assign", {}, uid=first).status_code, 403)
        course = self.make_course()
        batch = self.make_batch(course)
        enrollment = self.post("/enrollments", {"student_id": student, "batch_id": batch, "course_id": course, "total_fee": 1000}).json()["enrollment"]["id"]
        payment = {"student_id": student, "enrollment_id": enrollment, "amount": 100, "payment_mode": "Cash"}
        self.assertEqual(self.post("/payments", payment, uid=second).status_code, 404)
        self.assertEqual(self.post("/payments", payment, uid=first).status_code, 200)
        invoice_path = f"/admissions/students/{student}/invoices"
        self.assertEqual(self.post(invoice_path, {"enrollment_id": enrollment}, uid=second).status_code, 404)
        response = self.post(invoice_path, {"enrollment_id": enrollment}, uid=first)
        self.assertEqual(response.status_code, 200, response.text)
        invoice_id = response.json()["invoice"]["id"]
        self.assertEqual(self.get(f"/admissions/invoices/{invoice_id}/pdf", uid=second).status_code, 404)
        pdf = self.get(f"/admissions/invoices/{invoice_id}/pdf", uid=first)
        self.assertEqual(pdf.status_code, 200, pdf.text if pdf.status_code != 200 else "")
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        duplicate = self.post(invoice_path, {"enrollment_id": enrollment}, uid=first)
        self.assertEqual(duplicate.json()["invoice"]["id"], invoice_id)
        self.assertEqual(self.post("/payments", {**payment, "amount": 900}, uid=first).status_code, 200)
        queue = self.get("/admissions/students", uid=first).json()["students"]
        self.assertEqual(queue[0]["enrollments"][0]["invoice"]["status"], "Paid")
        self.assertEqual(self.get("/admissions/students", uid=first).json()["students"][0]["id"], student)

    def test_transfers_reject_foreign_leads_and_record_reason(self):
        with Session(S.ENGINE) as session:
            lead = session.get(Lead, self.leads[2])
            lead.owner_id = self.sales
            session.add(lead)
            session.commit()
        body = {"lead_ids": [self.leads[2]], "employee_id": self.emp, "reason": "Course specialist handoff"}
        response = self.post("/leads/transfer", body, uid=self.sales)
        self.assertEqual(response.status_code, 200, response.text)
        with Session(S.ENGINE) as session:
            history = session.exec(select(LeadTransferHistory)).all()
            self.assertEqual(len(history), 1)
            self.assertEqual((history[0].tenant_id, history[0].reason), (2, body["reason"]))
        body["lead_ids"] = [self.leads[3]]
        self.assertIn(self.post("/leads/transfer", body, uid=self.sales).status_code, (404, 409))

    def test_demo_five_courses_cannot_be_bypassed_by_changing_user(self):
        with Session(S.ENGINE) as session:
            other = User(tenant_id=2, email="other-admin@example.test", role="Admin", password="x")
            session.add(other)
            session.commit()
            other_id = other.id
            tenant = session.get(Tenant, 2)
            tenant.is_trial = True
            session.add(tenant)
            session.commit()
        for index in range(5):
            self.make_course(title=f"Course {index}")
        blocked = self.post("/courses", {"title": "Sixth"})
        self.assertEqual(blocked.status_code, 403, blocked.text)
        self.assertEqual(blocked.json()["detail"]["limit"], 5)
        blocked = self.post("/courses", {"title": "Sixth from another account"}, uid=other_id)
        self.assertEqual(blocked.status_code, 403, blocked.text)
        self.assertEqual(blocked.json()["detail"]["limit"], 5)

    def test_dashboard_switches_and_sections_are_independent(self):
        self.assertEqual(self.get("/dashboard-b2c/stats").status_code, 200)
        with Session(S.ENGINE) as session:
            flags = presets.apply_preset(session, 3, "agency")["features"]
            self.assertFalse(flags["dashboard_b2c"])
            features.set_features(session, 2, {"dashboard_b2c": False})
        self.assertEqual(self.get("/dashboard-b2c/stats").status_code, 403)
        self.assertEqual(self.get("/institute/reports").status_code, 200)
        from modules.dashboard_variants import b2b_payload
        flags = features._resolve({"dashboard": False, "dashboard_b2c": True, "command_center": True,
            "command_center_billing": False, "command_center_kpis": True, "dashboard_b2c_lead_stages": True})
        self.assertTrue(flags["dashboard_b2c_lead_stages"])
        data = b2b_payload({"billing": {"amount": 123}, "kpis": {"leads": 4}}, flags)
        self.assertNotIn("billing", data)
        self.assertEqual(data["kpis"], {"leads": 4})

    def test_demo_dashboard_can_initialize_its_source_catalog(self):
        with Session(S.ENGINE) as session:
            presets.apply_preset(session, 2, "serphawk")
            tenant = session.get(Tenant, 2)
            tenant.is_trial = True
            session.add(tenant)
            session.commit()
        response = self.get("/command-center/overview")
        self.assertEqual(response.status_code, 200, response.text)
        sources = self.get("/lead-sources")
        self.assertEqual(sources.status_code, 200, sources.text)
        self.assertEqual(len(sources.json()["sources"]), 5)

    def test_reports_tenant_one_cannot_see_another_company(self):
        with Session(S.ENGINE) as session:
            presets.apply_preset(session, 1, "institute")
        report = self.get("/institute/reports?all_time=true", tid=1)
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()["summary"]["leads"], 1)

    def test_course_hours_and_prerequisites_survive_updates(self):
        response = self.post("/courses", {"title": "Advanced course", "duration_hours": 40, "prerequisites": "Basic Python"})
        self.assertEqual(response.status_code, 200, response.text)
        cid = response.json()["course"]["id"]
        response = self.client.patch(f"/courses/{cid}", json={"title": "Renamed course"}, headers=self.h())
        self.assertEqual(response.status_code, 200, response.text)
        course = next(course for course in self.get("/courses").json()["courses"] if course["id"] == cid)
        self.assertEqual((course["duration_hours"], course["prerequisites"]), (40, "Basic Python"))


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Requires throwaway PostgreSQL")
class DemoRecordConcurrency(unittest.TestCase):
    def test_parallel_creations_stop_at_five(self):
        from sqlalchemy import create_engine, text, func
        from sqlalchemy.engine import make_url
        from addons.institute.models import Course
        from modules import demo_usage, tenant_scope
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        name = "crm_ticket_records_" + uuid.uuid4().hex[:12]
        admin = create_engine(url, isolation_level="AUTOCOMMIT")
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        engine = create_engine(url.set(database=name))
        try:
            S.load_main()
            SQLModel.metadata.create_all(engine)
            with Session(engine) as session:
                session.add(Tenant(id=2, name="Record quota test"))
                session.commit()
            def create(index):
                token = demo_usage.demo_context.set(2)
                scope = tenant_scope.current_tenant_id.set(2)
                try:
                    with Session(engine) as session:
                        session.add(Course(tenant_id=2, title=f"Course {index}"))
                        session.commit()
                    return True
                except HTTPException as error:
                    self.assertEqual(error.status_code, 403)
                    return False
                finally:
                    tenant_scope.current_tenant_id.reset(scope)
                    demo_usage.demo_context.reset(token)
            with ThreadPoolExecutor(max_workers=8) as workers:
                self.assertEqual(sum(workers.map(create, range(16))), 5)
            with Session(engine) as session:
                self.assertEqual(session.exec(select(func.count(Course.id)).where(Course.tenant_id == 2)).one(), 5)
        finally:
            engine.dispose()
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}"'))
            admin.dispose()
