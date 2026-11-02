from sqlmodel import Session, select
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import InventoryItem, InventorySupplier, User


class SupplierAssignment(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as session:
            self.items = []
            for tid, code in ((2, "one"), (2, "two"), (3, "foreign")):
                item = InventoryItem(tenant_id=tid, code=code, name=code)
                session.add(item); session.commit(); session.refresh(item); self.items.append(item.id)
            account = User(tenant_id=2, email="supplier@x.test", password="original-hash", hashed_password="original-hash", name="Existing Supplier", role="Supplier")
            session.add(account); session.commit(); session.refresh(account); self.account = account.id

    def assign(self, index=0, **fields):
        return self.client.post(f"/inventory/{self.items[index]}/suppliers", headers=self.as_tenant(2), json={"supplier_name": "Existing Supplier", **fields})

    def test_existing_account_is_reused_without_changing_credentials(self):
        for index in (0, 1):
            response = self.assign(index, supplier_email="SUPPLIER@x.test")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["supplier_user_id"], self.account)
            self.assertFalse(response.json()["credentials_created"])
            self.assertNotIn("login_password", response.json())
        with Session(S.ENGINE) as session:
            account = session.get(User, self.account)
            self.assertEqual((account.password, account.hashed_password, account.role), ("original-hash", "original-hash", "Supplier"))
            self.assertEqual(len(session.exec(select(InventorySupplier)).all()), 2)

    def test_id_selection_and_repeat_assignment_keep_one_link_per_lot(self):
        first = self.assign(supplier_user_id=self.account).json()
        second = self.assign(supplier_user_id=self.account).json()
        self.assertEqual(first["id"], second["id"])
        self.assertTrue(second["already_linked"])
        other_lot = self.assign(supplier_user_id=self.account, lot_number="LOT-B").json()
        self.assertNotEqual(first["id"], other_lot["id"])
        response = self.assign(1, existing_supplier_id=first["id"])
        self.assertEqual(response.json()["supplier_user_id"], self.account)

    def test_new_account_created_once_in_the_item_company(self):
        first = self.assign(supplier_email="new-supplier@x.test").json()
        self.assertTrue(first["credentials_created"])
        self.assertIn("login_password", first)
        second = self.assign(1, supplier_email="new-supplier@x.test").json()
        self.assertFalse(second["credentials_created"])
        self.assertEqual(first["supplier_user_id"], second["supplier_user_id"])
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(User, first["supplier_user_id"]).tenant_id, 2)

    def test_other_roles_foreign_accounts_and_foreign_items_are_refused(self):
        self.assertEqual(self.assign(supplier_email="admin2@t2.test").status_code, 409)
        self.assertEqual(self.assign(supplier_email="admin3@t3.test").status_code, 409)
        self.assertEqual(self.assign(supplier_user_id=self.users[3]).status_code, 404)
        self.assertEqual(self.assign(2, supplier_user_id=self.account).status_code, 404)
        with Session(S.ENGINE) as session:
            self.assertEqual(session.get(User, self.users[2]).role, "Admin")

    def test_existing_account_selector_is_tenant_scoped(self):
        response = self.client.get("/inventory/supplier-accounts", headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["id"] for row in response.json()["suppliers"]], [self.account])
