"""
Cross-tenant isolation. Each test states the SECURE outcome; a failure is a real data leak.

Two ordinary tenants (2 and 3) plus the owner tenant (1) each hold one lead and one client. A user of one
tenant must never read, change or delete another tenant's rows, and a caller with no identity must not be
able to pick a tenant by sending X-Tenant-ID.
"""
import unittest

from sqlmodel import Session, select, func

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import User, Lead, ClientProfile


class ReadIsolation(TenantIsolationBase):
    def test_lead_list_only_shows_own_tenant(self):
        for tid in (2, 3, 1):
            r = self.client.get("/leads", headers=self.as_tenant(tid))
            self.assertEqual(r.status_code, 200)
            names = {l["company_name"] for l in r.json()["leads"]}
            self.assertEqual(names, {f"Lead of {tid}"}, f"tenant {tid} saw {names}")

    def test_cannot_read_other_tenants_lead_by_id(self):
        r = self.client.get(f"/leads/{self.leads[3]}", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 404, r.text)

    def test_cannot_read_other_tenants_client_by_id(self):
        r = self.client.get(f"/clients/{self.clients[3]}", headers=self.as_tenant(2))
        self.assertIn(r.status_code, (403, 404), r.text)

    def test_client_list_only_shows_own_tenant(self):
        r = self.client.get("/clients", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        rows = body if isinstance(body, list) else body.get("clients", [])
        self.assertNotIn("Client of 3", str(rows))
        self.assertNotIn("Client of 1", str(rows))


class WriteIsolation(TenantIsolationBase):
    def test_cannot_update_other_tenants_lead(self):
        r = self.client.put(f"/leads/{self.leads[3]}", json={"company_name": "Renamed by tenant 2", "status": "Lost", "notes": "pwned"},
                            headers=self.as_tenant(2))
        self.assertIn(r.status_code, (403, 404), r.text)
        row = self.lead_row(3)
        self.assertNotEqual(row.status, "Lost")
        self.assertNotEqual(row.notes, "pwned")
        self.assertEqual(row.company_name, "Lead of 3")

    def test_cannot_delete_other_tenants_lead(self):
        r = self.client.delete(f"/leads/{self.leads[3]}", headers=self.as_tenant(2))
        self.assertIn(r.status_code, (403, 404), r.text)
        self.assertIsNotNone(self.lead_row(3), "tenant 2 deleted tenant 3's lead")

    def test_cannot_delete_other_tenants_client(self):
        r = self.client.delete(f"/clients/{self.clients[3]}", headers=self.as_tenant(2))
        self.assertIn(r.status_code, (403, 404), r.text)
        self.assertIsNotNone(self.client_row(3))


class IdentityIsolation(TenantIsolationBase):
    def test_anonymous_caller_cannot_choose_a_tenant(self):
        """No identity + X-Tenant-ID must not expose that tenant's data."""
        r = self.client.get("/leads", headers={"X-Tenant-ID": "3"})
        leaked = r.status_code == 200 and "Lead of 3" in r.text
        self.assertFalse(leaked, f"anonymous caller read tenant 3 via X-Tenant-ID: {r.status_code} {r.text[:120]}")

    def test_tenant_header_does_not_override_users_own_tenant(self):
        h = {**self.as_tenant(2), "X-Tenant-ID": "3"}
        r = self.client.get("/leads", headers=h)
        self.assertNotIn("Lead of 3", r.text)


class OrmFilterCoverage(TenantIsolationBase):
    """The do_orm_execute filter itself, independent of any route."""

    def _scoped(self, tid):
        token = self.main.current_tenant_id.set(tid)
        self.addCleanup(self.main.current_tenant_id.reset, token)

    def test_count_aggregate_is_scoped(self):
        self._scoped(2)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(func.count()).select_from(Lead)).one(), 1)
            self.assertEqual(s.exec(select(func.count(Lead.id))).one(), 1)

    def test_bulk_update_is_scoped(self):
        from sqlalchemy import update
        self._scoped(2)
        with Session(S.ENGINE) as s:
            s.exec(update(Lead).values(status="Hacked"))
            s.commit()
        self.assertNotEqual(self.lead_row(3).status, "Hacked")
        self.assertNotEqual(self.lead_row(1).status, "Hacked")

    def test_bulk_delete_is_scoped(self):
        from sqlalchemy import delete
        self._scoped(2)
        with Session(S.ENGINE) as s:
            s.exec(delete(Lead))
            s.commit()
        self.assertIsNotNone(self.lead_row(3))
        self.assertIsNotNone(self.lead_row(1))

    def test_get_by_primary_key_is_scoped(self):
        self._scoped(2)
        with Session(S.ENGINE) as s:
            self.assertIsNone(s.get(Lead, self.leads[3]))

    def test_join_is_scoped(self):
        self._scoped(2)
        with Session(S.ENGINE) as s:
            rows = s.exec(select(Lead.company_name).join(User, User.id == Lead.owner_id)).all()
        self.assertEqual(rows, ["Lead of 2"])


if __name__ == "__main__":
    unittest.main()
