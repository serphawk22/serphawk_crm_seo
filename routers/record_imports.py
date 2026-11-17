"""Unified CSV imports with row-level savepoints, duplicate merge, and failure tracking."""
import csv
import io
import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlmodel import Session, select
from sqlalchemy import func

from database import ClientProfile, Lead, Tenant, User
from main import get_session
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["import"])
ALIASES = {
    "company": "name", "companyname": "name", "clientname": "name", "name": "name",
    "email": "email", "emailaddress": "email", "phone": "phone", "mobile": "phone",
    "contact": "phone", "contactnumber": "phone",
    "website": "website", "websiteurl": "website", "url": "website",
    "industry": "industry", "sector": "industry",
    "source": "source", "leadsource": "source", "status": "status",
    "address": "address", "location": "address",
    "notes": "notes", "note": "notes", "description": "notes",
}


@router.post("/import/leads/csv")
@router.post("/import/clients/csv")
async def import_records(
    request: Request,
    file: UploadFile = File(...),
    duplicate_mode: Optional[str] = Query("merge"),
    session: Session = Depends(get_session),
):
    from main import _hash_password, _require_roles
    actor = _require_roles(session, ["Admin", "SalesManager", "Employee", "Sales", "Demo"])
    tid = current_tenant_id.get()
    clients = request.url.path == "/import/clients/csv"
    model = ClientProfile if clients else Lead
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Import files must be under 10 MB")
    decoded = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="A CSV header row is required")

    created, merged, skipped = 0, 0, 0
    errors = []
    failures = []

    from modules.record_duplicates import lock_company
    lock_company(session, tid)
    count = session.connection().execute(
        select(func.count()).select_from(model.__table__).where(model.__table__.c.tenant_id == tid)
    ).scalar_one()

    for number, row in enumerate(reader, start=2):
        try:
            mapped = {
                ALIASES[re.sub(r"[^a-z0-9]", "", (key or "").lower())]: str(value or "").strip()
                for key, value in row.items()
                if re.sub(r"[^a-z0-9]", "", (key or "").lower()) in ALIASES
            }
            if not mapped.get("name"):
                skipped += 1
                reason = "A company name is required"
                errors.append(f"Row {number}: {reason}")
                failures.append({"row": number, "reason": reason, "data": dict(row)})
                continue

            tenant = session.get(Tenant, tid)
            if tenant and count >= tenant.limit_clients:
                reason = "Company record limit reached"
                skipped += 1
                errors.append(f"Row {number}: {reason}")
                failures.append({"row": number, "reason": reason, "data": dict(row)})
                break

            with session.begin_nested():
                if clients:
                    # Check for duplicate ClientProfile
                    existing_client = None
                    clean_name = mapped["name"].casefold()
                    email = mapped.get("email", "").casefold()
                    phone = mapped.get("phone", "").strip()

                    q = select(ClientProfile).where(ClientProfile.tenant_id == tid)
                    if clean_name:
                        cand = session.exec(q.where(func.lower(ClientProfile.companyName) == clean_name)).first()
                        if cand:
                            existing_client = cand

                    if not existing_client and email:
                        # Find client account with this email
                        acc = session.exec(
                            select(User).where(User.tenant_id == tid, func.lower(User.email) == email)
                        ).first()
                        if acc:
                            cand = session.exec(q.where(ClientProfile.userId == acc.id)).first()
                            if cand:
                                existing_client = cand

                    if existing_client:
                        if duplicate_mode == "merge":
                            if not existing_client.phone and phone:
                                existing_client.phone = phone
                            if not existing_client.websiteUrl and mapped.get("website"):
                                existing_client.websiteUrl = mapped["website"]
                            if not existing_client.address and mapped.get("address"):
                                existing_client.address = mapped["address"]
                            if not existing_client.industry and mapped.get("industry"):
                                existing_client.industry = mapped["industry"]
                            if mapped.get("notes"):
                                cf = dict(existing_client.customFields or {})
                                old_notes = cf.get("notes", "")
                                cf["notes"] = f"{old_notes}\n{mapped['notes']}".strip() if old_notes else mapped["notes"]
                                existing_client.customFields = cf
                            session.add(existing_client)
                            merged += 1
                            continue
                        else:
                            skipped += 1
                            reason = f"Duplicate client '{mapped['name']}' skipped"
                            errors.append(f"Row {number}: {reason}")
                            failures.append({"row": number, "reason": reason, "data": dict(row)})
                            continue

                    account = None
                    if email:
                        accounts = session.connection().execute(
                            select(User.__table__.c.id, User.__table__.c.tenant_id).where(func.lower(User.__table__.c.email) == email)
                        ).all()
                        if accounts:
                            if len(accounts) != 1 or accounts[0].tenant_id != tid:
                                raise HTTPException(status_code=409, detail="Email is unavailable for this company")
                            account = session.get(User, accounts[0].id)
                        else:
                            account = User(
                                email=email, name=mapped["name"], role="Client",
                                tenant_id=tid, password=_hash_password(secrets.token_urlsafe(24))
                            )
                            session.add(account)
                            session.flush()

                    record = ClientProfile(
                        tenant_id=tid, userId=account.id if account else None, companyName=mapped["name"],
                        phone=mapped.get("phone") or None, websiteUrl=mapped.get("website") or None,
                        address=mapped.get("address") or None, industry=mapped.get("industry") or None,
                        lead_source=mapped.get("source") or "Import", status=mapped.get("status") or "Active",
                        customFields={"notes": mapped.get("notes", "")}
                    )
                else:
                    # Check for duplicate Lead
                    clean_name = mapped["name"].casefold()
                    email = mapped.get("email", "").casefold()
                    phone = mapped.get("phone", "").strip()
                    website = mapped.get("website", "").strip().lower()

                    existing_lead = None
                    q = select(Lead).where(Lead.tenant_id == tid)

                    if email:
                        existing_lead = session.exec(q.where(func.lower(Lead.email) == email)).first()
                    if not existing_lead and clean_name:
                        existing_lead = session.exec(q.where(func.lower(Lead.company_name) == clean_name)).first()
                    if not existing_lead and phone and len(phone) >= 7:
                        existing_lead = session.exec(q.where(Lead.phone == phone)).first()

                    if existing_lead:
                        if duplicate_mode == "merge":
                            if not existing_lead.email and email:
                                existing_lead.email = email
                            if not existing_lead.phone and phone:
                                existing_lead.phone = phone
                            if not existing_lead.website and website:
                                existing_lead.website = website
                            if not existing_lead.address and mapped.get("address"):
                                existing_lead.address = mapped["address"]
                            if not existing_lead.industry and mapped.get("industry"):
                                existing_lead.industry = mapped["industry"]
                            if mapped.get("notes"):
                                existing_lead.notes = (
                                    f"{existing_lead.notes}\n{mapped['notes']}".strip()
                                    if existing_lead.notes else mapped["notes"]
                                )
                            session.add(existing_lead)
                            merged += 1
                            continue
                        else:
                            skipped += 1
                            reason = f"Duplicate lead '{mapped['name']}' skipped"
                            errors.append(f"Row {number}: {reason}")
                            failures.append({"row": number, "reason": reason, "data": dict(row)})
                            continue

                    record = Lead(
                        tenant_id=tid, company_name=mapped["name"], email=mapped.get("email") or None,
                        phone=mapped.get("phone") or None, website=mapped.get("website") or None,
                        industry=mapped.get("industry") or None, source=mapped.get("source") or "Import",
                        status=mapped.get("status") or "New", address=mapped.get("address") or None,
                        notes=mapped.get("notes") or None
                    )

                session.add(record)
                session.flush()

            created += 1
            count += 1
        except HTTPException as error:
            skipped += 1
            errors.append(f"Row {number}: {error.detail}")
            failures.append({"row": number, "reason": str(error.detail), "data": dict(row)})
        except Exception as ex:
            skipped += 1
            errors.append(f"Row {number}: invalid row data ({str(ex)})")
            failures.append({"row": number, "reason": f"Invalid row data: {str(ex)}", "data": dict(row)})

    session.commit()
    return {
        "created": created,
        "merged": merged,
        "skipped": skipped,
        "errors": errors,
        "failures": failures,
    }
