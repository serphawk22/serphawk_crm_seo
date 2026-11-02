from sqlmodel import Session
from unittest import mock
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Case, Invoice, User
from modules import features, tenant_settings


class SupportInvoiceModules(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate(); tenant_settings.invalidate()
        self.addCleanup(features.invalidate); self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as session:
            manager = User(tenant_id=2, name="Manager", email="manager@support.test", password="x", role="SalesManager")
            session.add(manager); session.commit(); session.refresh(manager); self.manager = manager.id
            mine = Case(tenant_id=2, subject="Assigned", assigned_to=manager.id)
            other = Case(tenant_id=2, subject="Another case", assigned_to=self.users[2])
            session.add_all([mine, other]); session.commit(); session.refresh(mine); session.refresh(other)
            self.mine, self.other = mine.id, other.id

    def set_modules(self, **changes):
        with Session(S.ENGINE) as session: return features.set_features(session, 2, changes)

    def test_independent_cases_invoices_quotes_and_support_portal(self):
        self.set_modules(cases=False, invoices=False, billing=True, support_sh=True)
        for path, status in (("/cases", 403), ("/invoices", 403), ("/quotes", 200), ("/support/helpdesk", 200)):
            response = self.client.get(path, headers=self.as_tenant(2))
            self.assertEqual(response.status_code, status, response.text)
        self.set_modules(cases=True, invoices=True, billing=False, support_sh=False)
        for path, status in (("/cases", 200), ("/invoices", 200), ("/quotes", 403), ("/support/helpdesk", 403)):
            response = self.client.get(path, headers=self.as_tenant(2))
            self.assertEqual(response.status_code, status, response.text)

    def test_external_portal_uses_tenant_setting_and_case_creation_stays_external(self):
        self.set_modules(support_sh=True, cases=True)
        with Session(S.ENGINE) as session: tenant_settings.update_settings(session, 2, {"support_portal_url": "https://support.example.test/login"})
        response = self.client.get("/support/helpdesk", headers=self.as_tenant(2))
        self.assertEqual(response.json()["url"], "https://support.example.test/login")
        self.assertEqual(self.client.post("/cases", json={"subject": "External only"}, headers=self.as_tenant(2)).status_code, 403)

    def test_sales_case_queries_and_mutations_are_assignment_scoped(self):
        headers = {"X-User-ID": str(self.manager)}
        response = self.client.get(f"/cases?assigned_to={self.users[2]}", headers=headers)
        self.assertEqual([row["id"] for row in response.json()["cases"]], [self.mine])
        self.assertEqual(self.client.get(f"/cases/{self.other}", headers=headers).status_code, 404)
        self.assertEqual(self.client.put(f"/cases/{self.other}", json={"status": "Closed"}, headers=headers).status_code, 404)
        self.assertEqual(self.client.put(f"/cases/{self.mine}", json={"status": "Resolved"}, headers=headers).status_code, 200)
        self.assertEqual(self.client.delete(f"/cases/{self.mine}", headers=headers).status_code, 403)

    def test_invoice_list_details_and_writes_respect_client_ownership(self):
        with Session(S.ENGINE) as session:
            invoice = Invoice(tenant_id=2, invoice_number="PRIVATE", client_id=self.clients[2], amount=100, total=100)
            session.add(invoice); session.commit(); session.refresh(invoice); iid = invoice.id
        headers = {"X-User-ID": str(self.manager)}
        self.assertEqual(self.client.get("/invoices", headers=headers).json()["invoices"], [])
        self.assertEqual(self.client.get(f"/invoices/{iid}", headers=headers).status_code, 404)
        self.assertEqual(self.client.post("/invoices", json={"client_id": self.clients[3], "amount": 1}, headers=self.as_tenant(2)).status_code, 404)

    def test_invoice_creation_and_updates_keep_totals_and_tenant_branding(self):
        from database import ClientProfile
        with Session(S.ENGINE) as session:
            tenant_settings.update_settings(session, 2, {"brand_name": "Acme Studio"})
            client = session.get(ClientProfile, self.clients[2]); client.userId = self.users[2]
            session.add(client); session.commit()
        with mock.patch("main._send_notification_email") as mail:
            response = self.client.post("/invoices", json={"client_id": self.clients[2], "amount": 100, "tax": 5, "currency": "USD"}, headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        invoice = response.json()["invoice"]
        self.assertEqual(invoice["total"], 105)
        self.assertIn("Acme Studio", mail.call_args.args[1])
        self.assertNotIn("DaPros", mail.call_args.args[2])
        response = self.client.put(f"/invoices/{invoice['id']}", json={"amount": 120}, headers=self.as_tenant(2))
        self.assertEqual(response.json()["invoice"]["total"], 125)
