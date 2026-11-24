"""
Pulpos-Inspired Inventory, Stock Movement Engine, Warehouse, Procurement,
Goods Receiving, Stock Transfers, Stock Counting, Supplier Portal,
Supplier Payments, and Reporting Router.
"""
from __future__ import annotations

import csv
import io
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlmodel import Session, select

from addons.business_suite.models import StockMovement
import database
from database import (
    GoodsReceipt,
    InventoryItem,
    InventorySupplier,
    PurchaseOrder,
    RFQRequest,
    RFQResponse,
    StockCount,
    StockTransfer,
    SupplierPayment,
    User,
    Warehouse,
    WarehouseStock,
)
from modules.api_tracker import current_salesperson_id
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["Inventory & Procurement (Pulpos)"])

STAFF_ROLES = ["Admin", "SalesManager", "Employee", "Sales", "Demo"]
MANAGER_ROLES = ["Admin", "SalesManager", "Demo"]

MOVEMENT_TYPES = {
    "OPENING_STOCK",
    "PURCHASE_IN",
    "SALE_OUT",
    "PURCHASE_RETURN",
    "SALE_RETURN",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
    "DAMAGE_OUT",
}

OUTBOUND_MOVEMENT_TYPES = {
    "SALE_OUT",
    "PURCHASE_RETURN",
    "TRANSFER_OUT",
    "ADJUSTMENT_OUT",
    "DAMAGE_OUT",
}


def get_session():
    with Session(database.engine) as session:
        yield session


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _tid() -> Optional[int]:
    t = current_tenant_id.get()
    return t if (t and t > 0) else None


def _current_user(session: Session) -> Optional[User]:
    uid = current_salesperson_id.get()
    if not uid:
        return None
    return session.get(User, uid)


def _require_staff(session: Session, allowed_roles: Optional[List[str]] = None) -> Optional[User]:
    """Return authenticated user if present and validate role; in legacy/test calls without user header,
    enforce role check when a user is authenticated."""
    roles = allowed_roles or STAFF_ROLES
    uid = current_salesperson_id.get()
    if not uid:
        return None
    from main import _require_roles
    return _require_roles(session, roles)


def _require_manager(session: Session) -> Optional[User]:
    uid = current_salesperson_id.get()
    if not uid:
        return None
    from main import _require_roles
    return _require_roles(session, MANAGER_ROLES)


def _require_supplier_or_staff(session: Session, supplier_email: Optional[str] = None) -> Optional[User]:
    """Validate that a supplier portal request belongs to the authenticated supplier (or tenant staff)."""
    uid = current_salesperson_id.get()
    if not uid:
        return None
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    role = (user.role or "").strip()
    if role == "Supplier":
        if supplier_email and user.email.strip().lower() != supplier_email.strip().lower():
            raise HTTPException(status_code=403, detail="Suppliers can only access their own records")
        return user
    from main import _require_roles
    return _require_roles(session, STAFF_ROLES)


def stock_status_label(current_stock: float, min_stock: float) -> str:
    """Pulpos Stock Status:
    - In Stock: current_stock > min_stock and current_stock > 0
    - Low Stock: current_stock > 0 and current_stock <= min_stock
    - Out of Stock: current_stock <= 0
    """
    cur = float(current_stock or 0)
    mn = float(min_stock or 0)
    if cur <= 0:
        return "Out of Stock"
    if cur <= mn:
        return "Low Stock"
    return "In Stock"


# ═══════════════════════════════════════════════════════════════════════════════
# ATOMIC STOCK MOVEMENT ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def record_stock_movement(
    session: Session,
    *,
    item: InventoryItem,
    movement_type: str,
    quantity: float,
    reason: str,
    warehouse_id: Optional[int] = None,
    reference_id: Optional[str] = None,
    reference_type: Optional[str] = None,
    user: Optional[User] = None,
    idempotency_key: Optional[str] = None,
    allow_negative: bool = False,
) -> StockMovement:
    """Atomically update warehouse & item stock and create an immutable StockMovement record."""
    mtype = (movement_type or "ADJUSTMENT_IN").upper().strip()
    if mtype not in MOVEMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid movement_type: {mtype}")

    tenant_id = item.tenant_id or _tid()

    if idempotency_key:
        existing = session.exec(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.idempotency_key == idempotency_key,
                StockMovement.item_id == item.id,
            )
        ).first()
        if existing:
            return existing

    qty = abs(float(quantity or 0))
    is_outbound = mtype in OUTBOUND_MOVEMENT_TYPES
    signed_delta = -qty if is_outbound else qty

    prev_item_stock = float(item.current_stock or 0)

    # If warehouse_id is specified, update WarehouseStock as source of truth
    if warehouse_id is not None:
        wh = session.get(Warehouse, warehouse_id)
        if not wh or (tenant_id and wh.tenant_id and wh.tenant_id != tenant_id):
            raise HTTPException(status_code=404, detail="Warehouse not found")
        ws = session.exec(
            select(WarehouseStock).where(
                WarehouseStock.warehouse_id == warehouse_id,
                WarehouseStock.item_id == item.id,
            )
        ).first()
        if not ws:
            # If this is the first warehouse entry for an item that already had legacy stock,
            # seed the default warehouse or start at 0
            other_ws = session.exec(
                select(WarehouseStock).where(WarehouseStock.item_id == item.id)
            ).all()
            initial_wh_qty = prev_item_stock if (not other_ws and prev_item_stock > 0 and is_outbound) else 0.0
            ws = WarehouseStock(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                item_id=item.id,
                quantity=initial_wh_qty,
            )
            session.add(ws)
            session.flush()

        prev_wh_stock = float(ws.quantity or 0)
        new_wh_stock = prev_wh_stock + signed_delta
        if new_wh_stock < 0 and not allow_negative:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in warehouse '{wh.warehouse_name}' for {item.name} (available: {prev_wh_stock}, required: {qty})",
            )
        ws.quantity = new_wh_stock
        if mtype == "DAMAGE_OUT":
            ws.damaged_qty = float(ws.damaged_qty or 0) + qty
        ws.updated_at = _utcnow()
        session.add(ws)
        session.flush()

        # Recompute total across warehouses if all stock is tracked in warehouses, else apply delta
        all_ws = session.exec(
            select(WarehouseStock).where(WarehouseStock.item_id == item.id)
        ).all()
        ws_sum = sum(float(w.quantity or 0) for w in all_ws)
        new_item_stock = max(0.0, prev_item_stock + signed_delta) if ws_sum < prev_item_stock + signed_delta else ws_sum
    else:
        new_item_stock = prev_item_stock + signed_delta
        if new_item_stock < 0 and not allow_negative:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {item.name} (available: {prev_item_stock}, required: {qty})",
            )
        # Also sync with default warehouse if one exists
        default_wh = session.exec(
            select(Warehouse).where(Warehouse.is_default == True, Warehouse.status == "Active")
        ).first()
        if default_wh:
            ws = session.exec(
                select(WarehouseStock).where(
                    WarehouseStock.warehouse_id == default_wh.id,
                    WarehouseStock.item_id == item.id,
                )
            ).first()
            if ws:
                ws.quantity = max(0.0, float(ws.quantity or 0) + signed_delta)
                ws.updated_at = _utcnow()
                session.add(ws)
                warehouse_id = default_wh.id

    item.current_stock = new_item_stock
    item.updated_at = _utcnow()
    session.add(item)

    actor = user or _current_user(session)
    actor_id = actor.id if actor else current_salesperson_id.get()
    actor_name = (actor.name or actor.email) if actor else "System"

    movement = StockMovement(
        tenant_id=tenant_id,
        item_id=item.id,
        warehouse_id=warehouse_id,
        movement_type=mtype,
        quantity=qty,
        previous_stock=prev_item_stock,
        new_stock=new_item_stock,
        reference_id=str(reference_id) if reference_id is not None else None,
        reference_type=reference_type,
        reason=(reason or mtype).strip(),
        performed_by=actor_id,
        performed_by_name=actor_name,
        idempotency_key=idempotency_key,
        # Legacy fields
        change=signed_delta,
        reference=f"{reference_type}:{reference_id}" if (reference_type and reference_id) else (str(reference_id) if reference_id else None),
        balance_after=new_item_stock,
        author_id=actor_id,
        created_at=_utcnow(),
    )
    session.add(movement)
    return movement


def _movement_dict(m: StockMovement, item_map: Dict[int, InventoryItem], wh_map: Dict[int, Warehouse]) -> dict:
    item = item_map.get(m.item_id)
    wh = wh_map.get(m.warehouse_id) if m.warehouse_id else None
    mtype = m.movement_type or ("ADJUSTMENT_IN" if (m.change or 0) >= 0 else "ADJUSTMENT_OUT")
    qty = m.quantity if (m.quantity is not None and m.quantity > 0) else abs(float(m.change or 0))
    new_stk = m.new_stock if (m.new_stock is not None and (m.new_stock != 0 or m.balance_after is None)) else float(m.balance_after or 0)
    prev_stk = m.previous_stock if (m.previous_stock is not None and (m.previous_stock != 0 or m.quantity)) else (new_stk - float(m.change or 0))
    return {
        "id": m.id,
        "tenant_id": m.tenant_id,
        "item_id": m.item_id,
        "item_name": item.name if item else f"Item #{m.item_id}",
        "item_code": item.code if item else "—",
        "item_unit": (item.unit if item else None) or "pcs",
        "warehouse_id": m.warehouse_id,
        "warehouse_name": wh.warehouse_name if wh else "Main Inventory",
        "movement_type": mtype,
        "quantity": qty,
        "change": float(m.change or (qty if mtype not in OUTBOUND_MOVEMENT_TYPES else -qty)),
        "previous_stock": prev_stk,
        "new_stock": new_stk,
        "balance_after": new_stk,
        "reference_id": m.reference_id or m.reference,
        "reference_type": m.reference_type,
        "reason": m.reason,
        "performed_by": m.performed_by or m.author_id,
        "performed_by_name": m.performed_by_name or "Staff",
        "created_at": _iso(m.created_at),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: INVENTORY DASHBOARD, STOCK MOVEMENTS, ADJUSTMENTS & PRODUCT BULK/CSV
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/inventory/dashboard")
def get_inventory_dashboard(warehouse_id: Optional[int] = None, session: Session = Depends(get_session)):
    _require_staff(session)
    items = session.exec(select(InventoryItem).order_by(InventoryItem.created_at.desc())).all()
    suppliers = session.exec(select(InventorySupplier)).all()
    warehouses = session.exec(select(Warehouse).order_by(Warehouse.id)).all()
    wh_stocks = session.exec(select(WarehouseStock)).all()

    wh_qty_by_item: Dict[int, float] = {}
    if warehouse_id:
        for ws in wh_stocks:
            if ws.warehouse_id == warehouse_id:
                wh_qty_by_item[ws.item_id] = float(ws.quantity or 0)

    # Build preferred / fallback unit cost map from suppliers
    supplier_cost_by_item: Dict[int, float] = {}
    for s in suppliers:
        if s.unit_cost is not None and s.unit_cost > 0:
            if s.is_preferred or s.item_id not in supplier_cost_by_item:
                supplier_cost_by_item[s.item_id] = float(s.unit_cost)

    total_products = len(items)
    total_stock_qty = 0.0
    total_inventory_value = 0.0
    total_selling_value = 0.0
    in_stock_count = 0
    low_stock_count = 0
    out_of_stock_count = 0

    for item in items:
        cur = wh_qty_by_item.get(item.id, 0.0) if warehouse_id else float(item.current_stock or 0)
        mn = float(item.min_stock or 0)
        unit_cost = float(item.cost_price or 0) or supplier_cost_by_item.get(item.id, 0.0)
        sell_price = float(item.selling_price or 0) or unit_cost

        total_stock_qty += cur
        total_inventory_value += cur * unit_cost
        total_selling_value += cur * sell_price

        st = stock_status_label(cur, mn)
        if st == "Out of Stock":
            out_of_stock_count += 1
        elif st == "Low Stock":
            low_stock_count += 1
        else:
            in_stock_count += 1

    unique_supplier_keys = {
        (s.supplier_email or s.supplier_name or "").strip().lower()
        for s in suppliers
        if (s.supplier_email or s.supplier_name)
    }

    pos = session.exec(select(PurchaseOrder)).all()
    pending_pos = [
        p for p in pos
        if p.status in ("Draft", "Pending Approval", "Approved", "Sent", "Confirmed", "Partially Received")
    ]
    awaiting_receipt_pos = [
        p for p in pos
        if p.status in ("Approved", "Sent", "Confirmed", "Partially Received")
    ]

    recent_mv_rows = session.exec(
        select(StockMovement).order_by(StockMovement.created_at.desc()).limit(15)
    ).all()
    item_map = {i.id: i for i in items}
    wh_map = {w.id: w for w in warehouses}

    return {
        "total_products": total_products,
        "total_stock_quantity": round(total_stock_qty, 2),
        "total_inventory_value": round(total_inventory_value, 2),
        "total_selling_value": round(total_selling_value, 2),
        "in_stock_products": in_stock_count,
        "low_stock_products": low_stock_count,
        "out_of_stock_products": out_of_stock_count,
        "total_suppliers": len(unique_supplier_keys),
        "total_supplier_links": len(suppliers),
        "pending_purchase_orders": len(pending_pos),
        "pending_goods_receipts": len(awaiting_receipt_pos),
        "total_warehouses": len([w for w in warehouses if w.status == "Active"]),
        "recent_movements": [_movement_dict(m, item_map, wh_map) for m in recent_mv_rows],
    }


@router.get("/stock-movements")
def list_stock_movements(
    item_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    _require_staff(session)
    q = select(StockMovement).order_by(StockMovement.created_at.desc())
    if item_id:
        q = q.where(StockMovement.item_id == item_id)
    if warehouse_id:
        q = q.where(StockMovement.warehouse_id == warehouse_id)
    if movement_type and movement_type != "All":
        q = q.where(StockMovement.movement_type == movement_type.upper())

    rows = session.exec(q).all()
    items = session.exec(select(InventoryItem)).all()
    warehouses = session.exec(select(Warehouse)).all()
    item_map = {i.id: i for i in items}
    wh_map = {w.id: w for w in warehouses}

    out = []
    for r in rows:
        if date_from and r.created_at and r.created_at.strftime("%Y-%m-%d") < date_from[:10]:
            continue
        if date_to and r.created_at and r.created_at.strftime("%Y-%m-%d") > date_to[:10]:
            continue
        d = _movement_dict(r, item_map, wh_map)
        if search:
            sq = search.lower().strip()
            hay = f"{d['item_name']} {d['item_code']} {d['reason']} {d['reference_id'] or ''} {d['movement_type']} {d['warehouse_name']}".lower()
            if sq not in hay:
                continue
        out.append(d)

    total = len(out)
    return {
        "movements": out[offset : offset + limit],
        "total": total,
        "movement_types": sorted(MOVEMENT_TYPES),
    }


@router.get("/stock-movements/{movement_id}")
def get_stock_movement(movement_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    m = session.get(StockMovement, movement_id)
    if not m:
        raise HTTPException(status_code=404, detail="Stock movement not found")
    item = session.get(InventoryItem, m.item_id)
    wh = session.get(Warehouse, m.warehouse_id) if m.warehouse_id else None
    return _movement_dict(m, {m.item_id: item} if item else {}, {m.warehouse_id: wh} if wh else {})


class StockAdjustmentRequest(BaseModel):
    item_id: int
    warehouse_id: Optional[int] = None
    movement_type: str = "ADJUSTMENT_IN"  # ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE_OUT, OPENING_STOCK, SALE_OUT, SALE_RETURN, PURCHASE_RETURN
    quantity: float = Field(gt=0)
    reason: str = Field(min_length=2, max_length=255)
    reference_id: Optional[str] = None
    reference_type: Optional[str] = "MANUAL_ADJUSTMENT"
    idempotency_key: Optional[str] = None


@router.post("/stock-adjustments")
def create_stock_adjustment(body: StockAdjustmentRequest, session: Session = Depends(get_session)):
    user = _require_staff(session, ["Admin", "SalesManager", "Employee", "Demo"])
    if not body.reason or not body.reason.strip():
        raise HTTPException(status_code=400, detail="A mandatory reason is required for stock adjustments")
    item = session.get(InventoryItem, body.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    movement = record_stock_movement(
        session,
        item=item,
        movement_type=body.movement_type,
        quantity=body.quantity,
        reason=body.reason.strip(),
        warehouse_id=body.warehouse_id,
        reference_id=body.reference_id,
        reference_type=body.reference_type or "MANUAL_ADJUSTMENT",
        user=user,
        idempotency_key=body.idempotency_key,
    )
    session.commit()
    session.refresh(movement)
    session.refresh(item)
    wh = session.get(Warehouse, movement.warehouse_id) if movement.warehouse_id else None
    return {
        "ok": True,
        "current_stock": item.current_stock,
        "stock_status": stock_status_label(item.current_stock, item.min_stock),
        "movement": _movement_dict(movement, {item.id: item}, {wh.id: wh} if wh else {}),
    }


@router.get("/inventory/{item_id}/history")
def get_product_history(item_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    movements = session.exec(
        select(StockMovement)
        .where(StockMovement.item_id == item_id)
        .order_by(StockMovement.created_at.desc())
    ).all()
    warehouses = session.exec(select(Warehouse)).all()
    wh_map = {w.id: w for w in warehouses}
    wh_stocks = session.exec(
        select(WarehouseStock).where(WarehouseStock.item_id == item_id)
    ).all()
    rfqs = session.exec(
        select(RFQRequest).where(RFQRequest.item_id == item_id).order_by(RFQRequest.created_at.desc())
    ).all()

    return {
        "item": {
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "barcode": item.barcode,
            "brand": item.brand,
            "current_stock": item.current_stock,
            "min_stock": item.min_stock,
            "cost_price": item.cost_price,
            "selling_price": item.selling_price,
            "status": item.status,
            "stock_status": stock_status_label(item.current_stock, item.min_stock),
        },
        "warehouse_balances": [
            {
                "warehouse_id": ws.warehouse_id,
                "warehouse_name": wh_map[ws.warehouse_id].warehouse_name if ws.warehouse_id in wh_map else f"WH #{ws.warehouse_id}",
                "quantity": ws.quantity,
                "damaged_qty": ws.damaged_qty,
                "updated_at": _iso(ws.updated_at),
            }
            for ws in wh_stocks
        ],
        "movements": [_movement_dict(m, {item.id: item}, wh_map) for m in movements],
        "rfqs": [
            {
                "id": r.id,
                "supplier_name": r.supplier_name,
                "quantity": r.quantity,
                "status": r.status,
                "created_at": _iso(r.created_at),
            }
            for r in rfqs
        ],
    }


class BulkProductImportRow(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = "pcs"
    min_stock: float = 0.0
    current_stock: float = 0.0
    cost_price: float = 0.0
    selling_price: float = 0.0
    tax_rate: float = 0.0
    status: str = "Active"
    warehouse_id: Optional[int] = None


class BulkProductImportRequest(BaseModel):
    csv_text: Optional[str] = None
    items: Optional[List[BulkProductImportRow]] = None


@router.post("/inventory/import-csv")
def import_inventory_csv(body: BulkProductImportRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    tenant_id = _tid()
    rows_to_process: List[dict] = []

    if body.items:
        rows_to_process = [r.model_dump() for r in body.items]
    elif body.csv_text:
        reader = csv.DictReader(io.StringIO(body.csv_text.strip()))
        for r in reader:
            normalized = {str(k or "").strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in r.items()}
            code = normalized.get("code") or normalized.get("sku") or ""
            name = normalized.get("name") or normalized.get("product_name") or normalized.get("product") or ""
            if not code or not name:
                continue
            rows_to_process.append({
                "code": code,
                "name": name,
                "description": normalized.get("description") or "",
                "category": normalized.get("category") or "Other",
                "brand": normalized.get("brand") or "",
                "barcode": normalized.get("barcode") or "",
                "unit": normalized.get("unit") or "pcs",
                "min_stock": float(normalized.get("min_stock") or 0),
                "current_stock": float(normalized.get("current_stock") or normalized.get("stock") or 0),
                "cost_price": float(normalized.get("cost_price") or normalized.get("cost") or 0),
                "selling_price": float(normalized.get("selling_price") or normalized.get("price") or 0),
                "tax_rate": float(normalized.get("tax_rate") or normalized.get("tax") or 0),
                "status": normalized.get("status") or "Active",
            })

    if not rows_to_process:
        raise HTTPException(status_code=400, detail="No valid product rows found in import payload")

    created_count = 0
    updated_count = 0
    for r in rows_to_process:
        existing = session.exec(
            select(InventoryItem).where(func.lower(InventoryItem.code) == r["code"].strip().lower())
        ).first()
        target_stock = float(r.get("current_stock") or 0)
        if existing:
            prev_stock = float(existing.current_stock or 0)
            for field in ("name", "description", "category", "brand", "barcode", "unit", "min_stock", "cost_price", "selling_price", "tax_rate", "status"):
                if r.get(field) is not None and r.get(field) != "":
                    setattr(existing, field, r[field])
            existing.updated_at = _utcnow()
            session.add(existing)
            session.flush()
            delta = target_stock - prev_stock
            if abs(delta) > 1e-9:
                record_stock_movement(
                    session,
                    item=existing,
                    movement_type="ADJUSTMENT_IN" if delta > 0 else "ADJUSTMENT_OUT",
                    quantity=abs(delta),
                    reason="CSV Bulk Import Stock Sync",
                    warehouse_id=r.get("warehouse_id"),
                    reference_type="CSV_IMPORT",
                    user=user,
                )
            updated_count += 1
        else:
            item = InventoryItem(
                tenant_id=tenant_id,
                code=r["code"].strip(),
                name=r["name"].strip(),
                description=r.get("description") or None,
                category=r.get("category") or None,
                brand=r.get("brand") or None,
                barcode=r.get("barcode") or None,
                unit=r.get("unit") or "pcs",
                min_stock=float(r.get("min_stock") or 0),
                current_stock=0.0,
                cost_price=float(r.get("cost_price") or 0),
                selling_price=float(r.get("selling_price") or 0),
                tax_rate=float(r.get("tax_rate") or 0),
                status=r.get("status") or "Active",
            )
            session.add(item)
            session.flush()
            if target_stock > 0:
                record_stock_movement(
                    session,
                    item=item,
                    movement_type="OPENING_STOCK",
                    quantity=target_stock,
                    reason="Opening Stock via CSV Import",
                    warehouse_id=r.get("warehouse_id"),
                    reference_type="CSV_IMPORT",
                    user=user,
                )
            created_count += 1

    session.commit()
    return {"ok": True, "created": created_count, "updated": updated_count, "total": created_count + updated_count}


class BulkProductUpdateRequest(BaseModel):
    item_ids: List[int]
    category: Optional[str] = None
    brand: Optional[str] = None
    status: Optional[str] = None
    min_stock: Optional[float] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    tax_rate: Optional[float] = None


@router.post("/inventory/bulk-update")
def bulk_update_inventory_items(body: BulkProductUpdateRequest, session: Session = Depends(get_session)):
    _require_staff(session)
    if not body.item_ids:
        raise HTTPException(status_code=400, detail="Select at least one product to update")
    updated = 0
    for item_id in body.item_ids:
        item = session.get(InventoryItem, item_id)
        if not item:
            continue
        for field in ("category", "brand", "status", "min_stock", "cost_price", "selling_price", "tax_rate"):
            val = getattr(body, field)
            if val is not None and val != "":
                setattr(item, field, val)
        item.updated_at = _utcnow()
        session.add(item)
        updated += 1
    session.commit()
    return {"ok": True, "updated": updated}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: WAREHOUSE MANAGEMENT & MULTI-WAREHOUSE INVENTORY
# ═══════════════════════════════════════════════════════════════════════════════

class WarehouseCreateRequest(BaseModel):
    warehouse_name: str = Field(min_length=1, max_length=255)
    warehouse_code: str = Field(min_length=1, max_length=100)
    address: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = "Active"
    is_default: bool = False


def _warehouse_dict(w: Warehouse, wh_stocks: List[WarehouseStock], items_map: Dict[int, InventoryItem]) -> dict:
    my_stocks = [ws for ws in wh_stocks if ws.warehouse_id == w.id and float(ws.quantity or 0) > 0]
    total_qty = sum(float(ws.quantity or 0) for ws in my_stocks)
    total_val = 0.0
    for ws in my_stocks:
        it = items_map.get(ws.item_id)
        if it:
            total_val += float(ws.quantity or 0) * float(it.cost_price or 0)
    return {
        "id": w.id,
        "tenant_id": w.tenant_id,
        "warehouse_name": w.warehouse_name,
        "warehouse_code": w.warehouse_code,
        "address": w.address,
        "contact_person": w.contact_person,
        "phone": w.phone,
        "email": w.email,
        "status": w.status,
        "is_default": w.is_default,
        "product_count": len(my_stocks),
        "total_stock_qty": round(total_qty, 2),
        "total_stock_value": round(total_val, 2),
        "created_at": _iso(w.created_at),
    }


@router.get("/warehouses")
def list_warehouses(session: Session = Depends(get_session)):
    _require_staff(session)
    warehouses = session.exec(select(Warehouse).order_by(Warehouse.id)).all()
    wh_stocks = session.exec(select(WarehouseStock)).all()
    items = session.exec(select(InventoryItem)).all()
    items_map = {i.id: i for i in items}
    return {
        "warehouses": [_warehouse_dict(w, wh_stocks, items_map) for w in warehouses],
        "total": len(warehouses),
    }


@router.post("/warehouses")
def create_warehouse(body: WarehouseCreateRequest, session: Session = Depends(get_session)):
    _require_staff(session)
    tenant_id = _tid()
    existing = session.exec(
        select(Warehouse).where(func.lower(Warehouse.warehouse_code) == body.warehouse_code.strip().lower())
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Warehouse code already exists in this company")

    existing_all = session.exec(select(Warehouse)).all()
    is_default = body.is_default or (len(existing_all) == 0)
    if is_default:
        for w in existing_all:
            if w.is_default:
                w.is_default = False
                session.add(w)

    wh = Warehouse(
        tenant_id=tenant_id,
        warehouse_name=body.warehouse_name.strip(),
        warehouse_code=body.warehouse_code.strip().upper(),
        address=body.address,
        contact_person=body.contact_person,
        phone=body.phone,
        email=body.email,
        status=body.status or "Active",
        is_default=is_default,
    )
    session.add(wh)
    session.commit()
    session.refresh(wh)
    return {"warehouse": _warehouse_dict(wh, [], {})}


@router.put("/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, body: WarehouseCreateRequest, session: Session = Depends(get_session)):
    _require_staff(session)
    wh = session.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    if body.is_default and not wh.is_default:
        for other in session.exec(select(Warehouse)).all():
            if other.id != wh.id and other.is_default:
                other.is_default = False
                session.add(other)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(wh, k, v)
    wh.updated_at = _utcnow()
    session.add(wh)
    session.commit()
    session.refresh(wh)
    wh_stocks = session.exec(select(WarehouseStock).where(WarehouseStock.warehouse_id == wh.id)).all()
    items_map = {i.id: i for i in session.exec(select(InventoryItem)).all()}
    return {"warehouse": _warehouse_dict(wh, wh_stocks, items_map)}


@router.delete("/warehouses/{warehouse_id}")
def deactivate_warehouse(warehouse_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    wh = session.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.status = "Inactive"
    wh.updated_at = _utcnow()
    session.add(wh)
    session.commit()
    return {"ok": True, "status": "Inactive"}


@router.get("/warehouses/{warehouse_id}/inventory")
def get_warehouse_inventory(
    warehouse_id: int,
    search: Optional[str] = None,
    session: Session = Depends(get_session),
):
    _require_staff(session)
    wh = session.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh_stocks = session.exec(
        select(WarehouseStock).where(WarehouseStock.warehouse_id == warehouse_id)
    ).all()
    items = session.exec(select(InventoryItem)).all()
    items_map = {i.id: i for i in items}
    suppliers = session.exec(select(InventorySupplier)).all()
    sup_cost: Dict[int, float] = {}
    for s in suppliers:
        if s.unit_cost:
            if s.is_preferred or s.item_id not in sup_cost:
                sup_cost[s.item_id] = float(s.unit_cost)

    inventory_rows = []
    total_value = 0.0
    for ws in wh_stocks:
        it = items_map.get(ws.item_id)
        if not it:
            continue
        if search:
            sq = search.lower().strip()
            if sq not in it.name.lower() and sq not in it.code.lower() and sq not in (it.category or "").lower():
                continue
        unit_cost = float(it.cost_price or 0) or sup_cost.get(it.id, 0.0)
        qty = float(ws.quantity or 0)
        val = qty * unit_cost
        total_value += val
        inventory_rows.append({
            "item_id": it.id,
            "code": it.code,
            "name": it.name,
            "category": it.category,
            "unit": it.unit or "pcs",
            "quantity": qty,
            "reserved_qty": float(ws.reserved_qty or 0),
            "damaged_qty": float(ws.damaged_qty or 0),
            "min_stock": float(it.min_stock or 0),
            "unit_cost": unit_cost,
            "stock_value": round(val, 2),
            "stock_status": stock_status_label(qty, it.min_stock or 0),
            "updated_at": _iso(ws.updated_at),
        })

    movements = session.exec(
        select(StockMovement)
        .where(StockMovement.warehouse_id == warehouse_id)
        .order_by(StockMovement.created_at.desc())
        .limit(50)
    ).all()

    return {
        "warehouse": _warehouse_dict(wh, wh_stocks, items_map),
        "items": inventory_rows,
        "total_items": len(inventory_rows),
        "total_value": round(total_value, 2),
        "movements": [_movement_dict(m, items_map, {wh.id: wh}) for m in movements],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2B: STOCK TRANSFERS
# ═══════════════════════════════════════════════════════════════════════════════

class StockTransferItemInput(BaseModel):
    item_id: int
    requested_qty: float = Field(gt=0)


class StockTransferCreateRequest(BaseModel):
    source_warehouse_id: int
    destination_warehouse_id: int
    items: List[StockTransferItemInput]
    notes: Optional[str] = None


class StockTransferReceiveItemInput(BaseModel):
    item_id: int
    received_qty: float = Field(ge=0)
    damaged_qty: float = Field(default=0, ge=0)


class StockTransferReceiveRequest(BaseModel):
    items: List[StockTransferReceiveItemInput]
    notes: Optional[str] = None


def _transfer_dict(t: StockTransfer, wh_map: Dict[int, Warehouse]) -> dict:
    src = wh_map.get(t.source_warehouse_id)
    dst = wh_map.get(t.destination_warehouse_id)
    return {
        "id": t.id,
        "transfer_number": t.transfer_number,
        "source_warehouse_id": t.source_warehouse_id,
        "source_warehouse_name": src.warehouse_name if src else f"WH #{t.source_warehouse_id}",
        "destination_warehouse_id": t.destination_warehouse_id,
        "destination_warehouse_name": dst.warehouse_name if dst else f"WH #{t.destination_warehouse_id}",
        "items": t.items or [],
        "status": t.status,
        "requested_by": t.requested_by,
        "approved_by": t.approved_by,
        "dispatched_at": _iso(t.dispatched_at),
        "received_at": _iso(t.received_at),
        "notes": t.notes,
        "created_at": _iso(t.created_at),
    }


@router.get("/stock-transfers")
def list_stock_transfers(status: Optional[str] = None, session: Session = Depends(get_session)):
    _require_staff(session)
    q = select(StockTransfer).order_by(StockTransfer.created_at.desc())
    if status and status != "All":
        q = q.where(StockTransfer.status == status)
    transfers = session.exec(q).all()
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    return {"transfers": [_transfer_dict(t, wh_map) for t in transfers], "total": len(transfers)}


@router.post("/stock-transfers")
def create_stock_transfer(body: StockTransferCreateRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    if body.source_warehouse_id == body.destination_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses cannot be the same")
    if not body.items:
        raise HTTPException(status_code=400, detail="Add at least one item to transfer")

    src = session.get(Warehouse, body.source_warehouse_id)
    dst = session.get(Warehouse, body.destination_warehouse_id)
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Source or destination warehouse not found")

    items_payload = []
    for line in body.items:
        item = session.get(InventoryItem, line.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item #{line.item_id} not found")
        ws = session.exec(
            select(WarehouseStock).where(
                WarehouseStock.warehouse_id == src.id,
                WarehouseStock.item_id == item.id,
            )
        ).first()
        avail = float(ws.quantity if ws else (item.current_stock or 0))
        if avail < line.requested_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {item.name} in {src.warehouse_name} (available: {avail}, requested: {line.requested_qty})",
            )
        items_payload.append({
            "item_id": item.id,
            "item_code": item.code,
            "item_name": item.name,
            "unit": item.unit or "pcs",
            "requested_qty": float(line.requested_qty),
            "dispatched_qty": 0.0,
            "received_qty": 0.0,
            "damaged_qty": 0.0,
            "accepted_qty": 0.0,
        })

    count = len(session.exec(select(StockTransfer)).all()) + 1
    transfer = StockTransfer(
        tenant_id=_tid() or src.tenant_id,
        transfer_number=f"TRF-{count:05d}",
        source_warehouse_id=src.id,
        destination_warehouse_id=dst.id,
        items=items_payload,
        status="Pending Approval",
        requested_by=user.id if user else current_salesperson_id.get(),
        notes=body.notes,
    )
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    return {"transfer": _transfer_dict(transfer, {src.id: src, dst.id: dst})}


@router.put("/stock-transfers/{transfer_id}/approve")
def approve_stock_transfer(transfer_id: int, session: Session = Depends(get_session)):
    user = _require_manager(session)
    transfer = session.get(StockTransfer, transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status not in ("Draft", "Pending Approval"):
        raise HTTPException(status_code=400, detail=f"Cannot approve transfer in status '{transfer.status}'")
    transfer.status = "Approved"
    transfer.approved_by = user.id if user else current_salesperson_id.get()
    transfer.updated_at = _utcnow()
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    return {"transfer": _transfer_dict(transfer, wh_map)}


@router.put("/stock-transfers/{transfer_id}/dispatch")
def dispatch_stock_transfer(transfer_id: int, session: Session = Depends(get_session)):
    user = _require_staff(session)
    transfer = session.get(StockTransfer, transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status not in ("Approved", "Pending Approval"):
        raise HTTPException(status_code=400, detail=f"Transfer must be Approved before dispatch (current: {transfer.status})")

    updated_items = []
    for line in transfer.items or []:
        item = session.get(InventoryItem, int(line["item_id"]))
        if not item:
            raise HTTPException(status_code=404, detail=f"Item #{line['item_id']} not found")
        qty = float(line.get("requested_qty") or 0)
        record_stock_movement(
            session,
            item=item,
            movement_type="TRANSFER_OUT",
            quantity=qty,
            reason=f"Transfer Dispatch {transfer.transfer_number} to WH #{transfer.destination_warehouse_id}",
            warehouse_id=transfer.source_warehouse_id,
            reference_id=transfer.transfer_number,
            reference_type="STOCK_TRANSFER",
            user=user,
            idempotency_key=f"trf-dispatch-{transfer.id}-{item.id}",
        )
        new_line = dict(line)
        new_line["dispatched_qty"] = qty
        updated_items.append(new_line)

    transfer.items = updated_items
    transfer.status = "Dispatched"
    transfer.dispatched_at = _utcnow()
    transfer.updated_at = _utcnow()
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    return {"transfer": _transfer_dict(transfer, wh_map)}


@router.put("/stock-transfers/{transfer_id}/receive")
def receive_stock_transfer(
    transfer_id: int,
    body: Optional[StockTransferReceiveRequest] = None,
    session: Session = Depends(get_session),
):
    user = _require_staff(session)
    transfer = session.get(StockTransfer, transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status not in ("Dispatched", "Partially Received"):
        raise HTTPException(status_code=400, detail=f"Only Dispatched transfers can be received (current: {transfer.status})")

    receive_map: Dict[int, StockTransferReceiveItemInput] = {}
    if body and body.items:
        receive_map = {int(i.item_id): i for i in body.items}

    updated_items = []
    all_complete = True
    for line in transfer.items or []:
        item_id = int(line["item_id"])
        item = session.get(InventoryItem, item_id)
        if not item:
            continue
        dispatched_qty = float(line.get("dispatched_qty") or line.get("requested_qty") or 0)
        already_received = float(line.get("received_qty") or 0)
        remaining = max(0.0, dispatched_qty - already_received)

        if item_id in receive_map:
            rec_in = receive_map[item_id]
            this_received = float(rec_in.received_qty)
            this_damaged = float(rec_in.damaged_qty or 0)
        else:
            this_received = remaining
            this_damaged = 0.0

        if this_received > remaining + 1e-6:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot receive more than remaining dispatched quantity ({remaining}) for {item.name}",
            )
        this_accepted = max(0.0, this_received - this_damaged)
        if this_accepted > 0:
            record_stock_movement(
                session,
                item=item,
                movement_type="TRANSFER_IN",
                quantity=this_accepted,
                reason=f"Transfer Receipt {transfer.transfer_number} from WH #{transfer.source_warehouse_id}",
                warehouse_id=transfer.destination_warehouse_id,
                reference_id=transfer.transfer_number,
                reference_type="STOCK_TRANSFER",
                user=user,
            )

        new_line = dict(line)
        new_line["received_qty"] = already_received + this_received
        new_line["damaged_qty"] = float(line.get("damaged_qty") or 0) + this_damaged
        new_line["accepted_qty"] = float(line.get("accepted_qty") or 0) + this_accepted
        if new_line["received_qty"] < dispatched_qty - 1e-6:
            all_complete = False
        updated_items.append(new_line)

    transfer.items = updated_items
    transfer.status = "Completed" if all_complete else "Partially Received"
    transfer.received_at = _utcnow()
    transfer.updated_at = _utcnow()
    if body and body.notes:
        transfer.notes = (f"{transfer.notes}\n{body.notes}" if transfer.notes else body.notes).strip()
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    return {"transfer": _transfer_dict(transfer, wh_map)}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: RFQ ENHANCEMENTS, QUOTATION COMPARISON & PURCHASE ORDERS
# ═══════════════════════════════════════════════════════════════════════════════

class BatchRFQSupplierTarget(BaseModel):
    supplier_id: Optional[int] = None
    supplier_name: str
    supplier_email: str


class BatchRFQCreateRequest(BaseModel):
    item_id: int
    quantity: float = Field(gt=0)
    deadline: Optional[str] = None
    warehouse_id: Optional[int] = None
    notes: Optional[str] = None
    suppliers: List[BatchRFQSupplierTarget]
    send_email: bool = True


@router.post("/rfq/batch")
def create_batch_rfq(body: BatchRFQCreateRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    item = session.get(InventoryItem, body.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if not body.suppliers:
        raise HTTPException(status_code=400, detail="Select at least one supplier for the RFQ")

    group_code = f"RFQG-{secrets.token_hex(4).upper()}"
    created_rfqs = []
    for sup in body.suppliers:
        token = secrets.token_urlsafe(32)
        rfq = RFQRequest(
            tenant_id=item.tenant_id or _tid(),
            item_id=item.id,
            supplier_name=sup.supplier_name.strip(),
            supplier_email=sup.supplier_email.strip(),
            quantity=body.quantity,
            deadline=body.deadline,
            warehouse_id=body.warehouse_id,
            rfq_group_code=group_code,
            notes=body.notes,
            status="Pending",
            approval_status="Pending",
            token=token,
            sent_by=user.id if user else current_salesperson_id.get(),
        )
        session.add(rfq)
        session.flush()
        created_rfqs.append({"id": rfq.id, "supplier_name": rfq.supplier_name, "supplier_email": rfq.supplier_email, "token": token})

    session.commit()
    return {"ok": True, "rfq_group_code": group_code, "rfqs": created_rfqs, "count": len(created_rfqs)}


@router.get("/rfq/comparison")
def get_rfq_comparison(item_id: Optional[int] = None, session: Session = Depends(get_session)):
    _require_staff(session)
    q = select(RFQRequest).order_by(RFQRequest.created_at.desc())
    if item_id:
        q = q.where(RFQRequest.item_id == item_id)
    rfqs = session.exec(q).all()
    items_map = {i.id: i for i in session.exec(select(InventoryItem)).all()}
    suppliers = session.exec(select(InventorySupplier)).all()
    preferred_map: Dict[tuple, bool] = {}
    for s in suppliers:
        key = (s.item_id, (s.supplier_email or s.supplier_name or "").strip().lower())
        if s.is_preferred:
            preferred_map[key] = True

    # Group RFQs by item_id
    by_item: Dict[int, dict] = {}
    for r in rfqs:
        it = items_map.get(r.item_id)
        if not it:
            continue
        grp = by_item.setdefault(
            r.item_id,
            {
                "item_id": it.id,
                "item_name": it.name,
                "item_code": it.code,
                "unit": it.unit or "pcs",
                "current_stock": it.current_stock,
                "min_stock": it.min_stock,
                "quotations": [],
            },
        )
        responses = session.exec(select(RFQResponse).where(RFQResponse.rfq_id == r.id)).all()
        is_pref = preferred_map.get((r.item_id, (r.supplier_email or r.supplier_name or "").strip().lower()), False)
        if responses:
            for resp in responses:
                qty = float(r.quantity or resp.min_order_qty or 1)
                total_cost = round(float(resp.unit_price or 0) * qty, 2)
                grp["quotations"].append({
                    "rfq_id": r.id,
                    "response_id": resp.id,
                    "supplier_name": resp.supplier_name or r.supplier_name,
                    "supplier_email": resp.supplier_email or r.supplier_email,
                    "requested_qty": r.quantity,
                    "unit_price": resp.unit_price,
                    "currency": resp.currency,
                    "min_order_qty": resp.min_order_qty or 1,
                    "lead_time_days": resp.lead_time_days,
                    "availability": resp.availability or "In Stock",
                    "is_preferred": is_pref,
                    "total_cost": total_cost,
                    "valid_until": resp.valid_until,
                    "notes": resp.notes,
                    "attachment_url": resp.attachment_url,
                    "rfq_status": r.status,
                    "approval_status": r.approval_status,
                    "response_status": resp.status,
                    "deadline": r.deadline,
                    "submitted_at": _iso(resp.submitted_at),
                })
        else:
            grp["quotations"].append({
                "rfq_id": r.id,
                "response_id": None,
                "supplier_name": r.supplier_name,
                "supplier_email": r.supplier_email,
                "requested_qty": r.quantity,
                "unit_price": None,
                "currency": "USD",
                "min_order_qty": None,
                "lead_time_days": None,
                "availability": "Awaiting Quote",
                "is_preferred": is_pref,
                "total_cost": None,
                "valid_until": None,
                "notes": r.notes,
                "attachment_url": None,
                "rfq_status": r.status,
                "approval_status": r.approval_status,
                "response_status": "Pending",
                "deadline": r.deadline,
                "submitted_at": None,
            })

    return {"comparisons": list(by_item.values()), "total_items": len(by_item)}


class RFQApproveRequest(BaseModel):
    response_id: int
    notes: Optional[str] = None


@router.post("/rfq/{rfq_id}/approve")
def approve_rfq_quotation(rfq_id: int, body: RFQApproveRequest, session: Session = Depends(get_session)):
    user = _require_manager(session)
    rfq = session.get(RFQRequest, rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    resp = session.get(RFQResponse, body.response_id)
    if not resp or resp.rfq_id != rfq.id:
        raise HTTPException(status_code=404, detail="Quotation response not found for this RFQ")

    rfq.status = "Accepted"
    rfq.approval_status = "Approved"
    rfq.approved_response_id = resp.id
    rfq.approved_by = user.id if user else current_salesperson_id.get()
    rfq.approved_at = _utcnow()
    resp.status = "Approved"
    session.add(rfq)
    session.add(resp)
    session.commit()
    return {"ok": True, "rfq_id": rfq.id, "approved_response_id": resp.id, "status": "Approved"}


class POFromRFQRequest(BaseModel):
    rfq_id: int
    response_id: int
    warehouse_id: Optional[int] = None
    quantity: Optional[float] = None
    tax_rate: float = 0.0
    discount: float = 0.0
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None


@router.post("/purchase-orders/from-rfq")
def create_po_from_rfq(body: POFromRFQRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    rfq = session.get(RFQRequest, body.rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    resp = session.get(RFQResponse, body.response_id)
    if not resp or resp.rfq_id != rfq.id:
        raise HTTPException(status_code=404, detail="RFQ response not found")
    item = session.get(InventoryItem, rfq.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # Approve RFQ if not already approved
    if rfq.approval_status != "Approved":
        rfq.status = "Accepted"
        rfq.approval_status = "Approved"
        rfq.approved_response_id = resp.id
        rfq.approved_by = user.id if user else current_salesperson_id.get()
        rfq.approved_at = _utcnow()
        resp.status = "Approved"
        session.add(rfq)
        session.add(resp)

    qty = float(body.quantity or rfq.quantity or resp.min_order_qty or 1)
    unit_price = float(resp.unit_price or 0)
    subtotal = round(qty * unit_price, 2)
    tax_amount = round(subtotal * (float(body.tax_rate or item.tax_rate or 0) / 100.0), 2)
    discount = round(float(body.discount or 0), 2)
    total_amount = round(max(0.0, subtotal + tax_amount - discount), 2)

    sup = session.exec(
        select(InventorySupplier).where(
            InventorySupplier.item_id == item.id,
            func.lower(InventorySupplier.supplier_email) == (rfq.supplier_email or "").strip().lower(),
        )
    ).first()

    existing_pos = session.exec(select(PurchaseOrder)).all()
    po_number = f"PO-{len(existing_pos) + 1:05d}-{secrets.token_hex(2).upper()}"

    po_items = [
        {
            "product_id": item.id,
            "product_code": item.code,
            "product_name": item.name,
            "unit": item.unit or "pcs",
            "ordered_qty": qty,
            "received_qty": 0.0,
            "damaged_qty": 0.0,
            "accepted_qty": 0.0,
            "unit_cost": unit_price,
            "tax_rate": float(body.tax_rate or item.tax_rate or 0),
            "line_total": subtotal,
        }
    ]

    po = PurchaseOrder(
        tenant_id=rfq.tenant_id or _tid(),
        po_number=po_number,
        vendor_name=rfq.supplier_name,
        vendor_email=rfq.supplier_email,
        supplier_id=sup.id if sup else resp.supplier_id,
        supplier_user_id=sup.supplier_user_id if sup else None,
        rfq_id=rfq.id,
        rfq_response_id=resp.id,
        warehouse_id=body.warehouse_id or rfq.warehouse_id,
        items=po_items,
        subtotal=subtotal,
        tax_amount=tax_amount,
        discount=discount,
        total_amount=total_amount,
        grand_total=total_amount,
        currency=resp.currency or "USD",
        status="Approved",
        payment_status="Unpaid",
        expected_delivery=body.expected_delivery,
        notes=body.notes or rfq.notes,
        created_by=user.id if user else current_salesperson_id.get(),
        approved_by=user.id if user else current_salesperson_id.get(),
        approved_at=_utcnow(),
    )
    session.add(po)
    session.commit()
    session.refresh(po)
    return {"order": po.model_dump()}


@router.get("/purchase-orders/{order_id}")
def get_purchase_order_detail(order_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    receipts = session.exec(
        select(GoodsReceipt)
        .where(GoodsReceipt.purchase_order_id == order_id)
        .order_by(GoodsReceipt.received_at.desc())
    ).all()
    payments = session.exec(
        select(SupplierPayment)
        .where(SupplierPayment.purchase_order_id == order_id)
        .order_by(SupplierPayment.created_at.desc())
    ).all()
    data = o.model_dump()
    data["goods_receipts"] = [r.model_dump() for r in receipts]
    data["payments"] = [p.model_dump() for p in payments]
    return {"order": data}


@router.put("/purchase-orders/{order_id}/approve")
def approve_purchase_order(order_id: int, session: Session = Depends(get_session)):
    user = _require_manager(session)
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    o.status = "Approved"
    o.approved_by = user.id if user else current_salesperson_id.get()
    o.approved_at = _utcnow()
    o.updated_at = _utcnow()
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": o.model_dump()}


@router.put("/purchase-orders/{order_id}/send")
def send_purchase_order_to_supplier(order_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    o.status = "Sent"
    o.updated_at = _utcnow()
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": o.model_dump()}


@router.put("/purchase-orders/{order_id}/cancel")
def cancel_purchase_order(order_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if o.status in ("Received", "Partially Received"):
        raise HTTPException(status_code=400, detail="Cannot cancel a purchase order that has already received goods")
    o.status = "Cancelled"
    o.updated_at = _utcnow()
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": o.model_dump()}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: GOODS RECEIVING (PARTIAL DELIVERIES, QUALITY INSPECTION, STOCK UPDATE)
# ═══════════════════════════════════════════════════════════════════════════════

class GoodsReceiptItemInput(BaseModel):
    product_id: int
    ordered_qty: Optional[float] = None
    received_qty: float = Field(ge=0)
    damaged_qty: float = Field(default=0.0, ge=0)
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    unit_cost: Optional[float] = None


class GoodsReceiptCreateRequest(BaseModel):
    purchase_order_id: int
    warehouse_id: Optional[int] = None
    items: List[GoodsReceiptItemInput]
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None
    allow_over_delivery: bool = False


@router.get("/goods-receipts")
def list_goods_receipts(purchase_order_id: Optional[int] = None, session: Session = Depends(get_session)):
    _require_staff(session)
    q = select(GoodsReceipt).order_by(GoodsReceipt.received_at.desc())
    if purchase_order_id:
        q = q.where(GoodsReceipt.purchase_order_id == purchase_order_id)
    receipts = session.exec(q).all()
    pos_map = {p.id: p for p in session.exec(select(PurchaseOrder)).all()}
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    out = []
    for r in receipts:
        d = r.model_dump()
        po = pos_map.get(r.purchase_order_id)
        wh = wh_map.get(r.warehouse_id) if r.warehouse_id else None
        d["po_number"] = po.po_number if po else f"PO #{r.purchase_order_id}"
        d["vendor_name"] = po.vendor_name if po else "—"
        d["warehouse_name"] = wh.warehouse_name if wh else "Main Inventory"
        d["received_at"] = _iso(r.received_at)
        out.append(d)
    return {"receipts": out, "total": len(out)}


@router.get("/goods-receipts/{receipt_id}")
def get_goods_receipt(receipt_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    r = session.get(GoodsReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    d = r.model_dump()
    d["received_at"] = _iso(r.received_at)
    return {"receipt": d}


@router.post("/goods-receipts")
def create_goods_receipt(body: GoodsReceiptCreateRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    po = session.get(PurchaseOrder, body.purchase_order_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == "Cancelled":
        raise HTTPException(status_code=400, detail="Cannot receive goods against a cancelled purchase order")

    tenant_id = po.tenant_id or _tid()

    # Idempotency guard: prevent duplicate stock updates if submitted more than once
    if body.idempotency_key:
        existing_gr = session.exec(
            select(GoodsReceipt).where(
                GoodsReceipt.tenant_id == tenant_id,
                GoodsReceipt.idempotency_key == body.idempotency_key,
            )
        ).first()
        if existing_gr:
            d = existing_gr.model_dump()
            d["received_at"] = _iso(existing_gr.received_at)
            return {"receipt": d, "po_status": po.status, "duplicate_ignored": True}

    if not body.items:
        raise HTTPException(status_code=400, detail="Provide at least one received item")

    target_warehouse_id = body.warehouse_id or po.warehouse_id
    existing_receipts = session.exec(select(GoodsReceipt)).all()
    receipt_number = f"GRN-{len(existing_receipts) + 1:05d}"

    # Track cumulative received per product on the PO
    po_items_list = list(po.items or [])
    po_items_by_id: Dict[int, dict] = {int(li["product_id"]): dict(li) for li in po_items_list if "product_id" in li}

    receipt_items_payload = []
    has_discrepancy = False

    for line in body.items:
        item = session.get(InventoryItem, line.product_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Product #{line.product_id} not found")
        if line.damaged_qty > line.received_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Damaged quantity ({line.damaged_qty}) cannot exceed received quantity ({line.received_qty}) for {item.name}",
            )

        po_line = po_items_by_id.get(item.id)
        ordered_qty = float(line.ordered_qty if line.ordered_qty is not None else (po_line.get("ordered_qty") if po_line else line.received_qty))
        prev_accepted = float(po_line.get("accepted_qty") or 0) if po_line else 0.0
        prev_received = float(po_line.get("received_qty") or 0) if po_line else 0.0
        prev_damaged = float(po_line.get("damaged_qty") or 0) if po_line else 0.0

        accepted_qty = round(max(0.0, float(line.received_qty) - float(line.damaged_qty)), 4)

        if not body.allow_over_delivery and po_line and (prev_accepted + accepted_qty > ordered_qty + 1e-6):
            raise HTTPException(
                status_code=400,
                detail=f"Over-delivery rejected for {item.name}: ordered {ordered_qty}, already accepted {prev_accepted}, trying to accept {accepted_qty}",
            )

        if line.damaged_qty > 0 or (prev_accepted + accepted_qty < ordered_qty):
            has_discrepancy = True

        unit_cost = float(line.unit_cost if line.unit_cost is not None else (po_line.get("unit_cost") if po_line else (item.cost_price or 0)))
        if unit_cost > 0:
            item.cost_price = unit_cost

        # Increase inventory by ACCEPTED quantities only
        if accepted_qty > 0:
            record_stock_movement(
                session,
                item=item,
                movement_type="PURCHASE_IN",
                quantity=accepted_qty,
                reason=f"Goods Receipt {receipt_number} ({po.po_number or f'PO #{po.id}'})",
                warehouse_id=target_warehouse_id,
                reference_id=receipt_number,
                reference_type="GOODS_RECEIPT",
                user=user,
                idempotency_key=f"{body.idempotency_key or receipt_number}-item-{item.id}",
            )

        # Update lot number on supplier link if applicable
        if line.lot_number and po.supplier_id:
            sup = session.get(InventorySupplier, po.supplier_id)
            if sup and sup.item_id == item.id:
                sup.lot_number = line.lot_number
                session.add(sup)

        receipt_items_payload.append({
            "product_id": item.id,
            "product_code": item.code,
            "product_name": item.name,
            "unit": item.unit or "pcs",
            "ordered_qty": ordered_qty,
            "received_qty": float(line.received_qty),
            "damaged_qty": float(line.damaged_qty),
            "accepted_qty": accepted_qty,
            "lot_number": line.lot_number,
            "expiry_date": line.expiry_date,
            "unit_cost": unit_cost,
        })

        if po_line:
            po_line["received_qty"] = prev_received + float(line.received_qty)
            po_line["damaged_qty"] = prev_damaged + float(line.damaged_qty)
            po_line["accepted_qty"] = prev_accepted + accepted_qty
            po_items_by_id[item.id] = po_line
        else:
            po_items_by_id[item.id] = {
                "product_id": item.id,
                "product_code": item.code,
                "product_name": item.name,
                "unit": item.unit or "pcs",
                "ordered_qty": ordered_qty,
                "received_qty": float(line.received_qty),
                "damaged_qty": float(line.damaged_qty),
                "accepted_qty": accepted_qty,
                "unit_cost": unit_cost,
                "line_total": round(ordered_qty * unit_cost, 2),
            }

    # Determine updated PO status
    updated_po_items = list(po_items_by_id.values())
    all_fulfilled = all(
        float(li.get("accepted_qty") or 0) >= float(li.get("ordered_qty") or 0) - 1e-6
        for li in updated_po_items
    ) if updated_po_items else True

    po.items = updated_po_items
    po.status = "Received" if all_fulfilled else "Partially Received"
    po.updated_at = _utcnow()
    session.add(po)

    actor = user or _current_user(session)
    gr = GoodsReceipt(
        tenant_id=tenant_id,
        receipt_number=receipt_number,
        purchase_order_id=po.id,
        supplier_id=po.supplier_id,
        warehouse_id=target_warehouse_id,
        items=receipt_items_payload,
        status="Completed" if (all_fulfilled and not has_discrepancy) else ("Partial" if not all_fulfilled else "Discrepancy"),
        received_by=actor.id if actor else current_salesperson_id.get(),
        received_by_name=(actor.name or actor.email) if actor else "Staff",
        notes=body.notes,
        idempotency_key=body.idempotency_key,
    )
    session.add(gr)
    session.commit()
    session.refresh(gr)
    d = gr.model_dump()
    d["received_at"] = _iso(gr.received_at)
    return {"receipt": d, "po_status": po.status}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5A: STOCK COUNTING & DISCREPANCY APPROVAL
# ═══════════════════════════════════════════════════════════════════════════════

class StockCountCreateRequest(BaseModel):
    warehouse_id: Optional[int] = None
    item_ids: Optional[List[int]] = None
    notes: Optional[str] = None


class StockCountItemSubmitInput(BaseModel):
    item_id: int
    physical_qty: float = Field(ge=0)
    reason: Optional[str] = None


class StockCountSubmitRequest(BaseModel):
    items: List[StockCountItemSubmitInput]
    notes: Optional[str] = None


@router.get("/stock-counts")
def list_stock_counts(session: Session = Depends(get_session)):
    _require_staff(session)
    counts = session.exec(select(StockCount).order_by(StockCount.created_at.desc())).all()
    wh_map = {w.id: w for w in session.exec(select(Warehouse)).all()}
    out = []
    for c in counts:
        d = c.model_dump()
        wh = wh_map.get(c.warehouse_id) if c.warehouse_id else None
        d["warehouse_name"] = wh.warehouse_name if wh else "All / Main Inventory"
        d["submitted_at"] = _iso(c.submitted_at)
        d["approved_at"] = _iso(c.approved_at)
        d["created_at"] = _iso(c.created_at)
        out.append(d)
    return {"counts": out, "total": len(out)}


@router.post("/stock-counts")
def create_stock_count(body: StockCountCreateRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    items = session.exec(select(InventoryItem).order_by(InventoryItem.name)).all()
    if body.item_ids:
        id_set = set(body.item_ids)
        items = [i for i in items if i.id in id_set]

    wh_qty_map: Dict[int, float] = {}
    if body.warehouse_id:
        for ws in session.exec(select(WarehouseStock).where(WarehouseStock.warehouse_id == body.warehouse_id)).all():
            wh_qty_map[ws.item_id] = float(ws.quantity or 0)

    snapshot_items = []
    for it in items:
        sys_qty = wh_qty_map.get(it.id, 0.0) if body.warehouse_id else float(it.current_stock or 0)
        snapshot_items.append({
            "item_id": it.id,
            "item_code": it.code,
            "item_name": it.name,
            "unit": it.unit or "pcs",
            "system_qty": sys_qty,
            "physical_qty": sys_qty,
            "discrepancy": 0.0,
            "reason": "",
        })

    existing_cnt = len(session.exec(select(StockCount)).all()) + 1
    sc = StockCount(
        tenant_id=_tid(),
        count_number=f"CNT-{existing_cnt:05d}",
        warehouse_id=body.warehouse_id,
        status="Draft",
        items=snapshot_items,
        counted_by=user.id if user else current_salesperson_id.get(),
        notes=body.notes,
    )
    session.add(sc)
    session.commit()
    session.refresh(sc)
    d = sc.model_dump()
    d["created_at"] = _iso(sc.created_at)
    return {"count": d}


@router.post("/stock-counts/{count_id}/submit")
def submit_stock_count(count_id: int, body: StockCountSubmitRequest, session: Session = Depends(get_session)):
    _require_staff(session)
    sc = session.get(StockCount, count_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Stock count not found")
    if sc.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved stock count cannot be modified")

    phys_map = {int(i.item_id): i for i in body.items}
    updated_items = []
    for line in sc.items or []:
        iid = int(line["item_id"])
        sys_qty = float(line.get("system_qty") or 0)
        if iid in phys_map:
            phys_qty = float(phys_map[iid].physical_qty)
            reason = phys_map[iid].reason or line.get("reason") or ""
        else:
            phys_qty = float(line.get("physical_qty") or sys_qty)
            reason = line.get("reason") or ""
        disc = round(phys_qty - sys_qty, 4)
        new_line = dict(line)
        new_line["physical_qty"] = phys_qty
        new_line["discrepancy"] = disc
        new_line["reason"] = reason
        updated_items.append(new_line)

    sc.items = updated_items
    sc.status = "Submitted"
    sc.submitted_at = _utcnow()
    if body.notes:
        sc.notes = body.notes
    session.add(sc)
    session.commit()
    session.refresh(sc)
    d = sc.model_dump()
    d["submitted_at"] = _iso(sc.submitted_at)
    return {"count": d}


@router.post("/stock-counts/{count_id}/approve")
def approve_stock_count(count_id: int, session: Session = Depends(get_session)):
    user = _require_manager(session)
    sc = session.get(StockCount, count_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Stock count not found")
    if sc.status == "Approved":
        raise HTTPException(status_code=400, detail="Stock count is already approved")

    adjustments_made = 0
    for line in sc.items or []:
        disc = float(line.get("discrepancy") or 0)
        if abs(disc) < 1e-6:
            continue
        item = session.get(InventoryItem, int(line["item_id"]))
        if not item:
            continue
        mtype = "ADJUSTMENT_IN" if disc > 0 else "ADJUSTMENT_OUT"
        reason = (line.get("reason") or f"Physical Stock Count {sc.count_number} Approval").strip()
        record_stock_movement(
            session,
            item=item,
            movement_type=mtype,
            quantity=abs(disc),
            reason=reason,
            warehouse_id=sc.warehouse_id,
            reference_id=sc.count_number,
            reference_type="STOCK_COUNT",
            user=user,
            idempotency_key=f"cnt-approve-{sc.id}-{item.id}",
        )
        adjustments_made += 1

    sc.status = "Approved"
    sc.approved_by = user.id if user else current_salesperson_id.get()
    sc.approved_at = _utcnow()
    session.add(sc)
    session.commit()
    session.refresh(sc)
    d = sc.model_dump()
    d["approved_at"] = _iso(sc.approved_at)
    return {"count": d, "adjustments_made": adjustments_made}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5B: SUPPLIER PAYMENTS & OUTSTANDING BALANCES
# ═══════════════════════════════════════════════════════════════════════════════

class SupplierPaymentCreateRequest(BaseModel):
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    supplier_email: Optional[str] = None
    purchase_order_id: Optional[int] = None
    amount: float = Field(gt=0)
    currency: str = "USD"
    payment_method: str = "Bank Transfer"
    transaction_reference: Optional[str] = None
    payment_date: Optional[str] = None
    status: str = "Completed"
    notes: Optional[str] = None


@router.get("/supplier-payments")
def list_supplier_payments(
    supplier_id: Optional[int] = None,
    purchase_order_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    _require_staff(session)
    q = select(SupplierPayment).order_by(SupplierPayment.created_at.desc())
    if supplier_id:
        q = q.where(SupplierPayment.supplier_id == supplier_id)
    if purchase_order_id:
        q = q.where(SupplierPayment.purchase_order_id == purchase_order_id)
    payments = session.exec(q).all()
    pos_map = {p.id: p for p in session.exec(select(PurchaseOrder)).all()}
    out = []
    for p in payments:
        d = p.model_dump()
        po = pos_map.get(p.purchase_order_id) if p.purchase_order_id else None
        d["po_number"] = po.po_number if po else None
        d["created_at"] = _iso(p.created_at)
        out.append(d)
    return {"payments": out, "total": len(out)}


@router.post("/supplier-payments")
def create_supplier_payment(body: SupplierPaymentCreateRequest, session: Session = Depends(get_session)):
    user = _require_staff(session)
    po = session.get(PurchaseOrder, body.purchase_order_id) if body.purchase_order_id else None
    if body.purchase_order_id and not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    sup = session.get(InventorySupplier, body.supplier_id) if body.supplier_id else None
    supplier_name = body.supplier_name or (sup.supplier_name if sup else (po.vendor_name if po else "Supplier"))
    supplier_email = body.supplier_email or (sup.supplier_email if sup else (po.vendor_email if po else None))
    supplier_user_id = sup.supplier_user_id if sup else (po.supplier_user_id if po else None)

    count = len(session.exec(select(SupplierPayment)).all()) + 1
    payment = SupplierPayment(
        tenant_id=_tid() or (po.tenant_id if po else None),
        payment_number=f"PAY-{count:05d}",
        supplier_id=body.supplier_id or (po.supplier_id if po else None),
        supplier_user_id=supplier_user_id,
        supplier_name=supplier_name,
        supplier_email=supplier_email,
        purchase_order_id=po.id if po else None,
        amount=round(float(body.amount), 2),
        currency=body.currency or (po.currency if po else "USD"),
        payment_method=body.payment_method,
        transaction_reference=body.transaction_reference,
        payment_date=body.payment_date or _utcnow().strftime("%Y-%m-%d"),
        status=body.status or "Completed",
        notes=body.notes,
        created_by=user.id if user else current_salesperson_id.get(),
    )
    session.add(payment)

    if po and payment.status == "Completed":
        new_paid = round(float(po.paid_amount or 0) + float(body.amount), 2)
        total_due = float(po.total_amount or po.grand_total or 0)
        po.paid_amount = new_paid
        if total_due > 0 and new_paid >= total_due - 1e-2:
            po.payment_status = "Fully Paid"
        elif new_paid > 0:
            po.payment_status = "Partially Paid"
        else:
            po.payment_status = "Unpaid"
        po.updated_at = _utcnow()
        session.add(po)

    session.commit()
    session.refresh(payment)
    d = payment.model_dump()
    d["created_at"] = _iso(payment.created_at)
    return {"payment": d, "po_payment_status": po.payment_status if po else None}


@router.get("/suppliers/{supplier_id}/outstanding")
def get_supplier_outstanding(supplier_id: int, session: Session = Depends(get_session)):
    _require_staff(session)
    sup = session.get(InventorySupplier, supplier_id)
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")

    pos = session.exec(
        select(PurchaseOrder).where(
            or_(
                PurchaseOrder.supplier_id == supplier_id,
                func.lower(PurchaseOrder.vendor_email) == (sup.supplier_email or "").strip().lower(),
                func.lower(PurchaseOrder.vendor_name) == (sup.supplier_name or "").strip().lower(),
            )
        )
    ).all()
    active_pos = [p for p in pos if p.status != "Cancelled"]
    total_billed = sum(float(p.total_amount or p.grand_total or 0) for p in active_pos)
    total_paid = sum(float(p.paid_amount or 0) for p in active_pos)
    outstanding = round(max(0.0, total_billed - total_paid), 2)

    return {
        "supplier_id": sup.id,
        "supplier_name": sup.supplier_name,
        "supplier_email": sup.supplier_email,
        "currency": sup.currency or "USD",
        "total_orders": len(active_pos),
        "total_billed": round(total_billed, 2),
        "total_paid": round(total_paid, 2),
        "outstanding_balance": outstanding,
        "orders": [
            {
                "id": p.id,
                "po_number": p.po_number,
                "status": p.status,
                "payment_status": p.payment_status,
                "total_amount": float(p.total_amount or p.grand_total or 0),
                "paid_amount": float(p.paid_amount or 0),
                "balance": round(max(0.0, float(p.total_amount or p.grand_total or 0) - float(p.paid_amount or 0)), 2),
            }
            for p in active_pos
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5C: DEDICATED REPORTS & ANALYTICS (11 REPORTS + CSV/PDF EXPORT)
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_report_data(
    session: Session,
    report_type: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    item_id: Optional[int] = None,
    category: Optional[str] = None,
    supplier_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    stock_status: Optional[str] = None,
) -> dict:
    items = session.exec(select(InventoryItem).order_by(InventoryItem.name)).all()
    suppliers = session.exec(select(InventorySupplier)).all()
    warehouses = session.exec(select(Warehouse)).all()
    wh_stocks = session.exec(select(WarehouseStock)).all()
    items_map = {i.id: i for i in items}
    wh_map = {w.id: w for w in warehouses}

    sup_cost: Dict[int, float] = {}
    for s in suppliers:
        if s.unit_cost:
            if s.is_preferred or s.item_id not in sup_cost:
                sup_cost[s.item_id] = float(s.unit_cost)

    wh_qty_by_item: Dict[int, float] = {}
    if warehouse_id:
        for ws in wh_stocks:
            if ws.warehouse_id == warehouse_id:
                wh_qty_by_item[ws.item_id] = float(ws.quantity or 0)

    def _filter_item(it: InventoryItem) -> bool:
        if item_id and it.id != item_id:
            return False
        if category and category != "All" and (it.category or "Other") != category:
            return False
        if supplier_id:
            linked_ids = {s.item_id for s in suppliers if s.id == supplier_id}
            if it.id not in linked_ids:
                return False
        cur = wh_qty_by_item.get(it.id, 0.0) if warehouse_id else float(it.current_stock or 0)
        st = stock_status_label(cur, it.min_stock or 0)
        if stock_status and stock_status != "All" and st != stock_status:
            return False
        return True

    def _in_date_range(dt: Optional[datetime]) -> bool:
        if not dt:
            return True
        ds = dt.strftime("%Y-%m-%d")
        if date_from and ds < date_from[:10]:
            return False
        if date_to and ds > date_to[:10]:
            return False
        return True

    rtype = report_type.lower().strip()

    if rtype in ("current-inventory", "low-stock", "out-of-stock", "stock-valuation"):
        rows = []
        total_qty = 0.0
        total_cost_val = 0.0
        total_retail_val = 0.0
        for it in items:
            if not _filter_item(it):
                continue
            cur = wh_qty_by_item.get(it.id, 0.0) if warehouse_id else float(it.current_stock or 0)
            st = stock_status_label(cur, it.min_stock or 0)
            if rtype == "low-stock" and st != "Low Stock":
                continue
            if rtype == "out-of-stock" and st != "Out of Stock":
                continue
            uc = float(it.cost_price or 0) or sup_cost.get(it.id, 0.0)
            sp = float(it.selling_price or 0) or uc
            c_val = round(cur * uc, 2)
            r_val = round(cur * sp, 2)
            total_qty += cur
            total_cost_val += c_val
            total_retail_val += r_val
            rows.append({
                "code": it.code,
                "name": it.name,
                "category": it.category or "Other",
                "brand": it.brand or "—",
                "barcode": it.barcode or "—",
                "unit": it.unit or "pcs",
                "current_stock": cur,
                "min_stock": float(it.min_stock or 0),
                "stock_status": st,
                "unit_cost": uc,
                "selling_price": sp,
                "inventory_value": c_val,
                "retail_value": r_val,
            })
        return {
            "report_type": rtype,
            "summary": {
                "total_items": len(rows),
                "total_stock_quantity": round(total_qty, 2),
                "total_inventory_value": round(total_cost_val, 2),
                "total_retail_value": round(total_retail_val, 2),
            },
            "rows": rows,
        }

    if rtype == "stock-movements":
        mvs = session.exec(select(StockMovement).order_by(StockMovement.created_at.desc())).all()
        rows = []
        for m in mvs:
            if not _in_date_range(m.created_at):
                continue
            if item_id and m.item_id != item_id:
                continue
            if warehouse_id and m.warehouse_id != warehouse_id:
                continue
            it = items_map.get(m.item_id)
            if it and category and category != "All" and (it.category or "Other") != category:
                continue
            rows.append(_movement_dict(m, items_map, wh_map))
        return {
            "report_type": rtype,
            "summary": {"total_movements": len(rows)},
            "rows": rows,
        }

    if rtype == "purchase-orders":
        pos = session.exec(select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())).all()
        rows = []
        total_spend = 0.0
        total_paid = 0.0
        for p in pos:
            if not _in_date_range(p.created_at):
                continue
            if supplier_id and p.supplier_id != supplier_id:
                continue
            if warehouse_id and p.warehouse_id != warehouse_id:
                continue
            amt = float(p.total_amount or p.grand_total or 0)
            paid = float(p.paid_amount or 0)
            if p.status != "Cancelled":
                total_spend += amt
                total_paid += paid
            rows.append({
                "po_number": p.po_number,
                "vendor_name": p.vendor_name,
                "vendor_email": p.vendor_email,
                "status": p.status,
                "payment_status": p.payment_status,
                "currency": p.currency,
                "subtotal": p.subtotal,
                "tax_amount": p.tax_amount,
                "discount": p.discount,
                "total_amount": amt,
                "paid_amount": paid,
                "outstanding": round(max(0.0, amt - paid), 2),
                "expected_delivery": p.expected_delivery,
                "created_at": _iso(p.created_at),
            })
        return {
            "report_type": rtype,
            "summary": {
                "total_orders": len(rows),
                "total_spend": round(total_spend, 2),
                "total_paid": round(total_paid, 2),
                "total_outstanding": round(max(0.0, total_spend - total_paid), 2),
            },
            "rows": rows,
        }

    if rtype == "supplier-performance":
        pos = session.exec(select(PurchaseOrder)).all()
        receipts = session.exec(select(GoodsReceipt)).all()
        rfqs = session.exec(select(RFQRequest)).all()

        by_sup: Dict[str, dict] = {}
        for s in suppliers:
            key = (s.supplier_email or s.supplier_name or "").strip().lower()
            if not key:
                continue
            entry = by_sup.setdefault(
                key,
                {
                    "supplier_id": s.id,
                    "supplier_name": s.supplier_name,
                    "supplier_email": s.supplier_email,
                    "items_supplied": 0,
                    "avg_lead_time_days": 0.0,
                    "_lead_times": [],
                    "rfqs_sent": 0,
                    "rfqs_responded": 0,
                    "total_pos": 0,
                    "total_po_value": 0.0,
                    "total_received_qty": 0.0,
                    "total_damaged_qty": 0.0,
                    "quality_acceptance_rate": 100.0,
                },
            )
            entry["items_supplied"] += 1
            if s.lead_time_days is not None:
                entry["_lead_times"].append(float(s.lead_time_days))

        for r in rfqs:
            key = (r.supplier_email or r.supplier_name or "").strip().lower()
            if key in by_sup:
                by_sup[key]["rfqs_sent"] += 1
                if r.status in ("Responded", "Accepted"):
                    by_sup[key]["rfqs_responded"] += 1

        po_sup_key: Dict[int, str] = {}
        for p in pos:
            if p.status == "Cancelled":
                continue
            key = (p.vendor_email or p.vendor_name or "").strip().lower()
            po_sup_key[p.id] = key
            if key in by_sup:
                by_sup[key]["total_pos"] += 1
                by_sup[key]["total_po_value"] = round(by_sup[key]["total_po_value"] + float(p.total_amount or p.grand_total or 0), 2)

        for gr in receipts:
            key = po_sup_key.get(gr.purchase_order_id)
            if key and key in by_sup:
                for li in gr.items or []:
                    by_sup[key]["total_received_qty"] += float(li.get("received_qty") or 0)
                    by_sup[key]["total_damaged_qty"] += float(li.get("damaged_qty") or 0)

        rows = []
        for entry in by_sup.values():
            lts = entry.pop("_lead_times", [])
            entry["avg_lead_time_days"] = round(sum(lts) / len(lts), 1) if lts else 0.0
            rec = entry["total_received_qty"]
            dmg = entry["total_damaged_qty"]
            entry["quality_acceptance_rate"] = round(((rec - dmg) / rec) * 100.0, 1) if rec > 0 else 100.0
            rows.append(entry)
        return {
            "report_type": rtype,
            "summary": {"total_suppliers": len(rows)},
            "rows": rows,
        }

    if rtype == "goods-receiving":
        grs = session.exec(select(GoodsReceipt).order_by(GoodsReceipt.received_at.desc())).all()
        pos_map = {p.id: p for p in session.exec(select(PurchaseOrder)).all()}
        rows = []
        for gr in grs:
            if not _in_date_range(gr.received_at):
                continue
            if warehouse_id and gr.warehouse_id != warehouse_id:
                continue
            po = pos_map.get(gr.purchase_order_id)
            tot_rec = sum(float(i.get("received_qty") or 0) for i in (gr.items or []))
            tot_dmg = sum(float(i.get("damaged_qty") or 0) for i in (gr.items or []))
            tot_acc = sum(float(i.get("accepted_qty") or 0) for i in (gr.items or []))
            rows.append({
                "receipt_number": gr.receipt_number,
                "po_number": po.po_number if po else f"PO #{gr.purchase_order_id}",
                "vendor_name": po.vendor_name if po else "—",
                "warehouse_name": wh_map[gr.warehouse_id].warehouse_name if (gr.warehouse_id and gr.warehouse_id in wh_map) else "Main Inventory",
                "status": gr.status,
                "received_qty": tot_rec,
                "damaged_qty": tot_dmg,
                "accepted_qty": tot_acc,
                "received_by_name": gr.received_by_name or "Staff",
                "received_at": _iso(gr.received_at),
            })
        return {"report_type": rtype, "summary": {"total_receipts": len(rows)}, "rows": rows}

    if rtype == "stock-transfers":
        trfs = session.exec(select(StockTransfer).order_by(StockTransfer.created_at.desc())).all()
        rows = []
        for t in trfs:
            if not _in_date_range(t.created_at):
                continue
            if warehouse_id and t.source_warehouse_id != warehouse_id and t.destination_warehouse_id != warehouse_id:
                continue
            rows.append(_transfer_dict(t, wh_map))
        return {"report_type": rtype, "summary": {"total_transfers": len(rows)}, "rows": rows}

    if rtype == "stock-discrepancies":
        counts = session.exec(select(StockCount).order_by(StockCount.created_at.desc())).all()
        rows = []
        for c in counts:
            if not _in_date_range(c.created_at):
                continue
            if warehouse_id and c.warehouse_id != warehouse_id:
                continue
            for li in c.items or []:
                disc = float(li.get("discrepancy") or 0)
                if abs(disc) < 1e-6:
                    continue
                rows.append({
                    "count_number": c.count_number,
                    "status": c.status,
                    "warehouse_name": wh_map[c.warehouse_id].warehouse_name if (c.warehouse_id and c.warehouse_id in wh_map) else "Main Inventory",
                    "item_code": li.get("item_code"),
                    "item_name": li.get("item_name"),
                    "system_qty": li.get("system_qty"),
                    "physical_qty": li.get("physical_qty"),
                    "discrepancy": disc,
                    "reason": li.get("reason") or "—",
                    "created_at": _iso(c.created_at),
                })
        return {"report_type": rtype, "summary": {"total_discrepancies": len(rows)}, "rows": rows}

    if rtype == "supplier-payments":
        pays = session.exec(select(SupplierPayment).order_by(SupplierPayment.created_at.desc())).all()
        pos_map = {p.id: p for p in session.exec(select(PurchaseOrder)).all()}
        rows = []
        total_paid = 0.0
        for p in pays:
            if not _in_date_range(p.created_at):
                continue
            if supplier_id and p.supplier_id != supplier_id:
                continue
            po = pos_map.get(p.purchase_order_id) if p.purchase_order_id else None
            total_paid += float(p.amount or 0)
            rows.append({
                "payment_number": p.payment_number,
                "supplier_name": p.supplier_name,
                "supplier_email": p.supplier_email,
                "po_number": po.po_number if po else "—",
                "amount": p.amount,
                "currency": p.currency,
                "payment_method": p.payment_method,
                "transaction_reference": p.transaction_reference or "—",
                "payment_date": p.payment_date,
                "status": p.status,
            })
        return {
            "report_type": rtype,
            "summary": {"total_payments": len(rows), "total_amount_paid": round(total_paid, 2)},
            "rows": rows,
        }

    raise HTTPException(status_code=400, detail=f"Unknown report_type: {report_type}")


@router.get("/inventory/reports/{report_type}")
def get_inventory_report(
    report_type: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    item_id: Optional[int] = None,
    category: Optional[str] = None,
    supplier_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    stock_status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    _require_staff(session)
    return _generate_report_data(
        session,
        report_type,
        date_from=date_from,
        date_to=date_to,
        item_id=item_id,
        category=category,
        supplier_id=supplier_id,
        warehouse_id=warehouse_id,
        stock_status=stock_status,
    )


@router.get("/inventory/reports/{report_type}/export-csv")
def export_inventory_report_csv(
    report_type: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    item_id: Optional[int] = None,
    category: Optional[str] = None,
    supplier_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    stock_status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    _require_staff(session)
    report = _generate_report_data(
        session,
        report_type,
        date_from=date_from,
        date_to=date_to,
        item_id=item_id,
        category=category,
        supplier_id=supplier_id,
        warehouse_id=warehouse_id,
        stock_status=stock_status,
    )
    rows = report.get("rows") or []
    output = io.StringIO()
    if rows:
        headers = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: (json_val if not isinstance((json_val := r.get(k)), (list, dict)) else len(json_val)) for k in headers})
    else:
        output.write("No records found\n")
    csv_bytes = ("\ufeff" + output.getvalue()).encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={report_type}_report.csv"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: SUPPLIER PORTAL ENHANCEMENTS (DASHBOARD, RFQs, POs, PAYMENTS)
# ═══════════════════════════════════════════════════════════════════════════════

def _resolve_supplier_context(session: Session, email: str):
    """Resolve supplier records, RFQs, POs, and payments scoped strictly to this supplier and tenant."""
    user = _require_supplier_or_staff(session, email)
    clean_email = (email or (user.email if user else "")).strip().lower()
    if not clean_email:
        raise HTTPException(status_code=400, detail="Supplier email is required")

    sup_records = session.exec(
        select(InventorySupplier).where(func.lower(InventorySupplier.supplier_email) == clean_email)
    ).all()
    if not sup_records and user:
        sup_records = session.exec(
            select(InventorySupplier).where(InventorySupplier.supplier_user_id == user.id)
        ).all()

    sup_ids = [s.id for s in sup_records if s.id]
    rfqs = session.exec(
        select(RFQRequest)
        .where(func.lower(RFQRequest.supplier_email) == clean_email)
        .order_by(RFQRequest.created_at.desc())
    ).all()

    pos_q = select(PurchaseOrder).where(
        or_(
            func.lower(PurchaseOrder.vendor_email) == clean_email,
            PurchaseOrder.supplier_id.in_(sup_ids) if sup_ids else False,
            PurchaseOrder.supplier_user_id == (user.id if user else -999),
        )
    ).order_by(PurchaseOrder.created_at.desc())
    pos = session.exec(pos_q).all()

    payments_q = select(SupplierPayment).where(
        or_(
            func.lower(SupplierPayment.supplier_email) == clean_email,
            SupplierPayment.supplier_id.in_(sup_ids) if sup_ids else False,
        )
    ).order_by(SupplierPayment.created_at.desc())
    payments = session.exec(payments_q).all()

    return clean_email, sup_records, rfqs, pos, payments


@router.get("/supplier/dashboard")
def get_supplier_portal_dashboard(email: str, session: Session = Depends(get_session)):
    clean_email, sup_records, rfqs, pos, payments = _resolve_supplier_context(session, email)
    assigned_item_ids = {s.item_id for s in sup_records}
    pending_rfqs = [r for r in rfqs if r.status == "Pending"]
    submitted_quotes = [r for r in rfqs if r.status in ("Responded", "Accepted")]
    pending_pos = [p for p in pos if p.status in ("Approved", "Sent")]
    confirmed_pos = [p for p in pos if p.status in ("Confirmed", "Partially Received", "Received")]
    expected_deliveries = [p for p in pos if p.status in ("Confirmed", "Partially Received") and p.expected_delivery]

    active_pos = [p for p in pos if p.status != "Cancelled"]
    total_billed = sum(float(p.total_amount or p.grand_total or 0) for p in active_pos)
    total_paid = sum(float(p.paid_amount or 0) for p in active_pos)
    outstanding_payments = round(max(0.0, total_billed - total_paid), 2)

    return {
        "supplier_email": clean_email,
        "total_assigned_products": len(assigned_item_ids),
        "pending_rfqs": len(pending_rfqs),
        "submitted_quotations": len(submitted_quotes),
        "pending_purchase_orders": len(pending_pos),
        "confirmed_orders": len(confirmed_pos),
        "expected_deliveries": len(expected_deliveries),
        "outstanding_payments": outstanding_payments,
        "total_paid": round(total_paid, 2),
    }


@router.get("/supplier/rfqs")
def get_supplier_rfqs(email: str, session: Session = Depends(get_session)):
    _, _, rfqs, _, _ = _resolve_supplier_context(session, email)
    items_map = {i.id: i for i in session.exec(select(InventoryItem)).all()}
    out = []
    for r in rfqs:
        it = items_map.get(r.item_id)
        responses = session.exec(select(RFQResponse).where(RFQResponse.rfq_id == r.id)).all()
        out.append({
            "id": r.id,
            "item_id": r.item_id,
            "item_name": it.name if it else f"Item #{r.item_id}",
            "item_code": it.code if it else "—",
            "unit": (it.unit if it else None) or "pcs",
            "quantity": r.quantity,
            "deadline": r.deadline,
            "notes": r.notes,
            "status": r.status,
            "approval_status": r.approval_status,
            "created_at": _iso(r.created_at),
            "my_responses": [
                {
                    "id": resp.id,
                    "unit_price": resp.unit_price,
                    "currency": resp.currency,
                    "min_order_qty": resp.min_order_qty,
                    "lead_time_days": resp.lead_time_days,
                    "availability": resp.availability,
                    "valid_until": resp.valid_until,
                    "notes": resp.notes,
                    "status": resp.status,
                    "submitted_at": _iso(resp.submitted_at),
                }
                for resp in responses
            ],
        })
    return {"rfqs": out, "total": len(out)}


class SupplierRFQResponseInput(BaseModel):
    supplier_email: str
    unit_price: float = Field(gt=0)
    currency: str = "USD"
    min_order_qty: Optional[float] = 1.0
    lead_time_days: Optional[int] = None
    availability: str = "In Stock"
    valid_until: Optional[str] = None
    attachment_url: Optional[str] = None
    notes: Optional[str] = None


@router.post("/supplier/rfqs/{rfq_id}/respond")
def supplier_respond_to_rfq(rfq_id: int, body: SupplierRFQResponseInput, session: Session = Depends(get_session)):
    _require_supplier_or_staff(session, body.supplier_email)
    rfq = session.get(RFQRequest, rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    if (rfq.supplier_email or "").strip().lower() != body.supplier_email.strip().lower():
        raise HTTPException(status_code=403, detail="This RFQ belongs to another supplier")

    resp = RFQResponse(
        tenant_id=rfq.tenant_id,
        rfq_id=rfq.id,
        supplier_name=rfq.supplier_name,
        supplier_email=rfq.supplier_email,
        unit_price=body.unit_price,
        currency=body.currency,
        min_order_qty=body.min_order_qty,
        lead_time_days=body.lead_time_days,
        availability=body.availability,
        valid_until=body.valid_until,
        attachment_url=body.attachment_url,
        notes=body.notes,
        status="Submitted",
    )
    rfq.status = "Responded"
    session.add(resp)
    session.add(rfq)
    session.commit()
    session.refresh(resp)
    return {"ok": True, "response_id": resp.id, "rfq_status": rfq.status}


@router.get("/supplier/purchase-orders")
def get_supplier_purchase_orders(email: str, session: Session = Depends(get_session)):
    _, _, _, pos, payments = _resolve_supplier_context(session, email)
    return {
        "orders": [p.model_dump() for p in pos],
        "payments": [pay.model_dump() for pay in payments],
        "total": len(pos),
    }


class SupplierPOConfirmInput(BaseModel):
    supplier_email: str
    action: str = "confirm"  # confirm | reject
    confirmed_delivery: Optional[str] = None
    notes: Optional[str] = None


@router.put("/supplier/purchase-orders/{po_id}/confirm")
def supplier_confirm_purchase_order(po_id: int, body: SupplierPOConfirmInput, session: Session = Depends(get_session)):
    _require_supplier_or_staff(session, body.supplier_email)
    po = session.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if (po.vendor_email or "").strip().lower() != body.supplier_email.strip().lower():
        raise HTTPException(status_code=403, detail="This purchase order belongs to another supplier")

    act = body.action.lower().strip()
    if act == "reject":
        po.status = "Cancelled"
    else:
        po.status = "Confirmed"
        po.supplier_confirmed_at = _utcnow()
        if body.confirmed_delivery:
            po.supplier_confirmed_delivery = body.confirmed_delivery
            po.expected_delivery = body.confirmed_delivery
    if body.notes:
        po.supplier_notes = body.notes
    po.updated_at = _utcnow()
    session.add(po)
    session.commit()
    session.refresh(po)
    return {"ok": True, "order": po.model_dump()}


class SupplierPOInvoiceInput(BaseModel):
    supplier_email: str
    invoice_number: str = Field(min_length=1, max_length=120)
    invoice_amount: float = Field(gt=0)
    notes: Optional[str] = None


@router.post("/supplier/purchase-orders/{po_id}/invoice")
def supplier_submit_po_invoice(po_id: int, body: SupplierPOInvoiceInput, session: Session = Depends(get_session)):
    _require_supplier_or_staff(session, body.supplier_email)
    po = session.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if (po.vendor_email or "").strip().lower() != body.supplier_email.strip().lower():
        raise HTTPException(status_code=403, detail="This purchase order belongs to another supplier")

    po.supplier_invoice_number = body.invoice_number.strip()
    po.supplier_invoice_amount = round(float(body.invoice_amount), 2)
    if body.notes:
        po.supplier_notes = body.notes
    po.updated_at = _utcnow()
    session.add(po)
    session.commit()
    session.refresh(po)
    return {"ok": True, "order": po.model_dump()}
