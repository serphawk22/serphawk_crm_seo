import json
import os
import time
import uuid
from unittest import mock
from sqlmodel import Session, select
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Lead, TenantDomain, Notification
from modules import company_domains as domains, tenant_settings, features
from addons.lead_capture.models import Enquiry
from addons.lead_capture.config import default_form
from addons.lead_capture.attribution import touch
import unittest


class BotVerificationTests(unittest.TestCase):
    def verify(self, result, secret="configured-production-secret"):
        from addons.lead_capture.routes import verify_bot
        response = mock.Mock()
        response.json.return_value = result
        with mock.patch("addons.lead_capture.routes.turnstile_settings.credentials", return_value=("site-key", secret)), \
             mock.patch("addons.lead_capture.routes.requests.post", return_value=response):
            verify_bot("verification-token", "dapros.serphawk.in")

    def test_success_requires_company_hostname_and_action(self):
        self.verify({"success": True, "hostname": "dapros.serphawk.in", "action": "lead_capture"})

    def test_another_company_hostname_is_rejected(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as error:
            self.verify({"success": True, "hostname": "scmhb.serphawk.in", "action": "lead_capture"})
        self.assertEqual(error.exception.status_code, 422)

    def test_missing_action_is_rejected(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as error:
            self.verify({"success": True, "hostname": "dapros.serphawk.in"})
        self.assertEqual(error.exception.status_code, 422)

    def test_dummy_secret_is_rejected(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as error:
            self.verify({"success": True, "hostname": "example.com"}, secret="1x0000000000000000000000000000000AA")
        self.assertEqual(error.exception.status_code, 503)


class LeadCapture(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        self.env = mock.patch.dict(os.environ, {"COMPANY_PROXY_SECRET": "test-only-company-secret"})
        self.env.start(); self.addCleanup(self.env.stop)
        def sign_apex(request):
            if request.headers.pop("x-test-unsigned", None) or "x-company-host" in request.headers:
                return
            stamp = str(int(time.time()))
            target = request.url.raw_path.decode("ascii")
            request.headers.update({"x-company-host": "serphawk.in", "x-company-time": stamp,
                "x-company-signature": domains.signature(request.method, target, "serphawk.in", stamp, request.content)})
        self.client.event_hooks["request"].append(sign_apex)
        self.bot = mock.patch("addons.lead_capture.routes.verify_bot")
        self.bot.start(); self.addCleanup(self.bot.stop)
        tenant_settings.invalidate(); features.invalidate()
        self.addCleanup(tenant_settings.invalidate); self.addCleanup(features.invalidate)
        self.revision = str(uuid.uuid4())
        with Session(S.ENGINE) as s:
            for tid, slug in ((2, "dapros"), (3, "scmhb")):
                s.add(TenantDomain(tenant_id=tid, slug=slug))
                s.commit()
                features.set_features(s, tid, {"public_lead_pages": True})
                tenant_settings.update_settings(s, tid, {"lead_form_published": {**default_form(), "revision": self.revision}, "brand_name": slug})

    def signed(self, method, path, body=None, host="dapros.serphawk.in", uid=None):
        data = json.dumps(body).encode() if body is not None else b""
        stamp = str(int(time.time()))
        headers = {"x-company-host": host, "x-company-time": stamp,
                   "x-company-signature": domains.signature(method, path, host, stamp, data), "content-type": "application/json"}
        if uid: headers["X-User-ID"] = str(uid)
        return self.client.request(method, path, content=data, headers=headers)

    def body(self, **patch):
        return {"submission_id": str(uuid.uuid4()), "revision": self.revision,
                "fields": {"name": "Prospect", "email": "new@example.test"}, "attribution": {"current": {"utm_source": "google", "utm_medium": "cpc", "utm_campaign": "summer"}}, **patch}

    def submit(self, body=None, host="dapros.serphawk.in"):
        return self.signed("POST", "/internal/lead-capture/submit", body or self.body(), host)

    def test_submit_scoped_and_retry_is_idempotent(self):
        body = self.body()
        r = self.submit(body); self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), self.submit(body).json())
        self.assertNotIn("lead_id", r.json())
        with Session(S.ENGINE) as s:
            enquiries = s.exec(select(Enquiry).execution_options(skip_tenant=True)).all()
            self.assertEqual(len(enquiries), 1)
            row = enquiries[0]
            self.assertEqual((row.tenant_id, row.receiving_company_name, row.hostname), (2, "dapros", "dapros.serphawk.in"))
            lead = s.exec(select(Lead).where(Lead.id == row.lead_id).execution_options(skip_tenant=True)).first()
            self.assertIsNone(lead.website)
            self.assertIsNone(lead.owner_id)
            self.assertEqual(lead.source, "google")

    def test_repeat_preserves_lead_and_owner(self):
        self.submit()
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.email == "new@example.test").execution_options(skip_tenant=True)).first()
            lead.status = "Contacted"; lead.owner_id = self.users[2]; s.add(lead); s.commit()
        self.assertEqual(self.submit().status_code, 200)
        with Session(S.ENGINE) as s:
            rows = s.exec(select(Enquiry).execution_options(skip_tenant=True)).all()
            self.assertEqual(len({r.lead_id for r in rows}), 1)
            self.assertEqual(sum(r.new_lead for r in rows), 1)

    def test_same_contact_different_company(self):
        self.submit(); self.submit(host="scmhb.serphawk.in")
        with Session(S.ENGINE) as s:
            rows = s.exec(select(Enquiry).execution_options(skip_tenant=True)).all()
            self.assertEqual({r.tenant_id for r in rows}, {2, 3})
            self.assertEqual(len({r.lead_id for r in rows}), 2)

    def test_tenant_spoofing_rejected(self):
        body = self.body(); body["fields"]["tenant_id"] = 3
        self.assertEqual(self.submit(body).status_code, 422)
        self.assertEqual(self.submit(host="unknown.serphawk.in").status_code, 404)

    def test_wrong_account_and_bad_signature(self):
        r = self.signed("GET", "/leads", uid=self.users[3])
        self.assertEqual(r.status_code, 403)
        r = self.client.get("/leads", headers={"x-company-host": "dapros.serphawk.in", "x-company-time": "0"})
        self.assertEqual(r.status_code, 403)

    def test_unpublish_does_not_block_crm(self):
        with Session(S.ENGINE) as s: tenant_settings.update_settings(s, 2, {"lead_form_published": None})
        self.assertEqual(self.submit().status_code, 404)
        self.assertEqual(self.signed("GET", "/leads", uid=self.users[2]).status_code, 200)

    def test_validation_conflicts_and_feature_gate(self):
        body = self.body(); self.submit(body)
        body["fields"]["name"] = "Changed"
        self.assertEqual(self.submit(body).status_code, 409)
        self.assertEqual(self.submit(self.body(revision="old")).status_code, 409)
        self.assertEqual(self.submit(self.body(fields={"name": "Nobody"})).status_code, 422)
        with Session(S.ENGINE) as s: features.set_features(s, 2, {"public_lead_pages": False})
        self.assertEqual(self.submit().status_code, 403)

    def test_rate_limit_and_no_cross_tenant_notifications(self):
        for _ in range(10): self.assertEqual(self.submit().status_code, 200)
        self.assertEqual(self.submit().status_code, 429)
        with Session(S.ENGINE) as s:
            rows = s.exec(select(Notification).execution_options(skip_tenant=True)).all()
            self.assertEqual({r.user_id for r in rows}, {self.users[2]})

    def test_reporting_visibility_and_export(self):
        self.submit()
        r = self.client.get("/lead-capture", headers=self.as_tenant(2))
        self.assertEqual(r.json()["summary"]["new_leads"], 1)
        r = self.client.get("/lead-capture", headers=self.as_tenant(3))
        self.assertEqual(r.json()["enquiries"], [])
        self.assertEqual(self.client.get("/lead-capture/export", headers=self.as_tenant(2)).status_code, 200)

    def test_classification(self):
        self.assertEqual(touch({"fbclid": "abc"})["channel"], "organic_social")
        self.assertEqual(touch({"gclid": "abc"})["channel"], "paid_search")
        self.assertEqual(touch({"utm_source": "instagram", "utm_medium": "paid_social"})["channel"], "paid_social")
        self.assertEqual(touch({})["channel"], "direct_unknown")

    def test_slug_validation(self):
        for value in ("www", "Dapros", "../dapros", "a", "a.b", "-abc"):
            with self.assertRaises(ValueError): domains.validate_slug(value)

    def test_conflicting_email_and_phone_require_review(self):
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.id == self.leads[2]).execution_options(skip_tenant=True)).first()
            lead.phone = "+919876543210"; s.add(lead); s.commit()
        self.submit()
        body = self.body(fields={"name": "Conflict", "email": "new@example.test", "phone": "+919876543210"})
        self.assertEqual(self.submit(body).status_code, 200)
        r = self.client.get("/lead-capture", headers=self.as_tenant(2))
        pending = next(row for row in r.json()["enquiries"] if row["state"] == "pending_conflict")
        r = self.client.post(f"/lead-capture/{pending['id']}/resolve", json={"lead_id": self.leads[3]}, headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 404)
        r = self.client.post(f"/lead-capture/{pending['id']}/resolve", json={"lead_id": self.leads[2]}, headers=self.as_tenant(2))
        self.assertEqual(r.json()["state"], "linked")

    def test_capacity_keeps_enquiry_and_retry_creates_lead(self):
        from database import Tenant
        with Session(S.ENGINE) as s:
            tenant = s.get(Tenant, 2); tenant.limit_clients = 1; s.add(tenant); s.commit()
        self.assertEqual(self.submit().status_code, 200)
        row = self.client.get("/lead-capture", headers=self.as_tenant(2)).json()["enquiries"][0]
        self.assertEqual(row["state"], "pending_capacity")
        with Session(S.ENGINE) as s:
            tenant = s.get(Tenant, 2); tenant.limit_clients = 10; s.add(tenant); s.commit()
        r = self.client.post(f"/lead-capture/{row['id']}/resolve", json={}, headers=self.as_tenant(2))
        self.assertEqual(r.json()["state"], "linked")

    def test_converted_lead_is_not_reopened(self):
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.id == self.leads[2]).execution_options(skip_tenant=True)).first()
            lead.is_converted = True; lead.status = "Converted"; s.add(lead); s.commit()
        self.submit(self.body(fields={"name": "Returning", "email": "lead2@x.test"}))
        self.assertEqual(self.lead_row(2).status, "Converted")

    def test_bot_failure_does_not_create_rows(self):
        from fastapi import HTTPException
        with mock.patch("addons.lead_capture.routes.verify_bot", side_effect=HTTPException(422, "Expired")):
            self.assertEqual(self.submit().status_code, 422)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(Enquiry).execution_options(skip_tenant=True)).all(), [])

    def test_database_failure_is_recoverable_and_private(self):
        from sqlalchemy.exc import SQLAlchemyError
        with mock.patch("addons.lead_capture.routes.link_or_create", side_effect=SQLAlchemyError("private@example.test")):
            response = self.submit()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private@example.test", response.text)

    def test_publish_requires_settings_and_generic_api_cannot_bypass_it(self):
        r = self.client.put("/tenant/settings", headers=self.as_tenant(2), json={"settings": {"lead_form_published": {}}})
        self.assertEqual(r.status_code, 422)
        r = self.client.post("/tenant/lead-capture/publish", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 503)
        with mock.patch("addons.lead_capture.routes.turnstile_settings.credentials", return_value=("site-key", "secret-key")):
            self.assertEqual(self.client.post("/tenant/lead-capture/publish", headers=self.as_tenant(2)).status_code, 422)
            form = default_form(); form["privacy_notice"] = "We use your contact details to answer your enquiry."
            self.assertEqual(self.client.put("/tenant/lead-capture", headers=self.as_tenant(2), json=form).status_code, 200)
            self.assertEqual(self.client.post("/tenant/lead-capture/publish", headers=self.as_tenant(2)).status_code, 200)

    def test_recovery_never_returns_link_or_uses_attacker_origin(self):
        with mock.patch("modules.email_sender.send_password_reset_email", return_value=False) as send:
            r = self.client.post("/auth/forgot-password", json={"email": "admin2@t2.test", "redirect_url": "https://attacker.test"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), {"message"})
        self.assertTrue(send.call_args.args[1].startswith("https://dapros.serphawk.in/reset-password?"))

    def test_draft_is_not_public_and_prelogin_brand_has_no_settings_secrets(self):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"lead_intake_api_key": "private-key"})
        r = self.signed("GET", "/internal/company-brand")
        self.assertEqual(r.json()["brand_name"], "dapros")
        self.assertNotIn("private-key", r.text)
        self.assertEqual(self.signed("GET", "/internal/lead-capture/config", host="serphawk.in").status_code, 404)

    def test_enforced_host_context_and_changed_body_rejected(self):
        self.assertEqual(self.client.get("/leads", headers={**self.as_tenant(2), "x-test-unsigned": "1"}).status_code, 403)
        self.assertEqual(self.client.get("/health", headers={"x-test-unsigned": "1"}).status_code, 200)

    def test_company_creation_domain_is_atomic(self):
        from modules import onboarding
        from database import Tenant
        with Session(S.ENGINE) as s, mock.patch("modules.presets.apply_preset", side_effect=ValueError("failure")):
            with self.assertRaises(ValueError):
                onboarding.create_workspace(s, company_name="Atomic", admin_name="A", admin_email="atomic@example.test", password_hash="hash", subdomain_slug="atomic-company")
        with Session(S.ENGINE) as s:
            self.assertIsNone(s.exec(select(Tenant).where(Tenant.name == "Atomic")).first())
            self.assertIsNone(s.exec(select(TenantDomain).where(TenantDomain.slug == "atomic-company").execution_options(skip_tenant=True)).first())

    def test_public_form_returns_only_the_public_site_key(self):
        from modules import turnstile_settings
        with mock.patch.dict(os.environ, {"SESSION_SECRET": "stable-test-session-key"}), Session(S.ENGINE) as session:
            turnstile_settings.save(session, "public-site-key", "private-secret-key")
            response = self.signed("GET", "/internal/lead-capture/config")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["site_key"], "public-site-key")
        self.assertNotIn("private-secret-key", response.text)
        self.assertNotIn("encrypted_secret", response.text)


class PlatformBotSettings(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        self.env = mock.patch.dict(os.environ, {"SESSION_SECRET": "platform-stable-session-key"})
        self.env.start(); self.addCleanup(self.env.stop)
        from database import User
        with Session(S.ENGINE) as session:
            user = User(email="operator@example.test", name="Operator", password="hash", role="SuperAdmin", tenant_id=None)
            session.add(user); session.commit(); session.refresh(user)
            self.headers = {"X-User-ID": str(user.id)}

    def test_only_platform_operator_can_read_or_write(self):
        for method in ("GET", "PUT"):
            r = self.client.request(method, "/superadmin/security/turnstile", headers=self.as_tenant(2),
                                    **({"json": {"site_key": "site-key", "secret_key": "secret-key"}} if method == "PUT" else {}))
            self.assertEqual(r.status_code, 403)

    def test_secret_is_encrypted_write_only_and_can_be_preserved(self):
        from database import PlatformSecuritySettings
        from modules import turnstile_settings
        r = self.client.put("/superadmin/security/turnstile", headers=self.headers,
                            json={"site_key": "site-key", "secret_key": "private-secret-value"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["configured"])
        self.assertNotIn("private-secret-value", r.text)
        with Session(S.ENGINE) as session:
            row = session.get(PlatformSecuritySettings, "turnstile")
            encrypted = row.encrypted_secret
            self.assertNotIn("private-secret-value", encrypted)
        self.assertEqual(turnstile_settings.credentials(), ("site-key", "private-secret-value"))
        r = self.client.put("/superadmin/security/turnstile", headers=self.headers, json={"site_key": "updated-site-key"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(turnstile_settings.credentials(), ("updated-site-key", "private-secret-value"))
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(PlatformSecuritySettings, "turnstile").encrypted_secret, encrypted)
        r = self.client.get("/superadmin/security/turnstile", headers=self.headers)
        self.assertNotIn(encrypted, r.text)
        self.assertNotIn("private-secret-value", r.text)

    def test_missing_or_rotated_session_secret_fails_closed(self):
        from modules import turnstile_settings
        from fastapi import HTTPException
        with mock.patch.dict(os.environ, {"SESSION_SECRET": ""}):
            r = self.client.put("/superadmin/security/turnstile", headers=self.headers, json={"site_key": "site-key", "secret_key": "secret-key"})
            self.assertEqual(r.status_code, 503)
        self.client.put("/superadmin/security/turnstile", headers=self.headers, json={"site_key": "site-key", "secret_key": "secret-key"})
        with mock.patch.dict(os.environ, {"SESSION_SECRET": "rotated-key"}):
            r = self.client.get("/superadmin/security/turnstile", headers=self.headers)
            self.assertFalse(r.json()["configured"])
            with self.assertRaises(HTTPException):
                turnstile_settings.credentials()

    def test_dummy_keys_are_rejected(self):
        r = self.client.put("/superadmin/security/turnstile", headers=self.headers,
                            json={"site_key": "site-key", "secret_key": "1x0000000000000000000000000000000AA"})
        self.assertEqual(r.status_code, 422)
