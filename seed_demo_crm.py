"""Add synthetic CRM and sales-reporting fixtures to an explicitly selected tenant.

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

from database import (
    Account,
    ActivityLog,
    BusinessCost,
    ClientProfile,
    Contact,
    ConversationLog,
    Deal,
    FollowUp,
    Invoice,
    Lead,
    LeadSource,
    Meeting,
    Proposal,
    ProposalComment,
    SalespersonHistory,
    Tenant,
    User,
    engine,
)


STAFF = (
    ("Avery Demo", "demo.avery", "bg-blue-500"),
    ("Jordan Demo", "demo.jordan", "bg-violet-500"),
    ("Casey Demo", "demo.casey", "bg-emerald-500"),
)
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
        "salesperson_history",
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
        for name, slug, _color in STAFF:
            email = f"{slug}+tenant-{tenant_id}@example.invalid"
            user, created = _get_or_create(
                session,
                User,
                tenant_id,
                {"email": email},
                {
                    "name": name,
                    "password": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
                    "hashed_password": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
                    "role": "Employee",
                    "is_active": False,
                    "status": "APPROVED",
                    "timezone": "UTC",
                },
            )
            track("inactive synthetic team members", created)
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
        for index, (company, industry, slug) in enumerate(CLIENTS):
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
            client, created = _get_or_create(
                session,
                ClientProfile,
                tenant_id,
                {"companyName": f"Demo | {company}"},
                {
                    "status": "Active",
                    "assignedEmployeeId": rep.id,
                    "lead_source": "Demo Referral",
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
            clients.append(client)
            accounts.append(account)
        session.flush()

        leads: list[Lead] = []
        for index, (company, industry, slug, source_name) in enumerate(LEADS):
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
                },
            )
            track("leads", created)
            leads.append(lead)
        session.flush()

        contacts: list[Contact] = []
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
            contacts.append(contact)
        session.flush()

        deals: list[Deal] = []
        for index, client in enumerate(clients):
            rep = reps[index % len(reps)]
            stage = DEAL_STAGES[index]
            created_at = _month_start(index % 6)
            deal, created = _get_or_create(
                session,
                Deal,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Opportunity-{index + 1:02d}"},
                {
                    "value": 18000.0 + index * 4200,
                    "final_value": 16500.0 + index * 3900 if stage == "Closed Won" else None,
                    "currency": "USD",
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
        for index in range(6):
            client = clients[index]
            deal = deals[index]
            line_items = [
                {
                    "product_name": "SEO growth program",
                    "description": "Synthetic demo service",
                    "quantity": 1,
                    "unit_price": deal.final_value or deal.value,
                    "currency": "USD",
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
                    "currency": "USD",
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
                        "currency": "USD",
                    }],
                    "currency": "USD",
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

        for index in range(6):
            deal, proposal = deals[index], proposals[index]
            status = ("Paid", "Paid", "Sent", "Overdue", "Partial", "Draft")[index]
            created_at = _month_start(index % 6)
            amount = float(deal.final_value or deal.value)
            invoice, created = _get_or_create(
                session,
                Invoice,
                tenant_id,
                {"invoice_number": f"DEMO-{tenant_id}-INV-{index + 1:04d}"},
                {
                    "client_id": clients[index].id,
                    "proposal_id": proposal.id,
                    "deal_id": deal.id,
                    "amount": amount,
                    "tax": round(amount * 0.08, 2),
                    "total": round(amount * 1.08, 2),
                    "currency": "USD",
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
            contact = contacts[index]
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

        for index in range(6):
            cost_date = _month_start(index).date().isoformat()
            cost, created = _get_or_create(
                session,
                BusinessCost,
                tenant_id,
                {"title": f"DEMO-{tenant_id}-Marketing-{index + 1:02d}"},
                {
                    "category": "Marketing",
                    "amount": 400.0 + index * 75,
                    "currency": "USD",
                    "cost_date": cost_date,
                    "is_recurring": False,
                    "employee_id": reps[index % len(reps)].id,
                    "notes": "Synthetic demonstration reporting cost.",
                    "created_by": reps[index % len(reps)].id,
                },
            )
            track("business cost entries", created)

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
