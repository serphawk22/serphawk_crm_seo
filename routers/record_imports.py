"""Unified CSV imports with row-level savepoints, duplicate merge, custom fields capture, and failure tracking."""
import csv
import io
import re
import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlmodel import Session, select
from sqlalchemy import func

from database import ClientProfile, Lead, Tenant, User, Contact, LeadSpace, DEFAULT_SPACE_STAGES, _utcnow, get_session
from modules import auto_calling
from modules.tenant_scope import current_tenant_id

router = APIRouter(tags=["import"])

ALIASES = {
    # Names / Companies
    "company": "company_name", "companyname": "company_name", "clientname": "company_name",
    "businessname": "company_name", "business_name": "company_name", "organization": "company_name",
    "account": "company_name", "firm": "company_name",

    "name": "name", "contactname": "name", "contact_name": "name", "fullname": "name", "full_name": "name",
    "person": "name", "personname": "name", "contactperson": "name",
    "firstname": "first_name", "first_name": "first_name",
    "lastname": "last_name", "last_name": "last_name",

    # Communication
    "email": "email", "emailaddress": "email", "mail": "email", "workemail": "email",
    "phone": "phone", "mobile": "phone", "phonenumber": "phone", "mobilenumber": "phone",
    "contact": "phone", "contactnumber": "phone", "cell": "phone", "telephone": "phone",
    "workphone": "phone", "alternatephone": "alternate_number", "alternatenumber": "alternate_number",

    # Online Profiles / Links
    "website": "website", "websiteurl": "website", "url": "website",
    "linkedin": "linkedin_url", "linkedinurl": "linkedin_url",
    "twitter": "twitter_url", "twitterurl": "twitter_url",

    # Designation / Org
    "designation": "designation", "title": "designation", "jobtitle": "designation", "role": "designation",
    "position": "designation", "department": "department",

    # Industry / Classification
    "industry": "industry", "sector": "industry",
    "source": "source", "leadsource": "source", "status": "status",

    # Location
    "address": "address", "location": "address", "city": "city", "state": "state", "country": "country",

    # Activities & Dates
    "created": "created_at", "createdat": "created_at", "createddate": "created_at", "date": "created_at",
    "lastactivity": "last_activity", "lastactivitydate": "last_activity", "lastcontact": "last_activity",
    "lastcontacted": "last_activity", "activity": "last_activity",

    # Tags & Notes
    "tags": "tags", "tag": "tags", "labels": "tags", "label": "tags", "keywords": "tags",
    "notes": "notes", "note": "notes", "description": "notes", "comments": "notes", "remarks": "notes",
}

CORE_NORMALIZED_KEYS = set(ALIASES.keys())


def normalize_phone_key(raw: Optional[str]) -> Optional[str]:
    """Strictly normalize phone number to canonical digits for duplicate matching.
    
    Extracts digits only. Rejects invalid dummy numbers (e.g. all repeating digits,
    sequential digits, strings with fewer than 7 digits). Returns the significant
    digits (last 10 digits for 10+ digit phone numbers) to ensure robust matching across
    varying country codes (+91, 0, etc.) without false positive collisions.
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw).strip())
    if len(digits) < 7 or len(digits) > 16:
        return None
    # Reject dummy repeating digits e.g. 0000000000, 9999999999, 1111111111
    if len(set(digits)) <= 1:
        return None
    # Reject common sequential dummies
    if digits in ("1234567890", "0123456789", "9876543210", "0987654321"):
        return None
    # If 10 or more digits, use the last 10 significant digits so "+919846672686", "09846672686", "9846672686" all match identically
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def normalize_email_key(raw: Optional[str]) -> Optional[str]:
    """Strictly normalize email address for duplicate matching.
    
    Lowercases, strips whitespace, and requires valid email format with '@' and domain dot.
    Ignores placeholders like none@..., test@..., n/a, etc.
    """
    if not raw:
        return None
    em = str(raw).strip().lower()
    if "@" not in em or "." not in em:
        return None
    if len(em) < 5 or len(em) > 254:
        return None
    parts = em.split("@")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    if "." not in parts[1]:
        return None
    # Filter out common dummy / placeholder emails
    user_part, domain_part = parts[0], parts[1]
    if user_part in ("none", "null", "test", "na", "n-a", "noemail", "notavailable", "info", "admin"):
        if domain_part in ("none.com", "null.com", "test.com", "example.com", "invalid.com", "na.com"):
            return None
    return em


@router.post("/import/leads/csv")
@router.post("/import/clients/csv")
@router.post("/import/contacts/csv")
@router.post("/import/{target}/csv")
def import_records(
    request: Request,
    target: Optional[str] = None,
    file: UploadFile = File(...),
    duplicate_mode: Optional[str] = Query("merge"),
    space_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
):
    from main import _hash_password, _require_roles
    actor = _require_roles(session, ["Admin", "SalesManager", "Employee", "Sales", "Demo"])
    tid = current_tenant_id.get()
    try:
        auto_calling.mark_bulk_import(session)
    except Exception:
        pass

    path = request.url.path.lower()
    if "clients" in path or target == "clients":
        import_type = "clients"
        model = ClientProfile
    elif "contacts" in path or target == "contacts":
        import_type = "contacts"
        model = Contact
    else:
        import_type = "leads"
        model = Lead

    content = file.file.read(50 * 1024 * 1024 + 1)
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Import files must be under 50 MB")
    decoded = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="A CSV header row is required")
    rows = list(reader)
    if not rows:
        return {"created": 0, "merged": 0, "skipped": 0, "errors": [], "failures": []}

    created, merged, skipped = 0, 0, 0
    errors = []
    failures = []

    tenant = session.get(Tenant, tid) if tid else None
    try:
        count = session.exec(select(func.count(model.id)).where(model.tenant_id == tid)).one()
    except Exception:
        count = 0

    # Pre-load in-memory indices for ultra-fast candidate lookup (targeted to batch, avoids loading full tables)
    from sqlalchemy import or_
    existing_contacts_by_email: Dict[str, Contact] = {}
    existing_contacts_by_phone: Dict[str, Contact] = {}
    leads_name_to_id: Dict[str, int] = {}
    clients_name_to_id: Dict[str, int] = {}

    existing_leads_by_email: Dict[str, Lead] = {}
    existing_leads_by_name: Dict[str, Lead] = {}
    existing_leads_by_phone: Dict[str, Lead] = {}

    existing_clients_by_name: Dict[str, ClientProfile] = {}
    existing_clients_by_user_id: Dict[int, ClientProfile] = {}
    users_by_email: Dict[str, User] = {}

    target_space_id = None
    default_lead_status = "New"
    if import_type == "leads":
        if space_id:
            sp = session.get(LeadSpace, space_id)
            if sp and (not tid or sp.tenant_id == tid or sp.tenant_id is None):
                target_space_id = sp.id
                if sp.stages and len(sp.stages) > 0:
                    default_lead_status = sp.stages[0].get("name") or "New"
        if not target_space_id:
            sp = session.exec(select(LeadSpace).where(LeadSpace.tenant_id == tid, LeadSpace.is_default == True)).first()
            if not sp:
                sp = session.exec(select(LeadSpace).where(LeadSpace.tenant_id == tid).order_by(LeadSpace.sort_order, LeadSpace.id)).first()
            if sp:
                target_space_id = sp.id
                if sp.stages and len(sp.stages) > 0:
                    default_lead_status = sp.stages[0].get("name") or "New"

    if import_type == "contacts":
        cand_emails = set()
        cand_phones_raw = set()
        for r in rows:
            for k, v in r.items():
                if not k or not v:
                    continue
                norm_k = re.sub(r'[\s_\-]+', '', str(k).lower())
                canon = ALIASES.get(norm_k)
                if canon == "email":
                    em_k = normalize_email_key(v)
                    if em_k:
                        cand_emails.add(em_k)
                elif canon == "phone":
                    ph_k = normalize_phone_key(v)
                    if ph_k:
                        cand_phones_raw.add(str(v).strip())

        filters = []
        if cand_emails:
            filters.append(func.lower(Contact.email).in_(cand_emails))
        if cand_phones_raw:
            filters.append(Contact.mobile_number.in_(cand_phones_raw))

        if filters:
            base_q = select(Contact)
            if tid:
                base_q = base_q.where(Contact.tenant_id == tid)
            for c in session.exec(base_q.where(or_(*filters))).all():
                em_k = normalize_email_key(c.email)
                if em_k:
                    existing_contacts_by_email[em_k] = c
                ph_k = normalize_phone_key(c.mobile_number)
                if ph_k:
                    existing_contacts_by_phone[ph_k] = c

        for l_id, l_name in session.exec(select(Lead.id, Lead.company_name).where(Lead.tenant_id == tid)).all():
            if l_name:
                leads_name_to_id[l_name.strip().casefold()] = l_id
        for cl_id, cl_name in session.exec(select(ClientProfile.id, ClientProfile.companyName).where(ClientProfile.tenant_id == tid)).all():
            if cl_name:
                clients_name_to_id[cl_name.strip().casefold()] = cl_id

    elif import_type == "leads":
        cand_emails = set()
        cand_names = set()
        cand_phones = set()
        for r in rows:
            for k, v in r.items():
                if not k or not v:
                    continue
                norm_k = re.sub(r'[\s_\-]+', '', str(k).lower())
                canon = ALIASES.get(norm_k)
                if canon == "email":
                    em = str(v).strip().lower()
                    if em: cand_emails.add(em)
                elif canon == "company_name":
                    cn = str(v).strip().casefold()
                    if cn: cand_names.add(cn)
                elif canon == "phone":
                    ph = str(v).strip()
                    if len(ph) >= 7: cand_phones.add(ph)

        filters = []
        if cand_emails:
            filters.append(func.lower(Lead.email).in_(cand_emails))
        if cand_names:
            filters.append(func.lower(Lead.company_name).in_(cand_names))
        if cand_phones:
            filters.append(Lead.phone.in_(cand_phones))
        if filters:
            for l in session.exec(select(Lead).where(Lead.tenant_id == tid, or_(*filters))).all():
                if l.email:
                    existing_leads_by_email[l.email.strip().lower()] = l
                if l.company_name:
                    existing_leads_by_name[l.company_name.strip().casefold()] = l
                if l.phone and len(l.phone.strip()) >= 7:
                    existing_leads_by_phone[l.phone.strip()] = l

    elif import_type == "clients":
        for cl in session.exec(select(ClientProfile).where(ClientProfile.tenant_id == tid)).all():
            if cl.companyName:
                existing_clients_by_name[cl.companyName.strip().casefold()] = cl
            if cl.userId:
                existing_clients_by_user_id[cl.userId] = cl
        for u in session.exec(select(User).where(User.tenant_id == tid)).all():
            if u.email:
                users_by_email[u.email.strip().lower()] = u

    batch_pending = 0
    for number, row in enumerate(rows, start=2):
        try:
            # 1. Map standard recognized fields
            mapped: Dict[str, str] = {}
            # 2. Extract ANY extra columns as custom fields
            custom_fields: Dict[str, Any] = {}

            for raw_key, raw_val in row.items():
                if not raw_key:
                    continue
                header_str = str(raw_key).strip()
                val_str = str(raw_val or "").strip()
                if not val_str:
                    continue
                norm_key = re.sub(r"[^a-z0-9]", "", header_str.lower())
                if norm_key in ALIASES:
                    std_name = ALIASES[norm_key]
                    if std_name not in mapped:
                        mapped[std_name] = val_str
                else:
                    custom_fields[header_str] = val_str

            # Parse tags list
            tags_list: List[str] = []
            if mapped.get("tags"):
                for t in mapped["tags"].replace(";", ",").split(","):
                    t_clean = t.strip()
                    if t_clean and t_clean not in tags_list:
                        tags_list.append(t_clean)

            # Parse created date if provided
            parsed_created = None
            if mapped.get("created_at"):
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
                    try:
                        parsed_created = datetime.strptime(mapped["created_at"].split(".")[0].replace("Z", ""), fmt)
                        break
                    except Exception:
                        pass
                if not parsed_created:
                    custom_fields["created_date"] = mapped["created_at"]

            # Check tenant limit for clients
            if import_type == "clients" and tenant and count >= tenant.limit_clients:
                reason = "Company client record limit reached"
                skipped += 1
                errors.append(f"Row {number}: {reason}")
                failures.append({"row": number, "reason": reason, "data": dict(row)})
                break

            # ── CASE 1: CONTACTS IMPORT ─────────────────────────────────────
            if import_type == "contacts":
                contact_name = mapped.get("name") or f"{mapped.get('first_name', '')} {mapped.get('last_name', '')}".strip()
                email = mapped.get("email", "").strip() or None
                phone = mapped.get("phone", "").strip() or None
                company_name = mapped.get("company_name", "").strip() or None

                if not contact_name and not email and not phone:
                    skipped += 1
                    reason = "A contact name, email, or phone is required"
                    errors.append(f"Row {number}: {reason}")
                    failures.append({"row": number, "reason": reason, "data": dict(row)})
                    continue

                # Split name into first and last
                if contact_name:
                    parts = contact_name.split()
                    first_name = parts[0][:100]
                    last_name = (" ".join(parts[1:]) if len(parts) > 1 else None)
                    if last_name:
                        last_name = last_name[:100]
                    full_name = contact_name[:255]
                else:
                    first_name = ((email.split("@")[0] if email else phone) or "Contact")[:100]
                    last_name = None
                    full_name = first_name[:255]

                if email:
                    email = email[:255]
                if phone:
                    phone = phone[:100]

                # Clean keys for strict duplicate matching
                clean_em = normalize_email_key(email)
                clean_ph = normalize_phone_key(phone)

                # Check for duplicate Contact strictly by verified email or phone
                existing_contact = None
                if clean_em and clean_em in existing_contacts_by_email:
                    existing_contact = existing_contacts_by_email[clean_em]
                elif clean_ph and clean_ph in existing_contacts_by_phone:
                    existing_contact = existing_contacts_by_phone[clean_ph]

                # Link to existing Lead or Client if business name is provided
                linked_lead_id = leads_name_to_id.get(company_name.casefold()) if company_name else None
                linked_client_id = clients_name_to_id.get(company_name.casefold()) if company_name and not linked_lead_id else None
                if company_name and not linked_lead_id and not linked_client_id:
                    custom_fields["business_name"] = company_name

                if mapped.get("last_activity"):
                    custom_fields["last_activity"] = mapped["last_activity"]

                if existing_contact:
                    if duplicate_mode == "merge":
                        changed = False
                        if email and existing_contact.email != email:
                            existing_contact.email = email
                            changed = True
                        if phone and existing_contact.mobile_number != phone:
                            existing_contact.mobile_number = phone
                            changed = True
                        if mapped.get("designation") and existing_contact.designation != mapped["designation"]:
                            existing_contact.designation = mapped["designation"]
                            changed = True
                        if mapped.get("department") and existing_contact.department != mapped["department"]:
                            existing_contact.department = mapped["department"]
                            changed = True
                        if linked_lead_id and existing_contact.lead_id != linked_lead_id:
                            existing_contact.lead_id = linked_lead_id
                            changed = True
                        if linked_client_id and existing_contact.client_id != linked_client_id:
                            existing_contact.client_id = linked_client_id
                            changed = True
                        if tags_list:
                            cur_tags = list(existing_contact.tags or [])
                            tags_updated = False
                            for t in tags_list:
                                if t not in cur_tags:
                                    cur_tags.append(t)
                                    tags_updated = True
                            if tags_updated:
                                existing_contact.tags = cur_tags
                                changed = True
                        if mapped.get("notes"):
                            existing_contact.notes = f"{existing_contact.notes}\n{mapped['notes']}".strip() if existing_contact.notes else mapped["notes"]
                            changed = True
                        if custom_fields:
                            cur_cf = dict(existing_contact.custom_fields or {})
                            cur_cf.update(custom_fields)
                            existing_contact.custom_fields = cur_cf
                            changed = True
                        if changed:
                            session.add(existing_contact)
                        merged += 1
                        batch_pending += 1
                        if batch_pending >= 500:
                            session.commit()
                            batch_pending = 0
                        continue
                    else:
                        skipped += 1
                        reason = f"Duplicate contact '{full_name}' skipped (matching email/phone)"
                        errors.append(f"Row {number}: {reason}")
                        failures.append({"row": number, "reason": reason, "data": dict(row)})
                        continue

                record = Contact(
                    tenant_id=tid,
                    first_name=first_name,
                    last_name=last_name,
                    full_name=full_name,
                    email=email,
                    mobile_number=phone,
                    alternate_number=mapped.get("alternate_number") or None,
                    designation=mapped.get("designation") or None,
                    department=mapped.get("department") or None,
                    linkedin_url=mapped.get("linkedin_url") or None,
                    twitter_url=mapped.get("twitter_url") or None,
                    lead_id=linked_lead_id,
                    client_id=linked_client_id,
                    notes=mapped.get("notes") or None,
                    tags=tags_list,
                    custom_fields=custom_fields,
                    created_at=parsed_created or _utcnow()
                )
                session.add(record)
                if clean_em:
                    existing_contacts_by_email[clean_em] = record
                if clean_ph:
                    existing_contacts_by_phone[clean_ph] = record
                created += 1
                count += 1
                batch_pending += 1
                if batch_pending >= 500:
                    session.commit()
                    batch_pending = 0

            # ── CASE 2: CLIENTS IMPORT ──────────────────────────────────────
            elif import_type == "clients":
                comp_name = mapped.get("company_name") or mapped.get("name")
                if not comp_name:
                    skipped += 1
                    reason = "A company or client name is required"
                    errors.append(f"Row {number}: {reason}")
                    failures.append({"row": number, "reason": reason, "data": dict(row)})
                    continue

                clean_name = comp_name.casefold()
                email = mapped.get("email", "").casefold()
                phone = mapped.get("phone", "").strip()

                existing_client = None
                if clean_name in existing_clients_by_name:
                    existing_client = existing_clients_by_name[clean_name]
                elif email and email in users_by_email:
                    existing_client = existing_clients_by_user_id.get(users_by_email[email].id)

                # Put notes and tags in customFields
                client_cf = dict(custom_fields)
                if mapped.get("notes"):
                    client_cf["notes"] = mapped["notes"]
                if tags_list:
                    client_cf["tags"] = tags_list

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
                        if mapped.get("last_activity"):
                            existing_client.lastActivity = mapped["last_activity"]
                        # Merge custom fields
                        old_cf = dict(existing_client.customFields or {})
                        if mapped.get("notes"):
                            old_notes = old_cf.get("notes", "")
                            client_cf["notes"] = f"{old_notes}\n{mapped['notes']}".strip() if old_notes else mapped["notes"]
                        old_cf.update(client_cf)
                        existing_client.customFields = old_cf

                        session.add(existing_client)
                        merged += 1
                        batch_pending += 1
                        if batch_pending >= 500:
                            session.commit()
                            batch_pending = 0
                        continue
                    else:
                        skipped += 1
                        reason = f"Duplicate client '{comp_name}' skipped"
                        errors.append(f"Row {number}: {reason}")
                        failures.append({"row": number, "reason": reason, "data": dict(row)})
                        continue

                account = None
                if email:
                    if email in users_by_email:
                        account = users_by_email[email]
                    else:
                        account = User(
                            email=email, name=comp_name, role="Client",
                            tenant_id=tid, password=_hash_password(secrets.token_urlsafe(24))
                        )
                        session.add(account)
                        session.flush()
                        users_by_email[email] = account

                record = ClientProfile(
                    tenant_id=tid, userId=account.id if account else None, companyName=comp_name,
                    phone=phone or None, websiteUrl=mapped.get("website") or None,
                    address=mapped.get("address") or None, industry=mapped.get("industry") or None,
                    lead_source=mapped.get("source") or "Import", status=mapped.get("status") or "Active",
                    lastActivity=mapped.get("last_activity") or None,
                    customFields=client_cf
                )
                session.add(record)
                existing_clients_by_name[clean_name] = record
                if account:
                    existing_clients_by_user_id[account.id] = record

            # ── CASE 3: LEADS IMPORT ────────────────────────────────────────
            else:
                lead_name = mapped.get("company_name") or mapped.get("name")
                if not lead_name:
                    skipped += 1
                    reason = "A company or lead name is required"
                    errors.append(f"Row {number}: {reason}")
                    failures.append({"row": number, "reason": reason, "data": dict(row)})
                    continue

                clean_name = lead_name.casefold()
                email = mapped.get("email", "").casefold()
                phone = mapped.get("phone", "").strip()
                website = mapped.get("website", "").strip().lower()

                existing_lead = None
                if email and email in existing_leads_by_email:
                    existing_lead = existing_leads_by_email[email]
                elif clean_name and clean_name in existing_leads_by_name:
                    existing_lead = existing_leads_by_name[clean_name]
                elif phone and len(phone) >= 7 and phone in existing_leads_by_phone:
                    existing_lead = existing_leads_by_phone[phone]

                # Put tags into custom_fields
                lead_cf = dict(custom_fields)
                if tags_list:
                    lead_cf["tags"] = tags_list

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
                        if mapped.get("last_activity"):
                            existing_lead.last_activity = mapped["last_activity"]
                        if mapped.get("notes"):
                            existing_lead.notes = (
                                f"{existing_lead.notes}\n{mapped['notes']}".strip()
                                if existing_lead.notes else mapped["notes"]
                            )
                        # Merge custom fields
                        old_lcf = dict(existing_lead.custom_fields or {})
                        old_lcf.update(lead_cf)
                        existing_lead.custom_fields = old_lcf

                        session.add(existing_lead)
                        merged += 1
                        batch_pending += 1
                        if batch_pending >= 500:
                            session.commit()
                            batch_pending = 0
                        continue
                    else:
                        skipped += 1
                        reason = f"Duplicate lead '{lead_name}' skipped"
                        errors.append(f"Row {number}: {reason}")
                        failures.append({"row": number, "reason": reason, "data": dict(row)})
                        continue

                record = Lead(
                    tenant_id=tid, space_id=target_space_id, company_name=lead_name, email=email or None,
                    phone=phone or None, website=mapped.get("website") or None,
                    industry=mapped.get("industry") or None, source=mapped.get("source") or "Import",
                    status=mapped.get("status") or default_lead_status, address=mapped.get("address") or None,
                    notes=mapped.get("notes") or None,
                    last_activity=mapped.get("last_activity") or None,
                    created_at=parsed_created or _utcnow(),
                    custom_fields=lead_cf
                )
                session.add(record)
                if email:
                    existing_leads_by_email[email] = record
                if clean_name:
                    existing_leads_by_name[clean_name] = record
                if phone and len(phone) >= 7:
                    existing_leads_by_phone[phone] = record

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

    try:
        session.commit()
    except Exception as ex:
        session.rollback()
        errors.append(f"Database commit error: {str(ex)}")
        return {
            "created": created,
            "merged": merged,
            "skipped": skipped,
            "errors": errors,
            "failures": failures or [{"row": 0, "reason": str(ex), "data": {}}],
        }

    return {
        "created": created,
        "merged": merged,
        "skipped": skipped,
        "errors": errors,
        "failures": failures,
    }
