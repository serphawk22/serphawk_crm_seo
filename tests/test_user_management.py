"""POST /users: only Admin / SalesManager / SuperAdmin, only for roles they may create, never a tenant-less user."""
import os
import unittest
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import ClientProfile, User


class CreateUser(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            rows = [User(email="emp@t2.test", password="x", name="Emp", role="Employee", tenant_id=2),
                    User(email="mgr@t2.test", password="x", name="Mgr", role="SalesManager", tenant_id=2),
                    User(email="cli@t2.test", password="x", name="Cli", role="Client", tenant_id=2),
                    User(email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None)]
            s.add_all(rows)
            s.commit()
            for r in rows:
                s.refresh(r)
            self.emp, self.mgr, self.cli, self.root = (r.id for r in rows)

    def create(self, caller, role, email="new@x.test", extra_headers=None):
        h = {"X-User-ID": str(caller), **(extra_headers or {})}
        return self.client.post("/users", json={"email": email, "password": "pw-123456", "name": "New", "role": role}, headers=h)

    def test_anonymous_and_low_roles_cannot_create_users(self):
        self.assertIn(self.client.post("/users", json={"email": "a@x.test", "password": "p", "role": "Admin"}).status_code, (401, 403))
        for caller in (self.cli, self.emp):
            self.assertEqual(self.create(caller, "Admin").status_code, 403, caller)
            self.assertEqual(self.create(caller, "Employee").status_code, 403, caller)

    def test_a_manager_cannot_create_admins_or_managers(self):
        for role in ("Admin", "SalesManager", "SuperAdmin"):
            self.assertEqual(self.create(self.mgr, role).status_code, 403, role)
        self.assertEqual(self.create(self.mgr, "Employee").status_code, 200)
        self.assertEqual(self.create(self.mgr, "Client", "client2@x.test").status_code, 200)

    def test_an_admin_creates_staff_in_their_own_tenant_but_never_a_superadmin(self):
        r = self.create(self.users[2], "Admin", "second-admin@x.test")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["user"]["tenant_id"], 2)
        self.assertEqual(self.create(self.users[2], "SuperAdmin", "boss@x.test").status_code, 403)
        self.assertEqual(self.create(self.users[2], "Wizard", "wiz@x.test").status_code, 422)
        with Session(S.ENGINE) as s:
            self.assertEqual(s.exec(select(User).where(User.email == "boss@x.test")).first(), None)

    def test_a_client_login_gets_its_profile_in_the_tenant(self):
        r = self.create(self.users[2], "Client", "newclient@x.test")
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            cp = s.exec(select(ClientProfile).where(ClientProfile.userId == r.json()["user"]["id"]).execution_options(skip_tenant=True)).one()
            self.assertEqual(cp.tenant_id, 2)

    def test_a_superadmin_must_name_a_tenant_so_no_tenantless_user_appears(self):
        self.assertEqual(self.create(self.root, "Admin").status_code, 400)
        r = self.create(self.root, "Admin", "scoped-admin@x.test", {"X-Tenant-ID": "3"})
        self.assertEqual(r.status_code, 400, r.text)
        self.assertEqual(self.create(self.root, "SuperAdmin", "operator@x.test").json()["user"]["tenant_id"], None)

    def test_emails_are_unique_across_tenants(self):
        self.assertEqual(self.create(self.users[2], "Employee", "dup@x.test").status_code, 200)
        self.assertEqual(self.create(self.users[3], "Employee", "dup@x.test").status_code, 400)


class UsersAreTenantScoped(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            emp = User(email="emp@t2.test", password="x", name="Emp", role="Employee", tenant_id=2)
            root = User(email="root@platform.test", password="x", name="Root", role="SuperAdmin", tenant_id=None)
            s.add(emp)
            s.add(root)
            s.commit()
            s.refresh(emp)
            s.refresh(root)
            self.emp, self.root = emp.id, root.id

    def test_listing_shows_only_the_callers_tenant(self):
        emails = {u["email"] for u in self.client.get("/users", headers={"X-User-ID": str(self.users[2])}).json()["users"]}
        self.assertEqual(emails, {"admin2@t2.test", "emp@t2.test"})

    def test_loading_another_tenants_user_by_id_finds_nothing(self):
        token = self.main.current_tenant_id.set(2)
        try:
            with Session(S.ENGINE) as s:
                self.assertIsNone(s.get(User, self.users[3]))
                self.assertIsNone(s.exec(select(User).where(User.id == self.users[1])).first())
                self.assertIsNotNone(s.get(User, self.emp))
        finally:
            self.main.current_tenant_id.reset(token)

    def test_user_stats_and_delete_cannot_cross_tenants(self):
        h = {"X-User-ID": str(self.users[2])}
        self.assertEqual(self.client.get(f"/users/{self.users[3]}/stats", headers=h).status_code, 404)
        self.assertEqual(self.client.delete(f"/users/{self.users[3]}", headers=h).status_code, 404)
        with Session(S.ENGINE) as s:
            self.assertIsNotNone(s.exec(select(User).where(User.id == self.users[3]).execution_options(skip_tenant=True)).first())

    def test_deleting_users_needs_admin(self):
        self.assertEqual(self.client.delete(f"/users/{self.emp}", headers={"X-User-ID": str(self.emp)}).status_code, 403)
        self.assertEqual(self.client.delete(f"/users/{self.emp}").status_code, 401)
        self.assertEqual(self.client.delete(f"/users/{self.emp}", headers={"X-User-ID": str(self.users[2])}).status_code, 200)
        # an Admin cannot remove the platform operator
        self.assertEqual(self.client.delete(f"/users/{self.root}", headers={"X-User-ID": str(self.users[2])}).status_code, 404)

    def test_login_stays_global_because_an_email_belongs_to_one_account(self):
        with Session(S.ENGINE) as s:
            u = s.get(User, self.users[3])
            u.password = self.main._hash_password("tenant3-pass")
            s.add(u)
            s.commit()
        self.assertEqual(self.client.post("/login", json={"email": "admin3@t3.test", "password": "tenant3-pass"}).status_code, 200)

    def test_a_superadmin_cannot_access_tenant_users(self):
        h = {"X-User-ID": str(self.root), "X-Tenant-ID": "2"}
        self.assertEqual(self.client.get("/users", headers=h).status_code, 403)
        self.assertEqual(self.client.delete(f"/users/{self.emp}", headers=h).status_code, 403)
        self.assertEqual(self.client.get("/users/me", headers=h).status_code, 200)


class OperatorAccount(TenantIsolationBase):
    """The first SuperAdmin is created on boot: never with a published default password."""

    def boot(self, env):
        import contextlib
        import io
        import os
        from unittest import mock
        with Session(S.ENGINE) as s:
            for u in s.exec(select(User).where(User.role == "SuperAdmin")).all():
                s.delete(u)
            s.commit()
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"BACKGROUND_JOBS": "0", **env}),                 mock.patch.object(self.main, "create_db_and_tables"), mock.patch.object(self.main, "patch_openai"),                 contextlib.redirect_stdout(out):
            self.main.on_startup()
        return out.getvalue()

    def login(self, password, email="superadmin@serphawk.in"):
        return self.client.post("/login", json={"email": email, "password": password}).status_code

    def test_password_comes_from_the_environment_and_is_stored_hashed(self):
        printed = self.boot({"SUPERADMIN_PASSWORD": "a-strong-operator-pw"})
        self.assertEqual(self.login("a-strong-operator-pw"), 200)
        self.assertEqual(self.login("password123"), 401)
        self.assertNotIn("a-strong-operator-pw", printed)
        with Session(S.ENGINE) as s:
            root = s.exec(select(User).where(User.role == "SuperAdmin")).one()
            self.assertNotEqual(root.password, "a-strong-operator-pw")

    def test_without_an_env_var_a_one_time_password_is_generated_and_printed(self):
        import os
        os.environ.pop("SUPERADMIN_PASSWORD", None)
        printed = self.boot({})
        line = [l for l in printed.splitlines() if "One-time password" in l]
        self.assertEqual(len(line), 1, printed)
        generated = line[0].rsplit(": ", 1)[1].strip()
        self.assertGreaterEqual(len(generated), 14)
        self.assertEqual(self.login(generated), 200)
        self.assertEqual(self.login("password123"), 401)


if __name__ == "__main__":
    unittest.main()
