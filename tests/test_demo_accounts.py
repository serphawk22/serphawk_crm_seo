"""Demo accounts: self-service sign-up (/signup, Google) and their management in Demo Account Data."""
import os
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import EmailOTP, Lead, Notification, PageVisitTelemetry, Tenant, TenantFeature, User
from modules import demo_accounts, features, onboarding, ratelimit, tenant_settings

PASSWORD = "S3cure-pass!"


class DemoBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        ratelimit.reset()
        p = mock.patch.dict(os.environ, {"ALLOW_DEBUG_OTP": ""})
        p.start()
        self.addCleanup(p.stop)
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            su = User(email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None)
            s.add(su)
            s.commit()
            s.refresh(su)
            self.super_id = su.id

    def sa(self):
        return {"X-User-ID": str(self.super_id)}

    def verify(self, email):
        sent = {}

        def fake(to, code, **kw):
            sent[to] = code
            return True

        with mock.patch("modules.email_sender.send_otp_email", fake):
            self.assertEqual(self.client.post("/email-otp/send", json={"email": email, "purpose": "signup"}).status_code, 200)
        r = self.client.post("/email-otp/verify", json={"email": email, "otp_code": sent[email], "purpose": "signup"})
        self.assertEqual(r.status_code, 200, r.text)

    def signup(self, email="visitor@demo.test", name="Vee Visitor", password=PASSWORD, verify=True):
        if verify:
            self.verify(email)
        return self.client.post("/demo/signup", json={"name": name, "email": email, "password": password})

    def demo_user(self, email="visitor@demo.test"):
        with Session(S.ENGINE) as s:
            return s.exec(select(User).where(User.email == email).execution_options(skip_tenant=True)).first()

    def tenant(self, tid):
        with Session(S.ENGINE) as s:
            return s.exec(select(Tenant).where(Tenant.id == tid).execution_options(skip_tenant=True)).first()

    def bearer(self, email="visitor@demo.test", password=PASSWORD):
        r = self.client.post("/login", json={"email": email, "password": password})
        self.assertEqual(r.status_code, 200, r.text)
        return {"Authorization": f"Bearer {r.json()['token']}"}

    def listing(self, headers):
        r = self.client.get("/telemetry/demo-accounts", headers=headers)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()


class Signup(DemoBase):
    def test_creates_a_configured_demo_workspace(self):
        r = self.signup()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["user"]["role"], "Demo")
        self.assertTrue(r.json()["token"])
        user = self.demo_user()
        t = self.tenant(user.tenant_id)
        self.assertNotIn(user.tenant_id, (1, 2, 3))
        self.assertTrue(t.is_trial)
        self.assertIsNone(t.demo_of_tenant_id)
        self.assertEqual((t.limit_clients, t.limit_emails, t.limit_calls), (15, 5, 5))
        with Session(S.ENGINE) as s:
            rows = s.exec(select(TenantFeature).where(TenantFeature.tenant_id == t.id).execution_options(skip_tenant=True)).all()
        self.assertTrue(rows, "the demo preset writes explicit module rows")
        self.assertEqual(tenant_settings.get_stored(t.id, use_cache=False)[0], demo_accounts.DEMO_PRESET)

    def test_then_login_and_onboarding_work(self):
        self.signup()
        h = self.bearer()
        r = self.client.post("/onboarding", json={"company": "Vee Co", "phone": "123"}, headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.tenant(self.demo_user().tenant_id).business_name, "Vee Co")

    def test_sees_none_of_the_other_companies_data(self):
        self.signup()
        r = self.client.get("/leads", headers=self.bearer())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["leads"], [])

    def test_needs_a_verified_email(self):
        self.assertEqual(self.signup(verify=False).status_code, 400)
        self.assertIsNone(self.demo_user())

    def test_validation(self):
        self.assertEqual(self.signup(password="short").status_code, 422)
        self.assertEqual(self.signup(email="not-an-email", verify=False).status_code, 422)

    def test_existing_email_is_refused_whatever_the_case(self):
        self.signup()
        r = self.client.post("/email-otp/send", json={"email": "VISITOR@demo.test", "purpose": "signup"})
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/demo/signup", json={"name": "x", "email": "Visitor@Demo.test", "password": PASSWORD})
        self.assertEqual(r.status_code, 400)

    def test_operators_are_notified(self):
        self.signup()
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.user_id == self.super_id).execution_options(skip_tenant=True)).all()
        self.assertTrue(any("visitor@demo.test" in n.message and n.link == "/admin/telemetry" for n in notes))

    def test_google_sign_up_makes_the_same_workspace(self):
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {"email": "gee@demo.test", "name": "Gee"}
        with mock.patch("requests.get", return_value=resp):
            r = self.client.post("/auth/google", json={"access_token": "t"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["is_new_user"])
        user = self.demo_user("gee@demo.test")
        self.assertEqual(user.role, "Demo")
        self.assertTrue(self.tenant(user.tenant_id).is_trial)


class Listing(DemoBase):
    def test_operator_sees_every_demo_with_its_details(self):
        self.signup()
        data = self.listing(self.sa())
        self.assertTrue(data["is_operator"])
        [a] = data["accounts"]
        self.assertEqual((a["email"], a["kind"], a["active"]), ("visitor@demo.test", "self_service", True))
        self.assertEqual(a["limits"]["clients"], {"usage": 0, "limit": 15})
        self.assertEqual(a["records"], {"leads": 0, "clients": 0})
        self.assertTrue(a["can_convert"] and a["can_delete"] and a["can_change_limits"])
        self.assertEqual(data["summary"]["total"], 1)
        self.assertEqual(data["summary"]["new_this_week"], 1)

    def test_company_admin_sees_only_their_own_demos(self):
        self.signup()
        with Session(S.ENGINE) as s:
            s.add(User(email="showcase@t2.test", password="x", name="Showcase", role="Demo", tenant_id=2))
            s.commit()
            out = onboarding.create_demo_workspace(s, 2, "x", "trial@t2.test", "Trial for alpha")
        data = self.listing(self.as_tenant(2))
        self.assertFalse(data["is_operator"])
        self.assertEqual({a["email"] for a in data["accounts"]}, {"showcase@t2.test", "trial@t2.test"})
        self.assertNotIn("pending_signups", data)
        org = next(a for a in data["accounts"] if a["email"] == "trial@t2.test")
        self.assertEqual((org["kind"], org["demo_of_name"]), ("organization", "alpha"))
        self.assertFalse(org["can_delete"] or org["can_change_limits"] or org["can_convert"])
        self.assertEqual(self.listing(self.as_tenant(3))["accounts"], [])
        r = self.client.get(f"/telemetry/demo-account/{out['admin_user_id']}", headers=self.as_tenant(3))
        self.assertEqual(r.status_code, 404)

    def test_a_demo_user_cannot_open_it(self):
        self.signup()
        self.assertEqual(self.client.get("/telemetry/demo-accounts", headers=self.bearer()).status_code, 403)

    def test_last_active_comes_from_page_visits(self):
        self.signup()
        self.client.post("/telemetry/page-visit", json={"page_path": "/leads", "time_spent_seconds": 5}, headers=self.bearer())
        data = self.listing(self.sa())
        self.assertIsNotNone(data["accounts"][0]["last_active"])
        self.assertEqual(data["summary"]["active_this_week"], 1)

    def test_pending_signups_and_mail_status(self):
        with mock.patch("modules.email_sender.send_otp_email", return_value=False):
            self.client.post("/email-otp/send", json={"email": "lost@demo.test", "purpose": "signup"})
        self.signup()
        with mock.patch.dict(os.environ, {"EMAIL_SENDER": "", "OUTLOOK_EMAIL": ""}):
            data = self.listing(self.sa())
        self.assertEqual([p["email"] for p in data["pending_signups"]], ["lost@demo.test"])
        self.assertFalse(data["signup_mail_ready"])

    def test_demo_management_never_exposes_workspace_records_to_operator(self):
        self.signup()
        user = self.demo_user()
        with Session(S.ENGINE) as s:
            s.add(Lead(company_name="Tried it", tenant_id=user.tenant_id))
            s.commit()
        for selected in (None, 3, user.tenant_id):
            h = self.sa()
            if selected:
                h['X-Tenant-ID'] = str(selected)
            r = self.client.get(f"/telemetry/demo-account/{user.id}", headers=h)
            self.assertEqual(r.status_code, 200, r.text)
            self.assertFalse(r.json()['records_available'])
            self.assertEqual(r.json()['leads'], [])
            self.assertTrue(r.json()['account']['can_change_limits'])

    def test_management_available_but_crm_hidden_when_inspection_disabled(self):
        self.signup()
        user = self.demo_user()
        with Session(S.ENGINE) as s:
            s.add(Lead(company_name='Private demo prospect', tenant_id=user.tenant_id))
            features.set_features(s, user.tenant_id, {'demo_accounts': False})
            s.commit()
        for selection in (None, str(user.tenant_id), '3'):
            h = self.sa()
            if selection:
                h['X-Tenant-ID'] = selection
            r = self.client.get(f'/telemetry/demo-account/{user.id}', headers=h)
            self.assertEqual(r.status_code, 200, r.text)
            self.assertFalse(r.json()['records_available'])
            self.assertTrue(r.json()['account']['can_change_limits'])
            for key in ('leads', 'clients', 'contacts', 'emails', 'calls', 'team_members', 'projects',
                        'radar', 'meetings', 'researches', 'competitors'):
                self.assertEqual(r.json()[key], [], key)
            self.assertNotIn('Private demo prospect', r.text)
            self.assertEqual(self.client.get('/telemetry/demo-accounts', headers=h).status_code, 200)
        r = self.client.patch(f'/telemetry/demo-accounts/{user.id}', json={'active': False}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)

    def test_detail_of_a_demo_inside_a_company_never_shows_the_company_data(self):
        with Session(S.ENGINE) as s:
            u = User(email="showcase@t2.test", password="x", name="Showcase", role="Demo", tenant_id=2)
            s.add(u)
            s.commit()
            s.refresh(u)
        r = self.client.get(f"/telemetry/demo-account/{u.id}", headers=self.as_tenant(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["leads"], [])
        self.assertEqual(r.json()["account"]["kind"], "in_company")


class Actions(DemoBase):
    def setUp(self):
        super().setUp()
        self.signup()
        self.uid = self.demo_user().id

    def test_switch_off_blocks_login_and_existing_sessions(self):
        h = self.bearer()
        r = self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"active": False}, headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["account"]["active"])
        self.assertEqual(self.client.post("/login", json={"email": "visitor@demo.test", "password": PASSWORD}).status_code, 403)
        self.assertEqual(self.client.get("/telemetry/demo-accounts", headers=h).status_code, 401)
        self.assertEqual(self.listing(self.sa())["summary"]["disabled"], 1)
        self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"active": True}, headers=self.sa())
        self.bearer()

    def test_reset_password(self):
        old = self.bearer()
        r = self.client.post(f"/telemetry/demo-accounts/{self.uid}/reset-password", headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.post("/login", json={"email": "visitor@demo.test", "password": PASSWORD}).status_code, 401)
        self.bearer(password=r.json()["password"])
        self.assertEqual(self.client.get("/telemetry/demo-accounts", headers=old).status_code, 401)

    def test_limits_and_usage(self):
        tid = self.demo_user().tenant_id
        with Session(S.ENGINE) as s:
            t = s.exec(select(Tenant).where(Tenant.id == tid).execution_options(skip_tenant=True)).first()
            t.usage_emails = 5
            s.add(t)
            s.commit()
        r = self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"limits": {"emails": 50}, "reset_usage": True},
                              headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["account"]["limits"]["emails"], {"usage": 0, "limit": 50})
        bad = self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"limits": {"rockets": 1}}, headers=self.sa())
        self.assertEqual(bad.status_code, 422)

    def test_only_the_operator_changes_limits_converts_or_deletes(self):
        with Session(S.ENGINE) as s:
            t = s.exec(select(Tenant).where(Tenant.id == self.demo_user().tenant_id).execution_options(skip_tenant=True)).first()
            t.demo_of_tenant_id = 2      # make it alpha's demo, so alpha's Admin can see it
            s.add(t)
            s.commit()
        h = self.as_tenant(2)
        self.assertEqual(self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"limits": {"emails": 9}}, headers=h).status_code, 403)
        self.assertEqual(self.client.post(f"/telemetry/demo-accounts/{self.uid}/convert", headers=h).status_code, 403)
        self.assertEqual(self.client.delete(f"/telemetry/demo-accounts/{self.uid}", headers=h).status_code, 403)
        self.assertEqual(self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"active": False}, headers=h).status_code, 200)
        self.assertEqual(self.client.patch(f"/telemetry/demo-accounts/{self.uid}", json={"active": False},
                                           headers=self.as_tenant(3)).status_code, 404)

    def test_upgrade_request_reaches_the_operator_once(self):
        h = self.bearer()
        r = self.client.post("/demo/request-upgrade", json={"email": "someone-else@x.test"}, headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["already_requested"])
        self.assertTrue(self.client.post("/demo/upgrade", headers=h).json()["already_requested"])
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.title == demo_accounts.UPGRADE_TITLE)
                           .execution_options(skip_tenant=True)).all()
        self.assertEqual([n.user_id for n in notes], [self.super_id])
        self.assertTrue(self.listing(self.sa())["accounts"][0]["upgrade_requested"])
        self.assertEqual(self.client.post("/demo/request-upgrade", json={"email": "visitor@demo.test"}).status_code, 404)

    def test_convert_to_a_paying_company(self):
        h = self.bearer()
        self.client.post("/onboarding", json={"company": "Vee Co"}, headers=h)
        self.client.post("/demo/upgrade", headers=h)
        r = self.client.post(f"/telemetry/demo-accounts/{self.uid}/convert", headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        user = self.demo_user()
        t = self.tenant(user.tenant_id)
        self.assertEqual(user.role, "Admin")
        self.assertFalse(t.is_trial)
        self.assertEqual(t.limit_clients, onboarding.PAID_LIMIT)
        self.assertEqual(t.name, "Vee Co")
        self.assertEqual(self.listing(self.sa())["accounts"], [])

    def test_delete_removes_the_whole_workspace_and_nothing_else(self):
        tid = self.demo_user().tenant_id
        h = self.bearer()
        with Session(S.ENGINE) as s:
            s.add(Lead(company_name="Demo lead", tenant_id=tid, owner_id=self.uid))
            s.add(PageVisitTelemetry(tenant_id=tid, user_id=self.uid, page_path="/"))
            s.add(EmailOTP(user_id=self.uid, email="visitor@demo.test", otp_code="1", purpose="integration",
                           expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)))
            s.commit()
        self.client.post("/demo/upgrade", headers=h)
        r = self.client.delete(f"/telemetry/demo-accounts/{self.uid}", headers=self.sa())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(self.demo_user())
        self.assertIsNone(self.tenant(tid))
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(Lead).where(Lead.tenant_id == tid).execution_options(skip_tenant=True)).all(), [])
            self.assertEqual(s.exec(select(EmailOTP).where(EmailOTP.user_id == self.uid).execution_options(skip_tenant=True)).all(), [])
        for tid_other in (1, 2, 3):
            self.assertIsNotNone(self.lead_row(tid_other))
        self.assertEqual(self.listing(self.sa())["accounts"], [])

    def test_a_demo_inside_a_real_company_is_never_deleted(self):
        with Session(S.ENGINE) as s:
            u = User(email="showcase@t2.test", password="x", name="Showcase", role="Demo", tenant_id=2)
            s.add(u)
            s.commit()
            s.refresh(u)
        self.assertEqual(self.client.delete(f"/telemetry/demo-accounts/{u.id}", headers=self.sa()).status_code, 403)
        self.assertIsNotNone(self.tenant(2))
