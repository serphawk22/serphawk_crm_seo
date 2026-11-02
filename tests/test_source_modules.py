from sqlmodel import Session
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Lead, TenantFeature
from modules import features


class SourceModules(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate(); self.addCleanup(features.invalidate)

    def set_modules(self, **changes):
        with Session(S.ENGINE) as session: return features.set_features(session, 2, changes)

    def test_modules_are_independent_in_both_directions(self):
        for sources, analytics in ((True, False), (False, True), (True, True), (False, False)):
            self.set_modules(lead_sources=sources, lead_source_analytics=analytics)
            for path, enabled in (("/lead-sources", sources), ("/lead-sources/overview", sources), ("/analytics/lead-sources/full", analytics)):
                response = self.client.get(path, headers=self.as_tenant(2))
                self.assertEqual(response.status_code, 200 if enabled else 403, path)

    def test_legacy_combined_entitlement_survives_independent_changes(self):
        with Session(S.ENGINE) as session:
            session.add(TenantFeature(tenant_id=2, feature_key="lead_sources", enabled=True)); session.commit()
        self.assertTrue(features.effective_features(2)["lead_source_analytics"])
        result = self.set_modules(lead_sources=False)
        self.assertTrue(result["lead_source_analytics"])
        self.assertFalse(result["lead_sources"])

    def test_overview_counts_conversions_and_scopes_every_company(self):
        self.set_modules(lead_sources=True)
        with Session(S.ENGINE) as session:
            session.add_all([Lead(tenant_id=2, company_name="Ad win", source="Meta Ads", is_converted=True),
                             Lead(tenant_id=2, company_name="Ad lost", source="Meta Ads", status="Lost"),
                             Lead(tenant_id=3, company_name="Private", source="Foreign campaign")]); session.commit()
        response = self.client.get("/lead-sources/overview", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        meta = next(row for row in data["sources"] if row["source"] == "Meta Ads")
        self.assertEqual((meta["total"], meta["converted"], meta["lost"], meta["win_rate"]), (2, 1, 1, 50))
        self.assertEqual(data["summary"]["top_source"], "Meta Ads")
        self.assertNotIn("Private", response.text)
        self.assertNotIn("Foreign campaign", response.text)
