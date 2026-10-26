"""business_suite extras (dropped clients, proposal share links, invoice conversion): gated, role-checked, tenant-safe."""
import unittest

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import (ActivityLog, ClientProfile, CRMQuote, Deal, Invoice, Notification, Proposal, QuoteItem, User)
from modules import features, presets, tenant_settings


class ExtrasBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo")
            emp = User(email="emp@t2.test", password="x", name="Emp Two", role="Employee", tenant_id=2)
            mgr = User(email="mgr@t2.test", password="x", name="Mgr Two", role="SalesManager", tenant_id=2)
            s.add(emp)
            s.add(mgr)
            s.commit()
            s.refresh(emp)
            s.refresh(mgr)
            self.emp, self.mgr = emp.id, mgr.id
            deal = Deal(title="Deal Two", value=100.0, stage="Negotiation", tenant_id=2, client_id=self.clients[2],
                        assigned_to=self.mgr)
            deal3 = Deal(title="Deal Three", value=7.0, stage="Negotiation", tenant_id=3, client_id=self.clients[3])
            s.add(deal)
            s.add(deal3)
            s.commit()
            s.refresh(deal)
            s.refresh(deal3)
            self.deal = deal.id
            prop = Proposal(title="Website build", client_id=self.clients[2], deal_id=deal.id, status="Sent", tenant_id=2,
                            total_value=100.0, currency="INR",
                            line_items=[{"product_name": "Design", "quantity": 2, "unit_price": 50}])
            quote = CRMQuote(title="Quote Two", quote_number="Q-2", client_id=self.clients[2], deal_id=deal.id,
                             status="Sent", tenant_id=2, grand_total=100.0)
            other = Proposal(title="Other tenant proposal", client_id=self.clients[3], status="Sent", tenant_id=3,
                             total_value=7.0)
            s.add(prop)
            s.add(quote)
            s.add(other)
            s.commit()
            for o in (prop, quote, other):
                s.refresh(o)
            s.add(QuoteItem(quote_id=quote.id, tenant_id=2, description="Service", quantity=2, unit_price=50, total=100))
            s.commit()
            self.prop_id, self.prop_uuid = prop.id, prop.public_uuid
            self.quote_id, self.quote_uuid = quote.id, quote.public_uuid
            self.other_uuid, self.other_id = other.public_uuid, other.id

    def h(self, uid=None, tid=2):
        return {"X-User-ID": str(uid or self.users[tid])}

    def get(self, path, uid=None, tid=2):
        return self.client.get(path, headers=self.h(uid, tid))

    def post(self, path, body=None, uid=None, tid=2):
        return self.client.post(path, json=body or {}, headers=self.h(uid, tid))

    def notified(self, user_id):
        with Session(S.ENGINE) as s:
            return s.exec(select(Notification).where(Notification.user_id == user_id).execution_options(skip_tenant=True)).all()


class DroppedClients(ExtrasBase):
    BODY = {"company_name": "Client of 2", "reason": "Budget cut", "reason_category": "Price", "last_revenue": 500}

    def test_gated_per_tenant(self):
        self.assertEqual(self.get("/dropped-clients", tid=3).status_code, 403)
        self.assertEqual(self.get("/dropped-clients").status_code, 200)

    def test_record_list_reactivate_delete(self):
        r = self.post("/dropped-clients", {**self.BODY, "client_id": self.clients[2]})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(ClientProfile, self.clients[2]).status, "Dropped")
            self.assertTrue(s.exec(select(ActivityLog).where(ActivityLog.clientId == self.clients[2])).first())
        listing = self.get("/dropped-clients").json()
        self.assertEqual(listing["total"], 1)
        self.assertEqual(listing["category_breakdown"], {"Price": 1})
        self.assertEqual(self.get(f"/dropped-clients/by-client/{self.clients[2]}").json()["dropped_client"]["reason"], "Budget cut")
        self.assertEqual(self.post(f"/dropped-clients/by-client/{self.clients[2]}/reactivate").status_code, 200)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(ClientProfile, self.clients[2]).status, "Active")
        rid = listing["dropped_clients"][0]["id"]
        self.assertEqual(self.client.delete(f"/dropped-clients/{rid}", headers=self.h()).status_code, 200)
        self.assertEqual(self.get("/dropped-clients").json()["total"], 0)

    def test_only_managers_write_and_other_tenants_see_nothing(self):
        self.assertEqual(self.post("/dropped-clients", self.BODY, uid=self.emp).status_code, 403)
        self.post("/dropped-clients", {**self.BODY, "client_id": self.clients[2]})
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "bpo")
        self.assertEqual(self.get("/dropped-clients", tid=3).json()["total"], 0)
        # cannot drop another tenant's client
        r = self.post("/dropped-clients", {**self.BODY, "client_id": self.clients[3]})
        self.assertEqual(r.status_code, 404)

    def test_reassigning_to_another_tenants_user_is_refused(self):
        r = self.post("/salesperson/reassign", {"client_id": self.clients[2], "to_user_id": self.users[3]})
        self.assertEqual(r.status_code, 404)
        r = self.post("/salesperson/reassign", {"client_id": self.clients[2], "to_user_id": self.mgr, "reason": "territory"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("territory", str(self.get(f"/salesperson/history/{self.clients[2]}").json()))


class PublicPortal(ExtrasBase):
    def anon(self, method, path, **kw):
        return self.client.request(method, path, **kw)

    def test_view_by_secret_link_only(self):
        r = self.anon("GET", f"/public/proposals/{self.prop_uuid}")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual((body["title"], body["grand_total"], body["client_name"]), ("Website build", 100.0, "Client of 2"))
        self.assertEqual(body["items"][0]["total"], 100.0)
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.quote_uuid}").status_code, 200)
        # the sequential database id is NOT a credential (it used to be)
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.prop_id}").status_code, 404)
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.other_id}").status_code, 404)
        self.assertEqual(self.anon("GET", "/public/proposals/not-a-real-link").status_code, 404)
        self.assertEqual(self.anon("GET", f"/public/proposals/{'x' * 200}").status_code, 404)

    def test_the_page_carries_the_issuing_tenants_brand(self):
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.prop_uuid}").json()["brand"]["name"], "SerpHawk")
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"brand_name": "Alpha BPO", "contact_email": "sales@alpha.test",
                                                   "proposal_terms": "Net 15."})
        tenant_settings.invalidate()
        body = self.anon("GET", f"/public/proposals/{self.prop_uuid}").json()
        self.assertEqual((body["brand"]["name"], body["brand"]["email"], body["terms"]), ("Alpha BPO", "sales@alpha.test", "Net 15."))
        self.assertNotIn("serphawk", str(body["brand"]).lower())

    def test_dead_when_the_tenant_does_not_have_the_feature(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"proposals_portal": False})
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.prop_uuid}").status_code, 404)
        self.assertEqual(self.anon("POST", f"/public/proposals/{self.prop_uuid}/accept").status_code, 404)

    def test_comment_starts_negotiation_and_only_notifies_its_own_tenant(self):
        r = self.anon("POST", f"/public/proposals/{self.prop_uuid}/comments", json={"author_name": "Buyer", "content": "Can you do 90?"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(Proposal, self.prop_id).status, "Negotiation")
            self.assertEqual(s.get(Deal, self.deal).stage, "Negotiation")
        self.assertTrue(any("Can you do 90" in n.message for n in self.notified(self.users[2])))
        self.assertTrue(self.notified(self.mgr))
        self.assertEqual(self.notified(self.users[3]), [])      # another client's admin hears nothing
        self.assertEqual(self.notified(self.users[1]), [])
        self.assertIn("Can you do 90", str(self.anon("GET", f"/public/proposals/{self.prop_uuid}").json()["comments"]))

    def test_public_input_is_limited(self):
        url = f"/public/proposals/{self.prop_uuid}/comments"
        self.assertEqual(self.anon("POST", url, json={"author_name": "B", "content": ""}).status_code, 422)
        self.assertEqual(self.anon("POST", url, json={"author_name": "B", "content": "x" * 5000}).status_code, 422)
        self.assertEqual(self.anon("POST", url, json={"author_name": "B" * 500, "content": "hi"}).status_code, 422)

    def test_accept_wins_the_deal_creates_the_invoice_and_is_final(self):
        url = f"/public/proposals/{self.prop_uuid}"
        r = self.anon("POST", url + "/accept", json={"signer_name": "Jane Buyer"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            prop = s.get(Proposal, self.prop_id)
            self.assertEqual((prop.status, prop.signature_data), ("Accepted", "Jane Buyer"))
            self.assertIsNotNone(prop.signed_at)
            deal = s.get(Deal, self.deal)
            self.assertEqual((deal.stage, deal.final_value), ("Closed Won", 100.0))
            self.assertIsNotNone(deal.won_at)
            self.assertEqual(s.get(ClientProfile, self.clients[2]).status, "Won")
            inv = s.exec(select(Invoice).where(Invoice.proposal_id == self.prop_id).execution_options(skip_tenant=True)).one()
            self.assertEqual((inv.tenant_id, inv.total, inv.client_id), (2, 100.0, self.clients[2]))
        self.assertTrue(any("Closed Won" in n.message for n in self.notified(self.users[2])))
        self.assertEqual(self.notified(self.users[3]), [])
        # final: cannot be accepted again, rejected, or reopened by a comment
        self.assertEqual(self.anon("POST", url + "/accept").status_code, 409)
        self.assertEqual(self.anon("POST", url + "/reject", json={"reason": "x"}).status_code, 409)
        self.assertEqual(self.anon("POST", url + "/comments", json={"author_name": "B", "content": "wait"}).status_code, 409)
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(Invoice).where(Invoice.proposal_id == self.prop_id).execution_options(skip_tenant=True)).all()), 1)

    def test_reject_loses_the_deal(self):
        r = self.anon("POST", f"/public/proposals/{self.quote_uuid}/reject", json={"reason": "too expensive"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(CRMQuote, self.quote_id).status, "Rejected")
            self.assertEqual(s.get(Deal, self.deal).stage, "Closed Lost")
            self.assertEqual(s.get(ClientProfile, self.clients[2]).status, "Lost")
        self.assertTrue(any("too expensive" in n.message for n in self.notified(self.users[2])))
        self.assertEqual(self.anon("POST", f"/public/proposals/{self.quote_uuid}/accept").status_code, 409)

    def test_pdf_by_link(self):
        r = self.anon("GET", f"/public/proposals/{self.prop_uuid}/pdf")
        self.assertEqual(r.status_code, 200, r.text[:200])
        self.assertIn("pdf", r.headers.get("content-type", "").lower())
        self.assertEqual(self.anon("GET", f"/public/proposals/{self.prop_id}/pdf").status_code, 404)


class Conversion(ExtrasBase):
    def test_proposal_to_invoice_is_idempotent_and_role_checked(self):
        self.assertEqual(self.post(f"/proposals/{self.prop_id}/convert-to-invoice", uid=self.emp).status_code, 403)
        a = self.post(f"/proposals/{self.prop_id}/convert-to-invoice")
        self.assertEqual(a.status_code, 200, a.text)
        b = self.post(f"/proposals/{self.prop_id}/convert-to-invoice")
        self.assertEqual(a.json()["invoice"]["id"], b.json()["invoice"]["id"])
        self.assertIn("already exists", b.json()["message"])

    def test_quote_to_invoice_and_tenant_boundary(self):
        r = self.post(f"/quotes/{self.quote_id}/convert-to-invoice")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["invoice"]["total"], 100.0)
        r = self.post(f"/quotes/{self.quote_id}/convert-to-invoice", tid=3)
        self.assertIn(r.status_code, (403, 404))

    def test_deal_proposals_listing(self):
        r = self.get(f"/deals/{self.deal}/proposals")
        self.assertEqual(r.status_code, 200, r.text)
        titles = {p["title"] for p in r.json()["proposals"]}
        self.assertEqual(titles, {"Website build", "Quote Two"})
        self.assertEqual(self.get(f"/deals/{self.deal}/proposals", tid=3).status_code, 403)


if __name__ == "__main__":
    unittest.main()
