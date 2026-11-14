"""Current dashboard controls use real, scoped metrics and section switches."""
from datetime import datetime, timezone
from sqlmodel import Session
from database import Lead, TaskSheetEntry, User
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import features, presets


class DashboardManagement(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        self.addCleanup(features.invalidate)
        with Session(S.ENGINE) as session:
            presets.apply_preset(session, 2, "institute")

    def stats(self):
        response = self.client.get("/dashboard-b2c/stats", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["operations"]

    def test_controls_and_source_rates_use_real_current_tenant_rows(self):
        today = datetime.now(timezone.utc).date().isoformat()
        with Session(S.ENGINE) as session:
            session.add_all([
                Lead(tenant_id=2, company_name="Unassigned", owner_id=None, source="Website"),
                Lead(tenant_id=2, company_name="Won", owner_id=self.users[2], source="Website", is_converted=True),
                Lead(tenant_id=3, company_name="Foreign", owner_id=None, source="Website", is_converted=True),
                TaskSheetEntry(tenant_id=2, user_id=self.users[2], work_date=today, summary="Today"),
                TaskSheetEntry(tenant_id=2, user_id=self.users[2], work_date="2000-01-01", summary="Old"),
                TaskSheetEntry(tenant_id=3, user_id=self.users[3], work_date=today, summary="Foreign"),
            ])
            session.commit()
        data = self.stats()
        self.assertEqual(data["management"], {"unassignedLeads": 1, "todayTasks": 1})
        source = next(row for row in data["sourceConversion"] if row["name"] == "Website")
        self.assertEqual(source, {"name": "Website", "total": 2, "converted": 1, "rate": 50.0})

    def test_controls_and_source_rates_respect_separate_section_switches(self):
        with Session(S.ENGINE) as session:
            features.set_features(session, 2, {"dashboard_b2c_operations": False, "dashboard_b2c_source_conversion": False})
        data = self.stats()
        self.assertNotIn("management", data)
        self.assertNotIn("sourceConversion", data)
        self.assertIn("leadStages", data)

    def test_sales_scope_does_not_include_colleagues_or_unassigned_leads(self):
        with Session(S.ENGINE) as session:
            user = session.get(User, self.users[2])
            user.role = "SalesManager"
            session.add(user)
            colleague = User(tenant_id=2, role="Employee", email="colleague@example.test", password="x")
            session.add(colleague)
            session.commit()
            session.refresh(colleague)
            session.add_all([
                Lead(tenant_id=2, company_name="Other owner", owner_id=colleague.id),
                Lead(tenant_id=2, company_name="Unassigned", owner_id=None),
                TaskSheetEntry(tenant_id=2, user_id=colleague.id, work_date=datetime.now(timezone.utc).date().isoformat(), summary="Other work"),
            ])
            session.commit()
        data = self.stats()
        self.assertNotIn("unassignedLeads", data["management"])
        self.assertEqual(data["management"]["todayTasks"], 0)
        self.assertEqual(sum(row["total"] for row in data["sourceConversion"]), 1)
