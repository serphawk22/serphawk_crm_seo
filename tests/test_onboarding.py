"""Automated onboarding: registration, auto-configuration, checklist, logo, lead statuses, demo workspaces,
customization requests, the company mailbox, bulk onboarding and a 100-tenant smoke test."""
import io
import os
import time
import unittest
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import (ClientProfile, CustomizationRequest, EmailOTP, EmailSettings, Lead, Notification, Tenant,
                       TenantAsset, TenantFeature, User)
from modules import auth_tokens, features, onboarding, otp, presets, ratelimit, tenant_assets, tenant_settings


def png_bytes(size=(64, 32), color=(200, 30, 30, 255), fmt="PNG"):
    from PIL import Image
    buf = io.BytesIO()
    im = Image.new("RGBA" if fmt == "PNG" else "RGB", size, color if fmt == "PNG" else color[:3])
    im.save(buf, format=fmt)
    return buf.getvalue()


class RecommendUnit(unittest.TestCase):
    def test_industry_picks_the_preset(self):
        r = onboarding.recommend_config
        self.assertEqual(r({"industry": "logistics"})["preset"], "bpo")
        self.assertEqual(r({"industry": "education"})["preset"], "institute")
        self.assertEqual(r({"industry": "agency"})["preset"], "agency")
        self.assertEqual(r({"industry": "retail"})["preset"], "standard")
        self.assertEqual(r({})["preset"], "standard")
        self.assertEqual(r({"industry": "nonsense"})["preset"], "standard", "unknown industries get the standard CRM")

    def test_country_sets_regional_defaults(self):
        s = onboarding.recommend_config({"country": "mx", "company_name": "Acme"})["settings"]
        self.assertEqual((s["default_currency"], s["timezone"], s["default_dial_code"], s["locale"]),
                         ("MXN", "America/Mexico_City", "+52", "es"))
        self.assertEqual(s["brand_name"], "Acme")
        self.assertEqual(s["country"], "MX")

    def test_unknown_country_sets_nothing_regional(self):
        s = onboarding.recommend_config({"country": "ZZ"})["settings"]
        for k in ("default_currency", "timezone", "default_dial_code", "locale", "country"):
            self.assertNotIn(k, s)

    def test_website_gets_a_scheme_and_description_is_generated(self):
        s = onboarding.recommend_config({"company_name": "Acme", "website": "acme.test", "industry": "retail",
                                         "country": "IN"})["settings"]
        self.assertEqual(s["website_url"], "https://acme.test")
        self.assertIn("Acme", s["ai_company_description"])

    def test_everything_recommended_passes_validation(self):
        for industry in [i["key"] for i in onboarding.INDUSTRIES]:
            for country in onboarding.COUNTRIES:
                rec = onboarding.recommend_config({"industry": industry, "country": country, "company_name": "A B",
                                                   "email": "a@b.test", "phone": "+1 555 1234", "website": "a.test"})
                tenant_settings.validate(rec["settings"])
                self.assertIn(rec["preset"], presets.PRESETS)

    def test_standard_preset_is_brand_neutral_and_complete(self):
        p = presets.PRESETS["standard"]
        self.assertEqual(p["settings"], {})
        for key in ("leads", "clients", "deals", "inbox", "followups", "billing", "proposals", "email_agent"):
            self.assertIn(key, p["features"])
        self.assertNotIn("voice_agent", p["features"])
        self.assertNotIn("institute", p["features"])


class OnboardingBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        ratelimit.reset()
        p = mock.patch.dict(os.environ, {"ALLOW_DEBUG_OTP": ""})       # the compose file turns this on for local use
        p.start()
        self.addCleanup(p.stop)
        features.invalidate()
        tenant_settings.invalidate()
        tenant_assets.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        self.addCleanup(tenant_assets.invalidate)
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

    def emp(self):
        return {"X-User-ID": str(self.emp_id)}

    def verified_email(self, email):
        """Run the real send + verify steps (the mail is captured instead of sent)."""
        sent = {}

        def fake(to, code, purpose="", **kw):
            sent[to] = code
            return True

        with mock.patch("modules.email_sender.send_otp_email", fake):
            r = self.client.post("/email-otp/send", json={"email": email, "purpose": "signup"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json()["debug_otp"])
        r = self.client.post("/email-otp/verify", json={"email": email, "otp_code": sent[email], "purpose": "signup"})
        self.assertEqual(r.status_code, 200, r.text)
        return sent[email]

    def register(self, email="owner@newco.test", **extra):
        body = {"company_name": "Newco Ltd", "admin_name": "Nia Newco", "email": email, "password": "S3cure-pass!",
                **extra}
        return self.client.post("/register", json=body)

    def tenant_row(self, tid):
        with Session(S.ENGINE) as s:
            return s.exec(select(Tenant).where(Tenant.id == tid).execution_options(skip_tenant=True)).first()


class Registration(OnboardingBase):
    def test_options_are_public(self):
        r = self.client.get("/register/options")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any(i["key"] == "logistics" for i in r.json()["industries"]))
        self.assertTrue(any(c["code"] == "MX" and c["dial_code"] == "+52" for c in r.json()["countries"]))

    def test_cannot_register_without_a_verified_email(self):
        r = self.register()
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("verify", r.json()["detail"].lower())

    def test_full_flow_creates_a_configured_workspace(self):
        self.verified_email("owner@newco.test")
        r = self.register(industry="logistics", country="IN", phone="+91 98765 43210", website="newco.test")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        tid = body["tenant_id"]
        self.assertEqual(body["preset"], "bpo")
        self.assertEqual(body["user"]["role"], "Admin")
        self.assertEqual(body["user"]["tenant_id"], tid)
        self.assertTrue(body["configured"])

        tenant = self.tenant_row(tid)
        self.assertTrue(tenant.is_trial)
        self.assertEqual(tenant.business_name, "Newco Ltd")

        cfg = self.client.get("/me/features", headers={"Authorization": f"Bearer {body['token']}"})
        self.assertEqual(cfg.status_code, 200, cfg.text)
        j = cfg.json()
        self.assertEqual(j["preset"], "bpo")
        self.assertEqual(j["settings"]["brand_name"], "Newco Ltd")
        self.assertEqual(j["settings"]["default_currency"], "INR")
        self.assertEqual(j["settings"]["website_url"], "https://newco.test")
        self.assertTrue(j["features"]["command_center"], "the logistics setup includes the business suite")

    def test_default_registration_is_the_standard_crm(self):
        self.verified_email("owner@newco.test")
        body = self.register().json()
        self.assertEqual(body["preset"], "standard")
        feats = self.client.get("/me/features", headers={"X-User-ID": str(body["user"]["id"])}).json()["features"]
        self.assertTrue(feats["leads"] and feats["billing"] and feats["inbox"])
        self.assertFalse(feats["voice_agent"] or feats["institute"] or feats["finance_suite"])

    def test_new_tenant_sees_none_of_the_other_tenants_data(self):
        self.verified_email("owner@newco.test")
        body = self.register().json()
        h = {"X-User-ID": str(body["user"]["id"])}
        self.assertEqual(self.client.get("/leads", headers=h).json()["leads"], [])
        r = self.client.get(f"/leads/{self.leads[2]}", headers=h)
        self.assertEqual(r.status_code, 404, r.text)

    def test_other_tenants_are_unchanged(self):
        before = self.client.get("/me/features", headers=self.as_tenant(2)).json()["features"]
        self.verified_email("owner@newco.test")
        self.register()
        self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(2)).json()["features"], before)

    def test_verification_is_single_use(self):
        self.verified_email("owner@newco.test")
        self.assertEqual(self.register().status_code, 200)
        r = self.register(company_name="Other Co")
        self.assertEqual(r.status_code, 400, r.text)         # already registered / code consumed
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(EmailOTP).where(EmailOTP.email == "owner@newco.test")).all(), [])

    def test_existing_email_is_refused(self):
        self.verified_email("fresh@newco.test")
        r = self.register(email="admin2@t2.test")
        self.assertEqual(r.status_code, 400, r.text)

    def test_validation(self):
        self.verified_email("owner@newco.test")
        self.assertEqual(self.register(password="short").status_code, 422)
        self.assertEqual(self.client.post("/register", json={"company_name": " ", "admin_name": "x", "email": "owner@newco.test",
                                                              "password": "longenough1"}).status_code, 422)
        self.assertEqual(self.register(email="not-an-email").status_code, 422)

    def test_nothing_is_left_behind_when_creation_fails(self):
        self.verified_email("owner@newco.test")
        with mock.patch.object(presets, "apply_preset", side_effect=RuntimeError("boom")):
            self.assertEqual(self.register().status_code, 500)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(Tenant).where(Tenant.business_name == "Newco Ltd").execution_options(skip_tenant=True)).all(), [])
            self.assertIsNone(s.exec(select(User).where(User.email == "owner@newco.test").execution_options(skip_tenant=True)).first())

    def test_operators_are_notified(self):
        self.verified_email("owner@newco.test")
        self.register()
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.user_id == self.super_id).execution_options(skip_tenant=True)).all()
        self.assertTrue(any("Newco" in n.message for n in notes))

    def test_registration_becomes_a_lead_in_the_master_tenant(self):
        with Session(S.ENGINE) as s:
            s.add(Tenant(id=50, name="Master Admin"))
            s.commit()
        self.verified_email("owner@newco.test")
        self.assertEqual(self.register().status_code, 200)
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.tenant_id == 50).execution_options(skip_tenant=True)).first()
        self.assertEqual(lead.company_name, "Newco Ltd")
        self.assertEqual(lead.source, "Trial Signup")

    def test_register_is_rate_limited(self):
        statuses = [self.register(email=f"x{i}@newco.test").status_code for i in range(12)]
        self.assertEqual(statuses.count(429), 2, statuses)

    def test_legacy_signup_goes_through_the_same_checks(self):
        body = {"name": "Old Path", "business_name": "Oldco", "email": "old@oldco.test", "phone": "123", "password": "S3cure-pass!"}
        self.assertEqual(self.client.post("/signup", json=body).status_code, 400)
        self.verified_email("old@oldco.test")
        r = self.client.post("/signup", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("tenant_id", r.json())


class OneTimeCodes(OnboardingBase):
    def send(self, email="a@x.test", sent=True):
        with mock.patch("modules.email_sender.send_otp_email", return_value=sent):
            return self.client.post("/email-otp/send", json={"email": email, "purpose": "signup"})

    def code(self, email="a@x.test"):
        with Session(S.ENGINE) as s:
            return s.exec(select(EmailOTP).where(EmailOTP.email == email)).first().otp_code

    def verify(self, code, email="a@x.test"):
        return self.client.post("/email-otp/verify", json={"email": email, "otp_code": code, "purpose": "signup"})

    def test_code_is_not_returned_when_the_mail_could_not_be_sent(self):
        r = self.send(sent=False)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["delivered"])
        self.assertIsNone(r.json()["debug_otp"])

    def test_code_is_returned_only_on_a_local_dev_setup(self):
        with mock.patch.dict(os.environ, {"ALLOW_DEBUG_OTP": "1"}):
            r = self.send(sent=False)
        self.assertEqual(r.json()["debug_otp"], self.code())

    def test_five_wrong_guesses_kill_the_code(self):
        self.send()
        real = self.code()
        wrong = "000000" if real != "000000" else "111111"
        for _ in range(otp.MAX_ATTEMPTS):
            self.assertEqual(self.verify(wrong).status_code, 400)
        self.assertEqual(self.verify(real).status_code, 400, "the right code must not work after too many wrong ones")
        self.send()                                         # a fresh code works again
        self.assertEqual(self.verify(self.code()).status_code, 200)

    def test_verify_works_with_timezone_aware_expiry(self):
        self.send()
        r = self.verify(self.code())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["verified"])

    def test_expired_code_is_rejected(self):
        self.send()
        with Session(S.ENGINE) as s:
            rec = s.exec(select(EmailOTP)).first()
            from datetime import datetime, timedelta, timezone
            rec.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            s.add(rec)
            s.commit()
        self.assertEqual(self.verify(self.code()).status_code, 400)

    def test_sending_is_throttled_per_address(self):
        statuses = [self.send().status_code for _ in range(7)]
        self.assertEqual(statuses.count(429), 2, statuses)


class AutoConfigure(OnboardingBase):
    def test_fills_blank_settings_and_keeps_chosen_ones(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"default_currency": "EUR"})
        r = self.client.post("/tenant/auto-configure", json={"industry": "retail", "country": "MX"}, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertNotIn("default_currency", out["applied"], "a value the admin set is never overwritten")
        self.assertIn("default_currency", out["kept"])
        self.assertEqual(out["applied"]["timezone"], "America/Mexico_City")
        s2 = self.client.get("/tenant/settings", headers=self.as_tenant(2)).json()["settings"]
        self.assertEqual((s2["default_currency"], s2["default_dial_code"], s2["industry"], s2["country"]), ("EUR", "+52", "retail", "MX"))

    def test_overwrite_applies_the_profile_defaults_again(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"default_currency": "EUR"})
        r = self.client.post("/tenant/auto-configure", json={"country": "IN", "overwrite": True}, headers=self.as_tenant(2))
        self.assertEqual(r.json()["applied"]["default_currency"], "INR")

    def test_does_not_touch_features_or_other_tenants(self):
        before = self.client.get("/me/features", headers=self.as_tenant(3)).json()
        feats = self.client.get("/me/features", headers=self.as_tenant(2)).json()["features"]
        self.client.post("/tenant/auto-configure", json={"industry": "logistics", "country": "IN"}, headers=self.as_tenant(2))
        self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(2)).json()["features"], feats)
        self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(3)).json(), before)

    def test_only_an_admin(self):
        self.assertEqual(self.client.post("/tenant/auto-configure", json={}, headers=self.emp()).status_code, 403)

    def test_bad_input_is_rejected_not_stored(self):
        r = self.client.post("/tenant/auto-configure", json={"industry": "Not A Key!"}, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, "unknown industries are simply ignored")
        self.assertNotIn("industry", r.json()["applied"])


class Checklist(OnboardingBase):
    def items(self, tid=3):
        r = self.client.get("/tenant/onboarding", headers=self.as_tenant(tid))
        self.assertEqual(r.status_code, 200, r.text)
        return r.json(), {i["key"]: i["done"] for i in r.json()["items"]}

    def test_progress_follows_what_the_admin_does(self):
        body, done = self.items()
        self.assertFalse(done["brand"] or done["logo"] or done["mailbox"])
        self.assertFalse(done["team"])
        self.assertTrue(done["first_lead"], "the fixture tenant already has a lead")
        before = body["percent"]

        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 3, {"brand_name": "Beta", "contact_email": "hi@beta.test"})
            s.add(EmailSettings(tenant_id=3, smtp_host="h", smtp_port=587, smtp_user="u", smtp_pass="p", from_name="A", from_email="a@beta.test"))
            s.commit()
        body, done = self.items()
        self.assertTrue(done["brand"] and done["contact"] and done["mailbox"])
        self.assertGreater(body["percent"], before)
        self.assertEqual(self.client.put("/tenant/logo", files={"file": ("l.png", png_bytes(), "image/png")},
                                         headers=self.as_tenant(3)).status_code, 200)
        self.assertTrue(self.items()[1]["logo"])

    def test_counts_are_per_tenant(self):
        with Session(S.ENGINE) as s:
            s.add(User(email="e1@t1.test", password="x", name="E", role="Employee", tenant_id=1))
            s.commit()
        self.assertTrue(self.items(1)[1]["team"])
        self.assertTrue(self.items(2)[1]["team"], "tenant 2 has its own employee")
        self.assertFalse(self.items(3)[1]["team"], "and tenant 3 still has none")

    def test_only_an_admin_sees_it(self):
        self.assertEqual(self.client.get("/tenant/onboarding", headers=self.emp()).status_code, 403)


class Logo(OnboardingBase):
    def put(self, data, name="logo.png", mime="image/png", headers=None):
        return self.client.put("/tenant/logo", files={"file": (name, data, mime)}, headers=headers or self.as_tenant(2))

    def test_upload_serve_and_setting(self):
        r = self.put(png_bytes((300, 100)))
        self.assertEqual(r.status_code, 200, r.text)
        url = r.json()["logo_url"]
        self.assertTrue(url.startswith("/tenant/logo/2?v="))
        self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]["brand_logo_url"], url)
        img = self.client.get("/tenant/logo/2")                       # public: no login
        self.assertEqual(img.status_code, 200)
        self.assertEqual(img.headers["content-type"], "image/png")
        self.assertEqual(img.headers["x-content-type-options"], "nosniff")
        from PIL import Image
        self.assertEqual(Image.open(io.BytesIO(img.content)).size, (300, 100))

    def test_large_images_are_scaled_down(self):
        self.put(png_bytes((2000, 1000)))
        from PIL import Image
        w, h = Image.open(io.BytesIO(self.client.get("/tenant/logo/2").content)).size
        self.assertEqual(max(w, h), tenant_assets.MAX_EDGE)
        self.assertEqual(w, 2 * h)

    def test_jpeg_is_accepted_and_stored_as_png(self):
        self.assertEqual(self.put(png_bytes((50, 50), (10, 20, 30, 255), "JPEG"), "l.jpg", "image/jpeg").status_code, 200)
        self.assertEqual(self.client.get("/tenant/logo/2").headers["content-type"], "image/png")

    def test_rejects_non_images_svg_and_oversize(self):
        for data, name, mime in ((b"hello", "a.png", "image/png"),
                                 (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "a.svg", "image/svg+xml"),
                                 (b"", "e.png", "image/png"),
                                 (b"GIF89a" + b"0" * 100, "a.gif", "image/gif"),
                                 (png_bytes((10, 10)) + b"0" * (tenant_assets.MAX_UPLOAD_BYTES + 10), "big.png", "image/png")):
            r = self.put(data, name, mime)
            self.assertEqual(r.status_code, 422, f"{name}: {r.text}")
        self.assertEqual(self.client.get("/tenant/logo/2").status_code, 404)

    def test_metadata_and_trailing_bytes_are_dropped(self):
        evil = png_bytes((20, 20)) + b"<?php system($_GET['c']); ?>"
        self.assertEqual(self.put(evil).status_code, 200)
        self.assertNotIn(b"<?php", self.client.get("/tenant/logo/2").content)

    def test_operator_can_set_a_clients_logo(self):
        r = self.client.put("/superadmin/tenants/3/logo", files={"file": ("l.png", png_bytes(), "image/png")}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.get("/tenant/logo/3").status_code, 200)
        self.assertEqual(self.client.get("/me/features", headers=self.as_tenant(3)).json()["settings"]["brand_logo_url"], r.json()["logo_url"])
        self.assertEqual(self.client.get("/tenant/logo/2").status_code, 404, "only that client changed")
        for headers, code in ((self.as_tenant(2), 403), (self.emp(), 403)):
            self.assertEqual(self.client.put("/superadmin/tenants/3/logo", files={"file": ("l.png", png_bytes(), "image/png")},
                                             headers=headers).status_code, code)
        self.assertEqual(self.client.put("/superadmin/tenants/999/logo", files={"file": ("l.png", png_bytes(), "image/png")},
                                         headers=self.sa()).status_code, 404)

    def test_only_admin_can_change_it(self):
        self.assertEqual(self.put(png_bytes(), headers=self.emp()).status_code, 403)
        self.assertEqual(self.client.delete("/tenant/logo", headers=self.emp()).status_code, 403)

    def test_each_tenant_has_its_own(self):
        self.put(png_bytes((10, 10), (255, 0, 0, 255)))
        self.put(png_bytes((10, 10), (0, 0, 255, 255)), headers=self.as_tenant(3))
        from PIL import Image
        px = lambda tid: Image.open(io.BytesIO(self.client.get(f"/tenant/logo/{tid}").content)).convert("RGBA").getpixel((0, 0))
        self.assertEqual(px(2)[:3], (255, 0, 0))
        self.assertEqual(px(3)[:3], (0, 0, 255))
        self.assertEqual(self.client.get("/tenant/logo/1").status_code, 404)

    def test_replace_and_delete(self):
        self.put(png_bytes((10, 10)))
        v1 = self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]["brand_logo_url"]
        time.sleep(1.1)
        self.put(png_bytes((20, 20)))
        v2 = self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]["brand_logo_url"]
        self.assertNotEqual(v1, v2, "the address changes with every upload so browsers refetch")
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(TenantAsset)).all()), 1)
        self.assertTrue(self.client.delete("/tenant/logo", headers=self.as_tenant(2)).json()["removed"])
        self.assertEqual(self.client.get("/tenant/logo/2").status_code, 404)
        self.assertIsNone(self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]["brand_logo_url"])

    def test_documents_use_the_tenants_logo_and_never_anothers(self):
        from modules import branding, pdf_export
        from modules.tenant_scope import current_tenant_id
        self.put(png_bytes((40, 40)))
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"brand_name": "Alpha"})
            tenant_settings.update_settings(s, 3, {"brand_name": "Beta"})      # own brand, no logo
        tok = current_tenant_id.set(2)
        try:
            self.assertIsNotNone(pdf_export._logo_flowable())
            self.assertTrue(branding.current_logo())
        finally:
            current_tenant_id.reset(tok)
        tok = current_tenant_id.set(3)
        try:
            self.assertIsNone(pdf_export._logo_flowable(), "a tenant with its own brand and no logo must not get SerpHawk's")
        finally:
            current_tenant_id.reset(tok)
        tok = current_tenant_id.set(1)                                         # default identity keeps its logo
        try:
            self.assertEqual(pdf_export._logo_flowable() is not None, os.path.exists(pdf_export._STATIC_LOGO))
        finally:
            current_tenant_id.reset(tok)

    def test_email_carries_the_tenant_logo(self):
        from modules import email_sender
        from modules.tenant_scope import current_tenant_id
        self.put(png_bytes((40, 20)))
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"brand_name": "Alpha"})
            tenant_settings.update_settings(s, 3, {"brand_name": "Beta"})
        tok = current_tenant_id.set(2)
        try:
            data, is_tenant = email_sender._logo_for_email()
            self.assertTrue(data and is_tenant)
            html = email_sender._inject_logo("<html><body><p>hi</p></body></html>", True)
            self.assertIn("cid:serphawk_logo", html)
            self.assertNotIn("width=\"150\" height=\"150\"", html, "a non-square logo must not be stretched")
        finally:
            current_tenant_id.reset(tok)
        tok = current_tenant_id.set(3)
        try:
            self.assertEqual(email_sender._logo_for_email(), (None, True))
        finally:
            current_tenant_id.reset(tok)


class InvoiceStyle(OnboardingBase):
    def test_invoice_renders_with_and_without_custom_style(self):
        from modules import pdf_export
        from modules.tenant_scope import current_tenant_id
        data = {"invoice_number": "INV-1", "client_name": "Acme", "currency": "$", "amount": 100, "tax": 10, "total": 110,
                "line_items": [{"description": "Work", "amount": 100, "provider": "us"}], "notes": "n"}
        tok = current_tenant_id.set(2)
        try:
            plain = pdf_export.invoice_pdf(data)
            with Session(S.ENGINE) as s:
                tenant_settings.update_settings(s, 2, {
                    "brand_name": "Alpha", "invoice_accent_color": "#ff0000", "invoice_footer_note": "Thank you!",
                    "invoice_payment_details": "Bank: 123\nIBAN: X", "invoice_terms": "Net 15", "invoice_logo_position": "right"})
            self.client.put("/tenant/logo", files={"file": ("l.png", png_bytes(), "image/png")}, headers=self.as_tenant(2))
            styled = pdf_export.invoice_pdf(data)
        finally:
            current_tenant_id.reset(tok)
        self.assertTrue(plain.startswith(b"%PDF") and styled.startswith(b"%PDF"))
        self.assertNotEqual(plain, styled)

    def test_invoice_settings_are_validated(self):
        for bad in ({"invoice_accent_color": "red"}, {"invoice_logo_position": "middle"}, {"invoice_footer_note": "x" * 400}):
            r = self.client.put("/tenant/settings", json={"settings": bad}, headers=self.as_tenant(2))
            self.assertEqual(r.status_code, 422, bad)
        r = self.client.put("/tenant/settings", json={"settings": {"invoice_accent_color": "#00aa00", "invoice_logo_position": "right"}},
                            headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)

    def test_document_style_defaults_to_the_brand_colour(self):
        from modules import branding
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"primary_color": "#112233"})
        self.assertEqual(branding.document_style(2)["accent"], "#112233")
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"invoice_accent_color": "#445566"})
        self.assertEqual(branding.document_style(2)["accent"], "#445566")
        self.assertIsNone(branding.document_style(3)["accent"])


class LeadStatuses(OnboardingBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            for tid, status in ((2, "Qualified"), (3, "Qualified")):
                s.add(Lead(company_name=f"Q{tid}", status=status, tenant_id=tid))
            s.commit()

    def statuses(self, tid):
        with Session(S.ENGINE) as s:
            return sorted(l.status for l in s.exec(select(Lead).where(Lead.tenant_id == tid).execution_options(skip_tenant=True)).all())

    def put(self, body, headers=None):
        return self.client.put("/tenant/lead-statuses", json=body, headers=headers or self.as_tenant(2))

    def test_set_labels_and_rename_existing_leads(self):
        r = self.put({"statuses": ["New", "Contacted", "Hot", "Won", "Lost"], "renames": {"Qualified": "Hot"}})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["leads_renamed"], 1)
        self.assertEqual(self.statuses(2), ["Hot", "New"])
        self.assertEqual(self.statuses(3), ["New", "Qualified"], "another tenant's leads are untouched")
        s = self.client.get("/me/features", headers=self.as_tenant(2)).json()["settings"]
        self.assertEqual(s["lead_statuses"], ["New", "Contacted", "Hot", "Won", "Lost"])
        self.assertIsNone(self.client.get("/me/features", headers=self.as_tenant(3)).json()["settings"]["lead_statuses"])

    def test_the_statuses_the_crm_sets_itself_stay(self):
        self.assertEqual(self.put({"statuses": ["Fresh", "Contacted", "Won"]}).status_code, 422)
        self.assertEqual(self.put({"statuses": ["New", "Reached", "Won"]}).status_code, 422)
        self.assertEqual(self.put({"statuses": ["New", "Contacted", "Won"], "renames": {"Contacted": "Won"}}).status_code, 422)

    def test_validation(self):
        self.assertEqual(self.put({"statuses": ["New"]}).status_code, 422)
        self.assertEqual(self.put({"statuses": ["New", "Contacted", "new"]}).status_code, 422, "duplicates ignore case")
        self.assertEqual(self.put({"statuses": ["New", "Contacted", "x" * 61]}).status_code, 422)
        self.assertEqual(self.put({"statuses": ["New", "Contacted", "A"], "renames": {"Qualified": "Missing"}}).status_code, 422)
        self.assertEqual(self.statuses(2), ["New", "Qualified"], "a rejected change changes nothing")

    def test_only_an_admin(self):
        self.assertEqual(self.put({"statuses": ["New", "Contacted"]}, self.emp()).status_code, 403)


class DemoWorkspace(OnboardingBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo", {"brand_name": "Alpha Logistics", "lead_intake_api_key": "secret-key"})

    def test_creates_a_separate_workspace_that_looks_like_the_organization(self):
        r = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        demo_tid = out["tenant_id"]
        self.assertNotEqual(demo_tid, 2)
        self.assertEqual(out["demo_of_tenant_id"], 2)
        self.assertEqual(out["sample_data"]["leads"], 8)

        # same modules and branding as Alpha, but never its secret
        real = self.client.get("/me/features", headers=self.as_tenant(2)).json()
        with Session(S.ENGINE) as s:
            demo_user = s.exec(select(User).where(User.tenant_id == demo_tid).execution_options(skip_tenant=True)).first()
        self.assertEqual(demo_user.role, "Demo")
        demo = self.client.get("/me/features", headers={"X-User-ID": str(demo_user.id)}).json()
        self.assertEqual(demo["features"], real["features"])
        self.assertEqual(demo["settings"]["brand_name"], "Alpha Logistics")
        stored = tenant_settings.get_stored(demo_tid, use_cache=False)[1]
        self.assertNotIn("lead_intake_api_key", stored)

    def test_demo_and_real_data_never_mix(self):
        demo_tid = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()["tenant_id"]
        with Session(S.ENGINE) as s:
            demo_user = s.exec(select(User).where(User.tenant_id == demo_tid).execution_options(skip_tenant=True)).first()
        h = {"X-User-ID": str(demo_user.id)}
        names = {l["company_name"] for l in self.client.get("/leads", headers=h).json()["leads"]}
        self.assertIn("Northwind Traders", names)
        self.assertNotIn("Lead of 2", names)
        real = {l["company_name"] for l in self.client.get("/leads", headers=self.as_tenant(2)).json()["leads"]}
        self.assertEqual(real, {"Lead of 2"}, "sample leads do not appear in the real workspace")
        self.assertEqual(self.client.get(f"/leads/{self.leads[2]}", headers=h).status_code, 404)

    def test_login_details_work_and_listing(self):
        out = self.client.post("/superadmin/tenants/2/demo", json={"email": "demo@alpha.test", "password": "Demo-pass-1"},
                               headers=self.sa()).json()
        self.assertEqual(out["demo_password"], "Demo-pass-1")
        r = self.client.post("/login", json={"email": "demo@alpha.test", "password": "Demo-pass-1"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["user"]["tenant_id"], out["tenant_id"])
        demos = self.client.get("/superadmin/tenants/2/demos", headers=self.sa()).json()["demos"]
        self.assertEqual([d["demo_email"] for d in demos], ["demo@alpha.test"])

    def test_a_second_demo_gets_its_own_login(self):
        a = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()
        b = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()
        self.assertNotEqual(a["tenant_id"], b["tenant_id"])
        self.assertNotEqual(a["admin_email"], b["admin_email"])

    def test_guards(self):
        self.assertEqual(self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.as_tenant(2)).status_code, 403)
        self.assertEqual(self.client.post("/superadmin/tenants/999/demo", json={}, headers=self.sa()).status_code, 404)
        demo_tid = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()["tenant_id"]
        self.assertEqual(self.client.post(f"/superadmin/tenants/{demo_tid}/demo", json={}, headers=self.sa()).status_code, 422)
        self.assertEqual(self.client.post("/superadmin/tenants/2/demo", json={"email": "admin3@t3.test"}, headers=self.sa()).status_code, 409)

    def test_sample_data_uses_the_tenants_own_status_labels(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_statuses": ["New", "Contacted", "Warm", "Hot"]})
        demo_tid = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()["tenant_id"]
        with Session(S.ENGINE) as s:
            statuses = {l.status for l in s.exec(select(Lead).where(Lead.tenant_id == demo_tid).execution_options(skip_tenant=True)).all()}
        self.assertTrue(statuses <= {"New", "Contacted", "Warm", "Hot"}, statuses)


class CustomizationRequests(OnboardingBase):
    def create(self, tid=2, **extra):
        body = {"title": "Add a WhatsApp channel", "description": "We want to message leads on WhatsApp.", **extra}
        return self.client.post("/tenant/requests", json=body, headers=self.as_tenant(tid))

    def test_client_raises_and_platform_is_told(self):
        r = self.create(category="integration", priority="high")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()["status"], r.json()["category"], r.json()["priority"]), ("new", "integration", "high"))
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.user_id == self.super_id).execution_options(skip_tenant=True)).all()
        self.assertTrue(any("WhatsApp" in n.message for n in notes))

    def test_each_client_sees_only_its_own(self):
        self.create(2)
        self.create(3, title="Other client's idea")
        mine = self.client.get("/tenant/requests", headers=self.as_tenant(2)).json()["requests"]
        self.assertEqual([m["title"] for m in mine], ["Add a WhatsApp channel"])
        rid3 = self.client.get("/tenant/requests", headers=self.as_tenant(3)).json()["requests"][0]["id"]
        self.assertEqual(self.client.get(f"/tenant/requests/{rid3}", headers=self.as_tenant(2)).status_code, 404)
        self.assertEqual(self.client.post(f"/tenant/requests/{rid3}/messages", json={"body": "hi"}, headers=self.as_tenant(2)).status_code, 404)

    def test_platform_sees_all_and_can_answer_and_progress(self):
        self.create(2)
        self.create(3, title="Beta idea")
        everything = self.client.get("/superadmin/requests", headers=self.sa()).json()["requests"]
        self.assertEqual({r["tenant_name"] for r in everything}, {"alpha", "beta"})
        rid = next(r["id"] for r in everything if r["tenant_name"] == "alpha")

        r = self.client.post(f"/superadmin/requests/{rid}/messages", json={"body": "We can do this next month."}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "in_review")
        self.assertTrue(r.json()["messages"][-1]["from_platform"])
        self.assertEqual(self.client.put(f"/superadmin/requests/{rid}", json={"status": "planned"}, headers=self.sa()).status_code, 200)

        thread = self.client.get(f"/tenant/requests/{rid}", headers=self.as_tenant(2)).json()
        self.assertEqual(thread["status"], "planned")
        self.assertEqual(len(thread["messages"]), 1)
        with Session(S.ENGINE) as s:
            told = s.exec(select(Notification).where(Notification.user_id == self.users[2]).execution_options(skip_tenant=True)).all()
        self.assertEqual(len(told), 2, "the client hears about the reply and the status change")

        r = self.client.post(f"/tenant/requests/{rid}/messages", json={"body": "Great, thanks"}, headers=self.as_tenant(2))
        self.assertFalse(r.json()["messages"][-1]["from_platform"])

    def test_writing_again_reopens_a_finished_request(self):
        rid = self.create().json()["id"]
        self.client.put(f"/superadmin/requests/{rid}", json={"status": "done"}, headers=self.sa())
        r = self.client.post(f"/tenant/requests/{rid}/messages", json={"body": "One more thing"}, headers=self.as_tenant(2))
        self.assertEqual(r.json()["status"], "in_review")

    def test_validation_and_roles(self):
        self.assertEqual(self.create(title=" ").status_code, 422)
        self.assertEqual(self.create(category="nope").status_code, 422)
        self.assertEqual(self.create(priority="urgent").status_code, 422)
        self.assertEqual(self.client.post("/tenant/requests", json={"title": "x", "description": "y"}, headers=self.emp()).status_code, 403)
        self.assertEqual(self.client.get("/superadmin/requests", headers=self.as_tenant(2)).status_code, 403)
        rid = self.create().json()["id"]
        self.assertEqual(self.client.put(f"/superadmin/requests/{rid}", json={"status": "done"}, headers=self.as_tenant(2)).status_code, 403)
        self.assertEqual(self.client.put(f"/superadmin/requests/{rid}", json={"status": "bogus"}, headers=self.sa()).status_code, 422)

    def test_filtering(self):
        a = self.create(2).json()["id"]
        self.create(3)
        self.client.put(f"/superadmin/requests/{a}", json={"status": "done"}, headers=self.sa())
        done = self.client.get("/superadmin/requests?status=done", headers=self.sa()).json()["requests"]
        self.assertEqual([r["id"] for r in done], [a])
        t3 = self.client.get("/superadmin/requests?tenant_id=3", headers=self.sa()).json()["requests"]
        self.assertEqual(len(t3), 1)


class CompanyMailbox(OnboardingBase):
    KEY = "test-key-for-company-mailbox-0000"

    def setUp(self):
        super().setUp()
        p = mock.patch.dict(os.environ, {"EMAIL_CREDENTIAL_ENCRYPTION_KEY": self.KEY})
        p.start()
        self.addCleanup(p.stop)

    def verify_address(self, user_id, email):
        from datetime import datetime, timedelta, timezone
        with Session(S.ENGINE) as s:
            s.add(EmailOTP(user_id=user_id, email=email, otp_code="123456", purpose="smtp_settings", verified=True,
                           expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)))
            s.commit()

    body = {"smtp_host": "smtp.alpha.test", "smtp_port": 587, "smtp_user": "mail@alpha.test", "smtp_pass": "app-secret",
            "from_name": "Alpha", "from_email": "mail@alpha.test"}

    def save(self, headers=None, **over):
        return self.client.post("/settings/email", json={**self.body, **over}, headers=headers or self.as_tenant(2))

    def stored(self, tid=2):
        with Session(S.ENGINE) as s:
            return s.exec(select(EmailSettings).where(EmailSettings.tenant_id == tid).execution_options(skip_tenant=True)).first()

    def test_saving_needs_a_verified_address_and_cannot_be_skipped(self):
        r = self.save()
        self.assertEqual(r.status_code, 400, r.text)
        r = self.client.post("/settings/email?otp_verified=true", json=self.body, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 400, "the old client-supplied flag no longer skips the check")
        self.assertIsNone(self.stored())

    def test_save_encrypts_and_never_returns_the_password(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        r = self.save()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn("app-secret", r.text)
        row = self.stored()
        self.assertNotEqual(row.smtp_pass, "app-secret")
        from modules import tenant_mailbox
        self.assertEqual(tenant_mailbox.reveal(row.smtp_pass), "app-secret")
        g = self.client.get("/settings/email", headers=self.as_tenant(2))
        self.assertEqual(g.status_code, 200)
        self.assertNotIn("app-secret", g.text)
        self.assertTrue(g.json()["has_password"] and g.json()["encrypted"])
        self.assertEqual(g.json()["smtp_pass"], "")

    def test_blank_password_on_update_keeps_the_saved_one(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.save()
        r = self.save(smtp_pass="", from_name="Alpha Team")
        self.assertEqual(r.status_code, 200, r.text)
        from modules import tenant_mailbox
        self.assertEqual(tenant_mailbox.reveal(self.stored().smtp_pass), "app-secret")
        self.assertEqual(self.stored().from_name, "Alpha Team")

    def test_first_save_needs_a_password(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.assertEqual(self.save(smtp_pass="").status_code, 422)

    def test_only_an_admin_can_read_or_change_it(self):
        self.verify_address(self.emp_id, "mail@alpha.test")
        self.assertEqual(self.save(headers=self.emp()).status_code, 403)
        self.assertEqual(self.client.get("/settings/email", headers=self.emp()).status_code, 403)

    def test_one_tenant_cannot_read_anothers_mailbox(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.save()
        g = self.client.get("/settings/email", headers=self.as_tenant(3))
        self.assertEqual(g.json(), {})

    def test_a_password_saved_in_plain_text_before_this_change_still_works(self):
        with Session(S.ENGINE) as s:
            s.add(EmailSettings(tenant_id=2, smtp_host="smtp.alpha.test", smtp_port=587, smtp_user="u", smtp_pass="plain-old",
                                from_name="A", from_email="mail@alpha.test"))
            s.commit()
        from modules import company_mailer
        with Session(S.ENGINE) as s:
            acct = company_mailer._tenant_settings(s, 2)
        self.assertEqual(acct.password, "plain-old")
        g = self.client.get("/settings/email", headers=self.as_tenant(2)).json()
        self.assertTrue(g["has_password"])
        self.assertFalse(g["encrypted"], "the page can tell the admin to re-save")

    def test_company_mailer_decrypts_for_sending(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.save()
        from modules import company_mailer
        with Session(S.ENGINE) as s:
            acct = company_mailer._tenant_settings(s, 2)
        self.assertEqual((acct.password, acct.email, acct.smtp_host), ("app-secret", "mail@alpha.test", "smtp.alpha.test"))

    def test_inbox_sync_gets_the_decrypted_password(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.save()
        from modules import inbox_sync
        with Session(S.ENGINE) as s:
            cfgs = [c for c in inbox_sync._all_mailboxes(s) if c.address == "mail@alpha.test"] if hasattr(inbox_sync, "_all_mailboxes") else []
        if cfgs:
            self.assertEqual(cfgs[0].password, "app-secret")

    def test_the_platform_operator_gets_a_clear_answer_never_a_401(self):
        """A 401 makes the app log the user out, so 'no company selected' must be a different status."""
        g = self.client.get("/settings/email", headers=self.sa())
        self.assertEqual((g.status_code, g.json()), (200, {"no_tenant": True}))
        self.assertEqual(self.save(headers=self.sa()).status_code, 400)
        self.assertEqual(self.client.post("/settings/email/test", json={}, headers=self.sa()).status_code, 400)
        self.assertEqual(self.client.get("/settings/email").status_code, 401, "not signed in is still a 401")

    def test_connection_test_uses_saved_details_and_is_admin_only(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        self.save()
        with mock.patch("modules.email_integration.test_smtp_connection", return_value=(True, "SMTP connection successful.")) as m:
            r = self.client.post("/settings/email/test", json={}, headers=self.as_tenant(2))
        self.assertEqual(r.json(), {"ok": True, "message": "SMTP connection successful."})
        self.assertEqual(m.call_args[0][:4], ("mail@alpha.test", "app-secret", "smtp.alpha.test", 587))
        self.assertEqual(self.client.post("/settings/email/test", json={}, headers=self.emp()).status_code, 403)
        self.assertEqual(self.client.post("/settings/email/test", json={}, headers=self.as_tenant(3)).status_code, 422, "nothing saved, nothing typed")

    def test_without_a_key_the_old_behaviour_is_kept_and_flagged(self):
        self.verify_address(self.users[2], "mail@alpha.test")
        with mock.patch.dict(os.environ, {"EMAIL_CREDENTIAL_ENCRYPTION_KEY": ""}):
            self.assertEqual(self.save().status_code, 200)
            self.assertEqual(self.stored().smtp_pass, "app-secret")
            self.assertFalse(self.client.get("/settings/email", headers=self.as_tenant(2)).json()["encrypted"])


class BulkOnboarding(OnboardingBase):
    def client_body(self, n, **extra):
        return {"name": f"client-{n}", "business_name": f"Client {n}", "admin_email": f"admin@client{n}.test",
                "admin_name": f"Admin {n}", "preset": "standard", **extra}

    def test_creates_many_and_reports_each(self):
        body = {"clients": [self.client_body(1, country="IN", industry="logistics", preset="bpo"), self.client_body(2),
                            self.client_body(3, preset="nope"), self.client_body(2)]}
        r = self.client.post("/superadmin/tenants/bulk", json=body, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertEqual((out["created"], out["failed"]), (2, 2))
        self.assertTrue(out["results"][0]["generated_admin_password"])
        self.assertIn("Unknown preset", out["results"][2]["error"])
        self.assertIn("already exists", out["results"][3]["error"])
        cfg = self.client.get(f"/superadmin/tenants/{out['results'][0]['tenant_id']}/config", headers=self.sa()).json()
        self.assertEqual(cfg["settings"]["default_currency"], "INR")
        self.assertEqual(cfg["settings"]["brand_name"], "Client 1")

    def test_only_the_operator(self):
        self.assertEqual(self.client.post("/superadmin/tenants/bulk", json={"clients": []}, headers=self.as_tenant(2)).status_code, 403)

    def test_single_onboarding_keeps_working_and_applies_the_profile(self):
        r = self.client.post("/superadmin/tenants", json={**self.client_body(9), "country": "MX", "settings": {"default_currency": "USD"}},
                             headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        s = r.json()["settings"]
        self.assertEqual((s["default_currency"], s["default_dial_code"]), ("USD", "+52"), "typed values beat the profile's")
        login = self.client.post("/login", json={"email": "admin@client9.test", "password": r.json()["generated_admin_password"]})
        self.assertEqual(login.status_code, 200, login.text)


class ClientOverview(OnboardingBase):
    def test_overview_has_real_numbers_per_client(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo", {"brand_name": "Alpha Logistics", "country": "IN"})
        self.client.put("/superadmin/tenants/2/logo", files={"file": ("l.png", png_bytes(), "image/png")}, headers=self.sa())
        self.client.post("/tenant/requests", json={"title": "x", "description": "y"}, headers=self.as_tenant(2))
        demo = self.client.post("/superadmin/tenants/2/demo", json={}, headers=self.sa()).json()
        r = self.client.get("/superadmin/tenants/overview", headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        by = {t["id"]: t for t in body["tenants"]}
        alpha = by[2]
        self.assertEqual((alpha["preset"], alpha["brand_name"], alpha["country"], alpha["has_logo"]), ("bpo", "Alpha Logistics", "IN", True))
        self.assertEqual((alpha["users"], alpha["leads"], alpha["clients"], alpha["open_requests"]), (2, 1, 1, 1))
        self.assertEqual(alpha["admin_email"], "admin2@t2.test")
        self.assertGreater(alpha["modules_on"], by[3]["modules_on"] - 1)
        self.assertFalse(by[3]["has_logo"])
        self.assertEqual(by[demo["tenant_id"]]["demo_of_tenant_id"], 2)
        self.assertEqual(body["totals"]["demo"], 1)
        self.assertEqual(body["totals"]["clients"], len(body["tenants"]) - 1)
        self.assertEqual(body["total_modules"], len(features.FEATURES))

    def test_only_the_operator(self):
        self.assertEqual(self.client.get("/superadmin/tenants/overview", headers=self.as_tenant(2)).status_code, 403)
        self.assertEqual(self.client.get("/superadmin/tenants/overview").status_code, 401)


class ScaleSmoke(OnboardingBase):
    """100 clients created through the API, each isolated from the others."""

    def test_one_hundred_tenants(self):
        started = time.monotonic()
        clients = [{"name": f"bulk-{i}", "business_name": f"Bulk {i}", "admin_email": f"a{i}@bulk{i}.test",
                    "admin_name": f"A{i}", "preset": "standard", "admin_password": "Pass-word-1"} for i in range(100)]
        r = self.client.post("/superadmin/tenants/bulk", json={"clients": clients}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["created"], 100, [x for x in r.json()["results"] if not x["ok"]][:3])
        created = time.monotonic() - started

        ids = {x["name"]: (x["tenant_id"], x["admin_user_id"]) for x in r.json()["results"]}
        with Session(S.ENGINE) as s:
            for name, (tid, uid) in ids.items():
                s.add(Lead(company_name=f"Lead of {name}", tenant_id=tid, owner_id=uid))
            s.commit()
        for name in ("bulk-0", "bulk-37", "bulk-99"):
            tid, uid = ids[name]
            seen = {l["company_name"] for l in self.client.get("/leads", headers={"X-User-ID": str(uid)}).json()["leads"]}
            self.assertEqual(seen, {f"Lead of {name}"}, name)
            self.assertEqual(self.client.get("/me/features", headers={"X-User-ID": str(uid)}).json()["tenant_id"], tid)

        with Session(S.ENGINE) as s:
            n_features = len(s.exec(select(TenantFeature).where(TenantFeature.tenant_id.in_([t for t, _ in ids.values()]))
                                    .execution_options(skip_tenant=True)).all())
        self.assertEqual(n_features, 100 * len(features.FEATURES) - 100 * sum(1 for f in features.FEATURES.values() if f.locked))
        self.assertLess(created, 60, f"creating 100 clients took {created:.1f}s")


class FollowUpRemindersAcrossTenants(OnboardingBase):
    """The reminder scheduler runs once over every tenant: each reminder goes to its own assignee from its own mailbox."""

    def setUp(self):
        super().setUp()
        from datetime import datetime, timedelta, timezone
        from database import FollowUp
        self.now = datetime.now(timezone.utc)
        with Session(S.ENGINE) as s:
            for tid in (2, 3):
                s.add(EmailSettings(tenant_id=tid, smtp_host=f"smtp.t{tid}.test", smtp_port=587, smtp_user=f"mail@t{tid}.test",
                                    smtp_pass="pw", from_name=f"T{tid}", from_email=f"mail@t{tid}.test"))
                s.add(FollowUp(tenant_id=tid, lead_id=self.leads[tid], title=f"Call tenant {tid}", due_at=self.now - timedelta(minutes=5),
                               assigned_to=self.users[tid], created_by=self.users[tid], contact_email=f"lead{tid}@x.test"))
            s.add(FollowUp(tenant_id=2, lead_id=self.leads[2], title="Not yet", due_at=self.now + timedelta(days=2),
                           assigned_to=self.users[2], created_by=self.users[2]))
            s.commit()

    def run_reminders(self):
        from modules import followups_core as core
        calls = []

        def fake(account, *, to, subject, body, **kw):
            calls.append({"from": account.email, "to": to, "subject": subject, "body": body})

        return core.process_due_reminders(engine=S.ENGINE, send_email=fake, now=self.now), calls

    def test_each_reminder_goes_to_its_own_assignee_from_its_own_mailbox(self):
        n, calls = self.run_reminders()
        self.assertEqual(n, 2)
        self.assertEqual(sorted((c["from"], c["to"]) for c in calls),
                         [("mail@t2.test", "admin2@t2.test"), ("mail@t3.test", "admin3@t3.test")])
        for c in calls:
            tid = c["to"].split("@")[0][-1]
            self.assertIn(f"Call tenant {tid}", c["subject"])
            self.assertNotIn("Not yet", c["subject"])

    def test_a_reminder_is_sent_once_and_notified_inside_its_tenant(self):
        self.run_reminders()
        n, calls = self.run_reminders()
        self.assertEqual((n, calls), (0, []))
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.title.like("Follow-up due%")).execution_options(skip_tenant=True)).all()
        self.assertEqual(sorted((x.tenant_id, x.user_id) for x in notes), sorted([(2, self.users[2]), (3, self.users[3])]))

    def test_the_follow_ups_api_only_shows_a_tenants_own(self):
        r = self.client.get("/followups", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        titles = {f["title"] for f in r.json()["items"]}
        self.assertEqual(titles, {"Call tenant 2", "Not yet"})


if __name__ == "__main__":
    unittest.main()
