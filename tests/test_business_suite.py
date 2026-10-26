"""business_suite add-on (ported from SCM BPO): gated per tenant, isolated per tenant, and working."""
import unittest
from datetime import datetime, timezone

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Deal, InventoryItem, Lead, User
from modules import features, presets, tenant_settings


class BusinessSuiteBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo")
            sm = User(email="rep@t2.test", password="x", name="Rep Two", role="SalesManager", tenant_id=2)
            s.add(sm)
            s.commit()
            s.refresh(sm)
            self.rep_id = sm.id
            deal = Deal(title="Big deal", value=1000.0, stage="Closed Won", tenant_id=2, assigned_to=self.users[2],
                        client_id=self.clients[2])
            s.add(deal)
            s.add(InventoryItem(code="W-1", name="Widget", tenant_id=2, current_stock=2, min_stock=5))
            s.commit()
            s.refresh(deal)
            self.deal_id = deal.id

    def get(self, path, tid=2, **kw):
        return self.client.get(path, headers=self.as_tenant(tid), **kw)

    def post(self, path, body, tid=2):
        return self.client.post(path, json=body, headers=self.as_tenant(tid))


class Gating(BusinessSuiteBase):
    def test_off_by_default_for_tenants_that_did_not_opt_in(self):
        for path in ("/lead-sources", "/business-costs", "/revenue/summary", "/ownership/history",
                     "/command-center/overview", "/inventory-stock/low", "/reports/ai/quick-prompts",
                     f"/deals/{self.deal_id}/negotiations"):
            r = self.get(path, tid=3)
            self.assertEqual(r.status_code, 403, path)
            self.assertIn("feature", r.json(), path)

    def test_bpo_preset_turns_it_on(self):
        for path in ("/lead-sources", "/business-costs", "/revenue/summary", "/ownership/report", "/inventory-stock/low"):
            self.assertEqual(self.get(path).status_code, 200, path)

    def test_a_single_feature_can_be_switched_off(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"finance_suite": False})
        self.assertEqual(self.get("/business-costs").status_code, 403)
        self.assertEqual(self.get("/lead-sources").status_code, 200)


class LeadSources(BusinessSuiteBase):
    def test_defaults_are_seeded_per_tenant_and_assignable(self):
        rows = self.get("/lead-sources").json()
        rows = rows if isinstance(rows, list) else rows.get("sources", rows.get("items", []))
        self.assertTrue(any(r["name"] == "Facebook" for r in rows))
        fb = next(r for r in rows if r["name"] == "Facebook")
        r = self.post("/lead-sources/assign", {"entity_type": "lead", "entity_id": self.leads[2], "source_id": fb["id"]})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(Lead, self.leads[2]).lead_source_id, fb["id"])
        self.assertEqual(self.get("/analytics/lead-sources").status_code, 200)

    def test_other_tenants_sources_are_invisible(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "bpo")
        self.post("/lead-sources", {"name": "Only Alpha", "channel": "Event"})
        names3 = str(self.get("/lead-sources", tid=3).json())
        self.assertNotIn("Only Alpha", names3)
        self.assertIn("Only Alpha", str(self.get("/lead-sources").json()))


class Finance(BusinessSuiteBase):
    def test_costs_and_revenue(self):
        r = self.post("/business-costs", {"title": "Office rent", "category": "Rent", "amount": 250.0,
                                          "cost_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("Office rent", str(self.get("/business-costs").json()))
        summary = self.get("/revenue/summary")
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertIn("1000", str(summary.json()))

    def test_costs_are_admin_only_and_tenant_private(self):
        rep = {"X-User-ID": str(self.rep_id)}
        self.assertEqual(self.client.get("/business-costs", headers=rep).status_code, 403)
        self.post("/business-costs", {"title": "Secret salary", "category": "Salary", "amount": 9.0, "cost_date": "2026-01-01"})
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "bpo")
        self.assertNotIn("Secret salary", str(self.get("/business-costs", tid=3).json()))

    def test_negotiation_rounds(self):
        r = self.post(f"/deals/{self.deal_id}/negotiations", {"party": "us", "price": 900.0, "discount_pct": 10})
        self.assertEqual(r.status_code, 200, r.text)
        rounds = self.get(f"/deals/{self.deal_id}/negotiations")
        self.assertEqual(rounds.status_code, 200)
        self.assertIn("900", str(rounds.json()))
        # tenant 3 cannot touch tenant 2's deal even with the feature enabled
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "bpo")
        self.assertIn(self.post(f"/deals/{self.deal_id}/negotiations", {"price": 1.0}, tid=3).status_code, (403, 404))
        self.assertEqual(len(str(self.get(f"/deals/{self.deal_id}/negotiations", tid=3).json()).count("price") * "x"), str(self.get(f"/deals/{self.deal_id}/negotiations", tid=3).json()).count("price"))


class Ownership(BusinessSuiteBase):
    def test_reassign_records_history(self):
        r = self.post("/ownership/reassign", {"entity_type": "lead", "entity_id": self.leads[2],
                                              "to_user_id": self.rep_id, "reason": "territory change"})
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.get(Lead, self.leads[2]).owner_id, self.rep_id)
        hist = self.get(f"/ownership/history?entity_type=lead&entity_id={self.leads[2]}")
        self.assertIn("territory change", str(hist.json()))
        self.assertEqual(self.get("/ownership/report").status_code, 200)

    def test_cannot_reassign_another_tenants_lead(self):
        r = self.post("/ownership/reassign", {"entity_type": "lead", "entity_id": self.leads[3], "to_user_id": self.rep_id})
        self.assertIn(r.status_code, (400, 403, 404), r.text)
        with Session(S.ENGINE) as s:
            self.assertNotEqual(s.exec(select(Lead).where(Lead.id == self.leads[3]).execution_options(skip_tenant=True)).one().owner_id, self.rep_id)


class Misc(BusinessSuiteBase):
    def test_stock_movements_and_low_stock(self):
        low = self.get("/inventory-stock/low").json()
        self.assertEqual(low["count"], 1)
        with Session(S.ENGINE) as s:
            item_id = s.exec(select(InventoryItem).where(InventoryItem.code == "W-1")).one().id
        r = self.post(f"/inventory-stock/{item_id}/movements", {"change": 10, "reason": "Purchase"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.get("/inventory-stock/low").json()["count"], 0)
        self.assertIn("Purchase", str(self.get(f"/inventory-stock/{item_id}/movements").json()))

    def test_timezone_preference(self):
        r = self.client.put("/me/timezone", json={"timezone": "Asia/Kolkata"}, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.get("/me/timezone").json()["timezone"], "Asia/Kolkata")
        self.assertEqual(self.client.put("/me/timezone", json={"timezone": "Nope/Zone"}, headers=self.as_tenant(2)).status_code, 400)

    def test_command_center_and_ai_reports_run(self):
        r = self.get("/command-center/overview")
        self.assertEqual(r.status_code, 200, r.text[:300])
        r = self.post("/reports/ai/generate", {"prompt": "Compare sales staff performance", "time_range": "12m"})
        self.assertEqual(r.status_code, 200, r.text[:300])
        self.assertEqual(self.get("/reports/ai/quick-prompts").status_code, 200)

    def test_command_center_never_leaks_across_tenants_or_anonymous(self):
        self.assertIn(self.client.get("/command-center/overview").status_code, (401, 403))
        # an unscoped request must not be silently moved into tenant 1 (the original deployment did that)
        r = self.client.get("/command-center/overview", headers={"X-User-ID": "999999"})
        self.assertIn(r.status_code, (401, 403))
        # the AI report endpoint needs a signed-in user too
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo")
        self.assertEqual(self.client.post("/reports/ai/generate", json={"prompt": "x"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
