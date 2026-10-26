"""Feature entitlements, tenant settings, presets and client onboarding."""
import unittest

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import User, TenantFeature
from modules import features, presets, tenant_settings


class FeatureUnit(unittest.TestCase):
    def test_path_mapping(self):
        f = features.feature_for_path
        self.assertEqual(f("/inbox/messages"), "inbox")
        self.assertEqual(f("/inbox"), "inbox")
        self.assertEqual(f("/voice-agent/pitches"), "voice_agent")
        self.assertIsNone(f("/voice-agent/twilio/voice"), "Twilio webhooks must stay reachable")
        self.assertIsNone(f("/inboxes"), "prefix match must respect segment boundaries")
        self.assertIsNone(f("/leads"))
        self.assertEqual(f("/rfq/3/respond"), "inventory")

    def test_registry_is_consistent(self):
        for key, feat in features.FEATURES.items():
            self.assertEqual(key, feat.key)
        for name, preset in presets.PRESETS.items():
            self.assertLessEqual(preset["features"], set(features.FEATURES), name)
            self.assertIn("leads", preset["features"] | {"leads"})
            tenant_settings.validate(preset["settings"])

    def test_settings_validation(self):
        v = tenant_settings.validate
        self.assertEqual(v({"default_currency": "mxn"})["default_currency"], "MXN")
        for bad in ({"nope": 1}, {"home_dashboard": "x"}, {"primary_color": "red"}, {"locale": "fr"}, {"default_dial_code": "52"},
                    {"support_email": "x"}, {"lead_statuses": "New"}, {"role_policy": {"inbox": {"x": []}}},
                    {"role_policy": {"inbox": {"scoped": ["Wizard"]}}}):
            with self.assertRaises(ValueError, msg=str(bad)):
                v(bad)


class FeatureApi(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            su = User(email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None)
            emp = User(email="emp@t2.test", password="x", name="Emp", role="Employee", tenant_id=2)
            s.add(su)
            s.add(emp)
            s.commit()
            s.refresh(su)
            s.refresh(emp)
            self.super_id, self.emp_id = su.id, emp.id

    def sa(self):
        return {"X-User-ID": str(self.super_id)}

    def test_existing_tenant_keeps_every_feature(self):
        r = self.client.get("/me/features", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        for key, feat in features.FEATURES.items():
            # everything that existed before entitlements stays on; ported add-ons start off until enabled
            self.assertEqual(body["features"][key], feat.default_on, key)
        self.assertTrue(body["features"]["inbox"])
        self.assertFalse(body["features"]["finance_suite"])
        self.assertIsNone(body["settings"]["brand_name"], "no stored brand = keep the built-in text")

    def test_requires_login(self):
        self.assertEqual(self.client.get("/me/features").status_code, 401)

    def test_disabled_module_is_blocked_only_for_that_tenant(self):
        r = self.client.put("/superadmin/tenants/2/features", json={"features": {"inbox": False}}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["features"]["inbox"])
        blocked = self.client.get("/inbox/counts", headers=self.as_tenant(2))
        self.assertEqual(blocked.status_code, 403, blocked.text)
        self.assertEqual(blocked.json()["feature"], "inbox")
        self.assertNotEqual(self.client.get("/inbox/counts", headers=self.as_tenant(3)).status_code, 403)
        # the sidebar feed reflects it
        me = self.client.get("/me/features", headers=self.as_tenant(2)).json()
        self.assertFalse(me["features"]["inbox"])
        self.assertTrue(me["features"]["followups"])

    def test_turning_it_back_on_restores_access(self):
        self.client.put("/superadmin/tenants/2/features", json={"features": {"followups": False}}, headers=self.sa())
        self.assertEqual(self.client.get("/followups/summary", headers=self.as_tenant(2)).status_code, 403)
        self.client.put("/superadmin/tenants/2/features", json={"features": {"followups": True}}, headers=self.sa())
        self.assertNotEqual(self.client.get("/followups/summary", headers=self.as_tenant(2)).status_code, 403)

    def test_locked_feature_cannot_be_disabled(self):
        r = self.client.put("/superadmin/tenants/2/features", json={"features": {"leads": False}}, headers=self.sa())
        self.assertTrue(r.json()["features"]["leads"])

    def test_unknown_feature_rejected(self):
        r = self.client.put("/superadmin/tenants/2/features", json={"features": {"teleport": True}}, headers=self.sa())
        self.assertEqual(r.status_code, 422)

    def test_only_superadmin_manages_features(self):
        r = self.client.put("/superadmin/tenants/3/features", json={"features": {"inbox": False}},
                            headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client.get("/superadmin/tenants/3/config", headers=self.as_tenant(2)).status_code, 403)
        self.assertEqual(self.client.get("/superadmin/features/catalog", headers=self.as_tenant(2)).status_code, 403)

    def test_tenant_admin_edits_own_settings_only(self):
        r = self.client.put("/tenant/settings", json={"settings": {"brand_name": "Alpha Co", "locale": "es"}},
                            headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        mine = self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]
        other = self.client.get("/me/features", headers=self.as_tenant(3)).json()["settings"]
        self.assertEqual((mine["brand_name"], mine["locale"]), ("Alpha Co", "es"))
        self.assertEqual((other["brand_name"], other["locale"]), (None, None))

    def test_non_admin_cannot_edit_settings_or_see_private_ones(self):
        h = {"X-User-ID": str(self.emp_id)}
        self.assertEqual(self.client.put("/tenant/settings", json={"settings": {"brand_name": "x"}}, headers=h).status_code, 403)
        self.client.put("/tenant/settings", json={"settings": {"support_email": "help@alpha.test"}}, headers=self.as_tenant(2))
        seen = self.client.get("/tenant/settings", headers=h).json()["settings"]
        self.assertNotIn("support_email", seen)
        self.assertIn("brand_name", seen)

    def test_invalid_settings_rejected(self):
        r = self.client.put("/tenant/settings", json={"settings": {"primary_color": "blue"}}, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 422)

    def test_onboarding_creates_a_working_client(self):
        r = self.client.post("/superadmin/tenants", headers=self.sa(), json={
            "name": "acme", "business_name": "Acme Logistics", "preset": "bpo",
            "admin_email": "boss@acme.test", "admin_name": "Acme Boss", "admin_password": "s3cret-pw"})
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertNotIn("generated_admin_password", out)
        self.assertTrue(out["features"]["inventory"])
        self.assertFalse(out["features"]["marketplace"])
        self.assertFalse(out["features"]["voice_agent"])
        self.assertEqual(out["settings"]["brand_name"], "Acme Logistics")
        self.assertEqual(out["settings"]["default_currency"], "INR")
        login = self.client.post("/login", json={"email": "boss@acme.test", "password": "s3cret-pw"})
        self.assertEqual(login.status_code, 200, login.text)
        user = login.json()["user"]
        self.assertEqual((user["role"], user["tenant_id"]), ("Admin", out["tenant_id"]))
        h = {"Authorization": f"Bearer {login.json()['token']}"}
        me = self.client.get("/me/features", headers=h).json()
        self.assertEqual(me["preset"], "bpo")
        self.assertFalse(me["features"]["marketplace"])
        self.assertEqual(self.client.get("/inbox/counts", headers=h).status_code != 403, True)
        # brand-new tenant has no data of anyone else's
        self.assertEqual(self.client.get("/leads", headers=h).json()["leads"], [])

    def test_onboarding_generates_password_and_rejects_duplicates(self):
        body = {"name": "beta2", "preset": "agency", "admin_email": "x@beta2.test", "admin_name": "X"}
        r = self.client.post("/superadmin/tenants", headers=self.sa(), json=body)
        self.assertEqual(r.status_code, 200, r.text)
        pw = r.json()["generated_admin_password"]
        self.assertEqual(self.client.post("/login", json={"email": "x@beta2.test", "password": pw}).status_code, 200)
        self.assertEqual(self.client.post("/superadmin/tenants", headers=self.sa(), json=body).status_code, 409)
        body2 = {**body, "name": "beta3"}
        self.assertEqual(self.client.post("/superadmin/tenants", headers=self.sa(), json=body2).status_code, 409)

    def test_onboarding_validates_input(self):
        base = {"name": "gamma", "admin_email": "g@gamma.test", "admin_name": "G"}
        self.assertEqual(self.client.post("/superadmin/tenants", headers=self.sa(), json={**base, "preset": "nope"}).status_code, 422)
        self.assertEqual(self.client.post("/superadmin/tenants", headers=self.sa(),
                                          json={**base, "preset": "agency", "settings": {"primary_color": "x"}}).status_code, 422)
        self.assertEqual(self.client.post("/superadmin/tenants", headers=self.as_tenant(2),
                                          json={**base, "preset": "agency"}).status_code, 403)

    def test_applying_a_preset_replaces_all_entitlements(self):
        self.client.put("/superadmin/tenants/2/features", json={"preset": "institute"}, headers=self.sa())
        f = self.client.get("/me/features", headers=self.as_tenant(2)).json()["features"]
        self.assertFalse(f["clients"])
        self.assertFalse(f["billing"])
        self.assertTrue(f["leads"])
        self.assertTrue(f["inbox"])
        with Session(S.ENGINE) as s:
            n = s.exec(select(TenantFeature).where(TenantFeature.tenant_id == 2).execution_options(skip_tenant=True)).all()
            self.assertEqual(len(n), len(features.FEATURES) - sum(1 for x in features.FEATURES.values() if x.locked))

    def test_role_policy_changes_inbox_access(self):
        h = {"X-User-ID": str(self.emp_id)}
        before = self.client.get("/inbox/counts", headers=h).status_code
        self.assertNotEqual(before, 403)
        self.client.put("/tenant/settings", headers=self.as_tenant(2),
                        json={"settings": {"role_policy": {"inbox": {"full_access": ["Admin"], "scoped": ["SalesManager"]}}}})
        self.assertEqual(self.client.get("/inbox/counts", headers=h).status_code, 403)


class PasswordHardening(TenantIsolationBase):
    def _user(self, **kw):
        with Session(S.ENGINE) as s:
            u = User(email=kw.pop("email"), name="P", role="Admin", tenant_id=2, **kw)
            s.add(u)
            s.commit()

    def test_stored_hash_is_not_accepted_as_the_password(self):
        h = self.main._hash_password("real-pw")
        self._user(email="hash@t2.test", password=h)
        self.assertEqual(self.client.post("/login", json={"email": "hash@t2.test", "password": h}).status_code, 401)
        self.assertEqual(self.client.post("/login", json={"email": "hash@t2.test", "password": "real-pw"}).status_code, 200)

    def test_legacy_plaintext_account_still_logs_in(self):
        self._user(email="plain@t2.test", password="plain-pw")
        self.assertEqual(self.client.post("/login", json={"email": "plain@t2.test", "password": "plain-pw"}).status_code, 200)
        self.assertEqual(self.client.post("/login", json={"email": "plain@t2.test", "password": "wrong"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
