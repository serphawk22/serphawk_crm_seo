"""
Lead Duplicate Detection & Resolution Engine
Searches for existing leads matching email or phone number.
Provides clear diffing between incoming lead and existing record,
and supports:
1. Merge (add new/missing information to existing lead)
2. Replace (delete/recycle old lead and create fresh new lead)
3. Create Anyway (force creation as separate lead)
"""
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import func
from sqlmodel import Session, select
from database import Lead, User, ActivityLog, Contact, ContactLeadLink, DeletedRecord


def normalize_email(email: Optional[str]) -> str:
    if not email:
        return ""
    return email.strip().lower()


def normalize_phone_digits(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    # Strip leading zero if present
    if digits.startswith("0") and len(digits) > 7:
        digits = digits[1:]
    return digits


def phones_match(p1: Optional[str], p2: Optional[str]) -> bool:
    d1 = normalize_phone_digits(p1)
    d2 = normalize_phone_digits(p2)
    if not d1 or not d2:
        return False
    if len(d1) < 7 or len(d2) < 7:
        return d1 == d2
    # Match last 10 or 8 digits to account for country codes (+1, +52, +91 etc.)
    tail1 = d1[-10:] if len(d1) >= 10 else d1
    tail2 = d2[-10:] if len(d2) >= 10 else d2
    return tail1 == tail2 or d1 in d2 or d2 in d1


def find_duplicate_leads(
    session: Session,
    tenant_id: Optional[int],
    email: Optional[str],
    phone: Optional[str],
    exclude_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    clean_email = normalize_email(email)
    clean_phone_digits = normalize_phone_digits(phone)

    if not clean_email and not clean_phone_digits:
        return []

    query = select(Lead)
    if tenant_id:
        query = query.where(Lead.tenant_id == tenant_id)
    if exclude_id:
        query = query.where(Lead.id != exclude_id)

    all_leads = session.exec(query).all()
    results = []

    for l in all_leads:
        match_email = bool(clean_email and l.email and normalize_email(l.email) == clean_email)
        match_phone = bool(clean_phone_digits and l.phone and phones_match(phone, l.phone))

        if match_email or match_phone:
            match_reasons = []
            if match_email:
                match_reasons.append("email")
            if match_phone:
                match_reasons.append("phone")

            owner_name = None
            if l.owner_id:
                owner = session.get(User, l.owner_id)
                if owner:
                    owner_name = owner.name

            results.append({
                "id": l.id,
                "company_name": l.company_name,
                "email": l.email,
                "phone": l.phone,
                "website": l.website,
                "status": l.status,
                "is_converted": l.is_converted,
                "source": l.source,
                "industry": l.industry,
                "address": l.address,
                "city": l.city,
                "country": l.country,
                "owner_id": l.owner_id,
                "owner_name": owner_name,
                "notes": l.notes,
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "match_reason": "both" if len(match_reasons) > 1 else match_reasons[0]
            })

    return results


def calculate_lead_diff(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes additions (what incoming brings that existing lacked)
    and differences (where incoming value conflicts/updates existing).
    """
    additions = []
    differences = []

    fields_to_check = [
        ("website", "Website"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("address", "Address"),
        ("city", "City"),
        ("country", "Country"),
        ("industry", "Industry"),
        ("source", "Lead Source"),
    ]

    for key, label in fields_to_check:
        in_val = (incoming.get(key) or "").strip() if isinstance(incoming.get(key), str) else incoming.get(key)
        ex_val = (existing.get(key) or "").strip() if isinstance(existing.get(key), str) else existing.get(key)

        if in_val and not ex_val:
            additions.append({
                "field": key,
                "label": label,
                "new_value": in_val
            })
        elif in_val and ex_val and str(in_val).lower() != str(ex_val).lower():
            differences.append({
                "field": key,
                "label": label,
                "old_value": ex_val,
                "new_value": in_val
            })

    # Contact person check
    contact_addition = None
    if incoming.get("add_contact") or incoming.get("contact_name"):
        c_name = (incoming.get("contact_name") or "").strip()
        c_email = (incoming.get("contact_email") or "").strip()
        c_phone = (incoming.get("contact_phone") or "").strip()
        c_role = (incoming.get("contact_designation") or "Key Decision Maker").strip()
        if c_name:
            contact_addition = {
                "name": c_name,
                "designation": c_role,
                "email": c_email or incoming.get("email"),
                "phone": c_phone or incoming.get("phone"),
            }

    # Notes addition check
    notes_addition = None
    in_notes = (incoming.get("notes") or "").strip()
    ex_notes = (existing.get("notes") or "").strip()
    if in_notes and in_notes not in ex_notes:
        notes_addition = in_notes

    return {
        "additions": additions,
        "differences": differences,
        "contact_addition": contact_addition,
        "notes_addition": notes_addition
    }


def merge_into_existing_lead(
    session: Session,
    existing_id: int,
    incoming: Dict[str, Any],
    actor_id: Optional[int] = None
) -> Lead:
    """
    Applies incoming additions to the existing lead record.
    Fills empty fields, appends notes, creates contact person if requested,
    and logs an activity entry.
    """
    session.info["skip_duplicate_validation"] = True
    lead = session.get(Lead, existing_id)
    if not lead:
        raise ValueError(f"Lead #{existing_id} not found")

    updated_fields = []

    # Update empty or specified fields
    for field in ["website", "email", "phone", "address", "city", "country", "industry", "source"]:
        in_val = incoming.get(field)
        if in_val and isinstance(in_val, str) and in_val.strip():
            in_val = in_val.strip()
            ex_val = getattr(lead, field, None)
            if not ex_val:
                setattr(lead, field, in_val)
                updated_fields.append(field)
            elif field in ["website", "address"] and ex_val != in_val:
                setattr(lead, field, in_val)
                updated_fields.append(field)

    # Append notes
    in_notes = (incoming.get("notes") or "").strip()
    if in_notes:
        now_str = datetime.now(timezone.utc).strftime("%b %d, %Y")
        if lead.notes:
            if in_notes not in lead.notes:
                lead.notes = f"{lead.notes}\n\n[Merged on {now_str}]:\n{in_notes}"
                updated_fields.append("notes")
        else:
            lead.notes = in_notes
            updated_fields.append("notes")

    # Add Contact person if specified
    if incoming.get("add_contact") or incoming.get("contact_name"):
        raw_name = (incoming.get("contact_name") or "").strip()
        if raw_name:
            parts = raw_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else None
            contact_email = (incoming.get("contact_email") or incoming.get("email") or "").strip() or None
            contact_phone = (incoming.get("contact_phone") or incoming.get("phone") or "").strip() or None
            designation = (incoming.get("contact_designation") or "Key Decision Maker").strip()
            department = (incoming.get("contact_department") or "Executive").strip()

            contact = Contact(
                tenant_id=lead.tenant_id,
                first_name=first_name,
                last_name=last_name,
                full_name=raw_name,
                designation=designation,
                department=department,
                email=contact_email,
                mobile_number=contact_phone,
                lead_id=lead.id,
                owner_id=lead.owner_id,
            )
            session.add(contact)
            session.flush()

            link = ContactLeadLink(
                tenant_id=lead.tenant_id,
                contact_id=contact.id,
                lead_id=lead.id,
                role_at_lead=designation
            )
            session.add(link)
            updated_fields.append("contact_person")

    session.add(lead)

    # Log Activity
    summary_txt = f"Merged duplicate submission. Updated fields: {', '.join(updated_fields) if updated_fields else 'confirmed details'}."
    session.add(ActivityLog(
        tenant_id=lead.tenant_id,
        user_id=actor_id,
        action="Lead Duplicate Merged",
        details=summary_txt,
        lead_id=lead.id
    ))

    session.commit()
    session.refresh(lead)
    return lead


def replace_existing_lead(
    session: Session,
    existing_id: int,
    incoming: Dict[str, Any],
    actor_id: Optional[int] = None
) -> Lead:
    """
    Snapshots the old lead to DeletedRecord (Recycle Bin),
    removes it, and creates the incoming lead as fresh record.
    """
    session.info["skip_duplicate_validation"] = True
    old_lead = session.get(Lead, existing_id)
    if not old_lead:
        raise ValueError(f"Lead #{existing_id} not found")

    tenant_id = old_lead.tenant_id

    # 1. Snapshot old lead to recycle bin
    snap = {
        "company_name": old_lead.company_name,
        "website": old_lead.website,
        "email": old_lead.email,
        "phone": old_lead.phone,
        "city": old_lead.city,
        "country": old_lead.country,
        "address": old_lead.address,
        "status": old_lead.status,
        "source": old_lead.source,
        "owner_id": old_lead.owner_id,
        "notes": old_lead.notes,
        "tenant_id": old_lead.tenant_id,
    }
    del_rec = DeletedRecord(
        tenant_id=tenant_id,
        record_type="lead",
        record_id=old_lead.id,
        record_name=old_lead.company_name or f"Lead #{old_lead.id}",
        details={"snapshot": snap, "replaced_by_new_lead": True, "reason": "Duplicate replace"},
        deleted_by_id=actor_id,
    )
    session.add(del_rec)

    # 2. Delete old lead
    session.delete(old_lead)
    session.flush()

    # 3. Create fresh lead
    lead_dict = {k: v for k, v in incoming.items() if k not in {
        "add_contact", "contact_name", "contact_first_name", "contact_last_name",
        "contact_designation", "contact_email", "contact_phone", "contact_department"
    } and hasattr(Lead, k)}
    new_lead = Lead(**lead_dict)
    new_lead.tenant_id = tenant_id
    if not new_lead.owner_id and actor_id:
        new_lead.owner_id = actor_id
    session.add(new_lead)
    session.flush()
    session.refresh(new_lead)

    # 4. Create contact if requested
    if incoming.get("add_contact") or incoming.get("contact_name"):
        raw_name = (incoming.get("contact_name") or "").strip()
        if raw_name:
            parts = raw_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else None
            contact_email = (incoming.get("contact_email") or incoming.get("email") or "").strip() or None
            contact_phone = (incoming.get("contact_phone") or incoming.get("phone") or "").strip() or None
            designation = (incoming.get("contact_designation") or "Key Decision Maker").strip()
            department = (incoming.get("contact_department") or "Executive").strip()

            contact = Contact(
                tenant_id=tenant_id,
                first_name=first_name,
                last_name=last_name,
                full_name=raw_name,
                designation=designation,
                department=department,
                email=contact_email,
                mobile_number=contact_phone,
                lead_id=new_lead.id,
                owner_id=new_lead.owner_id,
            )
            session.add(contact)
            session.flush()

            link = ContactLeadLink(
                tenant_id=tenant_id,
                contact_id=contact.id,
                lead_id=new_lead.id,
                role_at_lead=designation
            )
            session.add(link)

    # Log activity
    session.add(ActivityLog(
        tenant_id=tenant_id,
        user_id=actor_id,
        action="Lead Replaced",
        details=f"Replaced previous lead #{existing_id} ({old_lead.company_name}) with new lead #{new_lead.id}. Old lead archived to recycle bin.",
        lead_id=new_lead.id
    ))

    session.commit()
    session.refresh(new_lead)
    return new_lead
