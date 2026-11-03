"""Ticket regressions: removed modules, real dashboard data, cases, paid demo budgets."""
import asyncio
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest import mock

import httpx
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Case, DemoServiceUsage, Lead, Tenant, User
from modules import demo_usage, features, tenant_settings
from modules.tenant_scope import using_tenant


class CrmRefinement(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate(); tenant_settings.invalidate()
        self.addCleanup(features.invalidate); self.addCleanup(tenant_settings.invalidate)
        self.addCleanup(lambda: demo_usage.demo_context.set(None))

    def demo(self, trial=True, role="Demo"):
        with Session(S.ENGINE) as session:
            tenant = session.get(Tenant, 2); tenant.is_trial = trial; session.add(tenant)
            user = session.get(User, self.users[2]); user.role = role; session.add(user)
            session.commit()

    def test_removed_modules_have_no_catalog_entries_or_routes(self):
        self.assertNotIn("deals", features.FEATURES)
        self.assertNotIn("scmhub_cases", features.FEATURES)
        for path in ("/deals", "/scmhub-cases"):
            self.assertEqual(self.client.get(path, headers=self.as_tenant(2)).status_code, 404)
            self.assertEqual(self.client.post(path, json={}, headers=self.as_tenant(2)).status_code, 404)

    def test_dashboard_does_not_accept_another_identity(self):
        with Session(S.ENGINE) as session:
            user = session.get(User, self.users[2]); user.role = "SalesManager"; session.add(user); session.commit()
        response = self.client.get("/dashboard-stats?role=Admin&email=admin3@t3.test", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["isSalesManager"])
        self.assertEqual(response.json()["metrics"]["assigned_leads"], 1)

    def test_dashboard_sections_are_independent_and_tenant_scoped(self):
        response = self.client.get("/dashboard-stats", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(sum(p["value"] for p in response.json()["operations"]["leadStages"]), 1)
        with Session(S.ENGINE) as session:
            features.set_features(session, 2, {"dashboard_lead_stages": False, "dashboard_lead_sources": True})
        data = self.client.get("/dashboard-stats", headers=self.as_tenant(2)).json()["operations"]
        self.assertNotIn("leadStages", data)
        self.assertEqual(sum(p["value"] for p in data["leadSources"]), 1)

    def test_institute_summary_uses_real_enrollments_and_ignores_other_tenants(self):
        from addons.institute.models import Batch, Course, Enrollment, Student
        with Session(S.ENGINE) as session:
            features.set_features(session, 2, {"institute": True})
            for tid in (2, 3):
                course = Course(tenant_id=tid, title=f"Course {tid}")
                student = Student(tenant_id=tid, name=f"Student {tid}", email=f"s{tid}@test.test")
                session.add_all([course, student]); session.commit(); session.refresh(course); session.refresh(student)
                batch = Batch(tenant_id=tid, course_id=course.id, batch_name="Test batch")
                session.add(batch); session.commit(); session.refresh(batch)
                session.add(Enrollment(tenant_id=tid, student_id=student.id, course_id=course.id, batch_id=batch.id,
                                       total_fee=1000 * tid, amount_paid=600 * tid, amount_due=400 * tid))
                session.commit()
        data = self.client.get("/dashboard-stats", headers=self.as_tenant(2)).json()["operations"]
        self.assertEqual(data["instituteSummary"]["collected"], 1200)
        self.assertEqual(data["instituteSummary"]["due"], 800)
        self.assertEqual(data["courseAdmissions"], [{"name": "Course 2", "value": 1}])

    def test_case_creation_assigns_sales_to_self_and_prevents_cross_tenant_links(self):
        with Session(S.ENGINE) as session:
            user = session.get(User, self.users[2]); user.role = "SalesManager"; session.add(user); session.commit()
        headers = self.as_tenant(2)
        response = self.client.post("/cases", json={"subject": " Issue ", "case_type": "Issue", "category": "Leads"}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        case = response.json()["case"]
        self.assertEqual((case["subject"], case["assigned_to"], case["tenant_id"]), ("Issue", self.users[2], 2))
        for values, status in (({"assigned_to": self.users[3]}, 403), ({"client_id": self.clients[3]}, 404)):
            response = self.client.post("/cases", json={"subject": "Issue", **values}, headers=headers)
            self.assertEqual(response.status_code, status, response.text)

    def test_case_reopening_clears_resolution_timestamp_and_rejects_bad_values(self):
        headers = self.as_tenant(2)
        case = self.client.post("/cases", json={"subject": "A real issue"}, headers=headers).json()["case"]
        path = f"/cases/{case['id']}"
        self.assertIsNotNone(self.client.put(path, json={"status": "Resolved"}, headers=headers).json()["case"]["resolved_at"])
        self.assertIsNone(self.client.put(path, json={"status": "Open"}, headers=headers).json()["case"]["resolved_at"])
        for values in ({"status": "nonsense"}, {"priority": None}, {"url": "javascript:alert(1)"}, {"subject": " "}):
            self.assertEqual(self.client.put(path, json=values, headers=headers).status_code, 422)

    def test_all_demo_kinds_are_restricted_even_inside_a_paid_company(self):
        for trial, role in ((True, "Demo"), (False, "Demo"), (True, "Admin")):
            self.demo(trial, role)
            response = self.client.get("/me/demo-usage", headers=self.as_tenant(2))
            self.assertTrue(response.json()["restricted"])
            self.assertEqual(response.json()["budgets"]["ai"]["limit"], 5)
            self.assertEqual(response.json()["budgets"]["calls"]["limit"], 2)
        self.demo(False, "Admin")
        self.assertFalse(self.client.get("/me/demo-usage", headers=self.as_tenant(2)).json()["restricted"])

    def test_sixth_paid_request_never_reaches_the_provider(self):
        self.demo()
        token = demo_usage.demo_context.set(2)
        self.addCleanup(demo_usage.demo_context.reset, token)
        received = []
        transport = httpx.MockTransport(lambda request: (received.append(request), httpx.Response(200, json={}))[1])
        with using_tenant(2), httpx.Client(transport=transport) as client:
            for _ in range(5):
                client.post("https://api.openai.com/v1/chat/completions", json={})
            with self.assertRaises(HTTPException):
                client.post("https://api.openai.com/v1/audio/speech", json={})
        self.assertEqual(len(received), 5)
        # API entry points return a useful 403 rather than swallowing a provider exception.
        response = self.client.post("/tts/generate", json={"text": "Test"}, headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["detail"]["error"], "LIMIT_REACHED")

    def test_async_paid_services_share_the_same_budget(self):
        self.demo()
        async def request():
            token = demo_usage.demo_context.set(2)
            try:
                async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200))) as client:
                    for _ in range(5):
                        await client.get("https://maps.googleapis.com/maps/api/place/textsearch/json")
                    with self.assertRaises(HTTPException):
                        await client.post("https://google.serper.dev/search")
            finally:
                demo_usage.demo_context.reset(token)
        asyncio.run(request())

    def test_requests_based_paid_services_cannot_bypass_the_shared_budget(self):
        import requests
        self.demo()
        token = demo_usage.demo_context.set(2)
        self.addCleanup(demo_usage.demo_context.reset, token)
        response = requests.Response(); response.status_code = 200; response._content = b"{}"
        with using_tenant(2), mock.patch("requests.adapters.HTTPAdapter.send", return_value=response) as provider:
            for _ in range(5): requests.post("https://api.firecrawl.dev/v1/scrape", json={})
            with self.assertRaises(HTTPException): requests.post("https://api.firecrawl.dev/v1/scrape", json={})
            self.assertEqual(provider.call_count, 5)

    def test_paid_company_provider_requests_are_not_limited(self):
        self.demo(False, "Admin")
        with using_tenant(2), httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200))) as client:
            for _ in range(8): client.post("https://api.openai.com/v1/chat/completions", json={})
        with using_tenant(2), Session(S.ENGINE) as session:
            self.assertEqual(demo_usage.usage(session, 2)["ai"]["used"], 0)

    def test_workspace_counters_are_shared_and_isolated(self):
        with using_tenant(2):
            for _ in range(5): demo_usage.consume(2, "ai")
            with self.assertRaises(HTTPException): demo_usage.consume(2, "ai")
        with using_tenant(3):
            demo_usage.consume(3, "ai")
            with Session(S.ENGINE) as session:
                self.assertEqual(demo_usage.usage(session, 3)["ai"]["used"], 1)
        self.demo()
        with Session(S.ENGINE) as session:
            user = User(tenant_id=2, name="Another demo", email="demo2@test.test", password="x", role="Demo")
            session.add(user); session.commit(); session.refresh(user); uid = user.id
        self.assertEqual(self.client.post("/generate", json={}, headers={"X-User-ID": str(uid)}).status_code, 403)

    def test_two_calls_are_atomic_and_existing_usage_is_honored(self):
        with using_tenant(2):
            demo_usage.consume(2, "calls"); demo_usage.consume(2, "calls")
            with self.assertRaises(HTTPException): demo_usage.consume(2, "calls")
            with Session(S.ENGINE) as session:
                self.assertEqual(session.get(Tenant, 2).usage_calls, 2)

    def test_bulk_workflows_are_blocked_but_reads_and_edits_remain_available(self):
        self.demo()
        for path in ("/email-campaigns", "/followups/scan", "/research-map-company", "/inbox/sync"):
            response = self.client.post(path, json={}, headers=self.as_tenant(2))
            self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.client.get("/leads", headers=self.as_tenant(2)).status_code, 200)

    def test_paid_routes_cannot_bypass_demo_limits_by_omitting_identity(self):
        for path in ("/tts/generate", "/smart-research", "/generate", "/documents/ocr"):
            self.assertEqual(self.client.post(path, json={}).status_code, 401)

    def test_quota_reset_and_upgrade_preserve_expected_behavior(self):
        from modules import demo_accounts
        self.demo()
        with using_tenant(2):
            demo_usage.consume(2, "ai"); demo_usage.consume(2, "calls")
        with using_tenant(-1):  # platform operator has no company CRM context
            with Session(S.ENGINE) as session:
                demo_accounts.update_limits(session, session.get(Tenant, 2), None, True)
        with using_tenant(2):
            with Session(S.ENGINE) as session:
                data = demo_usage.usage(session, 2)
                self.assertEqual((data["ai"]["used"], data["calls"]["used"]), (0, 0))

    def test_automatic_inbox_triage_skips_trial_and_in_company_demo_mailboxes(self):
        from database import InboxMessage, UserEmailIntegration
        from modules import email_ai
        self.demo(False, "Demo")
        with Session(S.ENGINE) as session:
            session.add(UserEmailIntegration(tenant_id=2, user_id=self.users[2], email="DEMO@test.test",
                        encrypted_app_password="test-only", smtp_host="smtp.invalid", imap_host="imap.invalid"))
            session.add(InboxMessage(tenant_id=2, mailbox="demo@test.test", message_id="demo-test-1",
                                     from_address="sender@test.test", subject="A demo email"))
            session.commit()
        with mock.patch.object(email_ai, "classify_batch", return_value={}) as classify:
            self.assertEqual(email_ai.classify_pending(S.ENGINE), 0)
            classify.assert_not_called()
        self.demo(True, "Admin")
        with mock.patch.object(email_ai, "classify_batch", return_value={}) as classify:
            self.assertEqual(email_ai.classify_pending(S.ENGINE), 0)
            classify.assert_not_called()
        self.demo(False, "Admin")
        with mock.patch.object(email_ai, "classify_batch", return_value={}) as classify:
            self.assertEqual(email_ai.classify_pending(S.ENGINE), 1)
            classify.assert_called_once()

    def test_automatic_note_scans_do_not_spend_demo_credits(self):
        from database import ClientNote
        from modules import followups_core
        self.demo(False, "Demo")
        with Session(S.ENGINE) as session:
            session.add(ClientNote(tenant_id=2, lead_id=self.leads[2], author_id=self.users[2],
                                   content="Please call back tomorrow."))
            session.commit()
        extractor = mock.Mock(return_value=None)
        result = followups_core.scan_notes(S.ENGINE, tenant_id=2, extractor=extractor)
        self.assertEqual(result["scanned"], 0)
        extractor.assert_not_called()

    def test_preexisting_demo_campaign_is_stopped_before_mailbox_or_ai_work(self):
        from database import EmailCampaign
        from modules import company_mailer, email_campaign_worker
        self.demo(False, "Demo")
        with Session(S.ENGINE) as session:
            campaign = EmailCampaign(tenant_id=2, created_by=self.users[2], name="Old demo campaign",
                                     subject_template="Test", body_template="Test", ai_personalize=True)
            session.add(campaign); session.commit(); session.refresh(campaign); cid = campaign.id
        with mock.patch.object(company_mailer, "resolve_account") as mailbox:
            email_campaign_worker.run_campaign(cid, engine=S.ENGINE)
            mailbox.assert_not_called()
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(EmailCampaign, cid).status, "Failed")

    def test_voice_speech_threads_keep_the_demo_context_and_skip_automatic_prewarm(self):
        from database import AICall
        from routers import voice_agent
        self.demo(False, "Demo")
        call = AICall(id=999, tenant_id=2, started_by=self.users[2], to_number="+15555550100")
        observed = []
        def synthesize(*args, **kwargs):
            observed.append(demo_usage.demo_context.get())
            return ("static/test-only.wav", False)
        with mock.patch.object(voice_agent, "synthesize_cached", side_effect=synthesize), mock.patch.object(voice_agent, "_tts_budget", return_value=1):
            voice_agent._call_audio(call, "Test speech")
        self.assertEqual(observed, [2])
        with mock.patch.object(voice_agent.threading, "Thread") as thread:
            voice_agent._prewarm_call_clips(call)
            thread.assert_not_called()


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Requires the throwaway compose Postgres")
class DemoQuotaConcurrency(unittest.TestCase):
    def test_parallel_workers_cannot_overspend_either_budget(self):
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        import database
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        name = "crm_demo_quota_" + uuid.uuid4().hex[:12]
        admin = create_engine(url, isolation_level="AUTOCOMMIT")
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        engine = create_engine(url.set(database=name))
        try:
            SQLModel.metadata.create_all(engine)
            with Session(engine) as session:
                session.add(Tenant(id=2, name="Quota concurrency test")); session.commit()
            def spend(resource):
                try:
                    demo_usage.consume(2, resource)
                    return True
                except HTTPException as error:
                    self.assertEqual(error.status_code, 403)
                    return False
            with mock.patch.object(database, "engine", engine), ThreadPoolExecutor(max_workers=12) as workers:
                self.assertEqual(sum(workers.map(spend, ["ai"] * 24)), 5)
                self.assertEqual(sum(workers.map(spend, ["calls"] * 24)), 2)
            with Session(engine) as session:
                self.assertEqual(session.exec(select(DemoServiceUsage.used).where(DemoServiceUsage.tenant_id == 2)).one(), 5)
                self.assertEqual(session.get(Tenant, 2).usage_calls, 2)
        finally:
            engine.dispose()
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}"'))
            admin.dispose()
