"""
Sales extras ported from the SCM BPO deployment:

  dropped_clients   record clients who left (reason, last revenue, reactivation potential), reactivate them, and the
                    salesperson reassignment history.
  proposals_portal  public share links for quotes and proposals (view, PDF, comment, accept, reject) and conversion of
                    accepted quotes / proposals into invoices.

Multi-tenant changes against the original:
  * the public portal resolves a document by its secret UUID across tenants, then works INSIDE that document's tenant
    (every query and notification is scoped to it); the fallback that looked a proposal up by its sequential numeric id
    is gone (it let anyone enumerate every tenant's proposals);
  * notifications go to the admins / managers of the document's own tenant, not of every tenant;
  * accepted / rejected documents are final (no re-accepting, no comment re-opening a signed proposal), and inputs are
    length-limited because these endpoints are public;
  * role checks on everything that is not public, and no "default to tenant 1" fallbacks.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlmodel import Session, select

from addons.business_suite.models import DroppedClient, ProposalComment, SalespersonHistory
from addons.business_suite.scm2 import reassign_owner
from database import (ActivityLog, ClientProfile, CRMQuote, Deal, Invoice, Lead, Notification, Proposal, QuoteItem, User,
                      engine)
from modules import tenant_settings
from modules.branding import current_brand
from modules.api_tracker import current_salesperson_id
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["Sales extras"])

STAFF = ["Admin", "SalesManager", "Employee", "Demo"]
MANAGERS = ["Admin", "SalesManager"]
FINAL_STATES = ("Accepted", "Rejected")


def get_session():
    with Session(engine) as session:
        yield session


def _require_roles(session, roles):
    from main import _require_roles as f   # lazy: main imports this package while it is loading
    return f(session, roles)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _tid() -> Optional[int]:
    t = current_tenant_id.get()
    return t if (t and t > 0) else None


# ── Dropped clients and salesperson history ──────────────────────────────────────────────────────────────────────────
class DroppedClientCreate(BaseModel):
    client_id: Optional[int] = None
    company_name: str = Field(min_length=1, max_length=255)
    reason: Optional[str] = None
    reason_category: Optional[str] = "Other"
    last_revenue: Optional[float] = 0
    relationship_months: Optional[int] = 0
    reactivation_potential: Optional[str] = "Low"
    notes: Optional[str] = None


def _row(r) -> dict:
    d = r.model_dump()
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


@router.get("/dropped-clients")
def list_dropped_clients(session: Session = Depends(get_session)):
    user = _require_roles(session, STAFF)
    q = select(DroppedClient).order_by(DroppedClient.dropped_at.desc())
    if getattr(user, "role", None) == "Employee":          # an employee sees only the clients they dropped or are assigned to
        q = q.where(or_(DroppedClient.dropped_by == user.id,
                        DroppedClient.client_id.in_(select(ClientProfile.id).where(ClientProfile.assignedEmployeeId == user.id))))
    rows = session.exec(q).all()
    categories: Dict[str, int] = {}
    for r in rows:
        cat = r.reason_category or "Other"
        categories[cat] = categories.get(cat, 0) + 1
    return {"dropped_clients": [_row(r) for r in rows], "category_breakdown": categories, "total": len(rows)}


@router.post("/dropped-clients")
def create_dropped_client(body: DroppedClientCreate, session: Session = Depends(get_session)):
    _require_roles(session, MANAGERS)
    uid = current_salesperson_id.get()
    cp = session.get(ClientProfile, body.client_id) if body.client_id else None
    if body.client_id and not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    if not cp and body.company_name:
        cp = session.exec(select(ClientProfile).where(ClientProfile.companyName.ilike(body.company_name.strip()))).first()
    tenant_id = _tid() or (cp.tenant_id if cp and cp.tenant_id and cp.tenant_id > 0 else None)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Pick a tenant first (X-Tenant-ID)")
    if cp and session.exec(select(DroppedClient).where(DroppedClient.client_id == cp.id, DroppedClient.tenant_id == tenant_id,
                                                       DroppedClient.reactivated_at.is_(None))).first():
        raise HTTPException(status_code=409, detail="This client is already marked as dropped")
    row = DroppedClient(
        tenant_id=tenant_id, client_id=cp.id if cp else body.client_id, company_name=body.company_name,
        reason=body.reason, reason_category=body.reason_category or "Other", dropped_by=uid if uid and uid > 0 else None,
        last_revenue=body.last_revenue or 0, relationship_months=body.relationship_months or 0,
        reactivation_potential=body.reactivation_potential or "Low", notes=body.notes,
        previous_status=cp.status if cp else None)
    session.add(row)
    session.flush()
    out = _row(row)
    if cp:
        cp.status = "Dropped"
        session.add(cp)
        session.add(ActivityLog(
            tenant_id=tenant_id, clientId=cp.id, action=f"Client marked as Dropped: {body.reason_category or 'Discontinued'}",
            method="STATUS_UPDATE",
            content=f"Client status changed to Dropped. Reason: {body.reason or 'No reason specified'}. "
                    f"Category: {body.reason_category or 'Other'}. Reactivation: {body.reactivation_potential or 'Low'}",
            details=body.notes))
    session.commit()
    return {"dropped_client": out, "message": "Dropped client recorded"}


@router.get("/dropped-clients/by-client/{client_id}")
def get_dropped_client_by_client_id(client_id: int, session: Session = Depends(get_session)):
    _require_roles(session, STAFF)
    row = session.exec(select(DroppedClient).where(DroppedClient.client_id == client_id)
                       .order_by(DroppedClient.dropped_at.desc())).first()
    return {"dropped_client": _row(row) if row else None}


@router.post("/dropped-clients/by-client/{client_id}/reactivate")
def reactivate_dropped_client(client_id: int, session: Session = Depends(get_session)):
    _require_roles(session, MANAGERS)
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    record = session.exec(select(DroppedClient).where(DroppedClient.client_id == client_id, DroppedClient.tenant_id == cp.tenant_id,
                                                      DroppedClient.reactivated_at.is_(None))
                          .order_by(DroppedClient.dropped_at.desc())).first()
    restored = (record.previous_status if record and record.previous_status and record.previous_status != "Dropped" else None) or "Active"
    cp.status = restored
    session.add(cp)
    if record:
        record.reactivated_at = _utcnow()
        session.add(record)
    session.add(ActivityLog(tenant_id=cp.tenant_id, clientId=cp.id, action="Client Reactivated", method="STATUS_UPDATE",
                            content=f"Client status changed from Dropped back to {restored}."))
    session.commit()
    return {"ok": True, "status": restored, "dropped_client": _row(record) if record else None,
            "message": f"Client reactivated to {restored} status"}


@router.delete("/dropped-clients/{dc_id}")
def delete_dropped_client(dc_id: int, session: Session = Depends(get_session)):
    _require_roles(session, MANAGERS)
    row = session.get(DroppedClient, dc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    session.delete(row)
    session.commit()
    return {"ok": True}


class ReassignRequest(BaseModel):
    client_id: int
    to_user_id: int
    reason: Optional[str] = None


@router.post("/salesperson/reassign")
def reassign_salesperson(body: ReassignRequest, session: Session = Depends(get_session)):
    _require_roles(session, MANAGERS)
    h = reassign_owner(session, "client", body.client_id, body.to_user_id, body.reason)
    return {"message": f"Client reassigned to {h.to_user_name}", "history_id": h.id}


@router.get("/salesperson/history/{client_id}")
def get_salesperson_history(client_id: int, session: Session = Depends(get_session)):
    _require_roles(session, STAFF)
    rows = session.exec(select(SalespersonHistory).where(SalespersonHistory.client_id == client_id)
                        .order_by(SalespersonHistory.reassigned_at.desc())).all()
    return {"history": [_row(r) for r in rows]}


# ── Proposals portal ─────────────────────────────────────────────────────────────────────────────────────────────────
class ProposalCommentCreateRequest(BaseModel):
    author_name: str = Field(default="Client", max_length=120)
    author_type: str = Field(default="client", max_length=30)
    content: str = Field(min_length=1, max_length=2000)


class ProposalAcceptRequest(BaseModel):
    signer_name: Optional[str] = Field(default=None, max_length=200)


def _find_by_uuid(session: Session, uuid: str):
    """(kind, document) for a share link, working inside that document's tenant from here on.

    The link is the credential, so the lookup spans tenants; after it, the request context is switched to the
    document's tenant so every other read, write and notification is scoped to it."""
    if not uuid or len(uuid) > 60:
        raise HTTPException(status_code=404, detail="Proposal not found")
    from modules import features
    for kind, model in (("quote", CRMQuote), ("proposal", Proposal)):
        doc = session.exec(select(model).where(model.public_uuid == uuid).execution_options(skip_tenant=True)).first()
        if doc:
            if doc.tenant_id and doc.tenant_id > 0:
                if not features.is_enabled(doc.tenant_id, "proposals_portal"):
                    raise HTTPException(status_code=404, detail="Proposal not found")   # feature off: link is dead
                current_tenant_id.set(doc.tenant_id)
            return kind, doc
    raise HTTPException(status_code=404, detail="Proposal not found")


def _notify_tenant_team(session: Session, tenant_id: Optional[int], title: str, message: str, link: str,
                        client_id: Optional[int] = None, notif_type: str = "info") -> None:
    """Notify the Admins / SalesManagers of THIS tenant and the client's assigned employee."""
    q = select(User).where(User.role.in_(["Admin", "SalesManager"]))
    if tenant_id:
        q = q.where(User.tenant_id == tenant_id)
    ids = {u.id for u in session.exec(q).all() if u.id}
    if client_id:
        cp = session.get(ClientProfile, client_id)
        if cp and cp.assignedEmployeeId:
            ids.add(cp.assignedEmployeeId)
    for uid in ids:
        session.add(Notification(tenant_id=tenant_id, user_id=uid, title=title, message=message, type=notif_type,
                                 link=link, is_read=False, created_at=_utcnow()))


def _salesperson(session: Session, client, deal):
    sp = session.get(User, client.assignedEmployeeId) if client and client.assignedEmployeeId else None
    if not sp and deal and deal.assigned_to:
        sp = session.get(User, deal.assigned_to)
    return sp


def _proposal_items(prop) -> List[dict]:
    import json
    raw = prop.line_items or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    out = []
    for it in raw if isinstance(raw, list) else []:
        qty, price = float(it.get("quantity", 1) or 1), float(it.get("unit_price", 0) or 0)
        out.append({"description": it.get("product_name") or it.get("description", "Item"), "quantity": qty,
                    "unit_price": price, "total": qty * price})
    return out


@router.get("/public/proposals/{uuid}")
def get_public_proposal(uuid: str, session: Session = Depends(get_session)):
    kind, doc = _find_by_uuid(session, uuid)
    client = session.get(ClientProfile, doc.client_id) if doc.client_id else None
    lead = session.get(Lead, doc.lead_id) if doc.lead_id else None
    deal = session.get(Deal, doc.deal_id) if doc.deal_id else None
    sp = _salesperson(session, client, deal)
    brand = current_brand(doc.tenant_id)
    base = {
        "brand": {"name": brand.name, "email": brand.email, "phone": brand.phone, "website": brand.website},
        "client_name": client.companyName if client else (lead.company_name if lead else None),
        "lead_name": lead.company_name if lead else None,
        "salesperson_name": sp.name if sp else "Account Executive",
        "deal_title": deal.title if deal else doc.title,
        "deal_stage": deal.stage if deal else ("Closed Won" if doc.status == "Accepted" else "Negotiation"),
    }
    if kind == "quote":
        items = session.exec(select(QuoteItem).where(QuoteItem.quote_id == doc.id)).all()
        comments = session.exec(select(ProposalComment).where(ProposalComment.quote_id == doc.id)
                                .order_by(ProposalComment.created_at.asc())).all()
        d = doc.model_dump()
        d.update(base)
        d["items"] = [i.model_dump() for i in items]
        d["comments"] = [c.model_dump() for c in comments]
        return d
    comments = session.exec(select(ProposalComment).where(ProposalComment.proposal_id == doc.id)
                            .order_by(ProposalComment.created_at.asc())).all()
    terms = tenant_settings.get_setting(doc.tenant_id, "proposal_terms", "Standard terms and conditions apply.")
    return {
        "id": doc.id, "public_uuid": doc.public_uuid, "quote_number": f"PROP-{doc.id:04d}", "title": doc.title,
        "status": doc.status, "grand_total": doc.total_value or 0.0, "currency": doc.currency or "INR",
        "valid_until": doc.valid_until, "notes": doc.content, "terms": terms,
        "signed_at": doc.signed_at.isoformat() if doc.signed_at else None, "signed_by": doc.signature_data or None,
        "items": _proposal_items(doc), "comments": [c.model_dump() for c in comments], "is_proposal": True, **base,
    }


@router.get("/public/proposals/{uuid}/pdf")
def public_proposal_pdf(uuid: str, session: Session = Depends(get_session)):
    """The PDF behind a share link. The document is resolved by its secret UUID only."""
    from main import proposal_pdf, quote_pdf
    kind, doc = _find_by_uuid(session, uuid)
    return quote_pdf(doc.id, session=session) if kind == "quote" else proposal_pdf(doc.id, session=session)


def _guard_open(doc) -> None:
    if (doc.status or "") in FINAL_STATES:
        raise HTTPException(status_code=409, detail=f"This document was already {doc.status.lower()}.")


@router.post("/public/proposals/{uuid}/comments")
def add_proposal_comment(uuid: str, body: ProposalCommentCreateRequest, session: Session = Depends(get_session)):
    kind, doc = _find_by_uuid(session, uuid)
    _guard_open(doc)
    author = body.author_name.strip() or "Client"
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Comment is empty")
    session.add(ProposalComment(tenant_id=doc.tenant_id, author_name=author, author_type="client", content=content,
                                **({"quote_id": doc.id} if kind == "quote" else {"proposal_id": doc.id})))
    doc.status = "Negotiation"
    session.add(doc)
    client = session.get(ClientProfile, doc.client_id) if doc.client_id else None
    if client:
        client.status = "Negotiation"
        session.add(client)
    deal = session.get(Deal, doc.deal_id) if doc.deal_id else None
    if deal:
        deal.stage = "Negotiation"
        deal.updated_at = _utcnow()
        session.add(deal)
    _notify_tenant_team(session, doc.tenant_id, f"💬 Proposal Negotiation: {client.companyName if client else author}",
                        f'{author}: "{content[:140]}"', f"/p/{uuid}", doc.client_id)
    session.commit()
    return {"ok": True}


@router.post("/public/proposals/{uuid}/accept")
def accept_public_proposal(uuid: str, body: Optional[ProposalAcceptRequest] = None, session: Session = Depends(get_session)):
    kind, doc = _find_by_uuid(session, uuid)
    _guard_open(doc)
    signer = body.signer_name.strip() if body and body.signer_name else None
    doc.status = "Accepted"
    if kind == "proposal":
        doc.signed_at = doc.updated_at = _utcnow()
        if signer:
            doc.signature_data = signer
    session.add(doc)
    client = session.get(ClientProfile, doc.client_id) if doc.client_id else None
    if client:
        client.status = "Won"
        session.add(client)
    deal = session.get(Deal, doc.deal_id) if doc.deal_id else None
    if deal:
        deal.stage = "Closed Won"
        deal.won_at = deal.updated_at = _utcnow()
        if deal.value and not deal.final_value:
            deal.final_value = deal.value
        session.add(deal)
    session.commit()                     # the acceptance is saved before any billing work can fail
    if kind == "proposal":
        _auto_invoice_for_proposal(doc)
    _notify_tenant_team(session, doc.tenant_id, f"🎉 Deal Accepted & Signed: {client.companyName if client else 'Client'}",
                        f"{signer or (client.companyName if client else 'The client')} digitally accepted and signed "
                        f"'{doc.title}'. Deal advanced to Closed Won!", "/pipeline", doc.client_id, "success")
    session.commit()
    return {"ok": True}


@router.post("/public/proposals/{uuid}/reject")
def reject_public_proposal(uuid: str, body: Optional[Dict[str, Any]] = Body(None), session: Session = Depends(get_session)):
    kind, doc = _find_by_uuid(session, uuid)
    _guard_open(doc)
    reason = str((body or {}).get("reason") or "Cancelled / Declined by client")[:300]
    doc.status = "Rejected"
    session.add(doc)
    client = session.get(ClientProfile, doc.client_id) if doc.client_id else None
    if client:
        client.status = "Lost"
        session.add(client)
    deal = session.get(Deal, doc.deal_id) if doc.deal_id else None
    if deal:
        deal.stage = "Closed Lost"
        deal.updated_at = _utcnow()
        session.add(deal)
    _notify_tenant_team(session, doc.tenant_id, f"❌ Proposal Declined / Lost: {client.companyName if client else 'Client'}",
                        f"'{doc.title}' was declined: {reason}. Deal marked Closed Lost.", "/pipeline", doc.client_id, "error")
    session.commit()
    return {"ok": True}


# ── Authenticated: proposals of a deal, and conversion to invoices ───────────────────────────────────────────────────
@router.get("/deals/{deal_id}/proposals")
def get_deal_proposals(deal_id: int, session: Session = Depends(get_session)):
    _require_roles(session, STAFF)
    res = []
    for p in session.exec(select(CRMQuote).where(CRMQuote.deal_id == deal_id).order_by(CRMQuote.created_at.desc())).all():
        d = p.model_dump()
        d["items"] = [i.model_dump() for i in session.exec(select(QuoteItem).where(QuoteItem.quote_id == p.id)).all()]
        res.append(d)
    for pr in session.exec(select(Proposal).where(Proposal.deal_id == deal_id).order_by(Proposal.created_at.desc())).all():
        res.append({"id": pr.id, "title": pr.title, "quote_number": f"PROP-{str(pr.id).zfill(4)}",
                    "grand_total": pr.total_value or 0.0, "currency": pr.currency or "INR", "status": pr.status,
                    "public_uuid": pr.public_uuid, "is_proposal": True, "items": pr.line_items or []})
    return {"proposals": res}


def _find_invoice_for_proposal(prop, session: Session):
    """An existing invoice for this proposal (idempotency)."""
    if prop.id is None:
        return None
    inv = session.exec(select(Invoice).where(Invoice.proposal_id == prop.id)).first()
    if inv:
        return inv
    marker = f"Proposal Q-{prop.id:04d}"   # invoices made by the older manual button only carry a note
    return session.exec(select(Invoice).where(Invoice.notes.is_not(None), Invoice.notes.contains(marker))).first()


def _auto_invoice_for_proposal(prop):
    """Create the invoice for an accepted proposal (idempotent, never raises). Own session, so a billing failure can
    never undo the acceptance. The tenant is set explicitly: this may run in a public request with no tenant."""
    from main import _generate_invoice_number
    previous = current_tenant_id.get()
    try:
        if prop.tenant_id and prop.tenant_id > 0:
            current_tenant_id.set(prop.tenant_id)
        with Session(engine) as s:
            existing = _find_invoice_for_proposal(prop, s)
            if existing:
                return existing
            raw = prop.line_items if isinstance(prop.line_items, list) else []
            subtotal = float(prop.total_value or 0)
            inv = Invoice(
                invoice_number=_generate_invoice_number(s), client_id=prop.client_id or None, amount=round(subtotal, 2),
                tax=0.0, total=round(subtotal, 2), currency=prop.currency or "INR",
                due_date=(_utcnow() + timedelta(days=30)).date().isoformat(),
                notes=f"Auto-generated from accepted Proposal Q-{prop.id:04d}", line_items=raw, status="Draft",
                proposal_id=prop.id, deal_id=prop.deal_id, tenant_id=prop.tenant_id)
            s.add(inv)
            s.commit()
            s.refresh(inv)
            return inv
    except Exception as e:
        print(f"[billing] auto invoice failed for proposal {getattr(prop, 'id', '?')}: {e}")
        return None
    finally:
        current_tenant_id.set(previous)


@router.post("/quotes/{quote_id}/convert-to-invoice")
def convert_quote_to_invoice(quote_id: int, session: Session = Depends(get_session)):
    """Create an invoice pre-populated from a quote's line items."""
    from main import _generate_invoice_number, _invoice_dict
    _require_roles(session, MANAGERS)
    qt = session.get(CRMQuote, quote_id)
    if not qt:
        raise HTTPException(status_code=404, detail="Quote not found")
    items = session.exec(select(QuoteItem).where(QuoteItem.quote_id == qt.id)).all()
    line_items = [{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price} for i in items]
    subtotal = sum(i.quantity * i.unit_price for i in items) if items else (qt.grand_total or 0)
    inv = Invoice(invoice_number=_generate_invoice_number(session), client_id=qt.client_id or None, amount=round(subtotal, 2),
                  tax=0.0, total=round(subtotal, 2), currency=qt.currency or "INR",
                  due_date=(_utcnow() + timedelta(days=30)).date().isoformat(),
                  notes=f"Auto-generated from Quote {qt.quote_number or qt.id}", line_items=line_items, quote_id=qt.id,
                  deal_id=qt.deal_id)
    session.add(inv)
    session.commit()
    session.refresh(inv)
    return {"invoice": _invoice_dict(inv, session), "message": "Invoice created from quote"}


@router.post("/proposals/{proposal_id}/convert-to-invoice")
def convert_proposal_to_invoice(proposal_id: int, session: Session = Depends(get_session)):
    """Create an invoice pre-populated from a proposal's line items (idempotent)."""
    from main import _invoice_dict
    _require_roles(session, MANAGERS)
    prop = session.get(Proposal, proposal_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Proposal not found")
    existing = _find_invoice_for_proposal(prop, session)
    if existing:
        return {"invoice": _invoice_dict(existing, session), "message": "Invoice already exists for this proposal"}
    inv = _auto_invoice_for_proposal(prop)
    if not inv:
        raise HTTPException(status_code=500, detail="Failed to create invoice from proposal")
    return {"invoice": _invoice_dict(session.get(Invoice, inv.id) or inv, session),
            "message": "Invoice created from proposal"}
