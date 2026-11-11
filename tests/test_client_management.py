"""Top-level module totals and SuperAdmin workspace deletion."""
import os
import unittest
import uuid
from unittest import mock
from sqlmodel import Session, SQLModel, select
from database import ClientProfile, Lead, Project, Tenant, User
from modules import demo_accounts, features, presets
from tests import _support as S
from tests.test_onboarding import OnboardingBase, png_bytes


class ClientManagement(OnboardingBase):
    def delete(self, tid=2, headers=None, name="alpha"):
        return self.client.request("DELETE", f"/superadmin/tenants/{tid}",
            json={"confirm_name": name}, headers=self.sa() if headers is None else headers)

    def test_module_counts_exclude_dashboard_and_future_sales_sections(self):
        before = features.module_count()
        with mock.patch.dict(features.FEATURES, {"sales_test_section": features.Feature(
                "sales_test_section", "Sales section", "Sales", parent_key="leads")}):
            self.assertEqual(features.module_count(), before)
        with Session(S.ENGINE) as session:
            enabled = presets.apply_preset(session, 2, "full")["features"]
        response = self.client.get("/superadmin/tenants/overview", headers=self.sa()).json()
        row = next(row for row in response["tenants"] if row["id"] == 2)
        self.assertEqual((row["modules_on"], response["total_modules"]), (before, before))
        self.assertLess(before, len(features.FEATURES))
        for key in enabled:
            if features.FEATURES[key].parent_key:
                enabled[key] = False
        self.assertEqual(features.module_count(enabled), before)
        catalog = self.client.get("/superadmin/features/catalog", headers=self.sa()).json()
        self.assertEqual(next(f for f in catalog["features"] if f["key"] == "dashboard_b2c_revenue")["parent_key"], "dashboard_b2c")
        full = next(preset for preset in catalog["presets"] if preset["key"] == "full")
        self.assertEqual(full["module_count"], before)

    def test_delete_is_superadmin_only_and_requires_matching_confirmation(self):
        self.assertEqual(self.delete(headers={}).status_code, 401)
        self.assertEqual(self.delete(headers=self.as_tenant(2)).status_code, 403)
        self.assertEqual(self.delete(name="wrong workspace").status_code, 422)
        self.assertEqual(self.delete(tid=999).status_code, 404)
        with Session(S.ENGINE) as session:
            self.assertIsNotNone(session.get(Tenant, 2))

    def test_delete_removes_paid_client_and_revokes_its_users_only(self):
        uploaded = self.client.put("/superadmin/tenants/2/logo", files={"file": ("logo.png", png_bytes(), "image/png")}, headers=self.sa())
        self.assertEqual(uploaded.status_code, 200)
        self.assertEqual(self.client.get("/tenant/logo/2").status_code, 200)
        result = self.delete()
        self.assertEqual(result.status_code, 200, result.text)
        with Session(S.ENGINE) as session:
            self.assertIsNone(session.get(Tenant, 2))
            self.assertIsNone(session.get(User, self.users[2]))
            self.assertIsNone(session.get(Lead, self.leads[2]))
            self.assertIsNotNone(session.get(Tenant, 3))
            self.assertIsNotNone(session.get(Lead, self.leads[3]))
            self.assertIsNotNone(session.get(User, self.super_id))
        self.assertEqual(self.client.get("/users/me", headers=self.as_tenant(2)).status_code, 401)
        self.assertEqual(self.client.get("/tenant/logo/2").status_code, 404)

    def test_linked_demos_must_be_removed_before_their_parent(self):
        with Session(S.ENGINE) as session:
            session.add(Tenant(id=4, name="alpha-demo", demo_of_tenant_id=2))
            session.commit()
        self.assertEqual(self.delete().status_code, 409)
        self.assertEqual(self.delete(tid=4, name="alpha-demo").status_code, 200)
        self.assertEqual(self.delete().status_code, 200)

    def test_platform_accounts_are_protected_in_api_and_overview(self):
        with Session(S.ENGINE) as session:
            session.add(User(tenant_id=2, email="platform2@example.test", password="x", role="SuperAdmin"))
            session.commit()
        rows = self.client.get("/superadmin/tenants/overview", headers=self.sa()).json()["tenants"]
        self.assertFalse(next(row for row in rows if row["id"] == 2)["can_delete"])
        self.assertTrue(next(row for row in rows if row["id"] == 3)["can_delete"])
        self.assertEqual(self.delete().status_code, 409)


@unittest.skipUnless(os.getenv("TEST_POSTGRES_URL"), "Requires throwaway PostgreSQL")
class DeleteWorkspacePostgres(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        S.load_main()
        self.name = "crm_client_delete_" + uuid.uuid4().hex[:12]
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        self.admin = create_engine(url, isolation_level="AUTOCOMMIT")
        with self.admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{self.name}"'))
        self.engine = create_engine(url.set(database=self.name))
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all([Tenant(id=2, name="alpha"), Tenant(id=3, name="beta")])
            session.commit()
            client = ClientProfile(tenant_id=2, companyName="Alpha")
            lead = Lead(tenant_id=2, company_name="Alpha lead")
            session.add_all([client, lead])
            session.commit()
            project = Project(tenant_id=2, name="Alpha project", clientId=client.id, leadId=lead.id)
            session.add(project)
            session.commit()
            client.projectId = project.id
            lead.converted_client_id = client.id
            session.add_all([client, lead])
            session.commit()
            self.client_id, self.project_id = client.id, project.id

    def tearDown(self):
        from sqlalchemy import text
        self.engine.dispose()
        with self.admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{self.name}"'))
        self.admin.dispose()

    def test_real_foreign_key_cycles_are_removed_atomically(self):
        with Session(self.engine) as session:
            demo_accounts.delete_workspace(session, 2)
        with Session(self.engine) as session:
            self.assertIsNone(session.get(Tenant, 2))
            self.assertIsNone(session.get(ClientProfile, self.client_id))
            self.assertIsNone(session.get(Project, self.project_id))
            self.assertIsNotNone(session.get(Tenant, 3))

    def test_foreign_workspace_reference_rolls_back_the_entire_delete(self):
        with Session(self.engine) as session:
            foreign = Lead(tenant_id=3, company_name="Foreign reference", converted_client_id=self.client_id)
            session.add(foreign)
            session.commit()
        with Session(self.engine) as session:
            with self.assertRaises(RuntimeError):
                demo_accounts.delete_workspace(session, 2)
        with Session(self.engine) as session:
            self.assertIsNotNone(session.get(Tenant, 2))
            self.assertEqual(session.get(ClientProfile, self.client_id).projectId, self.project_id)
            self.assertEqual(session.get(Project, self.project_id).clientId, self.client_id)
