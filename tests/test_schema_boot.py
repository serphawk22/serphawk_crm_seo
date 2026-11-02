"""create_db_and_tables(): idempotent, and backfills tenant_id on child tables from their parent."""
import unittest
from unittest import mock

from sqlalchemy import text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import database
from database import Tenant, InventoryItem, InventorySupplier, User, CallLog


class SchemaBoot(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        p = mock.patch.object(database, "engine", self.engine)
        p.start()
        self.addCleanup(p.stop)

    def test_boot_twice_is_safe(self):
        database.create_db_and_tables()
        database.create_db_and_tables()

    def test_supplier_tenant_backfilled_from_item(self):
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as s:
            s.add(Tenant(id=5, name="five"))
            s.commit()
            item = InventoryItem(code="A1", name="Widget", tenant_id=5)
            s.add(item)
            s.commit()
            s.refresh(item)
            s.add(InventorySupplier(item_id=item.id, supplier_name="Acme"))  # legacy row: no tenant
            s.commit()
            self.assertIsNone(s.exec(text("SELECT tenant_id FROM inventory_suppliers")).first()[0])
        database.create_db_and_tables()
        with Session(self.engine) as s:
            self.assertEqual(s.exec(text("SELECT tenant_id FROM inventory_suppliers")).first()[0], 5)

    def test_legacy_call_assignees_are_resolved_only_when_unique_within_company(self):
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all([Tenant(id=5, name="five"), Tenant(id=6, name="six")]); session.commit()
            session.add_all([User(id=51, tenant_id=5, name="Unique", email="unique@five.test", password="x"),
                             User(id=61, tenant_id=6, name="Unique", email="unique@six.test", password="x"),
                             User(id=52, tenant_id=5, name="Duplicate", email="a@five.test", password="x"),
                             User(id=53, tenant_id=5, name="Duplicate", email="b@five.test", password="x")])
            session.commit()
            session.add_all([CallLog(id=1, tenant_id=5, phone_number="1", assigned_to="Unique"),
                             CallLog(id=2, tenant_id=6, phone_number="2", assigned_to="Unique"),
                             CallLog(id=3, tenant_id=5, phone_number="3", assigned_to="Duplicate")]); session.commit()
        database.create_db_and_tables()
        database.create_db_and_tables()
        with Session(self.engine) as session:
            self.assertEqual([session.get(CallLog, i).assigned_to for i in (1, 2, 3)], ["51", "61", "Duplicate"])


if __name__ == "__main__":
    unittest.main()
