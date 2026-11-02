"""The two-role sales hierarchy is enforced on API reads, writes and entitlements."""
from sqlmodel import Session, select
from sqlalchemy import func

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import User, Lead, ClientProfile, Contact, CallLog, ScheduledCall
from modules import features, tenant_settings, sales_access


class SalesAccess(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate(); tenant_settings.invalidate()
        self.addCleanup(features.invalidate); self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as session:
            users = [User(tenant_id=2, role="SalesManager", name=f"Manager {i}", email=f"manager{i}@x.test", password="x") for i in (1, 2)]
            session.add_all(users); session.commit()
            for user in users: session.refresh(user)
            self.managers = [user.id for user in users]
            self.records = []
            for uid in self.managers:
                rows = [Lead(tenant_id=2, company_name=f"L {uid}", owner_id=uid),
                        ClientProfile(tenant_id=2, companyName=f"C {uid}", assignedEmployeeId=uid),
                        Contact(tenant_id=2, first_name=f"P {uid}", owner_id=uid),
                        CallLog(tenant_id=2, phone_number=f"123{uid}", assigned_to=str(uid)),
                        ScheduledCall(tenant_id=2, title=f"Call {uid}", assigned_to=str(uid))]
                session.add_all(rows); session.commit()
                for row in rows: session.refresh(row)
                self.records.append([row.id for row in rows])

    def headers(self, index=0):
        return {"X-User-ID": str(self.managers[index])}

    def test_only_own_records_lists_details_and_mutations(self):
        for path, key, position in (("/leads", "leads", 0), ("/contacts", "contacts", 2), ("/calls", "calls", 3), ("/scheduled-calls", "scheduled_calls", 4)):
            response = self.client.get(path, headers=self.headers())
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual({row["id"] for row in response.json()[key]}, {self.records[0][position]}, path)
        for root, index in (("leads", 0), ("clients", 1), ("contacts", 2)):
            self.assertEqual(self.client.get(f"/{root}/{self.records[1][index]}", headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.patch(f"/calls/{self.records[1][3]}", json={"summary": "private"}, headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.delete(f"/scheduled-calls/{self.records[1][4]}", headers=self.headers()).status_code, 404)

    def test_creators_keep_visibility_and_counts_are_scoped(self):
        with Session(S.ENGINE) as session:
            session.add(Lead(tenant_id=2, company_name="Created then reassigned", created_by=self.managers[0], owner_id=self.managers[1]))
            session.commit()
        self.assertEqual(len(self.client.get("/leads", headers=self.headers()).json()["leads"]), 2)
        token = sales_access.actor.set((self.managers[0], "SalesManager", "Manager 1", "manager1@x.test"))
        tenant = self.main.current_tenant_id.set(2)
        try:
            with Session(S.ENGINE) as session:
                self.assertEqual(session.exec(select(func.count(Lead.id))).one(), 2)
        finally:
            sales_access.actor.reset(token); self.main.current_tenant_id.reset(tenant)

    def test_new_contact_is_owned_and_cannot_be_reassigned_by_sales(self):
        response = self.client.post("/contacts", json={"first_name": "New"}, headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["owner_id"], self.managers[0])
        self.assertEqual(response.json()["created_by"], self.managers[0])
        response = self.client.post("/contacts", json={"first_name": "Wrong", "owner_id": self.managers[1]}, headers=self.headers())
        self.assertEqual(response.status_code, 403, response.text)

    def test_admin_controls_sales_modules_inside_plan(self):
        admin = self.as_tenant(2)
        result = self.client.put("/tenant/sales-access", json={"calls": False, "contacts": False}, headers=admin)
        self.assertEqual(result.status_code, 200, result.text)
        for path in ("/calls", "/scheduled-calls", "/contacts"):
            self.assertEqual(self.client.get(path, headers=self.headers()).status_code, 403, path)
            self.assertEqual(self.client.get(path, headers=admin).status_code, 200, path)
        effective = self.client.get("/me/features", headers=self.headers()).json()["features"]
        self.assertFalse(effective["teams"]); self.assertFalse(effective["reports"])
        self.assertFalse(effective["calls"])
        self.assertEqual(self.client.put("/tenant/sales-access", json={"calls": True}, headers=self.headers()).status_code, 403)
        with Session(S.ENGINE) as session: features.set_features(session, 2, {"calls": False})
        self.client.put("/tenant/sales-access", json={"calls": True}, headers=admin)
        self.assertEqual(self.client.get("/calls", headers=self.headers()).status_code, 403)

    def test_duplicate_display_names_do_not_grant_call_access(self):
        with Session(S.ENGINE) as session:
            session.add(CallLog(tenant_id=2, phone_number="private", assigned_to="Manager 1"))
            session.commit()
        calls = self.client.get("/calls", headers=self.headers()).json()["calls"]
        self.assertNotIn("private", [call["phone_number"] for call in calls])

    def test_directory_and_creation_are_admin_only(self):
        users = self.client.get("/users", headers=self.headers()).json()["users"]
        self.assertEqual([user["id"] for user in users], [self.managers[0]])
        response = self.client.post("/users", json={"email": "new@x.test", "password": "12345678", "role": "Admin"}, headers=self.headers())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get(f"/users/{self.managers[1]}/stats", headers=self.headers()).status_code, 403)

    def test_removal_revokes_login_and_preserves_record_history(self):
        admin = self.as_tenant(2)
        self.assertEqual(self.client.delete(f"/users/{self.users[2]}", headers=admin).status_code, 409)
        self.assertEqual(self.client.delete(f"/users/{self.managers[0]}", headers=admin).status_code, 200)
        self.assertEqual(self.client.get("/users/me", headers=self.headers()).status_code, 401)
        with Session(S.ENGINE) as session:
            self.assertIsNotNone(session.get(Lead, self.records[0][0]))

    def test_superadmin_can_onboard_sales_manager_account(self):
        with Session(S.ENGINE) as session:
            root = User(role="SuperAdmin", name="Root", email="root@x.test", password="x")
            session.add(root); session.commit(); session.refresh(root); uid = root.id
        response = self.client.post("/superadmin/tenants", headers={"X-User-ID": str(uid)}, json={"name": "sales-workspace", "admin_name": "Sales", "admin_email": "sales@new.test", "account_role": "SalesManager"})
        self.assertEqual(response.status_code, 200, response.text)
        with Session(S.ENGINE) as session:
            user = session.exec(select(User).where(User.id == response.json()["admin_user_id"]).execution_options(skip_tenant=True)).one()
            self.assertEqual(user.role, "SalesManager")
