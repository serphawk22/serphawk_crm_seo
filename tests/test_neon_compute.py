"""Synthetic compute regressions; no real mailbox, API key, or production database."""
import json
import multiprocessing
import os
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, select
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import followups_core, inbox_sync, company_mailer
from modules.job_runtime import Guard, OwnershipLost, activity, tally
from database import (Lead, LeadNote, FollowUpNoteScan, SentEmail, EmailReply, Invoice,
                      CRMQuote, SalesOrder, PurchaseOrder, Proposal, ActivityLog)
from scripts.performance.neon_benchmark import Mailbox, measure


def _try_lock(url, key, queue):
    engine = create_engine(url)
    with Guard(engine, key) as guard:
        queue.put(guard.acquired)
    engine.dispose()


class ComputeRegressions(TenantIsolationBase):
    def test_existing_schema_does_not_install_optimization_indexes(self):
        import database
        names = ("ix_sent_emails_tenant_recipient_time", "ix_inbox_pending_classification", "ix_follow_ups_pending_reminder")
        with S.ENGINE.begin() as connection:
            for name in names:
                connection.execute(text(f"DROP INDEX {name}"))
        database.create_db_and_tables()
        with S.ENGINE.connect() as connection:
            present = set(connection.execute(text("SELECT name FROM sqlite_master WHERE type='index'")).scalars())
        self.assertTrue(present.isdisjoint(names), "existing schemas require the reviewed concurrent install")

    def test_ownership_loss_before_smtp_releases_auto_send_claim(self):
        from database import FollowUp
        with Session(S.ENGINE) as session:
            session.add(FollowUp(id=99, tenant_id=2, lead_id=self.leads[2], assigned_to=self.users[2], title="Synthetic",
                due_at=datetime.now(timezone.utc)-timedelta(minutes=1), auto_send=True,
                contact_email="synthetic@example.test", email_body="Synthetic", email_subject="Synthetic"))
            session.commit()
        with mock.patch.object(company_mailer, "resolve_account", return_value=mock.Mock()), \
             mock.patch.object(company_mailer, "user_signature", return_value=""), \
             mock.patch.object(company_mailer, "send_and_record", side_effect=OwnershipLost("Synthetic")):
            with self.assertRaises(OwnershipLost):
                followups_core.process_auto_sends(S.ENGINE)
        with Session(S.ENGINE) as session:
            follow_up = session.get(FollowUp, 99)
            self.assertTrue(follow_up.auto_send)
            self.assertIsNone(follow_up.email_sent_at)

    def test_resource_contention_and_exception_release(self):
        with Guard(S.ENGINE, "one") as first:
            self.assertTrue(first.acquired)
            with Guard(S.ENGINE, "one") as second:
                self.assertFalse(second.acquired)
            with Guard(S.ENGINE, "two") as other:
                self.assertTrue(other.acquired)
        with self.assertRaisesRegex(ValueError, "synthetic"):
            with Guard(S.ENGINE, "one"):
                raise ValueError("synthetic")
        with Guard(S.ENGINE, "one") as recovered:
            self.assertTrue(recovered.acquired)

    def test_activity_contains_counts_without_sql_or_parameters(self):
        with mock.patch("builtins.print") as output:
            with activity("synthetic", S.ENGINE):
                with S.ENGINE.connect() as connection:
                    connection.execute(text("SELECT :secret"), {"secret": "private-value"})
                tally(examined=4, changed=1)
        payload = json.loads(output.call_args.args[0].removeprefix("[job] "))
        self.assertEqual((payload["queries"], payload["examined"], payload["changed"]), (1, 4, 1))
        self.assertNotIn("private-value", output.call_args.args[0])
        self.assertNotIn("SELECT", output.call_args.args[0])

    def test_scanned_notes_do_not_hide_older_unscanned_notes_or_other_tenants(self):
        now = datetime.now(timezone.utc)
        with Session(S.ENGINE) as session:
            for i in range(60):
                session.add(LeadNote(id=100+i, tenant_id=2, lead_id=self.leads[2], content="Scanned", created_at=now))
                session.add(FollowUpNoteScan(tenant_id=2, source_key=f"leadnote-{100+i}", scanned_at=now))
                session.add(LeadNote(id=300+i, tenant_id=3, lead_id=self.leads[3], content="Other company", created_at=now))
            session.add(LeadNote(id=200, tenant_id=2, lead_id=self.leads[2], content="Not yet scanned", created_at=now-timedelta(hours=1)))
            session.commit()
        extractor = mock.Mock(return_value={"should_follow_up": False})
        result = followups_core.scan_notes(S.ENGINE, tenant_id=2, extractor=extractor)
        self.assertEqual(result["scanned"], 1)
        self.assertEqual(extractor.call_args.args[0], "Not yet scanned")
        self.assertEqual(followups_core.scan_notes(S.ENGINE, tenant_id=2, extractor=extractor)["scanned"], 0)

    def test_known_reply_scan_is_batched_and_never_fetches_bodies(self):
        from modules import email_sender
        with Session(S.ENGINE) as session:
            session.add(SentEmail(id=99, tenant_id=2, to_email="prospect@example.test", subject="Synthetic"))
            session.commit()
            session.add_all([EmailReply(tenant_id=2, sent_email_id=99, message_id=f"<bench-{i}@example.test>") for i in range(1, 1001)])
            session.commit()
        mailbox = Mailbox()
        stats = measure(lambda: email_sender._process_inbox_replies(mailbox, "sender@example.test", 5, tenant_id=2), repeats=1)
        self.assertEqual(stats["queries"], [2])
        self.assertEqual(mailbox.body_fetches, 0)

    def test_reply_imap_fetches_have_no_open_sql_transaction(self):
        from modules import email_sender
        with Session(S.ENGINE) as session:
            session.add(SentEmail(tenant_id=2, to_email="prospect@example.test", subject="Synthetic"))
            session.commit()
        transactions = set()
        def begin(connection):
            transactions.add(id(connection))
        def end(connection):
            transactions.discard(id(connection))
        for name, fn in (("begin", begin), ("commit", end), ("rollback", end)):
            event.listen(S.ENGINE, name, fn)
            self.addCleanup(event.remove, S.ENGINE, name, fn)
        mailbox = Mailbox(3)
        original = mailbox.fetch
        def fetch(*args):
            self.assertFalse(transactions, "IMAP must not hold a SQL transaction")
            return original(*args)
        mailbox.fetch = fetch
        self.assertEqual(email_sender._process_inbox_replies(mailbox, "sender@example.test", 5, tenant_id=2), 3)

    def test_failed_body_fetch_is_retried_and_missing_message_id_is_not_dropped(self):
        from modules import email_sender
        with Session(S.ENGINE) as session:
            session.add(SentEmail(tenant_id=2, to_email="prospect@example.test", subject="Synthetic"))
            session.commit()
        mailbox = Mailbox(1)
        original = mailbox.fetch
        def failed(uid, spec):
            return original(uid, spec) if "HEADER" in spec else ("NO", [])
        mailbox.fetch = failed
        self.assertEqual(email_sender._process_inbox_replies(mailbox, "sender@example.test", 5, tenant_id=2), 0)
        mailbox.fetch = original
        self.assertEqual(email_sender._process_inbox_replies(mailbox, "sender@example.test", 5, tenant_id=2), 1)
        mailbox.raws["1"] = mailbox.raws["1"].replace(b"Message-ID: <bench-1@example.test>\n", b"")
        self.assertEqual(email_sender._process_inbox_replies(mailbox, "sender@example.test", 5, tenant_id=2), 1)

    def test_manual_sync_and_classifier_respect_background_resource_guards(self):
        from modules import email_ai
        from modules.job_runtime import mailbox_resource
        cfg = inbox_sync.MailboxConfig("user@example.test", "user@example.test", "fake", "imap.example.test", 2, True)
        connect = mock.Mock()
        with Guard(S.ENGINE, mailbox_resource(cfg)):
            result = inbox_sync.sync_mailbox(cfg, S.ENGINE, connect=connect)
        self.assertIn("already running", result["error"])
        connect.assert_not_called()
        with Guard(S.ENGINE, "inbox-classification"), mock.patch.object(email_ai, "classify_batch") as classify:
            self.assertEqual(email_ai.classify_pending(S.ENGINE), 0)
            classify.assert_not_called()

    def test_live_campaign_is_not_failed_by_another_process_resumer(self):
        from database import EmailCampaign, EmailCampaignRecipient
        from modules import email_campaign_worker
        with Session(S.ENGINE) as session:
            session.add(EmailCampaign(id=99, tenant_id=2, name="Synthetic", subject_template="Test", body_template="Test", status="Sending"))
            session.commit()
            session.add(EmailCampaignRecipient(id=99, tenant_id=2, campaign_id=99, row_number=1, email="synthetic@example.test",
                status="Sending", claimed_at=datetime.now(timezone.utc)-timedelta(hours=1)))
            session.commit()
        with Guard(S.ENGINE, "campaign:99"), mock.patch.object(email_campaign_worker, "start_campaign", return_value=False):
            email_campaign_worker.resume_campaigns(S.ENGINE)
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(EmailCampaignRecipient, 99).status, "Sending")

    def test_smtp_arguments_do_not_reload_expired_objects(self):
        from modules.company_mailer import MailAccount
        # A scalar tracking ID must be captured before commit's expire-on-commit.
        with Session(S.ENGINE) as session:
            account = mock.Mock(spec=MailAccount)
            account.email, account.source = "sender@example.test", "user_integration"
            def sender(*args, **kwargs):
                self.assertFalse(session.in_transaction())
                self.assertIsInstance(kwargs["tracking_id"], int)
            company_mailer.send_and_record(session, account, tenant_id=2, to="prospect@example.test",
                                          subject="Synthetic", body="Synthetic", sender=sender)

    def test_batched_address_matching_preserves_tenant_and_precedence(self):
        with Session(S.ENGINE) as session:
            session.add(Lead(tenant_id=2, email="MATCH@example.test", company_name="First"))
            session.add(Lead(tenant_id=2, email="match@example.test", company_name="Latest"))
            session.add(Lead(tenant_id=3, email="match@example.test", company_name="Other"))
            session.commit()
            pairs = [("match@example.test", 2), ("match@example.test", 3), ("absent@example.test", 2)]
            expected = {pair: inbox_sync.match_address(session, *pair) for pair in pairs}
            self.assertEqual(inbox_sync.match_addresses(session, pairs), expected)

    def test_aggregate_dashboard_retains_baseline_contract(self):
        # The benchmark fixture's full response is also compared by the runner.
        response = self.client.get("/dashboard-stats", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["total"], data["active"], data["totalQuotesCount"]), (1, 1, 0))
        self.assertEqual(len(data["chartLabels"]), 7)
        self.assertEqual(len(data["revenueData"]), 6)

    def test_aggregate_dashboard_billing_and_date_boundaries(self):
        now = datetime.now(timezone.utc)
        with Session(S.ENGINE) as session:
            session.add(Invoice(tenant_id=2, client_id=self.clients[2], invoice_number="SYN-1", total=125, status="Paid", created_at=now))
            session.add(Invoice(tenant_id=3, client_id=self.clients[3], invoice_number="SYN-2", total=900, status="Paid", created_at=now))
            session.add(Proposal(tenant_id=2, client_id=self.clients[2], title="Open", total_value=250, status="Draft"))
            session.add(ActivityLog(tenant_id=2, action="Today", createdAt=now))
            session.add(ActivityLog(tenant_id=2, action="Old", createdAt=now-timedelta(days=20)))
            session.commit()
        data = self.client.get("/dashboard-stats", headers=self.as_tenant(2)).json()
        self.assertEqual((data["revenue"], data["pipelineValue"], data["totalActivities"]), (125, 250, 2))
        self.assertEqual(sum(data["activityChart"]), 1)
        self.assertEqual(data["revenueData"][-1]["revenue"], 125)


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Requires throwaway PostgreSQL")
class JobLocksPostgres(unittest.TestCase):
    def setUp(self):
        self.url = os.environ["TEST_POSTGRES_URL"]
        self.engine = create_engine(self.url)
        self.addCleanup(self.engine.dispose)

    def test_other_process_cannot_enter_and_recovers_after_release(self):
        context = multiprocessing.get_context("spawn")
        queue = context.Queue()
        with Guard(self.engine, "neon-test-exclusive") as owner:
            self.assertTrue(owner.acquired)
            worker = context.Process(target=_try_lock, args=(self.url, "neon-test-exclusive", queue))
            worker.start()
            self.assertFalse(queue.get(timeout=30))
            worker.join(30)
            self.assertEqual(worker.exitcode, 0)
            with self.engine.connect() as connection:
                state = connection.execute(text("SELECT state FROM pg_stat_activity WHERE pid=:pid"), {"pid": owner.pid}).scalar_one()
            self.assertEqual(state, "idle")
        with Guard(self.engine, "neon-test-exclusive") as recovered:
            self.assertTrue(recovered.acquired)
        queue.close()

    def test_connection_loss_fails_closed_and_allows_takeover(self):
        with Guard(self.engine, "neon-test-lost") as owner:
            with self.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as control:
                control.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": owner.pid})
            with self.assertRaises(OwnershipLost):
                owner.check()
            with Guard(self.engine, "neon-test-lost") as replacement:
                self.assertTrue(replacement.acquired)


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Requires throwaway PostgreSQL")
class ComputeQueriesPostgres(unittest.TestCase):
    def test_aggregate_and_note_queries_with_and_without_rls(self):
        from sqlmodel import SQLModel
        from database import Tenant, ClientProfile, User
        from modules import rls, dashboard
        base = make_url(os.environ["TEST_POSTGRES_URL"])
        admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        self.addCleanup(admin.dispose)
        with admin.connect() as connection:
            connection.execute(text("DROP DATABASE IF EXISTS crm_neon_query_test WITH (FORCE)"))
            connection.execute(text("CREATE DATABASE crm_neon_query_test"))
            if not connection.execute(text("SELECT 1 FROM pg_roles WHERE rolname='crm_compute_app'")).first():
                connection.execute(text("CREATE ROLE crm_compute_app LOGIN PASSWORD 'local-test-only' NOSUPERUSER NOBYPASSRLS"))
        owner = create_engine(base.set(database="crm_neon_query_test"))
        self.addCleanup(owner.dispose)
        SQLModel.metadata.create_all(owner)
        now = datetime.now(timezone.utc)
        with Session(owner) as session:
            session.add_all([Tenant(id=2, name="Synthetic 2"), Tenant(id=3, name="Synthetic 3")])
            session.commit()
            for tid in (2, 3):
                session.add(ClientProfile(tenant_id=tid, companyName="Synthetic"))
                session.add(Lead(id=tid, tenant_id=tid, company_name="Synthetic", status="New", source="Web"))
                session.add(SentEmail(tenant_id=tid, subject="Synthetic", to_email="synthetic@example.test", sent_at=now))
                session.add(LeadNote(tenant_id=tid, lead_id=tid, content="Synthetic", created_at=now))
            session.commit()
        with owner.begin() as connection:
            connection.execute(text("GRANT ALL ON ALL TABLES IN SCHEMA public TO crm_compute_app"))
            connection.execute(text("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO crm_compute_app"))
        app = create_engine(base.set(database="crm_neon_query_test", username="crm_compute_app", password="local-test-only"))
        self.addCleanup(app.dispose)
        def tenant_context(connection):
            connection.exec_driver_sql("SELECT set_config('app.tenant_id', '2', true), set_config('app.bypass_rls', 'off', true)")
        event.listen(app, "begin", tenant_context)
        S.reset_context()
        for enforce in (False, True):
            if enforce:
                rls.enable_rls(owner)
            with Session(app) as session:
                data = dashboard.admin_summary(session, 2, {"leads": True})
                self.assertEqual((data["total"], data["totalEmailsSent"]), (1, 1))
                self.assertEqual(sum(data["emailChart"]), 1)
                self.assertEqual(sum(row["value"] for row in data["operations"]["leadStages"]), 1)
                notes = followups_core._note_items(session, now-timedelta(days=1), tenant_id=2)
                self.assertEqual(len(notes), 1)
                self.assertEqual(notes[0][1], 2)
        app.dispose()
        owner.dispose()
        with admin.connect() as connection:
            connection.execute(text("DROP DATABASE crm_neon_query_test WITH (FORCE)"))
