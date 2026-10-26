"""scripts/migration/import_tenant.py: move one client's data into a tenant of the shared database."""
import os
import unittest
import unittest.mock
from datetime import datetime, timezone

from sqlalchemy import Integer, func, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import addons  # noqa: F401  (registers the add-on tables)
from addons.business_suite.models import LeadSource, OwnershipHistory
from addons.institute.models import Course, Student
from database import ClientProfile, Deal, FollowUp, FollowUpNoteScan, Lead, Task, Tenant, TenantFeature, User
from modules import features
from scripts.migration.import_tenant import ImportConflict, import_tenant


def make_engine():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    import warnings
    from sqlalchemy.exc import SAWarning
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SAWarning)
        SQLModel.metadata.create_all(e)
    return e


def one(s, model, **where):
    stmt = select(model).execution_options(skip_tenant=True)
    for k, v in where.items():
        stmt = stmt.where(getattr(model, k) == v)
    return s.exec(stmt).one()


class ImportBase(unittest.TestCase):
    def new_engines(self):
        return make_engine(), make_engine()

    def after_seed(self):
        """Hook for databases whose id sequences must catch up with explicitly seeded ids."""

    def setUp(self):
        self.src, self.tgt = self.new_engines()
        self.addCleanup(self.src.dispose)
        self.addCleanup(self.tgt.dispose)
        self.seed_source()
        self.seed_target()
        self.after_seed()
        features.invalidate()

    def seed_source(self):
        with Session(self.src) as s:
            s.add_all([Tenant(id=7, name="fork-client"), Tenant(id=8, name="other-client")])
            s.commit()
            s.add_all([
                User(id=1, email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None),
                User(id=10, email="admin@fork.test", password="hash-admin", name="Admin Fork", role="Admin", tenant_id=7),
                User(id=11, email="rep@fork.test", password="hash-rep", name="Rep Fork", role="SalesManager", tenant_id=7),
                User(id=20, email="admin@other.test", password="x", name="Admin Other", role="Admin", tenant_id=8),
            ])
            s.commit()
            s.add_all([LeadSource(id=3, tenant_id=7, name="Facebook"), Course(id=5, tenant_id=7, title="Python"),
                       Course(id=6, tenant_id=8, title="Other course")])
            s.commit()
            s.add_all([
                ClientProfile(id=100, tenant_id=7, companyName="Client One", assignedEmployeeId=11),
                ClientProfile(id=101, tenant_id=7, companyName="Client Two", assignedEmployeeId=20),   # points at another client's user
                ClientProfile(id=102, tenant_id=8, companyName="Foreign Client"),
            ])
            s.commit()
            s.add_all([
                Lead(id=200, tenant_id=7, company_name="Lead A", owner_id=11, lead_source_id=3, course_interest_id=5),
                Lead(id=201, tenant_id=7, company_name="Lead B", owner_id=20),                          # owner belongs to client 8
                Lead(id=202, tenant_id=8, company_name="Foreign Lead", owner_id=20),
                Lead(id=203, tenant_id=None, company_name="Legacy Lead"),
            ])
            s.commit()
            s.add(Student(id=300, tenant_id=7, name="Asha", lead_id=200))
            s.add(Deal(id=400, tenant_id=7, title="Big deal", value=10.0, stage="Closed Won", client_id=100, assigned_to=11))
            s.commit()
            s.add(Task(id=500, tenant_id=7, title="Welcome call", assigned_to=11, created_by=10, student_id=300, lead_id=200))
            s.add(FollowUp(id=600, tenant_id=7, title="Call back", lead_id=200, assigned_to=11, created_by=10,
                           due_at=datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)))
            s.add(OwnershipHistory(id=700, tenant_id=7, entity_type="lead", entity_id=200, to_user_id=11, changed_by=10))
            s.commit()
            # older code (sqlmodel 0.0.34) stored naive timestamps: rewrite the value the way such a deployment has it
            s.exec(text("UPDATE follow_ups SET due_at = '2026-11-01 09:00:00.000000' WHERE id = 600"))
            s.commit()

    def seed_target(self):
        with Session(self.tgt) as s:
            s.add(Tenant(id=2, name="existing-client"))
            s.commit()
            s.add_all([User(id=1, email="boss@existing.test", password="x", name="Boss", role="Admin", tenant_id=2),
                       User(id=2, email="rep@existing.test", password="x", name="Rep", role="SalesManager", tenant_id=2)])
            s.commit()
            s.add_all([Lead(id=1, tenant_id=2, company_name="Existing lead 1", owner_id=1),
                       Lead(id=2, tenant_id=2, company_name="Existing lead 2", owner_id=2),
                       Lead(id=200, tenant_id=2, company_name="Existing lead 200", owner_id=1)])   # same id as an imported lead
            s.commit()

    def run_import(self, **kw):
        args = dict(source_tenant_id=7, tenant_name="forkclient", log=lambda *_: None)
        args.update(kw)
        return import_tenant(self.src, self.tgt, **args)

    def target_counts(self):
        with Session(self.tgt) as s:
            return {m.__tablename__: s.exec(select(func.count()).select_from(m).execution_options(skip_tenant=True)).one()
                    for m in (User, Lead, ClientProfile, Task, FollowUp, Tenant)}


class Import(ImportBase):
    def test_everything_is_remapped_and_nothing_collides(self):
        before_existing = None
        with Session(self.tgt) as s:
            before_existing = [(l.id, l.company_name, l.owner_id) for l in s.exec(select(Lead).where(Lead.tenant_id == 2).execution_options(skip_tenant=True)).all()]
        report = self.run_import(preset="bpo", business_name="Fork Client")
        self.assertEqual(report.fk_violations, {})
        tid = report.tenant_id
        with Session(self.tgt) as s:
            # the existing client is untouched, including the id that collides with an imported lead
            after_existing = [(l.id, l.company_name, l.owner_id) for l in s.exec(select(Lead).where(Lead.tenant_id == 2).execution_options(skip_tenant=True)).all()]
            self.assertEqual(before_existing, after_existing)

            users = {u.email: u for u in s.exec(select(User).where(User.tenant_id == tid).execution_options(skip_tenant=True)).all()}
            self.assertEqual(set(users), {"admin@fork.test", "rep@fork.test"})        # no SuperAdmin, no other client's admin
            self.assertEqual(users["rep@fork.test"].password, "hash-rep")               # password hashes travel unchanged
            self.assertNotIn(users["rep@fork.test"].id, (1, 2))

            leads = {l.company_name: l for l in s.exec(select(Lead).where(Lead.tenant_id == tid).execution_options(skip_tenant=True)).all()}
            self.assertEqual(set(leads), {"Lead A", "Lead B"})                           # not the foreign / legacy ones
            self.assertEqual(leads["Lead A"].owner_id, users["rep@fork.test"].id)
            self.assertIsNone(leads["Lead B"].owner_id)                                  # owner was another client's user

            # soft references (plain integer columns) follow the new ids
            src = one(s, LeadSource, tenant_id=tid)
            course = one(s, Course, tenant_id=tid)
            self.assertEqual((leads["Lead A"].lead_source_id, leads["Lead A"].course_interest_id), (src.id, course.id))
            student = one(s, Student, tenant_id=tid)
            self.assertEqual(student.lead_id, leads["Lead A"].id)
            task = one(s, Task, tenant_id=tid)
            self.assertEqual((task.student_id, task.lead_id, task.assigned_to, task.created_by),
                             (student.id, leads["Lead A"].id, users["rep@fork.test"].id, users["admin@fork.test"].id))
            fu = one(s, FollowUp, tenant_id=tid)
            self.assertEqual((fu.lead_id, fu.assigned_to, fu.created_by),
                             (leads["Lead A"].id, users["rep@fork.test"].id, users["admin@fork.test"].id))
            self.assertIsNotNone(fu.due_at.tzinfo)                                       # naive timestamps become UTC
            hist = one(s, OwnershipHistory, tenant_id=tid)                               # polymorphic entity_id
            self.assertEqual((hist.entity_id, hist.to_user_id), (leads["Lead A"].id, users["rep@fork.test"].id))
            clients = {c.companyName: c for c in s.exec(select(ClientProfile).where(ClientProfile.tenant_id == tid).execution_options(skip_tenant=True)).all()}
            self.assertEqual(clients["Client One"].assignedEmployeeId, users["rep@fork.test"].id)
            self.assertIsNone(clients["Client Two"].assignedEmployeeId)
            deal = one(s, Deal, tenant_id=tid)
            self.assertEqual((deal.client_id, deal.assigned_to), (clients["Client One"].id, users["rep@fork.test"].id))

            # nothing of the other client's data came along
            self.assertEqual(s.exec(select(func.count()).select_from(Lead).where(Lead.company_name == "Foreign Lead").execution_options(skip_tenant=True)).one(), 0)
        # the preset was applied
        self.assertTrue(report.preset["features"]["finance_suite"])
        with Session(self.tgt) as s:
            rows = {r.feature_key: r.enabled for r in s.exec(select(TenantFeature).where(TenantFeature.tenant_id == tid).execution_options(skip_tenant=True)).all()}
        self.assertTrue(rows["finance_suite"])
        self.assertFalse(rows["voice_agent"])
        self.assertEqual(report.tables["leads"].copied, 2)
        self.assertEqual(report.tables["users"].copied, 2)
        self.assertEqual(report.tables["leads"].dangling.get("owner_id"), 1)

    def test_dry_run_leaves_the_target_untouched(self):
        before = self.target_counts()
        report = self.run_import(dry_run=True)
        self.assertEqual(self.target_counts(), before)
        self.assertGreater(report.tables["leads"].copied, 0)

    def test_second_import_needs_replace_and_never_duplicates(self):
        self.run_import()
        counts = self.target_counts()
        with self.assertRaises(ImportConflict):
            self.run_import()
        self.assertEqual(self.target_counts(), counts)
        self.run_import(replace=True)
        self.assertEqual(self.target_counts(), counts)

    def test_null_tenant_rows_only_with_the_flag(self):
        r = self.run_import(include_null_tenant=True)
        with Session(self.tgt) as s:
            names = {l.company_name for l in s.exec(select(Lead).where(Lead.tenant_id == r.tenant_id).execution_options(skip_tenant=True)).all()}
        self.assertEqual(names, {"Lead A", "Lead B", "Legacy Lead"})


class EmailConflicts(ImportBase):
    def setUp(self):
        super().setUp()
        with Session(self.tgt) as s:
            s.add(User(email="Rep@Fork.test", password="x", name="Same person elsewhere", role="Employee", tenant_id=2))
            s.commit()

    def test_default_is_to_stop_and_leave_nothing_behind(self):
        before = self.target_counts()
        with self.assertRaises(ImportConflict):
            self.run_import()
        self.assertEqual(self.target_counts(), before)

    def test_skip_drops_the_user_and_nulls_references(self):
        r = self.run_import(email_conflict="skip")
        with Session(self.tgt) as s:
            self.assertEqual({u.email for u in s.exec(select(User).where(User.tenant_id == r.tenant_id).execution_options(skip_tenant=True)).all()},
                             {"admin@fork.test"})
            lead_a = one(s, Lead, tenant_id=r.tenant_id, company_name="Lead A")
            self.assertIsNone(lead_a.owner_id)
        self.assertEqual(r.email_conflicts, ["rep@fork.test"])

    def test_rename_keeps_both_accounts(self):
        r = self.run_import(email_conflict="rename")
        with Session(self.tgt) as s:
            emails = {u.email for u in s.exec(select(User).where(User.tenant_id == r.tenant_id).execution_options(skip_tenant=True)).all()}
        self.assertEqual(emails, {"admin@fork.test", "rep+forkclient@fork.test"})


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "needs the local Postgres (docker compose run --rm test)")
class PostgresImport(Import):
    """The same scenarios on real PostgreSQL: sequences, strict foreign keys and the leads / clients cycle."""

    def new_engines(self):
        base = make_url(os.environ["TEST_POSTGRES_URL"])
        admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        engines = []
        with admin.connect() as c:
            for name in ("crm_mig_src", "crm_mig_tgt"):
                c.execute(text(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)"))
                c.execute(text(f"CREATE DATABASE {name}"))
                e = create_engine(base.set(database=name))
                import warnings
                from sqlalchemy.exc import SAWarning
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", SAWarning)
                    SQLModel.metadata.create_all(e)
                engines.append(e)
        admin.dispose()
        return engines[0], engines[1]

    def after_seed(self):
        # rows were seeded with explicit ids: move every sequence past them, like a database that has been in use
        for engine in (self.src, self.tgt):
            with engine.begin() as c:
                for t in SQLModel.metadata.sorted_tables:
                    if "id" in t.c and t.c.id.primary_key and isinstance(t.c.id.type, Integer):
                        c.execute(text(
                            f"SELECT setval(pg_get_serial_sequence('\"{t.name}\"', 'id'), COALESCE((SELECT MAX(id) FROM \"{t.name}\"), 1))"))

    def seed_source(self):
        super().seed_source()

    def test_naive_timestamps_become_utc_on_postgres(self):
        report = self.run_import()
        with Session(self.tgt) as s:
            fu = one(s, FollowUp, tenant_id=report.tenant_id)
        self.assertIsNotNone(fu.due_at.tzinfo)


class Compare(ImportBase):
    def test_reports_matching_numbers_and_flags_differences(self):
        from scripts.migration.compare_tenant import compare
        r = self.run_import(include_null_tenant=False, email_conflict="rename")
        result = compare(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient")
        # the SuperAdmin is deliberately not imported, and the legacy lead has no tenant: users differ only if counted
        self.assertTrue(result["tables"]["leads"]["same"], result["tables"]["leads"])
        self.assertEqual(result["tables"]["leads"]["target"], 2)
        self.assertTrue(result["breakdowns"]["deals"]["same"], result["breakdowns"]["deals"])
        # now make the target drift and the comparison must notice
        with Session(self.tgt) as s:
            lead = s.exec(select(Lead).where(Lead.tenant_id == r.tenant_id).execution_options(skip_tenant=True)).first()
            lead.status = "Lost"
            s.add(lead)
            s.commit()
        drifted = compare(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient")
        self.assertFalse(drifted["all_same"])
        self.assertFalse(drifted["breakdowns"]["leads"]["same"])


class CommandLine(ImportBase):
    def test_refuses_same_source_and_target_and_unconfirmed_writes(self):
        from scripts.migration import import_tenant as mod
        self.assertEqual(mod.main(["--source", "sqlite:///a.db", "--target", "sqlite:///a.db", "--tenant-name", "x"]), 2)
        self.assertEqual(mod.main(["--source", "sqlite:///a.db", "--target", "postgresql://u:p@localhost/db", "--tenant-name", "x"]), 2)


class ForeignFollowUpShapes(unittest.TestCase):
    """A deployment whose follow-up table differs from the shared one is translated, not silently dropped."""

    def setUp(self):
        self.src, self.tgt = make_engine(), make_engine()
        self.addCleanup(self.src.dispose)
        self.addCleanup(self.tgt.dispose)
        with Session(self.src) as s:
            s.add(Tenant(id=7, name="fork"))
            s.commit()
            s.add(User(id=10, email="rep@fork.test", password="x", name="Rep", role="SalesManager", tenant_id=7))
            s.add(Lead(id=5, company_name="Acme", tenant_id=7, owner_id=10))
            s.commit()
        features.invalidate()

    def run_import(self, **kw):
        report = import_tenant(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient", log=lambda *a: None, **kw)
        self.assertEqual(report.fk_violations, {})
        return report

    def target_rows(self):
        with Session(self.tgt) as s:
            return s.exec(select(FollowUp).order_by(FollowUp.id).execution_options(skip_tenant=True)).all()

    def test_scm_bpo_shape_is_translated(self):
        with self.src.begin() as c:
            c.execute(text("DROP TABLE follow_ups"))
            c.execute(text("""CREATE TABLE follow_ups (id INTEGER PRIMARY KEY, tenant_id INTEGER, title VARCHAR(500), notes TEXT,
                channel VARCHAR(30), priority VARCHAR(20), status VARCHAR(20), due_at TIMESTAMP, timezone VARCHAR(64),
                reminder_minutes INTEGER, reminder_sent_at TIMESTAMP, overdue_notified_at TIMESTAMP, completed_at TIMESTAMP,
                completion_note TEXT, lead_id INTEGER, client_id INTEGER, contact_id INTEGER, owner_id INTEGER, created_by INTEGER,
                created_at TIMESTAMP, updated_at TIMESTAMP)"""))
            c.execute(text("""INSERT INTO follow_ups (id, tenant_id, title, notes, channel, priority, status, due_at, timezone, reminder_minutes,
                completion_note, lead_id, owner_id, created_by, created_at) VALUES
                (1, 7, 'Call Acme', 'ask about price', 'Walk-in', 'Urgent', 'In Progress', '2031-05-01 04:30:00', 'Asia/Kolkata', 90, NULL, 5, 10, 10, '2031-04-01 00:00:00'),
                (2, 7, 'Undated', NULL, 'Email', 'Medium', 'Overdue', NULL, NULL, 0, 'was closed by phone', NULL, 10, 10, '2031-04-02 00:00:00')"""))
        self.run_import()
        a, b = self.target_rows()
        user_id = None
        with Session(self.tgt) as s:
            user_id = s.exec(select(User).where(User.email == "rep@fork.test").execution_options(skip_tenant=True)).one().id
            lead_id = s.exec(select(Lead).where(Lead.company_name == "Acme").execution_options(skip_tenant=True)).one().id
        self.assertEqual((a.assigned_to, a.created_by, a.lead_id), (user_id, user_id, lead_id), "owner follows the user's new id")
        self.assertEqual((a.channel, a.priority, a.status, a.timezone), ("walk-in", "urgent", "In Progress", "Asia/Kolkata"))
        self.assertEqual(a.due_at - a.remind_at, __import__("datetime").timedelta(minutes=90), "reminder_minutes becomes remind_at")
        self.assertEqual(b.assigned_to, user_id)
        self.assertEqual(b.outcome, "was closed by phone", "completion_note becomes outcome")
        self.assertEqual(b.status, "Pending", "a stored Overdue is derived now")
        self.assertEqual(b.due_at, b.created_at, "an undated follow-up gets its creation date (the shared table needs one)")

    def _make_hb_source(self):
        """SCM HB: the real follow-ups sit in crm_follow_ups; an unrelated older follow_ups table may sit next to them."""
        with self.src.begin() as c:
            c.execute(text("ALTER TABLE follow_ups RENAME TO crm_follow_ups"))
            c.execute(text("CREATE TABLE follow_ups (id INTEGER PRIMARY KEY, tenant_id INTEGER, legacy_text TEXT)"))
            c.execute(text("INSERT INTO follow_ups (id, tenant_id, legacy_text) VALUES (1, 7, 'an unrelated older table')"))
            c.execute(text("""INSERT INTO crm_follow_ups (id, tenant_id, title, channel, due_at, status, assigned_to, lead_id, priority,
                source, auto_send, created_at, updated_at) VALUES (1, 7, 'Call the student', 'call', '2031-05-01 04:30:00', 'Pending', 10, 5,
                'medium', 'manual', 0, '2031-04-01 00:00:00', '2031-04-01 00:00:00')"""))

    def test_scm_hb_crm_follow_ups_is_read_as_follow_ups_without_a_flag(self):
        self._make_hb_source()
        report = self.run_import()                                  # no table_map: follow_ups is the one standard name
        rows = self.target_rows()
        self.assertEqual([r.title for r in rows], ["Call the student"], "the real table is read, the unrelated older one is ignored")
        self.assertIsNotNone(rows[0].assigned_to)
        self.assertIn("crm_follow_ups", report.tables["follow_ups"].note)

    def test_scm_hb_without_an_older_follow_ups_table(self):
        with self.src.begin() as c:
            c.execute(text("ALTER TABLE follow_ups RENAME TO crm_follow_ups"))
            c.execute(text("""INSERT INTO crm_follow_ups (id, tenant_id, title, channel, due_at, status, assigned_to, priority,
                source, auto_send, created_at, updated_at) VALUES (1, 7, 'Only one', 'call', '2031-05-01 04:30:00', 'Pending', 10,
                'medium', 'manual', 0, '2031-04-01 00:00:00', '2031-04-01 00:00:00')"""))
        self.run_import()
        self.assertEqual([r.title for r in self.target_rows()], ["Only one"])

    def test_an_explicit_table_map_still_works_and_wins(self):
        self._make_hb_source()
        self.run_import(table_map={"follow_ups": "crm_follow_ups"})
        self.assertEqual([r.title for r in self.target_rows()], ["Call the student"])

    def test_the_note_scan_ledger_is_not_copied(self):
        # its keys ("note-12") name source row ids that are renumbered, and its source_key is unique database-wide
        with self.src.begin() as c:
            c.execute(text("INSERT INTO follow_up_note_scans (id, tenant_id, source_key, scanned_at) VALUES (1, 7, 'note-12', '2031-04-01 00:00:00')"))
        self.run_import()
        with Session(self.tgt) as s:
            self.assertEqual(s.exec(select(FollowUpNoteScan).execution_options(skip_tenant=True)).all(), [])

    def test_resolve_table_map(self):
        from scripts.migration.import_tenant import resolve_table_map
        self.assertEqual(resolve_table_map({"leads", "crm_follow_ups"}), {"follow_ups": "crm_follow_ups"})
        self.assertEqual(resolve_table_map({"leads", "follow_ups"}), {})
        self.assertEqual(resolve_table_map({"crm_follow_ups"}, {"follow_ups": "other"}), {"follow_ups": "other"}, "explicit wins")
        self.assertEqual(resolve_table_map({"crm_follow_up_note_scans"}), {"follow_up_note_scans": "crm_follow_up_note_scans"})

    def test_compare_and_audit_understand_the_hb_name(self):
        from scripts.migration import compare_tenant, inspect_source
        self._make_hb_source()
        self.run_import()
        result = compare_tenant.compare(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient")
        self.assertTrue(result["tables"]["follow_ups"]["same"], result["tables"]["follow_ups"])
        report = inspect_source.inspect(self.src, source_tenant=7)
        status = {t["table"]: t["status"] for t in report["tables"]}
        self.assertEqual(status["crm_follow_ups"], "translated")
        self.assertEqual(status["follow_ups"], "skipped on purpose", "the unrelated older table is reported as left behind")

    def test_a_table_map_to_a_missing_table_is_refused(self):
        with self.assertRaises(ValueError):
            self.run_import(table_map={"follow_ups": "no_such_table"})

    def test_urls_can_come_from_the_environment(self):
        from scripts.migration import import_tenant as mod
        with __import__("unittest").mock.patch.dict(os.environ, {"SRC_URL": "sqlite:///same.db", "TGT_URL": "sqlite:///same.db"}):
            self.assertEqual(mod.main(["--source-env", "SRC_URL", "--target-env", "TGT_URL", "--tenant-name", "x"]), 2, "same db is refused")
        self.assertEqual(mod.main(["--tenant-name", "x"]), 2, "no databases given")
        self.assertEqual(mod.main(["--source", "sqlite:///a.db", "--target", "sqlite:///b.db", "--tenant-name", "x", "--table-map", "oops"]), 2)


class RealDataEdgeCases(unittest.TestCase):
    """Things the clients' live databases did that tidy test data never did."""

    def setUp(self):
        self.src, self.tgt = make_engine(), make_engine()
        self.addCleanup(self.src.dispose)
        self.addCleanup(self.tgt.dispose)
        with Session(self.src) as s:
            s.add(Tenant(id=7, name="fork"))
            s.commit()
            s.add(User(id=10, email="rep@fork.test", password="x", name="Rep", role="SalesManager", tenant_id=7))
            s.add(User(id=11, email="root@fork.test", password="x", name="Operator", role="SuperAdmin", tenant_id=7))
            s.commit()
        features.invalidate()

    def run_import(self):
        return import_tenant(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient", log=lambda *a: None)

    def test_an_explicit_null_in_a_required_column_takes_the_columns_default(self):
        # SCM BPO's follow-ups have a nullable `source`; the shared table requires one
        with self.src.begin() as c:
            c.execute(text("DROP TABLE follow_ups"))
            c.execute(text("""CREATE TABLE follow_ups (id INTEGER PRIMARY KEY, tenant_id INTEGER, title VARCHAR(500), channel VARCHAR(30),
                priority VARCHAR(20), status VARCHAR(20), due_at TIMESTAMP, source VARCHAR(30), auto_send BOOLEAN, owner_id INTEGER,
                created_at TIMESTAMP, updated_at TIMESTAMP)"""))
            c.execute(text("""INSERT INTO follow_ups (id, tenant_id, title, channel, priority, status, due_at, source, auto_send, owner_id)
                VALUES (1, 7, 'Call', 'call', 'medium', 'Pending', '2031-05-01 04:30:00', NULL, NULL, 10)"""))
        report = self.run_import()
        self.assertEqual(report.tables["follow_ups"].copied, 1)
        with Session(self.tgt) as s:
            fu = s.exec(select(FollowUp).execution_options(skip_tenant=True)).one()
        self.assertEqual((fu.source, fu.auto_send), ("manual", False))

    def test_a_row_that_belongs_to_a_user_who_is_not_copied_is_skipped_not_fatal(self):
        # the operator (SuperAdmin) is never copied, so the mailbox profile that belongs only to them has no owner here
        with self.src.begin() as c:
            c.execute(text("""INSERT INTO email_agent_profiles (id, tenant_id, user_id, agent_name, auto_append_signature, created_at, updated_at)
                VALUES (1, 7, 11, 'Operator', 1, '2031-04-01 00:00:00', '2031-04-01 00:00:00'),
                       (2, 7, 10, 'Rep', 1, '2031-04-01 00:00:00', '2031-04-01 00:00:00')"""))
        report = self.run_import()
        tr = report.tables["email_agent_profiles"]
        self.assertEqual((tr.selected, tr.copied, tr.skipped), (2, 1, 1))


    def _seed_clash(self):
        """A test account (tester@fork.test) that the target already has, which owns a lead, a notification and a mailbox profile."""
        from database import Notification
        with Session(self.tgt) as s:
            s.add(Tenant(id=1, name="main"))
            s.commit()
            s.add(User(id=1, email="tester@fork.test", password="x", name="Tester", role="Admin", tenant_id=1))
            s.commit()
        with Session(self.src) as s:
            s.add(User(id=12, email="tester@fork.test", password="x", name="Tester", role="Admin", tenant_id=7))
            s.commit()
            s.add(Lead(id=5, company_name="Acme", tenant_id=7, owner_id=12))
            s.add(Notification(user_id=12, title="hi", message="m", tenant_id=7))
            s.commit()
        with self.src.begin() as c:
            c.execute(text("""INSERT INTO email_agent_profiles (id, tenant_id, user_id, agent_name, auto_append_signature, created_at, updated_at)
                VALUES (1, 7, 12, 'Tester', 1, '2031-04-01 00:00:00', '2031-04-01 00:00:00')"""))

    def test_skipped_test_accounts_hand_their_records_to_the_named_admin(self):
        from database import Notification
        self._seed_clash()
        report = import_tenant(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient", email_conflict="skip",
                               assign_skipped_to="boss@fork.test", admin_name="The Boss", log=lambda *a: None)
        self.assertEqual(report.fk_violations, {})
        self.assertTrue(report.admin["created"])
        self.assertTrue(report.admin_password)
        self.assertNotIn(report.admin_password, str(report.as_dict()), "the one-time password never goes into the JSON report")
        with Session(self.tgt) as s:
            boss = s.exec(select(User).where(User.email == "boss@fork.test").execution_options(skip_tenant=True)).one()
            lead = s.exec(select(Lead).where(Lead.company_name == "Acme").execution_options(skip_tenant=True)).one()
            self.assertEqual((boss.role, boss.name, boss.tenant_id), ("Admin", "The Boss", report.tenant_id))
            self.assertEqual(lead.owner_id, boss.id, "the skipped account's lead now belongs to the admin")
            self.assertEqual(s.exec(select(Notification).execution_options(skip_tenant=True)).all(), [], "one person's notifications are not handed over")
            self.assertEqual(s.exec(select(User).where(User.email == "tester@fork.test").execution_options(skip_tenant=True)).one().tenant_id, 1)
        self.assertEqual(report.tables["email_agent_profiles"].copied, 0, "the skipped account's mailbox profile is not handed over")

    def test_an_admin_the_client_already_has_is_reused(self):
        self._seed_clash()
        with Session(self.src) as s:
            s.add(User(id=13, email="boss@fork.test", password="keep", name="Boss", role="Admin", tenant_id=7))
            s.commit()
        report = import_tenant(self.src, self.tgt, source_tenant_id=7, tenant_name="forkclient", email_conflict="skip",
                               assign_skipped_to="Boss@fork.test", log=lambda *a: None)
        self.assertFalse(report.admin["created"])
        self.assertIsNone(report.admin_password)
        with Session(self.tgt) as s:
            boss = s.exec(select(User).where(User.email == "boss@fork.test").execution_options(skip_tenant=True)).one()
            self.assertEqual(boss.password, "keep")
            self.assertEqual(s.exec(select(Lead).where(Lead.company_name == "Acme").execution_options(skip_tenant=True)).one().owner_id, boss.id)



if __name__ == "__main__":
    unittest.main()
