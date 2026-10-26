"""Signed session tokens and the legacy X-User-ID fallback."""
import os
import time
import unittest
from unittest import mock

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import auth_tokens


class TokenUnit(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict(os.environ, {"SESSION_SECRET": "unit-test-secret"})
        p.start()
        self.addCleanup(p.stop)

    def test_roundtrip(self):
        t = auth_tokens.issue_token(7, "hash")
        payload = auth_tokens.verify_token(t)
        self.assertEqual(payload["uid"], 7)
        self.assertEqual(payload["pv"], auth_tokens.password_fingerprint("hash"))

    def test_tampered_payload_rejected(self):
        v, body, sig = auth_tokens.issue_token(7, "h").split(".")
        forged = auth_tokens._b64(b'{"uid":1,"iat":0,"exp":9999999999,"pv":""}')
        self.assertIsNone(auth_tokens.verify_token(f"{v}.{forged}.{sig}"))

    def test_wrong_secret_rejected(self):
        t = auth_tokens.issue_token(7, "h")
        with mock.patch.dict(os.environ, {"SESSION_SECRET": "another"}):
            self.assertIsNone(auth_tokens.verify_token(t))

    def test_expired_rejected(self):
        t = auth_tokens.issue_token(7, "h", now=time.time() - 10 * 24 * 3600)
        self.assertIsNone(auth_tokens.verify_token(t))

    def test_garbage_rejected(self):
        for bad in (None, "", "abc", "v1.a.b", "v2.a.b", "v1..", 123):
            self.assertIsNone(auth_tokens.verify_token(bad), bad)


class TokenAuth(TenantIsolationBase):
    def setUp(self):
        p = mock.patch.dict(os.environ, {"SESSION_SECRET": "route-test-secret", "LEGACY_USER_HEADER": "0"})
        p.start()
        self.addCleanup(p.stop)
        super().setUp()

    def token_for(self, tid):
        from sqlmodel import Session
        from database import User
        with Session(S.ENGINE) as s:
            u = s.get(User, self.users[tid])
            return auth_tokens.issue_token(u.id, u.password)

    def bearer(self, tid):
        return {"Authorization": f"Bearer {self.token_for(tid)}"}

    def names(self, headers):
        r = self.client.get("/leads", headers=headers)
        self.assertEqual(r.status_code, 200, r.text)
        return {l["company_name"] for l in r.json()["leads"]}

    def test_valid_token_sees_own_tenant(self):
        self.assertEqual(self.names(self.bearer(2)), {"Lead of 2"})

    def test_legacy_header_rejected_when_disabled(self):
        self.assertEqual(self.names(self.as_tenant(2)), set())

    def test_legacy_header_cannot_override_token(self):
        h = {**self.bearer(2), "X-User-ID": str(self.users[3])}
        self.assertEqual(self.names(h), {"Lead of 2"})

    def test_bad_token_does_not_fall_back_to_header(self):
        h = {"Authorization": "Bearer v1.bad.token", "X-User-ID": str(self.users[3])}
        self.assertEqual(self.names(h), set())

    def test_expired_token_is_anonymous(self):
        t = auth_tokens.issue_token(self.users[2], "x", now=time.time() - 30 * 24 * 3600)
        self.assertEqual(self.names({"Authorization": f"Bearer {t}"}), set())

    def test_password_change_invalidates_token(self):
        from sqlmodel import Session
        from database import User
        h = self.bearer(2)
        self.assertEqual(self.names(h), {"Lead of 2"})
        with Session(S.ENGINE) as s:
            u = s.get(User, self.users[2])
            u.password = "a-new-password-hash"
            s.add(u)
            s.commit()
        self.assertEqual(self.names(h), set())

    def test_token_for_unknown_user_is_anonymous(self):
        t = auth_tokens.issue_token(99999, "x")
        self.assertEqual(self.names({"Authorization": f"Bearer {t}"}), set())

    def test_token_cannot_choose_tenant_with_header(self):
        h = {**self.bearer(2), "X-Tenant-ID": "3"}
        self.assertEqual(self.names(h), {"Lead of 2"})

    def test_login_returns_working_token(self):
        from sqlmodel import Session
        from database import User
        with Session(S.ENGINE) as s:
            u = s.get(User, self.users[2])
            u.password = self.main._hash_password("secret-pw")
            s.add(u)
            s.commit()
            email = u.email
        r = self.client.post("/login", json={"email": email, "password": "secret-pw"})
        self.assertEqual(r.status_code, 200, r.text)
        token = r.json()["token"]
        self.assertEqual(self.names({"Authorization": f"Bearer {token}"}), {"Lead of 2"})


class CorsPreflight(TenantIsolationBase):
    """The browser now sends Authorization cross-origin: its preflight must be allowed or login breaks everywhere."""

    def test_authorization_header_is_allowed_by_preflight(self):
        r = self.client.options("/leads", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-user-id,x-tenant-id,content-type"})
        self.assertEqual(r.status_code, 200, r.text)
        allowed = r.headers.get("access-control-allow-headers", "").lower()
        for header in ("authorization", "x-user-id", "x-tenant-id"):
            self.assertIn(header, allowed)
        self.assertEqual(r.headers.get("access-control-allow-origin"), "http://localhost:3000")


class LegacyHeaderCompat(TenantIsolationBase):
    """Default behaviour is unchanged so the currently deployed frontend keeps working."""

    def setUp(self):
        p = mock.patch.dict(os.environ, {"SESSION_SECRET": "route-test-secret"})
        p.start()
        os.environ.pop("LEGACY_USER_HEADER", None)
        self.addCleanup(p.stop)
        super().setUp()

    def test_header_still_works_by_default(self):
        r = self.client.get("/leads", headers=self.as_tenant(2))
        self.assertEqual({l["company_name"] for l in r.json()["leads"]}, {"Lead of 2"})

    def test_unknown_user_id_is_not_unscoped(self):
        """A made-up user id used to resolve to 'no tenant', which meant no filter at all."""
        r = self.client.get("/leads", headers={"X-User-ID": "999999"})
        self.assertEqual(r.json()["leads"], [])


if __name__ == "__main__":
    unittest.main()
