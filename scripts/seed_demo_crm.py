"""Add synthetic CRM and sales-reporting fixtures to an explicitly selected tenant.

Run from the repo root:  python -m scripts.seed_demo_crm --tenant-id N [--apply] [--allow-non-demo-tenant]


By default this script runs in a transaction and rolls back after previewing.
Pass --apply to persist, and use --allow-non-demo-tenant only for a tenant that
is intentionally being used as a demo environment.
"""
from __future__ import annotations

import argparse
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import inspect
from sqlmodel import Session, select

from addons.business_suite.models import BusinessCost, LeadSource, ProposalComment, SalespersonHistory
from database import (
    Account,
    ActivityLog,
    CallLog,
    ClientNote,
    ClientProfile,
    Contact,
    ConversationLog,
    Deal,
    FollowUp,
    Invoice,
    Lead,
    LeadNote,
    Meeting,
    Proposal,
    SentEmail,
    Task,
    TaskSheetEntry,
    Tenant,
    User,
    engine,
)


STAFF = (
    ("Avery Demo", "demo.avery", "SalesManager"),
    ("Jordan Demo", "demo.jordan", "Employee"),
    ("Casey Demo", "demo.casey", "Employee"),
)
DEMO_ENTITY_COUNT = 40
CLIENTS = (
    ("Northstar Analytics", "Technology", "northstar"),
    ("Cedar & Stone", "Retail", "cedar"),
    ("Bluebird Health", "Healthcare", "bluebird"),
    ("Summit Works", "Manufacturing", "summit"),
    ("Harborlight Finance", "Financial Services", "harborlight"),
    ("BrightPath Learning", "Education", "brightpath"),
)
LEADS = (
    ("Atlas Home Group", "Real Estate", "atlas", "Referral"),
    ("Evergreen Mobility", "Automotive", "evergreen", "Website"),
    ("Copperline Foods", "Food & Beverage", "copperline", "Event"),
    ("Lumen Studio", "Professional Services", "lumen", "Cold Outreach"),
    ("Redwood Supply Co.", "Manufacturing", "redwood", "Referral"),
    ("Openwater Travel", "Travel", "openwater", "Website"),
)
DEAL_STAGES = ("Closed Won", "Closed Won", "Negotiation", "Discovery", "Closed Lost", "Demo")


def _expand_demo_rows(rows: tuple, count: int) -> tuple:
    expanded = list(rows)
    while len(expanded) < count:
        index = len(expanded)
        base = rows[index % len(rows)]
        expanded.append((
            f"{base[0]} Demo {index + 1:02d}",
            base[1],
            f"{base[2]}-demo-{index + 1:02d}",
            *base[3:],
        ))
    return tuple(expanded[:count])


CLIENT_ROWS = _expand_demo_rows(CLIENTS, DEMO_ENTITY_COUNT)
LEAD_ROWS = _expand_demo_rows(LEADS, DEMO_ENTITY_COUNT)


def _month_start(months_ago: int) -> datetime:
    now = datetime.now(timezone.utc)
    month_index = now.year * 12 + now.month - 1 - months_ago
    year, month_zero = divmod(month_index, 12)
    return datetime(year, month_zero + 1, 10, 12, tzinfo=timezone.utc)


def _get_or_create(
    session: Session,
    model: Any,
    tenant_id: int,
    key: dict[str, Any],
    values: dict[str, Any],
) -> tuple[Any, bool]:
    query = select(model).where(model.tenant_id == tenant_id)
    for field, value in key.items():
        query = query.where(getattr(model, field) == value)
    existing = session.exec(query).first()
    if existing:
        return existing, False
    record = model(tenant_id=tenant_id, **key, **values)
    session.add(record)
    session.flush()
    return record, True


def _is_demo_tenant(tenant: Tenant) -> bool:
    return bool(tenant.is_trial) or any(
        "demo" in (value or "").lower()
        for value in (tenant.name, tenant.business_name)
    )


def seed(tenant_id: int, apply: bool, allow_non_demo_tenant: bool) -> None:
    required_tables = (
        "tenants", "users", "client_profiles", "accounts", "contacts", "leads",
        "deals", "proposals", "invoices", "meetings", "follow_ups",
        "conversation_logs", "activity_logs", "lead_sources", "business_costs",
        "salesperson_history", "sent_emails", "call_logs", "tasks",
        "task_sheet_entries", "client_notes", "lead_notes",
    )
    missing_tables = [
        name for name in required_tables if not inspect(engine).has_table(name)
    ]
    if missing_tables:
        raise RuntimeError(
            "Database schema is not initialized; start the application and apply "
            f"migrations first. Missing tables: {', '.join(missing_tables)}"
        )

    with Session(engine) as session:
        tenant = session.get(Tenant, tenant_id)
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} does not exist.")
        if not _is_demo_tenant(tenant) and not allow_non_demo_tenant:
            raise ValueError(
                "Refusing to seed a non-demo tenant. Use a demo/trial tenant or "
                "explicitly pass --allow-non-demo-tenant."
            )

        added: dict[str, int] = {}

        def track(label: str, created: bool) -> None:
            added[label] = added.get(label, 0) + int(created)

        reps: list[User] = []
        for name, slug, role in STAFF:
            email = f"{slug}+tenant-{tenant_id}@example.invalid"
            random_password_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
            user, created = _get_or_create(
                session,
                User,
                tenant_id,
                {"email": email},
                {
                    "name": name,
                    "password": random_password_hash,
                    "hashed_password": random_password_hash,
                    "role": role,
                    "is_active": False,
                    "status": "APPROVED",
                    "timezone": "UTC",
                },
            )
            track("inactive synthetic team members", created)
            if user.role != role or user.is_active:
                user.role = role
                user.is_active = False
                session.add(user)
            reps.append(user)
        session.flush()

        sources: dict[str, LeadSource] = {}
        for name, channel in (
            ("Demo Referral", "Referral"),
            ("Demo Website", "Website"),
            ("Demo Events", "Event"),
            ("Demo Outreach", "Cold Outreach"),
        ):
            source, created = _get_or_create(
                session,
                LeadSource,
                tenant_id,
                {"name": name},
                {
                    "channel": channel,
                    "utm_key": f"demo_{channel.lower().replace(' ', '_')}",
                    "color": "#6366f1",
                    "monthly_cost": 250.0 if channel == "Event" else 50.0,
                    "is_active": True,
                },
            )
            track("lead sources", created)
            sources[channel] = source

        clients: list[ClientProfile] = []
        accounts: list[Account] = []
        for index, (company, industry, slug) in enumerate(CLIENT_ROWS):
            rep = reps[index % len(reps)]
            source_name = LEAD_ROWS[index][3]
            source = sources[source_name]
            client_user_email = f"client-{slug}+tenant-{tenant_id}@example.invalid"
            client_password_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
            client_user, created = _get_or_create(
                session,
                User,
                tenant_id,
                {"email": client_user_email},
                {
                    "name": f"Demo Client {index + 1}",
                    "password": client_password_hash,
                    "hashed_password": client_password_hash,
                    "role": "Client",
                    "is_active": False,
                    "status": "APPROVED",
                    "createdAt": _month_start(index % 6),
                },
            )
            track("inactive synthetic client portal users", created)
            account, created = _get_or_create(
                session,
                Account,
                tenant_id,
                {"company_name": f"Demo | {company}"},
                {
                    "website": f"https://{slug}.example.invalid",
                    "industry": industry,
                    "owner_id": rep.id,
                    "last_activity": "Demo CRM seed record",
                },
            )
            track("accounts", created)
            client, created = _get_or_create(
                session,
                ClientProfile,
                tenant_id,
                {"companyName": f"Demo | {company}"},
                {
                    "userId": client_user.id,
                    "status": "Active",
                    "assignedEmployeeId": rep.id,
                    "lead_source": source.name,
                    "lead_source_id": source.id,
                    "lead_score": 70 + index * 4,
                    "deal_value": 12000 + index * 3500,
                    "industry": industry,
                    "employee_count": ("11-50", "51-200", "201-500")[index % 3],
                    "revenue_range": "$1M-$10M",
                    "contact_person": f"Demo Contact {index + 1}",
                    "websiteUrl": f"https://{slug}.example.invalid",
                    "services_offered": "SEO, content strategy, analytics",
                    "services_requested": "SEO growth program",
                    "lastActivity": "Demo CRM seed record",
                    "lastActivityDate": _month_start(index % 5).date().isoformat(),
                },
            )
            track("clients", created)
            if client.userId != client_user.id:
                client.userId = client_user.id
                session.add(client)
            client.lead_source = source.name
            client.lead_source_id = source.id
            session.add(client)
            clients.append(client)
            accounts.append(account)
        session.flush()

        leads: list[Lead] = []
        for index, (company, industry, slug, source_name) in enumerate(LEAD_ROWS):
            rep = reps[index % len(reps)]
            account, created = _get_or_create(
                session,
                Account,
                tenant_id,
                {"company_name": f"Demo | {company}"},
                {
                    "website": f"https://{slug}.example.invalid",
                    "industry": industry,
                    "owner_id": rep.id,
                    "last_activity": "Demo CRM seed record",
                },
            )
            track("accounts", created)
            lead, created = _get_or_create(
                session,
                Lead,
                tenant_id,
                {"email": f"hello@{slug}.example.invalid"},
                {
                    "company_name": f"Demo | {company}",
                    "website": f"https://{slug}.example.invalid",
                    "industry": industry,
                    "phone": f"+1-555-010-{index + 10:02d}",
                    "source": f"Demo {source_name}",
                    "lead_source_id": sources[source_name].id,
                    "owner_id": rep.id,
                    "status": ("Qualified", "Contacted", "New")[index % 3],
                    "notes": "Synthetic demonstration lead; no real person or business.",
                    "account_id": account.id,
                    "created_at": _month_start(index % 6),
                },
            )
            track("leads", created)
            lead.created_at = _month_start(index % 6)
            lead.owner_id = rep.id
            lead.lead_source_id = sources[source_name].id
            lead.source = f"Demo {source_name}"
            session.add(lead)
            leads.append(lead)
        session.flush()

        for index, client in enumerate(clients):
            note, created = _get_or_create(
                session,
                ClientNote,
                tenant_id,
                {
                    "client_id": client.id,
                    "content": f"DEMO-SEED-v1: client account health review {index + 1:02d}",
                },
                {
                    "tags": ["demo", "account-review"],
                    "is_pinned": index == 0,
                    "author_id": reps[index % len(reps)].id,
                    "author_name": reps[index % len(reps)].name,
                },
            )
            track("client notes", created)

        for index, lead in enumerate(leads):
            note, created = _get_or_create(
                session,
                LeadNote,
                tenant_id,
                {
                    "lead_id": lead.id,
                    "content": f"DEMO-SEED-v1: qualification notes and next steps {index + 1:02d}",
                },
                {
                    "author_id": reps[index % len(reps)].id,
                    "author_name": reps[index % len(reps)].name,
                    "created_at": _month_start(index % 6),
                },
            )
            track("lead notes", created)

        client_contacts: list[Contact] = []
        for index, client in enumerate(clients):
            first_name = f"DemoContact{index + 1}"
            contact, created = _get_or_create(
                session,
                Contact,
                tenant_id,
                {"email": f"contact{index + 1}@client-{tenant_id}.example.invalid"},
                {
                    "first_name": first_name,
                    "last_name": "Example",
                    "full_name": f"{first_name} Example",
                    "designation": ("Marketing Director", "Operations Lead")[index % 2],
                    "department": ("Marketing", "Operations")[index % 2],
                    "mobile_number": f"+1-555-011-{index + 10:02d}",
                    "client_id": client.id,
                    "account_id": accounts[index].id,
                    "owner_id": reps[index % len(reps)].id,
                    "notes": "Synthetic demo contact.",
                    "tags": ["demo", "seed-v1"],
                },
            )
            track("contacts", created)
            client_contacts.append(contact)
        session.flush()

        lead_contacts: list[Contact] = []
        for index, lead in enumerate(leads):
            first_name = f"LeadContact{index + 1}"
            contact, created = _get_or_create(
                session,
                Contact,
                tenant_id,
                {"email": f"leadcontact{index + 1}@lead-{tenant_id}.example.invalid"},
                {
                    "first_name": first_name,
                    "last_name": "Example",
                    "full_name": f"{first_name} Example",
                    "designation": ("Founder", "Marketing Manager", "Operations Director")[index % 3],
                    "department": ("Leadership", "Marketing", "Operations")[index % 3],
                    "mobile_number": f"+1-555-012-{index + 10:02d}",
                    "lead_id": lead.id,
                    "account_id": lead.account_id,
                    "owner_id": reps[index % len(reps)].id,
                    "notes": "Synthetic demo lead contact.",
                    "tags": ["demo", "lead", "seed-v1"],
                },
            )
            track("lead contacts", created)
            lead_contacts.append(contact)
        session.flush()

        conversion_count = max(2, len(leads) // 5)
        for index, lead in enumerate(leads[:conversion_count]):
            lead.is_converted = True
            lead.status = "Converted"
            lead.converted_client_id = clients[index].id
            lead.account_id = accounts[index].id
            session.add(lead)

        deals: list[Deal] = []
        for index, client in enumerate(clients):
            rep = reps[index % len(reps)]
            stage = DEAL_STAGES[index % len(DEAL_STAGES)]
            created_at = _month_start(index % 6)
            deal, created = _get_or_create(
                session,
                Deal,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Opportunity-{index + 1:02d}"},
                {
                    "value": 18000.0 + index * 4200,
                    "final_value": 16500.0 + index * 3900 if stage == "Closed Won" else None,
                    "currency": "INR",
                    "client_id": client.id,
                    "assigned_to": rep.id,
                    "stage": stage,
                    "expected_close_date": (created_at + timedelta(days=45)).date().isoformat(),
                    "won_at": created_at if stage == "Closed Won" else None,
                    "created_at": created_at,
                    "updated_at": created_at,
                },
            )
            track("deals", created)
            deals.append(deal)
        session.flush()

        proposals: list[Proposal] = []
        for index, (client, deal) in enumerate(zip(clients, deals)):
            line_items = [
                {
                    "product_name": "SEO growth program",
                    "description": "Synthetic demo service",
                    "quantity": 1,
                    "unit_price": deal.final_value or deal.value,
                    "currency": "INR",
                }
            ]
            proposal, created = _get_or_create(
                session,
                Proposal,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Proposal-{index + 1:02d}"},
                {
                    "client_id": client.id,
                    "deal_id": deal.id,
                    "recipient_type": "client",
                    "content": "Synthetic demonstration proposal.",
                    "line_items": line_items,
                    "currency": "INR",
                    "status": ("Accepted", "Sent", "Draft")[index % 3],
                    "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat(),
                    "total_value": deal.final_value or deal.value,
                    "created_by": reps[index % len(reps)].id,
                },
            )
            track("proposals", created)
            proposals.append(proposal)
        for index, lead in enumerate(leads[:2]):
            proposal, created = _get_or_create(
                session,
                Proposal,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Lead-Proposal-{index + 1:02d}"},
                {
                    "lead_id": lead.id,
                    "recipient_type": "lead",
                    "content": "Synthetic proposal shared with a demo lead.",
                    "line_items": [{
                        "product_name": "Lead qualification and SEO plan",
                        "description": "Synthetic demo service",
                        "quantity": 1,
                        "unit_price": 9500.0 + index * 1500,
                        "currency": "INR",
                    }],
                    "currency": "INR",
                    "status": "Sent" if index == 0 else "Draft",
                    "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat(),
                    "total_value": 9500.0 + index * 1500,
                    "created_by": reps[index % len(reps)].id,
                },
            )
            track("lead proposals", created)
            proposals.append(proposal)
        session.flush()

        for index, proposal in enumerate(proposals):
            comment, created = _get_or_create(
                session,
                ProposalComment,
                tenant_id,
                {
                    "proposal_id": proposal.id,
                    "author_name": "Demo Client Contact",
                    "content": (
                        "Could you share the onboarding timeline?"
                        if index % 2 == 0
                        else "The scope looks good; please confirm the next steps."
                    ),
                },
                {"author_type": "client"},
            )
            track("proposal discussion comments", created)

        invoice_statuses = ("Paid", "Paid", "Sent", "Overdue", "Partial", "Draft")
        for index, (client, deal, proposal) in enumerate(zip(clients, deals, proposals)):
            status = invoice_statuses[index % len(invoice_statuses)]
            created_at = _month_start(index % 6)
            amount = float(deal.final_value or deal.value)
            invoice, created = _get_or_create(
                session,
                Invoice,
                tenant_id,
                {"invoice_number": f"DEMO-{tenant_id}-INV-{index + 1:04d}"},
                {
                    "client_id": client.id,
                    "proposal_id": proposal.id,
                    "deal_id": deal.id,
                    "amount": amount,
                    "tax": round(amount * 0.08, 2),
                    "total": round(amount * 1.08, 2),
                    "currency": "INR",
                    "status": status,
                    "due_date": (created_at + timedelta(days=30)).date().isoformat(),
                    "notes": "Synthetic demonstration invoice.",
                    "line_items": proposal.line_items,
                    "paid_at": created_at if status == "Paid" else None,
                    "created_at": created_at,
                    "updated_at": created_at,
                },
            )
            track("invoices", created)

        for index, lead in enumerate(leads):
            contact = lead_contacts[index]
            rep = reps[index % len(reps)]
            when = _month_start(index % 6)
            meeting, created = _get_or_create(
                session,
                Meeting,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Meeting-{index + 1:02d}"},
                {
                    "description": "Synthetic discovery/demo meeting.",
                    "meeting_type": ("Discovery", "Demo", "Follow-up")[index % 3],
                    "status": ("Completed", "Scheduled")[index % 2],
                    "scheduled_at": when,
                    "duration_minutes": 30 + (index % 3) * 15,
                    "host_id": rep.id,
                    "created_by": rep.id,
                    "lead_id": lead.id,
                    "contact_id": contact.id,
                    "attendees": [contact.full_name or contact.first_name],
                    "notes": "Synthetic demo activity.",
                    "outcome": "Next steps agreed" if index % 2 == 0 else None,
                },
            )
            track("meetings", created)
            follow_up, created = _get_or_create(
                session,
                FollowUp,
                tenant_id,
                {"source_ref": f"demo-seed-v1:followup-{index + 1:02d}"},
                {
                    "lead_id": lead.id,
                    "contact_name": contact.full_name or contact.first_name,
                    "contact_email": contact.email,
                    "company_name": lead.company_name,
                    "title": f"DEMO-{tenant_id}-Follow-up-{index + 1:02d}",
                    "notes": "Synthetic follow-up to support CRM workflow demos.",
                    "channel": ("email", "call", "meeting")[index % 3],
                    "due_at": when + timedelta(days=14),
                    "status": "Completed" if index % 2 == 0 else "Pending",
                    "priority": ("high", "medium", "low")[index % 3],
                    "source": "manual",
                    "assigned_to": rep.id,
                    "created_by": rep.id,
                    "completed_at": when if index % 2 == 0 else None,
                },
            )
            track("follow-ups", created)
            conversation, created = _get_or_create(
                session,
                ConversationLog,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Conversation-{index + 1:02d}"},
                {
                    "lead_id": lead.id,
                    "type": ("call", "email", "meeting")[index % 3],
                    "description": "Synthetic CRM conversation for demonstration.",
                    "author_id": rep.id,
                    "author_name": rep.name,
                },
            )
            track("conversation logs", created)
            activity, created = _get_or_create(
                session,
                ActivityLog,
                tenant_id,
                {
                    "action": f"DEMO-SEED-v1: activity {index + 1:02d}",
                    "lead_id": lead.id,
                },
                {
                    "userId": rep.id,
                    "clientId": clients[index].id,
                    "method": ("Email", "Phone", "In-person")[index % 3],
                    "content": "Synthetic demonstration activity.",
                    "createdAt": when,
                },
            )
            track("activity log entries", created)
            history, created = _get_or_create(
                session,
                SalespersonHistory,
                tenant_id,
                {
                    "client_id": clients[index].id,
                    "reason": f"DEMO-SEED-v1: assignment {index + 1:02d}",
                },
                {
                    "to_user_id": rep.id,
                    "to_user_name": rep.name,
                    "reassigned_by": rep.id,
                    "reassigned_at": when,
                },
            )
            track("sales assignment history entries", created)

        for month_index in range(6):
            work_datetime = _month_start(month_index)
            work_date = work_datetime.date().isoformat()
            for rep_index, rep in enumerate(reps):
                record_index = (month_index * len(reps) + rep_index) % len(leads)
                lead = leads[record_index]
                client = clients[record_index]
                sent_email, created = _get_or_create(
                    session,
                    SentEmail,
                    tenant_id,
                    {
                        "to_email": lead.email,
                        "subject": f"DEMO-{tenant_id}-Outreach-{month_index + 1:02d}-{rep_index + 1:02d}",
                    },
                    {
                        "client_id": client.id,
                        "lead_id": lead.id,
                        "english_body": "Synthetic demo outreach record; no email was sent.",
                        "recommended_services": "SEO growth program",
                        "manual": True,
                        "status": ("Opened", "Replied", "Sent")[rep_index],
                        "sent_at": work_datetime,
                        "opened_at": work_datetime + timedelta(hours=2) if rep_index == 0 else None,
                        "last_opened_at": work_datetime + timedelta(hours=3) if rep_index == 0 else None,
                        "open_count": 2 if rep_index == 0 else 0,
                        "replied_at": work_datetime + timedelta(days=1) if rep_index == 1 else None,
                        "reply_from": lead.email if rep_index == 1 else None,
                        "reply_subject": "Re: Demo outreach" if rep_index == 1 else None,
                        "reply_body": "Please send the proposal." if rep_index == 1 else None,
                    },
                )
                track("synthetic sent-email report records (not actually sent)", created)

                call, created = _get_or_create(
                    session,
                    CallLog,
                    tenant_id,
                    {
                        "phone_number": lead.phone,
                        "summary": f"DEMO-{tenant_id}-Call-{month_index + 1:02d}-{rep_index + 1:02d}",
                        "createdAt": work_datetime,
                    },
                    {
                        "received_at": work_datetime,
                        "duration_seconds": 180 + rep_index * 90,
                        "description": "Synthetic demo sales call record; no call was placed.",
                        "work_done": "Discussed goals, qualification and next steps.",
                        "assigned_to": rep.name,
                        "followup_needed": rep_index != 2,
                        "followup_date": (work_datetime + timedelta(days=7)).date().isoformat(),
                        "client_id": client.id,
                    },
                )
                track("synthetic call-report records (no calls placed)", created)

                task, created = _get_or_create(
                    session,
                    Task,
                    tenant_id,
                    {"title": f"DEMO-{tenant_id}-Task-{month_index + 1:02d}-{rep_index + 1:02d}"},
                    {
                        "description": "Synthetic sales follow-up task.",
                        "status": ("Done", "InProgress", "Todo")[rep_index],
                        "priority": ("High", "Medium", "Low")[rep_index],
                        "due_date": (work_datetime + timedelta(days=10)).date().isoformat(),
                        "client_id": client.id,
                        "lead_id": lead.id,
                        "assigned_to": rep.id,
                        "created_by": rep.id,
                        "created_at": work_datetime,
                        "updated_at": work_datetime,
                    },
                )
                track("sales tasks", created)

                task_entry, created = _get_or_create(
                    session,
                    TaskSheetEntry,
                    tenant_id,
                    {
                        "user_id": rep.id,
                        "work_date": work_date,
                    },
                    {
                        "area": "Sales",
                        "summary": f"DEMO-{tenant_id}-Worklog-{month_index + 1:02d}-{rep_index + 1:02d}: CRM outreach, qualification and follow-up.",
                        "status": "Done" if rep_index != 1 else "InProgress",
                        "time_spent_minutes": 45 + rep_index * 15,
                        "follow_up_date": (work_datetime + timedelta(days=7)).date().isoformat(),
                        "completion_date": work_date if rep_index != 1 else None,
                        "created_at": work_datetime,
                        "updated_at": work_datetime,
                    },
                )
                track("sales report worklog entries", created)

                activity, created = _get_or_create(
                    session,
                    ActivityLog,
                    tenant_id,
                    {
                        "action": f"DEMO-SEED-v1: monthly activity {month_index + 1:02d}-{rep_index + 1:02d}",
                        "lead_id": lead.id,
                    },
                    {
                        "userId": rep.id,
                        "clientId": client.id,
                        "method": ("Email", "Phone", "In-person")[rep_index],
                        "content": "Synthetic monthly sales activity for performance reports.",
                        "createdAt": work_datetime,
                    },
                )
                track("monthly sales activities", created)

        for month_index in range(6):
            cost_date = _month_start(month_index).date().isoformat()
            cost, created = _get_or_create(
                session,
                BusinessCost,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Marketing-{month_index + 1:02d}"},
                {
                    "category": "Marketing",
                    "amount": 400.0 + month_index * 75,
                    "currency": "INR",
                    "cost_date": cost_date,
                    "is_recurring": False,
                    "employee_id": reps[month_index % len(reps)].id,
                    "notes": "Synthetic demonstration reporting cost.",
                    "created_by": reps[month_index % len(reps)].id,
                },
            )
            track("business cost entries", created)
            for rep_index, rep in enumerate(reps):
                salary, created = _get_or_create(
                    session,
                    BusinessCost,
                    tenant_id,
                    {
                        "title": f"DEMO-{tenant_id}-Salary-{month_index + 1:02d}-{rep_index + 1:02d}",
                    },
                    {
                        "category": "Salary",
                        "amount": 1200.0 + rep_index * 150,
                        "currency": "INR",
                        "cost_date": cost_date,
                        "is_recurring": False,
                        "employee_id": rep.id,
                        "notes": "Synthetic demo staffing cost for sales performance reporting.",
                        "created_by": rep.id,
                    },
                )
                track("sales salary cost entries", created)

        print(f"Tenant: {tenant.name} (id={tenant.id})")
        print(f"Mode: {'APPLY' if apply else 'DRY RUN — rollback'}")
        for label, count in sorted(added.items()):
            print(f"  {label}: {count} new")
        if apply:
            session.commit()
            print("Demo CRM data committed.")
        else:
            session.rollback()
            print("No data was committed. Re-run with --apply to persist.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", type=int, required=True)
    parser.add_argument("--apply", action="store_true", help="Commit the seed records.")
    parser.add_argument(
        "--allow-non-demo-tenant",
        action="store_true",
        help="Explicitly permit using a tenant not marked trial/demo.",
    )
    args = parser.parse_args()
    seed(args.tenant_id, args.apply, args.allow_non_demo_tenant)


if __name__ == "__main__":
    main()
