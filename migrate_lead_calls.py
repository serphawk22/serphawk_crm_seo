

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import inspect, text
from sqlmodel import Session, select

from database import AICall, CallLog, Lead, engine
from modules import lead_calls
from modules.followups_core import as_utc

SIM_PREFIXES = ("AI Pitch Simulation for ", "Pitch Generation for ")
AI_PREFIXES = ("AI Voice Call", "AI Call")


def db_host_info() -> str:
    url = engine.url
    return f"{url.drivername}://{url.host or '(local)'}:{url.port or ''}/{url.database or ''}"


def looks_like_ai_call(summary: Optional[str]) -> bool:
    s = (summary or "").lstrip()
    return s.startswith(AI_PREFIXES)


def sim_entity_name(summary: Optional[str]) -> Optional[str]:
    s = summary or ""
    for prefix in SIM_PREFIXES:
        if s.startswith(prefix):
            return s[len(prefix):] or None
    return None


def parse_dt(value) -> Optional[datetime]:
    """Parse the date formats seen in legacy followup_date columns."""
    if value is None or isinstance(value, datetime):
        return as_utc(value)
    text_value = str(value).strip()
    if not text_value:
        return None
    text_value = text_value.replace("Z", "+00:00")
    try:
        return as_utc(datetime.fromisoformat(text_value))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return as_utc(datetime.strptime(text_value, fmt))
        except ValueError:
            continue
    return None


def normalise_legacy_follow_up(call: AICall) -> Optional[datetime]:
    """Copy old followup_* values to follow_up_* and return the effective due time."""
    needed = bool(call.follow_up_needed or call.followup_needed)
    due = as_utc(call.follow_up_at) or parse_dt(call.followup_date)
    if needed and due is None:
        # A legacy row explicitly marked "needs follow-up" but without a date. Use the
        # same conservative default as the live flow (3 business days after the call).
        extracted = lead_calls.extract_follow_up(
            "follow up", base_at=call.ended_at or call.created_at)
        due = extracted.get("follow_up_at")
    if not needed:
        return None
    call.follow_up_needed = True
    call.followup_needed = True
    call.follow_up_at = due
    call.followup_date = due.isoformat() if due else None
    if not call.follow_up_reason:
        call.follow_up_reason = lead_calls.summary_first_line(
            call.important_notes or call.next_steps or call.summary) or None
    return due


def ensure_columns(session: Session, *, commit: bool = True) -> None:
    """Add the new columns when the app's startup migration has not run yet."""
    insp = inspect(engine)
    if not insp.has_table("ai_calls") or not insp.has_table("leads"):
        return
    existing_ai = {c["name"] for c in insp.get_columns("ai_calls")}
    existing_lead = {c["name"] for c in insp.get_columns("leads")}
    dialect = engine.dialect.name

    def ts() -> str:
        return "TIMESTAMP" if dialect != "sqlite" else "DATETIME"

    statements = []
    if dialect == "postgresql":
        if "lead_id" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id)")
        if "follow_up_needed" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS follow_up_needed BOOLEAN DEFAULT FALSE")
        if "follow_up_at" not in existing_ai:
            statements.append(
                f"ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS follow_up_at {ts()}")
        if "follow_up_reason" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS follow_up_reason TEXT")
        if "follow_up_needed" not in existing_lead:
            statements.append(
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_needed BOOLEAN DEFAULT FALSE")
        if "next_follow_up_at" not in existing_lead:
            statements.append(
                f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at {ts()}")
        if "follow_up_reason" not in existing_lead:
            statements.append(
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_reason TEXT")
        if "last_contact_at" not in existing_lead:
            statements.append(
                f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at {ts()}")
    else:
        # SQLite has no IF NOT EXISTS for ADD COLUMN, but the inspector already told us
        # which columns are missing.
        if "lead_id" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN lead_id INTEGER")
        if "follow_up_needed" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN follow_up_needed BOOLEAN DEFAULT 0")
        if "follow_up_at" not in existing_ai:
            statements.append(
                f"ALTER TABLE ai_calls ADD COLUMN follow_up_at {ts()}")
        if "follow_up_reason" not in existing_ai:
            statements.append(
                "ALTER TABLE ai_calls ADD COLUMN follow_up_reason TEXT")
        if "follow_up_needed" not in existing_lead:
            statements.append(
                "ALTER TABLE leads ADD COLUMN follow_up_needed BOOLEAN DEFAULT 0")
        if "next_follow_up_at" not in existing_lead:
            statements.append(
                f"ALTER TABLE leads ADD COLUMN next_follow_up_at {ts()}")
        if "follow_up_reason" not in existing_lead:
            statements.append(
                "ALTER TABLE leads ADD COLUMN follow_up_reason TEXT")
        if "last_contact_at" not in existing_lead:
            statements.append(
                f"ALTER TABLE leads ADD COLUMN last_contact_at {ts()}")

    if not statements:
        return
    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            if dialect == "postgresql":
                # A live app can hold a short SELECT open; wait instead of failing instantly.
                session.execute(text("SET lock_timeout = '60s'"))
            for statement in statements:
                session.execute(text(statement))
            if commit:
                session.commit()
            print(f"Added missing columns: {len(statements)}"
                  + ("" if commit else " (rolled back after this preview)"))
            return
        except Exception as exc:
            session.rollback()
            if attempt >= attempts:
                raise
            print(
                f"Schema update blocked (attempt {attempt}/{attempts}): {exc}. Retrying...")
            time.sleep(5)


def match_existing_ai_call(row: CallLog, ai_calls: list[AICall]) -> Optional[AICall]:
    """Fallback duplicate check for call logs imported by an older script."""
    row_phone = lead_calls.phone_key(row.phone_number)
    row_time = as_utc(row.createdAt or row.received_at)
    if not row_phone or row_time is None:
        return None
    for call in ai_calls:
        if call.call_log_id == row.id:
            return call
        if lead_calls.phone_key(call.to_number) != row_phone or call.created_at is None:
            continue
        if row.duration_seconds is not None or call.duration_seconds is not None:
            if row.duration_seconds != call.duration_seconds:
                continue
        delta = (row_time - as_utc(call.created_at)).total_seconds()
        if delta < -300:
            continue
        if row.duration_seconds is not None:
            if abs(delta - row.duration_seconds) <= 900:
                return call
        elif delta <= 3600:
            return call
    return None


def call_log_to_ai_call(session: Session, row: CallLog, lead: Optional[Lead]) -> AICall:
    ended_at = as_utc(
        row.createdAt or row.received_at) or datetime.now(timezone.utc)
    started_at = ended_at
    if row.duration_seconds:
        started_at = ended_at - timedelta(seconds=int(row.duration_seconds))
    transcript = lead_calls.normalize_transcript(row.description or [])
    if not transcript and row.description:
        transcript = [{"role": "system", "speaker": "System", "text": row.description,
                       "timestamp": None, "ts": None}]
    name = sim_entity_name(row.summary)
    is_sim = name is not None
    due = parse_dt(row.followup_date)
    call = AICall(
        tenant_id=row.tenant_id,
        lead_id=lead.id if lead else None,
        entity_type="lead" if lead else ("client" if row.client_id else None),
        entity_id=lead.id if lead else row.client_id,
        entity_name=lead.company_name if lead else name,
        to_number=row.phone_number or "Unknown",
        status="completed",
        mode="simulation" if is_sim else "imported",
        summary=row.summary,
        transcript=transcript,
        important_notes=("Simulated AI pitch script generated from the CRM (not a live call)."
                         if is_sim else None),
        next_steps=row.work_done,
        assigned_to=row.assigned_to,
        followup_needed=bool(row.followup_needed),
        followup_date=row.followup_date,
        follow_up_needed=bool(row.followup_needed),
        follow_up_at=due if row.followup_needed else None,
        follow_up_reason=(lead_calls.summary_first_line(
            row.work_done or row.summary) or None) if row.followup_needed else None,
        duration_seconds=row.duration_seconds,
        started_by=None,
        call_log_id=row.id,
        created_at=started_at,
        ended_at=ended_at,
        finalized_at=datetime.now(timezone.utc),
    )
    if row.followup_needed and call.follow_up_at is None:
        normalise_legacy_follow_up(call)
    return call


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Attach existing AI calls to their leads.")
    parser.add_argument("--dry-run", action="store_true",
                        help="preview only (default)")
    parser.add_argument("--yes", action="store_true",
                        help="confirm writing to the database")
    args = parser.parse_args()
    write = args.yes and not args.dry_run

    print("=" * 80)
    print("Link AI calls to leads + migrate legacy Call Logs (no rows are deleted)")
    print(f"Database host : {db_host_info()}")
    print("Mode          :", "WRITE" if write else "DRY RUN")
    print('Backup hint   : pg_dump "$DATABASE_URL" -t ai_calls -t leads -t call_logs > backup.sql')
    print("=" * 80)

    with Session(engine) as session:
        # The app adds these on startup. Run the same additive statements inside this
        # transaction so the script also works before the first restart; a preview rolls
        # the schema change back together with everything else.
        ensure_columns(session, commit=write)

        leads = session.exec(select(Lead)).all()
        calls = session.exec(select(AICall)).all()
        logs = session.exec(select(CallLog)).all()

        leads_by_id = {lead.id: lead for lead in leads}
        linked_log_ids = {
            call.call_log_id for call in calls if call.call_log_id}

        # ── 1. Link existing AI calls ───────────────────────────────────────
        link_updates = 0
        unmatched_calls = []
        follow_up_by_lead: dict[int, tuple[datetime, str, AICall]] = {}
        contact_by_lead: dict[int, tuple[datetime, AICall]] = {}
        linked_before = sum(1 for call in calls if call.lead_id in leads_by_id)

        def remember(lead: Lead, call: AICall) -> None:
            """Track the newest contact and earliest outstanding follow-up per lead."""
            ended = as_utc(call.ended_at or call.created_at)
            if ended:
                previous = contact_by_lead.get(lead.id)
                if previous is None or ended > previous[0]:
                    contact_by_lead[lead.id] = (ended, call)
            due = normalise_legacy_follow_up(call)
            if call.follow_up_needed and due:
                reason = call.follow_up_reason or lead_calls.summary_first_line(
                    call.summary) or ""
                current = follow_up_by_lead.get(lead.id)
                if current is None or due < current[0]:
                    follow_up_by_lead[lead.id] = (due, reason, call)

        for call in calls:
            lead = leads_by_id.get(call.lead_id) if call.lead_id else None
            if lead is None:
                lead = lead_calls.resolve_lead(
                    session,
                    lead_id=call.lead_id,
                    entity_type=call.entity_type,
                    entity_id=call.entity_id,
                    to_number=call.to_number,
                    tenant_id=call.tenant_id,
                )
            if lead is None:
                unmatched_calls.append(call)
                continue
            if call.lead_id != lead.id:
                call.lead_id = lead.id
                link_updates += 1
            # Keep an existing client/contact entity context; only fill a missing one.
            if not call.entity_type:
                call.entity_type = "lead"
                call.entity_id = lead.id
            elif call.entity_type == "lead" and not call.entity_id:
                call.entity_id = lead.id
            if not call.entity_name:
                call.entity_name = lead.company_name
            session.add(call)
            remember(lead, call)

        print(f"\nAI calls scanned           : {len(calls)}")
        print(f"  -> already linked        : {linked_before}")
        print(f"  -> newly linked          : {link_updates}")
        print(f"  -> unmatched (no lead)   : {len(unmatched_calls)}")

        # ── 2. Import legacy AI call logs (never delete the originals) ──────
        to_import: list[tuple[CallLog, Optional[Lead], AICall]] = []
        unmatched_logs = []
        already_in_calls = 0
        non_ai_logs = 0
        for row in logs:
            if row.id in linked_log_ids:
                already_in_calls += 1
                continue
            existing = match_existing_ai_call(row, calls)
            if existing is not None:
                already_in_calls += 1
                if existing.lead_id is None:
                    lead = lead_calls.resolve_lead(
                        session, entity_type=existing.entity_type, entity_id=existing.entity_id,
                        to_number=existing.to_number, tenant_id=existing.tenant_id)
                    if lead is not None:
                        existing.lead_id = lead.id
                        if not existing.entity_type:
                            existing.entity_type = "lead"
                            existing.entity_id = lead.id
                        elif existing.entity_type == "lead" and not existing.entity_id:
                            existing.entity_id = lead.id
                        session.add(existing)
                        remember(lead, existing)
                continue
            if not looks_like_ai_call(row.summary):
                # Manually logged calls are left alone; they are not AI calls.
                non_ai_logs += 1
                continue
            lead = lead_calls.resolve_lead(
                session,
                entity_type="client" if row.client_id else None,
                entity_id=row.client_id,
                to_number=row.phone_number,
                tenant_id=row.tenant_id,
            )
            if lead is None:
                unmatched_logs.append(row)
            ai_call = call_log_to_ai_call(session, row, lead)
            if lead is not None:
                remember(lead, ai_call)
            to_import.append((row, lead, ai_call))

        print(f"\nCall Logs scanned          : {len(logs)}")
        print(f"  -> already in AI Calls   : {already_in_calls}")
        print(f"  -> non-AI / manual       : {non_ai_logs}")
        print(f"  -> will import           : {len(to_import)}")
        print(f"  -> AI call, no lead      : {len(unmatched_logs)}")
        print("  (old Call Logs rows are kept - nothing is deleted)")

        # ── 3. Update lead contact / follow-up fields ───────────────────────
        lead_changes = 0
        for lead_id, (ended, _call) in contact_by_lead.items():
            lead = leads_by_id.get(lead_id)
            if lead is None:
                continue
            previous = as_utc(lead.last_contact_at)
            if previous is None or ended > previous:
                if write:
                    lead.last_contact_at = ended
                    session.add(lead)
                lead_changes += 1

        for lead_id, (due, reason, _call) in follow_up_by_lead.items():
            lead = leads_by_id.get(lead_id)
            if lead is None:
                continue
            # Never overwrite a follow-up a user already has on the lead.
            if lead.follow_up_needed and lead.next_follow_up_at:
                continue
            if write:
                lead.follow_up_needed = True
                lead.next_follow_up_at = due
                lead.follow_up_reason = reason or "Follow-up promised on an AI call."
                session.add(lead)
            lead_changes += 1

        print(f"\nLead field updates         : {lead_changes}")
        print(f"  -> last_contact_at       : {len(contact_by_lead)}")
        print(f"  -> next follow-up        : {len(follow_up_by_lead)}")

        if unmatched_calls or unmatched_logs:
            print("\n-- unmatched calls (fix the lead phone / link manually) --")
            for call in unmatched_calls:
                print(f"  ai_calls#{call.id}: {call.to_number} | {call.status} | "
                      f"{call.entity_name or '(no entity)'} | {call.summary or ''}")
            for row in unmatched_logs:
                print(f"  call_logs#{row.id}: {row.phone_number} | {row.duration_seconds}s | "
                      f"{row.summary or ''}")

        if not write:
            session.rollback()
            print("\nDRY RUN - nothing was written. Re-run with --yes to apply.")
            return 0

        created = 0
        for row, lead, ai_call in to_import:
            session.add(ai_call)
            created += 1
        session.commit()
        # Refresh pre-import rows so the final counts are accurate.
        total_ai = len(session.exec(select(AICall)).all())
        total_logs = len(session.exec(select(CallLog)).all())
        print(f"\nAI calls imported          : {created}")
        print(f"AI calls total now         : {total_ai}")
        print(f"Call Logs rows remaining   : {total_logs}  (unchanged)")
        print(
            f"Unmatched calls            : {len(unmatched_calls) + len(unmatched_logs)}")

    print("\nDone. No Call Logs rows were deleted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
