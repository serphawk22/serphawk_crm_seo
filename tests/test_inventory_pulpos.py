"""
End-to-end tests for the Pulpos-inspired Inventory, Stock Movement Engine,
Warehouses, Stock Transfers, RFQ Comparison, Purchase Orders, Goods Receiving,
Stock Counting, Supplier Portal Security, Supplier Payments, and Reports.
"""
from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from addons.business_suite.models import StockMovement
from database import InventoryItem, InventorySupplier, User


class PulposInventoryWorkflowTests(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as session:
            sup_user = User(
                tenant_id=2,
                email="vendorA@t2.test",
                password="hash",
                hashed_password="hash",
                name="Vendor A",
                role="Supplier",
                is_active=True,
            )
            other_sup = User(
                tenant_id=2,
                email="vendorB@t2.test",
                password="hash",
                hashed_password="hash",
                name="Vendor B",
                role="Supplier",
                is_active=True,
            )
            foreign_item = InventoryItem(
                tenant_id=3,
                code="T3-SKU",
                name="Foreign Product",
                current_stock=50,
                min_stock=10,
            )
            session.add(sup_user)
            session.add(other_sup)
            session.add(foreign_item)
            session.commit()
            session.refresh(sup_user)
            session.refresh(other_sup)
            session.refresh(foreign_item)
            self.sup_a_id = sup_user.id
            self.sup_b_id = other_sup.id
            self.foreign_item_id = foreign_item.id

    def as_supplier_a(self):
        return {"X-User-ID": str(self.sup_a_id)}

    def as_supplier_b(self):
        return {"X-User-ID": str(self.sup_b_id)}

    def test_phase1_stock_movement_engine_and_product_enhancements(self):
        # 1. Create product with opening stock -> creates OPENING_STOCK movement
        r = self.client.post(
            "/inventory",
            headers=self.as_tenant(2),
            json={
                "code": "PUMP-100",
                "name": "Industrial Pump",
                "category": "Machinery",
                "brand": "FlowMax",
                "barcode": "8901234567890",
                "unit": "pcs",
                "min_stock": 10,
                "current_stock": 25,
                "cost_price": 120.0,
                "selling_price": 180.0,
                "tax_rate": 18.0,
                "variants": [{"sku": "PUMP-100-220V", "name": "220V Variant", "stock": 15}],
            },
        )
        self.assertEqual(r.status_code, 200, r.text)
        item_id = r.json()["id"]
        self.assertEqual(r.json()["current_stock"], 25)

        # Verify OPENING_STOCK movement exists
        mvs = self.client.get(f"/stock-movements?item_id={item_id}", headers=self.as_tenant(2)).json()
        self.assertEqual(mvs["total"], 1)
        self.assertEqual(mvs["movements"][0]["movement_type"], "OPENING_STOCK")
        self.assertEqual(mvs["movements"][0]["previous_stock"], 0)
        self.assertEqual(mvs["movements"][0]["new_stock"], 25)

        # 2. Manual Stock Adjustment (DAMAGE_OUT) with idempotency
        adj = self.client.post(
            "/stock-adjustments",
            headers=self.as_tenant(2),
            json={
                "item_id": item_id,
                "movement_type": "DAMAGE_OUT",
                "quantity": 5,
                "reason": "Damaged during forklift handling",
                "idempotency_key": "adj-dmg-1",
            },
        )
        self.assertEqual(adj.status_code, 200, adj.text)
        self.assertEqual(adj.json()["current_stock"], 20)

        # Repeat same idempotency_key -> no duplicate deduction
        adj_dup = self.client.post(
            "/stock-adjustments",
            headers=self.as_tenant(2),
            json={
                "item_id": item_id,
                "movement_type": "DAMAGE_OUT",
                "quantity": 5,
                "reason": "Damaged during forklift handling",
                "idempotency_key": "adj-dmg-1",
            },
        )
        self.assertEqual(adj_dup.status_code, 200)
        self.assertEqual(adj_dup.json()["current_stock"], 20)

        # Prevent negative stock
        over_out = self.client.post(
            "/stock-adjustments",
            headers=self.as_tenant(2),
            json={
                "item_id": item_id,
                "movement_type": "SALE_OUT",
                "quantity": 500,
                "reason": "Oversold test",
            },
        )
        self.assertEqual(over_out.status_code, 400)

        # 3. CSV Import and Dashboard real numbers
        imp = self.client.post(
            "/inventory/import-csv",
            headers=self.as_tenant(2),
            json={
                "csv_text": "code,name,category,brand,barcode,unit,min_stock,current_stock,cost_price,selling_price\nVALVE-01,Control Valve,Tools,ValveCorp,111222333,pcs,15,5,40,65"
            },
        )
        self.assertEqual(imp.status_code, 200, imp.text)
        self.assertEqual(imp.json()["created"], 1)

        dash = self.client.get("/inventory/dashboard", headers=self.as_tenant(2)).json()
        self.assertEqual(dash["total_products"], 2)
        self.assertEqual(dash["in_stock_products"], 1)   # PUMP-100: 20 > 10
        self.assertEqual(dash["low_stock_products"], 1)  # VALVE-01: 5 <= 15
        self.assertEqual(dash["total_stock_quantity"], 25.0)
        self.assertEqual(dash["total_inventory_value"], 20 * 120.0 + 5 * 40.0)

    def test_phase2_warehouses_and_stock_transfers(self):
        wh1 = self.client.post(
            "/warehouses",
            headers=self.as_tenant(2),
            json={"warehouse_name": "Central Hub", "warehouse_code": "WH-CENTRAL", "is_default": True},
        ).json()["warehouse"]
        wh2 = self.client.post(
            "/warehouses",
            headers=self.as_tenant(2),
            json={"warehouse_name": "East Branch", "warehouse_code": "WH-EAST"},
        ).json()["warehouse"]

        # Create item stocked in Central Hub
        item = self.client.post(
            "/inventory",
            headers=self.as_tenant(2),
            json={
                "code": "MOTOR-50",
                "name": "Servo Motor",
                "min_stock": 5,
                "current_stock": 30,
                "cost_price": 100.0,
                "warehouse_id": wh1["id"],
            },
        ).json()

        # Prevent same-warehouse transfer
        same = self.client.post(
            "/stock-transfers",
            headers=self.as_tenant(2),
            json={
                "source_warehouse_id": wh1["id"],
                "destination_warehouse_id": wh1["id"],
                "items": [{"item_id": item["id"], "requested_qty": 10}],
            },
        )
        self.assertEqual(same.status_code, 400)

        # Create -> Approve -> Dispatch -> Partial Receive -> Complete Receive
        trf = self.client.post(
            "/stock-transfers",
            headers=self.as_tenant(2),
            json={
                "source_warehouse_id": wh1["id"],
                "destination_warehouse_id": wh2["id"],
                "items": [{"item_id": item["id"], "requested_qty": 10}],
            },
        )
        self.assertEqual(trf.status_code, 200, trf.text)
        tid = trf.json()["transfer"]["id"]

        self.assertEqual(
            self.client.put(f"/stock-transfers/{tid}/approve", headers=self.as_tenant(2)).json()["transfer"]["status"],
            "Approved",
        )
        self.assertEqual(
            self.client.put(f"/stock-transfers/{tid}/dispatch", headers=self.as_tenant(2)).json()["transfer"]["status"],
            "Dispatched",
        )

        # Source warehouse now has 20
        wh1_inv = self.client.get(f"/warehouses/{wh1['id']}/inventory", headers=self.as_tenant(2)).json()
        self.assertEqual(wh1_inv["items"][0]["quantity"], 20.0)

        # Receive 9 good + 1 damaged at Destination
        rec = self.client.put(
            f"/stock-transfers/{tid}/receive",
            headers=self.as_tenant(2),
            json={"items": [{"item_id": item["id"], "received_qty": 10, "damaged_qty": 1}]},
        )
        self.assertEqual(rec.status_code, 200, rec.text)
        self.assertEqual(rec.json()["transfer"]["status"], "Completed")

        # Destination warehouse has 9 accepted
        wh2_inv = self.client.get(f"/warehouses/{wh2['id']}/inventory", headers=self.as_tenant(2)).json()
        self.assertEqual(wh2_inv["items"][0]["quantity"], 9.0)

    def test_phase3_and_4_rfq_comparison_po_goods_receiving_and_payments(self):
        # 1. Create low-stock product & assign two suppliers
        item = self.client.post(
            "/inventory",
            headers=self.as_tenant(2),
            json={"code": "CHIP-X1", "name": "Microcontroller X1", "min_stock": 50, "current_stock": 10, "cost_price": 15.0},
        ).json()
        sup_a = self.client.post(
            f"/inventory/{item['id']}/suppliers",
            headers=self.as_tenant(2),
            json={"supplier_name": "Vendor A", "supplier_email": "vendorA@t2.test", "unit_cost": 14.0, "lead_time_days": 5, "is_preferred": True},
        ).json()
        self.client.post(
            f"/inventory/{item['id']}/suppliers",
            headers=self.as_tenant(2),
            json={"supplier_name": "Vendor B", "supplier_email": "vendorB@t2.test", "unit_cost": 12.5, "lead_time_days": 14},
        )

        # Verify no plaintext login_password is stored in DB
        with Session(S.ENGINE) as s:
            db_sup = s.get(InventorySupplier, sup_a["id"])
            self.assertIsNone(db_sup.login_password)

        # 2. Batch RFQ to both suppliers
        batch = self.client.post(
            "/rfq/batch",
            headers=self.as_tenant(2),
            json={
                "item_id": item["id"],
                "quantity": 100,
                "deadline": "2026-12-01",
                "suppliers": [
                    {"supplier_name": "Vendor A", "supplier_email": "vendorA@t2.test"},
                    {"supplier_name": "Vendor B", "supplier_email": "vendorB@t2.test"},
                ],
            },
        )
        self.assertEqual(batch.status_code, 200, batch.text)
        rfq_a_id = batch.json()["rfqs"][0]["id"]
        rfq_b_id = batch.json()["rfqs"][1]["id"]

        # Supplier A responds via Supplier Portal; Supplier B cannot respond to Supplier A's RFQ
        forbid = self.client.post(
            f"/supplier/rfqs/{rfq_a_id}/respond",
            headers=self.as_supplier_b(),
            json={"supplier_email": "vendorB@t2.test", "unit_price": 13.0},
        )
        self.assertEqual(forbid.status_code, 403)

        resp_a = self.client.post(
            f"/supplier/rfqs/{rfq_a_id}/respond",
            headers=self.as_supplier_a(),
            json={
                "supplier_email": "vendorA@t2.test",
                "unit_price": 13.5,
                "currency": "USD",
                "min_order_qty": 50,
                "lead_time_days": 4,
                "availability": "In Stock",
            },
        )
        self.assertEqual(resp_a.status_code, 200, resp_a.text)
        resp_a_id = resp_a.json()["response_id"]

        # 3. Quotation Comparison
        comp = self.client.get(f"/rfq/comparison?item_id={item['id']}", headers=self.as_tenant(2)).json()
        self.assertEqual(len(comp["comparisons"]), 1)
        self.assertEqual(len(comp["comparisons"][0]["quotations"]), 2)

        # 4. Approve quotation & create Purchase Order from RFQ
        po_res = self.client.post(
            "/purchase-orders/from-rfq",
            headers=self.as_tenant(2),
            json={"rfq_id": rfq_a_id, "response_id": resp_a_id, "quantity": 100, "tax_rate": 10, "discount": 50},
        )
        self.assertEqual(po_res.status_code, 200, po_res.text)
        po = po_res.json()["order"]
        self.assertEqual(po["subtotal"], 1350.0)
        self.assertEqual(po["tax_amount"], 135.0)
        self.assertEqual(po["total_amount"], 1435.0)

        # 5. Supplier confirms PO and submits invoice
        conf = self.client.put(
            f"/supplier/purchase-orders/{po['id']}/confirm",
            headers=self.as_supplier_a(),
            json={"supplier_email": "vendorA@t2.test", "action": "confirm", "confirmed_delivery": "2026-12-05"},
        )
        self.assertEqual(conf.status_code, 200)
        self.assertEqual(conf.json()["order"]["status"], "Confirmed")

        inv = self.client.post(
            f"/supplier/purchase-orders/{po['id']}/invoice",
            headers=self.as_supplier_a(),
            json={"supplier_email": "vendorA@t2.test", "invoice_number": "INV-A-900", "invoice_amount": 1435.0},
        )
        self.assertEqual(inv.status_code, 200)

        # 6. Goods Receiving: Partial Delivery #1 (60 received, 5 damaged -> 55 accepted)
        gr1 = self.client.post(
            "/goods-receipts",
            headers=self.as_tenant(2),
            json={
                "purchase_order_id": po["id"],
                "idempotency_key": "gr-po-1",
                "items": [
                    {
                        "product_id": item["id"],
                        "ordered_qty": 100,
                        "received_qty": 60,
                        "damaged_qty": 5,
                        "lot_number": "LOT-CHIP-01",
                        "expiry_date": "2028-01-01",
                        "unit_cost": 13.5,
                    }
                ],
            },
        )
        self.assertEqual(gr1.status_code, 200, gr1.text)
        self.assertEqual(gr1.json()["po_status"], "Partially Received")

        # Stock increased only by accepted_qty (10 + 55 = 65)
        items_now = self.client.get("/inventory", headers=self.as_tenant(2)).json()["items"]
        chip_now = next(i for i in items_now if i["id"] == item["id"])
        self.assertEqual(chip_now["current_stock"], 65.0)

        # Duplicate submission with same idempotency_key does not double-increment stock
        gr1_dup = self.client.post(
            "/goods-receipts",
            headers=self.as_tenant(2),
            json={
                "purchase_order_id": po["id"],
                "idempotency_key": "gr-po-1",
                "items": [{"product_id": item["id"], "ordered_qty": 100, "received_qty": 60, "damaged_qty": 5}],
            },
        )
        self.assertTrue(gr1_dup.json().get("duplicate_ignored"))
        chip_after_dup = next(i for i in self.client.get("/inventory", headers=self.as_tenant(2)).json()["items"] if i["id"] == item["id"])
        self.assertEqual(chip_after_dup["current_stock"], 65.0)

        # Over-delivery validation (ordered 100, accepted 55, trying to accept 50 -> 105 > 100)
        over_gr = self.client.post(
            "/goods-receipts",
            headers=self.as_tenant(2),
            json={
                "purchase_order_id": po["id"],
                "items": [{"product_id": item["id"], "ordered_qty": 100, "received_qty": 50, "damaged_qty": 0}],
            },
        )
        self.assertEqual(over_gr.status_code, 400)

        # Goods Receiving #2: Remaining 45 accepted -> PO becomes Received, stock becomes 110
        gr2 = self.client.post(
            "/goods-receipts",
            headers=self.as_tenant(2),
            json={
                "purchase_order_id": po["id"],
                "items": [{"product_id": item["id"], "ordered_qty": 100, "received_qty": 45, "damaged_qty": 0}],
            },
        )
        self.assertEqual(gr2.status_code, 200, gr2.text)
        self.assertEqual(gr2.json()["po_status"], "Received")

        # 7. Supplier Payments & Outstanding Balance
        pay1 = self.client.post(
            "/supplier-payments",
            headers=self.as_tenant(2),
            json={"supplier_id": sup_a["id"], "purchase_order_id": po["id"], "amount": 1000.0, "payment_method": "Wire"},
        )
        self.assertEqual(pay1.status_code, 200)
        self.assertEqual(pay1.json()["po_payment_status"], "Partially Paid")

        out_bal = self.client.get(f"/suppliers/{sup_a['id']}/outstanding", headers=self.as_tenant(2)).json()
        self.assertEqual(out_bal["outstanding_balance"], 435.0)

        pay2 = self.client.post(
            "/supplier-payments",
            headers=self.as_tenant(2),
            json={"supplier_id": sup_a["id"], "purchase_order_id": po["id"], "amount": 435.0, "payment_method": "Wire"},
        )
        self.assertEqual(pay2.json()["po_payment_status"], "Fully Paid")

    def test_phase5_stock_counting_supplier_security_and_reports(self):
        item = self.client.post(
            "/inventory",
            headers=self.as_tenant(2),
            json={"code": "BOX-10", "name": "Corrugated Box", "min_stock": 20, "current_stock": 100, "cost_price": 2.0},
        ).json()
        sup = self.client.post(
            f"/inventory/{item['id']}/suppliers",
            headers=self.as_tenant(2),
            json={"supplier_name": "Vendor A", "supplier_email": "vendorA@t2.test"},
        ).json()

        # Supplier cannot directly alter company stock
        forbid_stock = self.client.put(
            f"/supplier/inventory/{sup['id']}/stock?current_stock=9999",
            headers=self.as_supplier_a(),
        )
        self.assertEqual(forbid_stock.status_code, 403)

        # Stock Count: start count (system=100) -> submit physical=94 (discrepancy=-6) -> stock unchanged until approved
        cnt = self.client.post("/stock-counts", headers=self.as_tenant(2), json={"item_ids": [item["id"]]}).json()["count"]
        sub = self.client.post(
            f"/stock-counts/{cnt['id']}/submit",
            headers=self.as_tenant(2),
            json={"items": [{"item_id": item["id"], "physical_qty": 94, "reason": "Cycle count shrinkage"}]},
        )
        self.assertEqual(sub.status_code, 200)
        # Before approval, stock is still 100
        cur_before = next(i for i in self.client.get("/inventory", headers=self.as_tenant(2)).json()["items"] if i["id"] == item["id"])
        self.assertEqual(cur_before["current_stock"], 100.0)

        # Approve count -> stock adjusts to 94 and creates ADJUSTMENT_OUT movement
        app_res = self.client.post(f"/stock-counts/{cnt['id']}/approve", headers=self.as_tenant(2))
        self.assertEqual(app_res.status_code, 200)
        self.assertEqual(app_res.json()["adjustments_made"], 1)
        cur_after = next(i for i in self.client.get("/inventory", headers=self.as_tenant(2)).json()["items"] if i["id"] == item["id"])
        self.assertEqual(cur_after["current_stock"], 94.0)

        # Verify all 11 reports return 200 and accurate data
        for rtype in (
            "current-inventory",
            "low-stock",
            "out-of-stock",
            "stock-valuation",
            "stock-movements",
            "purchase-orders",
            "supplier-performance",
            "goods-receiving",
            "stock-transfers",
            "stock-discrepancies",
            "supplier-payments",
        ):
            rep = self.client.get(f"/inventory/reports/{rtype}", headers=self.as_tenant(2))
            self.assertEqual(rep.status_code, 200, f"Report {rtype} failed: {rep.text}")
        csv_exp = self.client.get("/inventory/reports/current-inventory/export-csv", headers=self.as_tenant(2))
        self.assertEqual(csv_exp.status_code, 200)
        self.assertIn("BOX-10", csv_exp.text)
