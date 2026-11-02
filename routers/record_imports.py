"""Unified CSV imports with row-level savepoints and shared duplicate protection."""
import csv
import io
import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlmodel import Session, select
from sqlalchemy import func

from database import ClientProfile, Lead, Tenant, User
from main import get_session
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["import"])
ALIASES = {"company": "name", "companyname": "name", "clientname": "name", "name": "name",
           "email": "email", "emailaddress": "email", "phone": "phone", "mobile": "phone", "contact": "phone", "contactnumber": "phone",
           "website": "website", "websiteurl": "website", "url": "website", "industry": "industry", "sector": "industry",
           "source": "source", "leadsource": "source", "status": "status", "address": "address", "location": "address",
           "notes": "notes", "note": "notes", "description": "notes"}


@router.post("/import/leads/csv")
@router.post("/import/clients/csv")
async def import_records(request: Request, file: UploadFile = File(...), session: Session = Depends(get_session)):
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
    created, skipped, errors = 0, 0, []
    from modules.record_duplicates import lock_company
    lock_company(session, tid)
    count = session.connection().execute(select(func.count()).select_from(model.__table__).where(model.__table__.c.tenant_id == tid)).scalar_one()
    for number, row in enumerate(reader, start=2):
        try:
            mapped = {ALIASES[re.sub(r"[^a-z0-9]", "", (key or "").lower())]: str(value or "").strip()
                      for key, value in row.items() if re.sub(r"[^a-z0-9]", "", (key or "").lower()) in ALIASES}
            if not mapped.get("name"):
                skipped += 1; errors.append(f"Row {number}: a company name is required"); continue
            with session.begin_nested():
                tenant = session.get(Tenant, tid)
                if tenant and count >= tenant.limit_clients:
                    raise HTTPException(status_code=403, detail="Company record limit reached")
                if clients:
                    account = None
                    email = mapped.get("email", "").casefold()
                    if email:
                        # Account email is globally unique, but foreign-company accounts are never reused.
                        accounts = session.connection().execute(select(User.__table__.c.id, User.__table__.c.tenant_id).where(func.lower(User.__table__.c.email) == email)).all()
                        if accounts:
                            if len(accounts) != 1 or accounts[0].tenant_id != tid:
                                raise HTTPException(status_code=409, detail="Email is unavailable for this company")
                            account = session.get(User, accounts[0].id)
                        else:
                            account = User(email=email, name=mapped["name"], role="Client", tenant_id=tid, password=_hash_password(secrets.token_urlsafe(24)))
                            session.add(account); session.flush()
                    record = ClientProfile(tenant_id=tid, userId=account.id if account else None, companyName=mapped["name"], phone=mapped.get("phone") or None,
                        websiteUrl=mapped.get("website") or None, address=mapped.get("address") or None, industry=mapped.get("industry") or None,
                        lead_source=mapped.get("source") or "Import", status=mapped.get("status") or "Active", customFields={"notes": mapped.get("notes", "")})
                else:
                    record = Lead(tenant_id=tid, company_name=mapped["name"], email=mapped.get("email") or None, phone=mapped.get("phone") or None,
                        website=mapped.get("website") or None, industry=mapped.get("industry") or None, source=mapped.get("source") or "Import",
                        status=mapped.get("status") or "New", address=mapped.get("address") or None, notes=mapped.get("notes") or None)
                session.add(record); session.flush()
            created += 1
            count += 1
        except HTTPException as error:
            skipped += 1; errors.append(f"Row {number}: {error.detail}")
        except (ValueError, TypeError, csv.Error):
            skipped += 1; errors.append(f"Row {number}: invalid row data")
    session.commit()
    return {"created": created, "skipped": skipped, "errors": errors}
