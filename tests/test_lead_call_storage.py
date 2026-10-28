"""V2 adaptation: tenant isolation, durable transcripts, shared tasks and safe retries."""
from datetime import datetime, timezone
import unittest
import os
import uuid
from unittest import mock

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel, create_engine, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import AICall, ConversationLog, FollowUp, Lead, Tenant, User
from modules import conversation_store as store, features, followup_ai, lead_calls, tenant_settings
from modules.tenant_scope import current_tenant_id


ANALYSIS = {
    "summary": "The prospect requested a callback.", "engine": "rules", "error": None,
    "follow_up": {"should_follow_up": True, "due_date": "2026-11-02", "due_time": "15:00",
                  "title": "Call prospect", "channel": "call", "follow_up_type": "Call"},
}


class LeadCallStorage(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        self.analysis = mock.patch.object(followup_ai, "analyze_conversation", return_value=ANALYSIS).start()
        self.addCleanup(mock.patch.stopall)

    def call(self, tid=2, **kwargs):
        current_tenant_id.set(None)
        with Session(S.ENGINE) as s:
            call = AICall(tenant_id=tid, entity_type="lead", entity_id=self.leads[tid],
                          lead_id=self.leads[tid], to_number="+14155550123", started_by=self.users[tid],
                          status="completed", summary="Callback requested", **kwargs)
            s.add(call)
            s.commit()
            s.refresh(call)
            return call.id

    def create_conversation(self, tid=2, **kwargs):
        return self.client.post(f"/leads/{self.leads[tid]}/conversations", headers=self.as_tenant(tid),
                                json={"title": "Call notes", "description": "Please call back tomorrow", **kwargs})

    def test_call_history_and_latest_metadata_work(self):
        cid = self.call(transcript=[{"role": "client", "text": "Call me tomorrow", "ts": "now"}])
        headers = self.as_tenant(2)
        r = self.client.get(f"/leads/{self.leads[2]}/calls", headers=headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["calls"][0]["transcript"][0]["text"], "Call me tomorrow")
        r = self.client.get(f"/leads/{self.leads[2]}", headers=headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["latest_call_id"], cid)
        r = self.client.get("/leads", headers=headers)
        self.assertEqual(r.json()["leads"][0]["latest_call_id"], cid)

    def test_tenant_one_cannot_read_another_tenants_calls(self):
        self.call()
        for tid in (1, 3):
            r = self.client.get(f"/leads/{self.leads[2]}/calls", headers=self.as_tenant(tid))
            self.assertEqual(r.status_code, 404, r.text)

    def test_employee_cannot_read_another_owners_record(self):
        with Session(S.ENGINE) as s:
            user = User(email="employee@test.invalid", name="Rep", role="Employee", password="x", tenant_id=2)
            s.add(user)
            s.commit()
            s.refresh(user)
            uid = user.id
        r = self.client.get(f"/leads/{self.leads[2]}/calls", headers={"X-User-ID": str(uid)})
        self.assertEqual(r.status_code, 403, r.text)

    def test_caller_cannot_forge_conversation_author(self):
        r = self.create_conversation(author_id=self.users[3], analyze=False)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["conversation"]["author_id"], self.users[2])

    def test_analyze_retries_create_one_shared_task(self):
        r = self.create_conversation()
        self.assertEqual(r.status_code, 200, r.text)
        conv = r.json()["conversation"]
        for _ in range(2):
            r = self.client.post(f"/leads/{self.leads[2]}/conversations/{conv['id']}/analyze",
                                 headers=self.as_tenant(2))
            self.assertEqual(r.status_code, 200, r.text)
            self.assertFalse(r.json()["follow_up_created"])
        with Session(S.ENGINE) as s:
            tasks = s.exec(select(FollowUp)).all()
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0].conversation_id, conv["id"])
        r = self.client.get("/followups", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["items"][0]["conversation_id"], conv["id"])

    def test_analysis_reads_description_transcript_and_replies(self):
        r = self.create_conversation(transcript="Prospect: I need pricing")
        conv = r.json()["conversation"]
        r = self.client.post(f"/leads/{self.leads[2]}/conversations/{conv['id']}/replies",
                             headers=self.as_tenant(2), json={"content": "Call me Monday at 3 pm"})
        self.assertEqual(r.status_code, 200, r.text)
        content = self.analysis.call_args.args[0]
        for fragment in ("Please call back tomorrow", "I need pricing", "Call me Monday"):
            self.assertIn(fragment, content)

    def test_analysis_failure_keeps_saved_conversation(self):
        self.analysis.side_effect = RuntimeError("provider unavailable")
        r = self.create_conversation(transcript="Keep these words")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["ai_status"], "failed")
        r = self.client.get(f"/leads/{self.leads[2]}/conversations", headers=self.as_tenant(2))
        self.assertEqual(r.json()["conversations"][0]["transcript"], "Keep these words")

    def test_disabled_followups_do_not_schedule_from_analysis(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"followups": False})
        r = self.create_conversation()
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(FollowUp)).all(), [])

    def test_call_transcript_is_durable_and_idempotent(self):
        cid = self.call(transcript=[{"role": "client", "text": "Call me Monday at 3 pm"}])
        first = store.save_call_conversation(cid, 2)
        self.assertTrue(first["ok"], first)
        second = store.save_call_conversation(cid, 2)
        self.assertEqual(first["conversation_id"], second["conversation_id"])
        self.assertEqual(first["follow_up_id"], second["follow_up_id"])
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(ConversationLog)).all()), 1)
            self.assertEqual(len(s.exec(select(FollowUp)).all()), 1)
            self.assertIn("Call me Monday", s.get(ConversationLog, first["conversation_id"]).transcript)

    def test_real_finalize_flow_links_transcript_and_task_once(self):
        from routers import voice_agent
        cid = self.call(transcript=[{"role": "client", "text": "Call me Monday at 3 pm", "extra": "preserve"}])
        with mock.patch.object(voice_agent.va, "summarize_call", return_value={
                "summary": "Callback", "outcome": "callback", "next_steps": "Call Monday"}):
            voice_agent._finalize_call(cid, 2)
            voice_agent._finalize_call(cid, 2)
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(ConversationLog)).all()), 1)
            self.assertEqual(len(s.exec(select(FollowUp)).all()), 1)
            call = s.get(AICall, cid)
            self.assertEqual(call.transcript[0]["extra"], "preserve")
            self.assertTrue(call.follow_up_needed)
            self.assertIsNotNone(s.get(Lead, self.leads[2]).next_follow_up_at)

    def test_shared_followup_completion_clears_lead_banner(self):
        cid = self.call()
        result = store.save_call_conversation(cid, 2)
        lead_calls.sync_follow_up_record(cid, result["follow_up_id"], 2)
        r = self.client.post(f"/followups/{result['follow_up_id']}/complete",
                             headers=self.as_tenant(2), json={"outcome": "Called"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertFalse(s.get(Lead, self.leads[2]).follow_up_needed)
            self.assertFalse(s.get(AICall, cid).follow_up_needed)

    def test_board_reschedule_and_complete_update_the_same_call(self):
        self.analysis.return_value = {**ANALYSIS, "follow_up": {**ANALYSIS["follow_up"], "ambiguous": True}}
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"followup_board": True})
        cid = self.call()
        result = store.save_call_conversation(cid, 2)
        fid = result["follow_up_id"]
        r = self.client.post(f"/follow-ups/{fid}/reschedule", headers=self.as_tenant(2),
                             json={"due_at": "2026-11-04T15:00:00Z", "timezone": "UTC"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(AICall, cid).follow_up_at.day, 4)
            self.assertEqual(s.get(FollowUp, fid).schedule_status, "confirmed")
        r = self.client.post(f"/follow-ups/{fid}/complete", headers=self.as_tenant(2), json={"note": "Done"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertFalse(s.get(Lead, self.leads[2]).follow_up_needed)

    def test_client_call_uses_client_id_without_fake_lead_zero(self):
        with Session(S.ENGINE) as s:
            call = AICall(tenant_id=2, entity_type="client", entity_id=self.clients[2],
                          to_number="+525512345678", started_by=self.users[2], transcript=[])
            s.add(call)
            s.commit()
            s.refresh(call)
            cid = call.id
        result = store.save_call_conversation(cid, 2)
        self.assertTrue(result["ok"], result)
        with Session(S.ENGINE) as s:
            conv = s.get(ConversationLog, result["conversation_id"])
            self.assertIsNone(conv.lead_id)
            self.assertEqual(conv.client_id, self.clients[2])

    def test_background_call_save_rejects_wrong_tenant_and_restores_context(self):
        cid = self.call()
        current_tenant_id.set(1)
        self.assertFalse(store.save_call_conversation(cid, 3)["ok"])
        self.assertEqual(current_tenant_id.get(), 1)

    def test_resolver_requires_exact_tenant_and_unambiguous_phone(self):
        with Session(S.ENGINE) as s:
            foreign = s.get(Lead, self.leads[3])
            foreign.phone = "+14155550123"
            s.add(foreign)
            s.commit()
            self.assertIsNone(lead_calls.resolve_lead(s, lead_id=foreign.id, tenant_id=2))
            self.assertIsNone(lead_calls.resolve_lead(s, to_number=foreign.phone, tenant_id=2))
            own = s.get(Lead, self.leads[2])
            own.phone = foreign.phone
            s.add(own)
            s.commit()
            self.assertEqual(lead_calls.resolve_lead(s, to_number=foreign.phone, tenant_id=2).id, own.id)
            s.add(Lead(tenant_id=2, company_name="Duplicate phone", phone=own.phone))
            s.commit()
            self.assertIsNone(lead_calls.resolve_lead(s, to_number=own.phone, tenant_id=2))

    def test_tenant_timezone_drives_due_date(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"timezone": "America/Mexico_City"})
        conv = ConversationLog(tenant_id=2, title="Call", created_at=datetime.now(timezone.utc))
        due, status = store.resolve_due_at(conv, "2026-11-02", "15:00")
        self.assertEqual(due.hour, 21)
        self.assertEqual(status, "confirmed")
        _, status = store.resolve_due_at(conv, "2026-11-02", None)
        self.assertEqual(status, "needs_confirmation")

    def test_followup_cannot_link_unrelated_conversation(self):
        conv = self.create_conversation(analyze=False).json()["conversation"]
        r = self.client.post("/followups", headers=self.as_tenant(2), json={
            "title": "Wrong record", "client_id": self.clients[2], "conversation_id": conv["id"],
            "due_at": "2026-11-02T15:00:00Z"})
        self.assertEqual(r.status_code, 400, r.text)

    def test_same_idempotency_key_is_independent_for_each_tenant(self):
        for tid in (2, 3):
            r = self.client.post("/followups", headers=self.as_tenant(tid), json={
                "title": "Call", "lead_id": self.leads[tid], "idempotency_key": "shared-key",
                "due_at": "2026-11-02T15:00:00Z"})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertNotIn("duplicate", r.json())


class UpgradeSchema(unittest.TestCase):
    def test_existing_tables_gain_columns_and_upgrade_twice_is_safe(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE leads (id INTEGER PRIMARY KEY, company_name VARCHAR(255))"))
            conn.execute(text("INSERT INTO leads (id, company_name) VALUES (1, 'Existing customer')"))
        store.ensure_conversation_schema(engine)
        store.ensure_conversation_schema(engine)
        columns = {c["name"] for c in inspect(engine).get_columns("leads")}
        self.assertTrue({"follow_up_needed", "last_contact_at", "next_follow_up_at"} <= columns)
        with engine.connect() as conn:
            row = conn.execute(text("SELECT company_name, follow_up_needed FROM leads WHERE id=1")).one()
            self.assertEqual(tuple(row), ("Existing customer", 0))

    @unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "requires disposable Docker Postgres")
    def test_postgres_upgrades_old_tables_and_accepts_new_model_writes(self):
        S.reset_context()
        self.addCleanup(S.reset_context)
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        name = "crm_call_upgrade_" + uuid.uuid4().hex
        admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
        engine = create_engine(url.set(database=name))
        def cleanup():
            engine.dispose()
            with admin.connect() as conn:
                conn.execute(text(f'DROP DATABASE "{name}"'))
            admin.dispose()
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
        self.addCleanup(cleanup)
        with engine.begin() as conn:
            for table in ("leads", "ai_calls", "conversation_logs", "follow_ups"):
                conn.execute(text(f'CREATE TABLE "{table}" (id SERIAL PRIMARY KEY)'))
            conn.execute(text("INSERT INTO leads DEFAULT VALUES"))
        store.ensure_conversation_schema(engine)
        store.ensure_conversation_schema(engine)
        # Main's audit hook also runs in the full suite, so give it its normal supporting tables.
        SQLModel.metadata.create_all(engine)
        token = current_tenant_id.set(None)
        self.addCleanup(current_tenant_id.reset, token)
        with Session(engine) as s:
            self.assertFalse(s.get(Lead, 1).follow_up_needed)
            s.add(Tenant(id=2, name="Upgrade test"))
            s.commit()
            lead = Lead(company_name="Upgrade test", tenant_id=2, next_follow_up_at=datetime.now(timezone.utc))
            s.add(lead)
            s.commit()
            s.refresh(lead)
            self.assertIsNotNone(lead.next_follow_up_at.tzinfo)
