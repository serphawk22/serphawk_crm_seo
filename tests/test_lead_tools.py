"""Lead assignment (SCM BPO + SCM HB rules) and the website lead webhook, per company."""
import os
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from addons.institute.models import Batch, Course, Enrollment, Student
from database import ActivityLog, ClientNote, Contact, Lead, Notification, Tenant, User
from modules import features, lead_assignment, presets, ratelimit, tenant_settings

KEY2 = "intake-key-for-company-two-0001"
KEY3 = "intake-key-for-company-three-02"


class ToolsBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        ratelimit.reset()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            self.reps = {}
            for tid in (2, 3):
                for name, role in (("sm", "SalesManager"), ("sales", "Sales"), ("emp", "Employee")):
                    u = User(email=f"{name}@t{tid}.test", password="x", name=f"{name.upper()} {tid}", role=role, tenant_id=tid)
                    s.add(u)
                    s.commit()
                    s.refresh(u)
                    self.reps[(tid, name)] = u.id
            s.commit()
        self.patch_research = mock.patch("main._trigger_background_research")
        self.research = self.patch_research.start()
        self.addCleanup(self.patch_research.stop)

    def admin(self, tid=2):
        return {"X-User-ID": str(self.users[tid])}

    def rep(self, tid, name):
        return {"X-User-ID": str(self.reps[(tid, name)])}

    def add_leads(self, tid, n, owner=None, status="New", converted=False):
        with Session(S.ENGINE) as s:
            ids = []
            for i in range(n):
                lead = Lead(company_name=f"L{tid}-{owner}-{i}", tenant_id=tid, owner_id=owner, status=status, is_converted=converted)
                s.add(lead)
                s.commit()
                s.refresh(lead)
                ids.append(lead.id)
            return ids

    def owners(self, tid):
        with Session(S.ENGINE) as s:
            return [l.owner_id for l in s.exec(select(Lead).where(Lead.tenant_id == tid).order_by(Lead.id).execution_options(skip_tenant=True)).all()]

    def enable_webhook(self, tid=2, key=KEY2):
        with Session(S.ENGINE) as s:
            features.set_features(s, tid, {"lead_webhook": True})
            tenant_settings.update_settings(s, tid, {"lead_intake_api_key": key})


class WorkloadAssignment(ToolsBase):
    def test_assigns_the_least_loaded_sales_person_and_balances_as_it_goes(self):
        sm, sales = self.reps[(2, "sm")], self.reps[(2, "sales")]
        self.add_leads(2, 3, owner=sm)                         # SM has 3 (plus the fixture lead belongs to the admin)
        unassigned = self.add_leads(2, 4)
        r = self.client.post("/leads/auto-assign", headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["assigned"], 4)
        with Session(S.ENGINE) as s:
            owners = {l.id: l.owner_id for l in s.exec(select(Lead).where(Lead.id.in_(unassigned)).execution_options(skip_tenant=True)).all()}
        # the SalesManager already has 3, the Sales rep none: the Sales rep takes the first three to even out, and a
        # rep with no history counts as an average closer, so they also win the tie that follows
        self.assertEqual(sorted(owners.values()).count(sales), 4)
        self.assertEqual(sorted(owners.values()).count(sm), 0)
        self.assertNotIn(self.users[2], owners.values(), "an Admin is never given leads")
        self.assertNotIn(self.reps[(2, "emp")], owners.values(), "Employees are only used when there is no salesperson")

    def test_ties_go_to_the_better_conversion_rate(self):
        sm, sales = self.reps[(2, "sm")], self.reps[(2, "sales")]
        self.add_leads(2, 2, owner=sm, status="Won")
        self.add_leads(2, 2, owner=sales, status="Lost")
        (lead,) = self.add_leads(2, 1)
        self.client.post("/leads/auto-assign", headers=self.admin())
        self.assertEqual(self.owners(2)[-1], sm)

    def test_employees_are_the_fallback_when_there_is_no_salesperson(self):
        with Session(S.ENGINE) as s:
            for key in ("sm", "sales"):
                u = s.get(User, self.reps[(2, key)])
                u.is_active = False
                s.add(u)
            s.commit()
        self.add_leads(2, 2)
        r = self.client.post("/leads/auto-assign", headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(set(self.owners(2)[-2:]), {self.reps[(2, "emp")]})

    def test_never_uses_another_companys_people(self):
        self.add_leads(2, 3)
        self.client.post("/leads/auto-assign", headers=self.admin())
        company_two = {self.reps[(2, k)] for k in ("sm", "sales", "emp")} | {self.users[2]}
        self.assertTrue(set(self.owners(2)) <= company_two)
        self.assertEqual(self.owners(3), [self.users[3]], "company three's lead was not touched")

    def test_nobody_eligible_is_a_clear_error(self):
        with Session(S.ENGINE) as s:
            for u in s.exec(select(User).where(User.tenant_id == 2, User.role != "Admin").execution_options(skip_tenant=True)).all():
                u.is_active = False
                s.add(u)
            s.commit()
        self.add_leads(2, 1)
        self.assertEqual(self.client.post("/leads/auto-assign", headers=self.admin()).status_code, 409)

    def test_nothing_to_do_is_not_an_error(self):
        self.add_leads(2, 0)
        with Session(S.ENGINE) as s:
            for l in s.exec(select(Lead).where(Lead.tenant_id == 2).execution_options(skip_tenant=True)).all():
                l.owner_id = self.users[2]
                s.add(l)
            s.commit()
        r = self.client.post("/leads/auto-assign", headers=self.admin())
        self.assertEqual((r.status_code, r.json()["assigned"]), (200, 0))

    def test_roles(self):
        self.assertEqual(self.client.post("/leads/auto-assign", headers=self.rep(2, "sm")).status_code, 403)
        self.assertEqual(self.client.post("/leads/auto-assign", headers=self.rep(2, "emp")).status_code, 403)
        with Session(S.ENGINE) as s:
            s.add(User(email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None))
            s.commit()
            su = s.exec(select(User).where(User.email == "root@platform.test").execution_options(skip_tenant=True)).one().id
        self.assertEqual(self.client.post("/leads/auto-assign", headers={"X-User-ID": str(su)}).status_code, 400, "pick a company first")


class RevenueAssignment(ToolsBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_assignment": "revenue"})
            course = Course(tenant_id=2, title="Python")
            s.add(course)
            s.commit()
            s.refresh(course)
            batch = Batch(tenant_id=2, course_id=course.id, batch_name="Morning")
            s.add(batch)
            s.commit()
            s.refresh(batch)
            student = Student(tenant_id=2, name="Stu", assigned_salesperson_id=self.reps[(2, "sm")])
            s.add(student)
            s.commit()
            s.refresh(student)
            s.add(Enrollment(tenant_id=2, student_id=student.id, batch_id=batch.id, course_id=course.id, amount_paid=5000.0))
            s.commit()

    def test_the_salesperson_with_the_least_revenue_gets_the_lead(self):
        self.add_leads(2, 1)
        r = self.client.post("/leads/auto-assign-all", headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotEqual(self.owners(2)[-1], self.reps[(2, "sm")], "the one who already brought in 5000 is last in line")

    def test_one_lead_and_its_student(self):
        lead_id = self.add_leads(2, 1)[0]
        r = self.client.post(f"/leads/{lead_id}/auto-assign-employee", headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotEqual(r.json()["employee_id"], self.reps[(2, "sm")])
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(Lead, lead_id).owner_id, r.json()["employee_id"])

    def test_scope_and_roles(self):
        other = self.leads[3]
        self.assertEqual(self.client.post(f"/leads/{other}/auto-assign-employee", headers=self.admin()).status_code, 404)
        self.assertEqual(self.client.post(f"/leads/{self.leads[2]}/auto-assign-employee", headers=self.rep(2, "sm")).status_code, 403)
        self.assertEqual(self.client.post("/leads/auto-assign-all", headers=self.rep(2, "emp")).status_code, 403)
        self.assertEqual(self.client.post("/leads/auto-assign-all", headers=self.rep(2, "sm")).status_code, 200)


class AssignOnCreate(ToolsBase):
    def create(self, tid=2, **extra):
        return self.client.post("/leads", json={"company_name": "Fresh Co", **extra}, headers=self.admin(tid))

    def test_off_by_default(self):
        r = self.create()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(self.owners(2)[-1])

    def test_on_for_a_company_that_asks_for_it(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_auto_assign": True})
        self.assertEqual(self.create().status_code, 200)
        self.assertIn(self.owners(2)[-1], {self.reps[(2, "sm")], self.reps[(2, "sales")]})
        self.create(3)
        self.assertEqual(self.owners(3)[-1], None, "company three did not turn it on")

    def test_a_chosen_owner_is_kept_and_a_setting_is_validated(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_auto_assign": True})
        mine = self.reps[(2, "emp")]
        self.create(owner_id=mine)
        self.assertEqual(self.owners(2)[-1], mine)
        r = self.client.put("/tenant/settings", json={"settings": {"lead_assignment": "random"}}, headers=self.admin())
        self.assertEqual(r.status_code, 422)

    def test_the_bpo_preset_turns_it_on(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo")
        self.assertTrue(tenant_settings.get_setting(2, "lead_auto_assign"))
        self.assertEqual(lead_assignment.strategy_for(2), "workload")
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "institute")
        self.assertEqual(lead_assignment.strategy_for(3), "revenue")


class Webhook(ToolsBase):
    def post(self, body=None, key=KEY2, headers=None, **kw):
        h = {"X-API-Key": key} if key else {}
        h.update(headers or {})
        return self.client.post("/leads/webhook", json=body if body is not None else {"name": "Jo Prospect", "email": "jo@prospect.test"},
                                headers=h, **kw)

    def lead_rows(self, tid):
        with Session(S.ENGINE) as s:
            return s.exec(select(Lead).where(Lead.tenant_id == tid).order_by(Lead.id).execution_options(skip_tenant=True)).all()

    def test_the_info_page_is_public(self):
        for path in ("/leads/webhook", "/api/leads/webhook"):
            r = self.client.get(path)
            self.assertEqual((r.status_code, r.json()["status"]), (200, "online"))

    def test_closed_without_a_valid_key(self):
        self.enable_webhook()
        self.assertEqual(self.post(key=None).status_code, 401)
        self.assertEqual(self.post(key="wrong").status_code, 401)
        self.assertEqual(self.post(key=KEY3).status_code, 401, "a key nobody owns")
        self.assertEqual(len(self.lead_rows(2)), 1, "only the fixture lead exists")

    def test_closed_when_the_module_is_off_even_with_the_key(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_intake_api_key": KEY2})
        r = self.post()
        self.assertEqual(r.status_code, 403, r.text)

    def test_a_submission_creates_a_complete_lead_for_that_company_only(self):
        self.enable_webhook()
        body = {"name": "Jo Prospect", "company_name": "Prospect Ltd", "email": "jo@prospect.test", "phone": "+91 99999 11111",
                "form_name": "Quote request", "page_url": "https://site.test/contact", "service": "Call centre support",
                "message": "We need 20 seats.", "budget": "5 lakh", "tenant_id": 3}
        r = self.post(body)
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertTrue(out["success"])
        self.assertEqual(out["assigned_salesperson"]["id"] in {self.reps[(2, "sm")], self.reps[(2, "sales")], self.reps[(2, "emp")]}, True)
        lead = self.lead_rows(2)[-1]
        self.assertEqual((lead.company_name, lead.source, lead.status, lead.email), ("Prospect Ltd", "Website", "New", "jo@prospect.test"))
        self.assertIn("We need 20 seats.", lead.notes)
        self.assertIn("Budget: 5 lakh", lead.notes)
        self.assertEqual(lead.ai_analysis_results["website_form"]["form_name"], "Quote request")
        self.assertEqual(len(self.lead_rows(3)), 1, "tenant_id in the body must not redirect the lead to another company")
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(Contact).where(Contact.lead_id == lead.id).execution_options(skip_tenant=True)).all()), 1)
            self.assertEqual(len(s.exec(select(ClientNote).where(ClientNote.lead_id == lead.id).execution_options(skip_tenant=True)).all()), 1)
            acts = s.exec(select(ActivityLog).where(ActivityLog.lead_id == lead.id).execution_options(skip_tenant=True)).all()
            self.assertEqual([(a.action, a.tenant_id) for a in acts], [("Website form submitted", 2)])
            notes = s.exec(select(Notification).where(Notification.title.like("New website lead%")).execution_options(skip_tenant=True)).all()
            self.assertEqual({n.user_id for n in notes}, {self.users[2]}, "only this company's admin is told")
        self.research.assert_called_once()

    def test_two_companies_two_keys(self):
        self.enable_webhook(2, KEY2)
        self.enable_webhook(3, KEY3)
        self.post({"name": "For Two"}, key=KEY2)
        self.post({"name": "For Three"}, key=KEY3)
        self.assertEqual([l.company_name for l in self.lead_rows(2)][-1], "For Two")
        self.assertEqual([l.company_name for l in self.lead_rows(3)][-1], "For Three")

    def test_the_key_can_come_in_the_body_and_forms_are_accepted(self):
        self.enable_webhook()
        r = self.client.post("/api/leads/webhook", data={"name": "Form Person", "email": "f@p.test", "api_key": KEY2})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.lead_rows(2)[-1].company_name, "Form Person")
        r = self.client.post("/leads/webhook", json={"first_name": "A", "last_name": "B", "api_key": KEY2})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.lead_rows(2)[-1].company_name, "A B")
        self.assertEqual(self.client.post("/leads/webhook", content=b"not json", headers={"X-API-Key": KEY2, "content-type": "application/json"}).status_code, 200,
                         "an unreadable body still creates a bare lead rather than an error page")

    def test_keys_must_be_unique_across_companies(self):
        self.enable_webhook(2, KEY2)
        r = self.client.put("/tenant/settings", json={"settings": {"lead_intake_api_key": KEY2}}, headers=self.admin(3))
        self.assertEqual(r.status_code, 422, r.text)
        self.assertIn("already used", r.text)
        self.assertEqual(self.client.put("/tenant/settings", json={"settings": {"lead_intake_api_key": KEY2}}, headers=self.admin(2)).status_code, 200)

    def test_an_admin_can_generate_a_key(self):
        r = self.client.post("/tenant/lead-intake-key", headers=self.admin(2))
        self.assertEqual(r.status_code, 200, r.text)
        key = r.json()["api_key"]
        self.assertGreaterEqual(len(key), 24)
        self.assertEqual(tenant_settings.get_setting(2, "lead_intake_api_key"), key)
        self.assertEqual(self.client.post("/tenant/lead-intake-key", headers=self.rep(2, "sm")).status_code, 403)
        again = self.client.post("/tenant/lead-intake-key", headers=self.admin(2)).json()["api_key"]
        self.assertNotEqual(again, key)

    def test_bad_keys_are_rate_limited(self):
        self.enable_webhook()
        statuses = [self.post(key=f"bad-{i}").status_code for i in range(13)]
        self.assertEqual(statuses.count(401), 10, statuses)
        self.assertEqual(statuses.count(429), 3)
        self.assertEqual(self.post(key=KEY2).status_code, 200, "a good key is not punished for the bad ones")

    def test_new_leads_follow_the_companys_assignment_rule(self):
        self.enable_webhook()
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_assignment": "workload"})
        self.add_leads(2, 3, owner=self.reps[(2, "sm")])
        self.add_leads(2, 3, owner=self.reps[(2, "sales")])
        self.add_leads(2, 1, owner=self.reps[(2, "sales")])      # the Sales rep is now the busier one
        self.post({"name": "Balanced"})
        self.assertEqual(self.lead_rows(2)[-1].owner_id, self.reps[(2, "sm")])
