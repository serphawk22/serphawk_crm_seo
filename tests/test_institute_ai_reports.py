"""B2C AI reports use institute facts, feature gates and existing report ownership."""
import os
from datetime import datetime, timezone
from unittest import mock

from sqlmodel import Session

from addons.institute.models import Batch, Course, Enrollment, Student
from database import User
from modules import features, tenant_settings
from tests import _support as S
from tests.test_institute import InstituteBase


class InstituteAiReports(InstituteBase):
    def setUp(self):
        super().setUp()
        self.no_ai = mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""})
        self.no_ai.start()
        self.addCleanup(self.no_ai.stop)
        self.course = self.seed(2, self.emp, 1000, 250)
        self.other_course = self.seed(2, self.sales, 2000, 500)
        self.seed(3, self.users[3], 900000, 800000)

    def seed(self, tid, owner, fee, paid):
        with Session(S.ENGINE) as session:
            course = Course(tenant_id=tid, title=f"Course {fee}")
            student = Student(tenant_id=tid, name=f"Student {fee}", assigned_salesperson_id=owner)
            session.add_all([course, student]); session.commit()
            session.refresh(course); session.refresh(student)
            batch = Batch(tenant_id=tid, course_id=course.id, batch_name="AI batch")
            session.add(batch); session.commit(); session.refresh(batch)
            session.add(Enrollment(tenant_id=tid, student_id=student.id, batch_id=batch.id,
                course_id=course.id, enrolled_by=owner, total_fee=fee, amount_paid=paid,
                amount_due=fee-paid, enrollment_date=datetime(2026, 11, 10, tzinfo=timezone.utc)))
            session.commit()
            return course.id

    def generate(self, **extra):
        uid = extra.pop("uid", None)
        return self.post("/reports/ai/generate", {"prompt": "Compare admissions and collections",
            "time_range": "all", "currency": "MXN", **extra}, uid=uid)

    def test_institute_preset_exposes_ai_and_offline_report_uses_real_fees(self):
        response = self.generate()
        self.assertEqual(response.status_code, 200, response.text)
        report = response.json()
        self.assertEqual(report["report_type"], "institute")
        kpis = {kpi["label"]: kpi["value"] for kpi in report["kpis"]}
        self.assertEqual(kpis["Enrollments"], "2")
        self.assertEqual(kpis["Collected"], "MXN 750.00")
        self.assertEqual(kpis["Outstanding"], "MXN 2,250.00")
        self.assertNotIn("900,000", response.text)
        self.assertNotIn("Admin 3", response.text)
        self.assertEqual(report["ai_engine"], "institute-intelligence (offline fallback)")

    def test_ai_disable_blocks_prompts_and_generation(self):
        with Session(S.ENGINE) as session:
            features.set_features(session, 2, {"ai_reports": False})
        self.assertEqual(self.get("/reports/ai/quick-prompts").status_code, 403)
        self.assertEqual(self.generate().status_code, 403)

    def test_sales_scope_cannot_be_expanded_using_another_rep(self):
        with Session(S.ENGINE) as session:
            tenant_settings.update_settings(session, 2, {"sales_module_access": {"reports": True}})
        response = self.generate(uid=self.emp, rep_id=self.sales)
        self.assertEqual(response.status_code, 200, response.text)
        kpis = {kpi["label"]: kpi["value"] for kpi in response.json()["kpis"]}
        self.assertEqual(kpis["Enrollments"], "1")
        self.assertEqual(kpis["Collected"], "MXN 250.00")
        self.assertEqual([rep["id"] for rep in response.json()["target_reps"]], [self.emp])
        self.assertEqual([rep["id"] for rep in self.get("/reports/ai/quick-prompts", uid=self.emp).json()["reps"]], [self.emp])

    def test_course_and_dates_apply_to_ai_report(self):
        response = self.generate(time_range="custom", start_date="2026-11-01", end_date="2026-11-30", course_id=self.course)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(next(k["value"] for k in response.json()["kpis"] if k["label"] == "Collected"), "MXN 250.00")
        response = self.generate(time_range="custom", start_date="2026-12-01", end_date="2026-12-31")
        self.assertEqual(next(k["value"] for k in response.json()["kpis"] if k["label"] == "Enrollments"), "0")

    def test_portal_roles_cannot_read_ai_reports(self):
        with Session(S.ENGINE) as session:
            user = session.get(User, self.emp); user.role = "Student"; session.add(user); session.commit()
        self.assertEqual(self.generate(uid=self.emp).status_code, 403)
        self.assertEqual(self.get("/reports/ai/quick-prompts", uid=self.emp).status_code, 403)
