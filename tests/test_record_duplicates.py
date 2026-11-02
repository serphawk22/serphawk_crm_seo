from unittest import mock
import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import func
from sqlmodel import Session, select
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Lead, User, Tenant
from modules import tenant_settings


class RecordDuplicates(TenantIsolationBase):
    def test_sqlite_duplicate_lock_can_be_released_by_dependency_cleanup_thread(self):
        from modules.record_duplicates import lock_company, transaction_ended
        from types import SimpleNamespace
        session = mock.Mock()
        session.info = {}
        session.connection.return_value.dialect.name = 'sqlite'
        with ThreadPoolExecutor(max_workers=1) as worker:
            worker.submit(lock_company, session, 2468).result(timeout=2)
            lock = session.info['duplicate_locks'][2468]
            try:
                transaction_ended(session, SimpleNamespace(parent=None))
            except Exception:
                worker.submit(lock.release).result(timeout=2)
                raise
        self.assertTrue(lock.acquire(timeout=1))
        lock.release()

    def setUp(self):
        super().setUp()
        tenant_settings.invalidate(); self.addCleanup(tenant_settings.invalidate)
        for path in ("main._trigger_background_research", "modules.whatsapp.send_ai_polished_whatsapp_message"):
            patch = mock.patch(path); patch.start(); self.addCleanup(patch.stop)

    def post(self, path, body, tid=2):
        return self.client.post(path, json=body, headers=self.as_tenant(tid))

    def test_lead_phone_email_and_website_are_normalized_and_tenant_scoped(self):
        first = self.post("/leads", {"company_name": "Original", "email": "Sales@Example.test", "phone": "+91 (98765) 43210", "website": "https://www.example.test/"})
        self.assertEqual(first.status_code, 200, first.text)
        for values in ({"email": " sales@example.test "}, {"phone": "+919876543210"}, {"website": "http://example.test?utm_source=ads"}):
            response = self.post("/leads", {"company_name": "Duplicate", **values})
            self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.post("/leads", {"company_name": "Other company", "phone": "+919876543210"}, tid=3).status_code, 200)
        response = self.client.put(f"/leads/{first.json()['id']}", json={"company_name": "Original", "phone": "+919876543210"}, headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)

    def test_local_numbers_use_the_company_dial_code(self):
        with Session(S.ENGINE) as session: tenant_settings.update_settings(session, 2, {"default_dial_code": "+91"})
        self.assertEqual(self.post("/leads", {"company_name": "Local", "phone": "9876543210"}).status_code, 200)
        self.assertEqual(self.post("/leads", {"company_name": "Intl", "phone": "+91 9876543210"}).status_code, 409)

    def test_name_and_address_fallback_prevents_identical_empty_contact_records(self):
        for path, name in (("/leads", "company_name"), ("/clients", "companyName")):
            self.assertEqual(self.post(path, {name: "Acme Studio", "address": "Main Street"}).status_code, 200)
            self.assertEqual(self.post(path, {name: " acme   studio ", "address": "main street"}).status_code, 409)
            self.assertEqual(self.post(path, {name: "Acme Studio", "address": "Another Street"}).status_code, 200)

    def test_a_hidden_duplicate_is_rejected_without_disclosing_record_details(self):
        with Session(S.ENGINE) as session:
            user = User(tenant_id=2, role="SalesManager", email="manager@x.test", password="x", name="Manager")
            session.add(user); session.commit(); session.refresh(user); uid = user.id
            session.add(Lead(tenant_id=2, company_name="Hidden company", phone="+15551234567", owner_id=self.users[2])); session.commit()
        response = self.client.post("/leads", json={"company_name": "Other", "phone": "+1 555 123 4567"}, headers={"X-User-ID": str(uid)})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn("Hidden company", response.text)

    def test_client_rejection_does_not_leave_an_orphan_login(self):
        self.assertEqual(self.post("/clients", {"companyName": "Original", "phone": "+15551234567", "email": "original@buyer.test"}).status_code, 200)
        duplicate = self.post("/clients", {"companyName": "Other", "phone": "+1 (555) 123-4567", "email": "orphan@buyer.test"})
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        with Session(S.ENGINE) as session:
            self.assertIsNone(session.exec(select(User).where(User.email == "orphan@buyer.test")).first())
        response = self.post("/clients", {"companyName": "Same email", "email": "ORIGINAL@buyer.test"})
        self.assertEqual(response.status_code, 409, response.text)

    def test_marketplace_identity_includes_the_provider_and_handles_updates(self):
        first = self.post("/marketplace/services", {"service_name": "SEO Audit", "provider_name": "Acme"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.post("/marketplace/services", {"service_name": " seo   audit ", "provider_name": "ACME"}).status_code, 409)
        second = self.post("/marketplace/services", {"service_name": "SEO Audit", "provider_name": "Another"})
        self.assertEqual(second.status_code, 200, second.text)
        response = self.client.put(f"/marketplace/services/{second.json()['service']['id']}", json={"provider_name": "Acme"}, headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 409, response.text)

    def test_repeated_csv_imports_skip_duplicates_and_keep_valid_rows(self):
        body = b'company_name,email,phone,notes\nFirst,first@import.test,+15551234567,"A, B"\nAgain,second@import.test,+1 (555) 123-4567,Duplicate\n'
        for target in ("leads", "clients"):
            response = self.client.post(f"/import/{target}/csv", files={"file": ("rows.csv", body, "text/csv")}, headers=self.as_tenant(2))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual((response.json()["created"], response.json()["skipped"]), (1, 1), response.text)
            response = self.client.post(f"/import/{target}/csv", files={"file": ("rows.csv", body, "text/csv")}, headers=self.as_tenant(2))
            self.assertEqual((response.json()["created"], response.json()["skipped"]), (0, 2), response.text)
        with Session(S.ENGINE) as session:
            self.assertIsNone(session.exec(select(User).where(User.email == "second@import.test")).first())

    @unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Needs isolated Compose Postgres")
    def test_concurrent_postgres_writes_cannot_create_the_same_identity(self):
        from sqlalchemy import create_engine
        from sqlalchemy.schema import CreateSchema, DropSchema
        from sqlmodel import SQLModel
        from fastapi import HTTPException
        from modules.tenant_scope import current_tenant_id
        name = "duplicate_test_" + uuid.uuid4().hex
        owner = create_engine(os.environ["TEST_POSTGRES_URL"])
        with owner.begin() as connection: connection.execute(CreateSchema(name))
        engine = owner.execution_options(schema_translate_map={None: name})
        try:
            SQLModel.metadata.create_all(engine)
            with Session(engine) as session:
                session.add(Tenant(id=2, name="isolated duplicate test")); session.commit()
            barrier = threading.Barrier(2)
            def write():
                token = current_tenant_id.set(2)
                try:
                    barrier.wait(timeout=10)
                    with Session(engine) as session:
                        session.add(Lead(tenant_id=2, company_name="Concurrent", phone="+15557654321"))
                        try:
                            session.commit(); return 200
                        except HTTPException as error:
                            session.rollback(); return error.status_code
                finally: current_tenant_id.reset(token)
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(sorted(pool.map(lambda _: write(), range(2))), [200, 409])
        finally:
            with owner.begin() as connection: connection.execute(DropSchema(name, cascade=True))
            owner.dispose()
