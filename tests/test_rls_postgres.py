"""PostgreSQL Row-Level Security (modules/rls.py). Needs the local Postgres from docker-compose; skipped otherwise.

The application connects as an ordinary role (crm_app): Postgres superusers and BYPASSRLS roles ignore RLS.
"""
import contextvars
import os
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlmodel import Session, SQLModel, select

import database
from database import Tenant, Lead
from modules import rls

_tenant = contextvars.ContextVar("rls_test_tenant", default=None)
URL = os.getenv("TEST_POSTGRES_URL")


@unittest.skipUnless(URL, "TEST_POSTGRES_URL not set (run via docker compose run --rm test)")
class RlsPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = make_url(URL)
        admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        with admin.connect() as c:
            c.execute(text("DROP DATABASE IF EXISTS crm_rls_test WITH (FORCE)"))
            c.execute(text("CREATE DATABASE crm_rls_test"))
            if not c.execute(text("SELECT 1 FROM pg_roles WHERE rolname = 'crm_app'")).first():
                c.execute(text("CREATE ROLE crm_app LOGIN PASSWORD 'crm_app' NOSUPERUSER NOBYPASSRLS"))
        admin.dispose()
        cls.owner = create_engine(base.set(database="crm_rls_test"))
        SQLModel.metadata.create_all(cls.owner)
        cls.protected = rls.enable_rls(cls.owner)
        rls.enable_rls(cls.owner)  # idempotent
        with cls.owner.begin() as c:
            c.execute(text("GRANT ALL ON ALL TABLES IN SCHEMA public TO crm_app"))
            c.execute(text("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO crm_app"))
        cls.app = create_engine(base.set(username="crm_app", password="crm_app", database="crm_rls_test"))
        rls.install(lambda: _tenant.get())
        with Session(cls.owner) as s:  # no tenant context -> bypass
            for tid in (2, 3):
                s.add(Tenant(id=tid, name=f"t{tid}"))
            s.commit()
            for tid in (2, 2, 3):
                s.add(Lead(company_name=f"lead-{tid}", tenant_id=tid))
            s.commit()

    @classmethod
    def tearDownClass(cls):
        cls.app.dispose()
        cls.owner.dispose()

    def setUp(self):
        self.addCleanup(lambda: _tenant.set(None))

    def count(self, tenant):
        _tenant.set(tenant)
        with Session(self.app) as s:
            return s.execute(text("SELECT count(*) FROM leads")).scalar()

    def test_tables_protected(self):
        self.assertIn("leads", self.protected)
        self.assertNotIn("users", self.protected)
        self.assertNotIn("tenants", self.protected)

    def test_raw_sql_is_scoped_to_the_tenant(self):
        self.assertEqual(self.count(2), 2)
        self.assertEqual(self.count(3), 1)
        self.assertEqual(self.count(99), 0)

    def test_no_tenant_context_means_bypass(self):
        self.assertEqual(self.count(None), 3)

    def test_bare_connection_fails_closed(self):
        with self.app.connect() as c:
            self.assertEqual(c.execute(text("SELECT count(*) FROM leads")).scalar(), 0)

    def test_cannot_insert_into_another_tenant(self):
        _tenant.set(2)
        with Session(self.app) as s:
            s.add(Lead(company_name="smuggled", tenant_id=3))
            with self.assertRaises(DBAPIError):
                s.commit()

    def test_update_and_delete_only_touch_own_rows(self):
        _tenant.set(3)
        with Session(self.app) as s:
            self.assertEqual(s.execute(text("UPDATE leads SET status = 'Hacked' WHERE tenant_id = 2")).rowcount, 0)
            self.assertEqual(s.execute(text("DELETE FROM leads WHERE tenant_id = 2")).rowcount, 0)
            s.rollback()
        self.assertEqual(self.count(None), 3)

    def test_skip_tenant_statement_bypasses(self):
        _tenant.set(2)
        with Session(self.app) as s:
            rows = s.exec(select(Lead).execution_options(skip_tenant=True)).all()
        self.assertEqual(len(rows), 3)

    def test_context_does_not_leak_between_pooled_transactions(self):
        self.assertEqual(self.count(2), 2)
        self.assertEqual(self.count(3), 1)
        self.assertEqual(self.count(2), 2)


if __name__ == "__main__":
    unittest.main()
