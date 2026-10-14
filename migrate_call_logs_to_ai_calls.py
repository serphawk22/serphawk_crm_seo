"""
One-off migration: empty `call_logs` by moving everything into `ai_calls`.

Goal
----
"Call Logs" should contain no records; every call record lives under "AI Calls".

What it does
------------
* Rows already represented by an AICall (an AICall.call_log_id points at them) are just removed
  from call_logs - no duplicate is created.
* "Simulate Call" pitch scripts ("AI Pitch Simulation for X" / "Pitch Generation for X") are not
  real calls, but they are surfaced under AI Calls as records (mode="simulation").
* Any remaining row is imported the same way, so nothing is left behind.
* `ai_calls.call_log_id` is nulled first (the FK is NO ACTION), otherwise deleting call_logs rows
  would violate the constraint.
* The whole call_logs table is emptied.

Safety / idempotency
--------------------
* `--dry-run` writes nothing and prints exactly what it would create/delete.
* Re-running is safe: a row whose (summary, created_at) already exists in ai_calls is not
  re-created.
* THIS MAY BE THE SHARED PRODUCTION DATABASE. It prints the DB host and refuses to write
  without `--yes`. Back up first, e.g.:
      pg_dump "$DATABASE_URL" -t call_logs -t ai_calls > backup_before_clear.sql

Usage:
    python migrate_call_logs_to_ai_calls.py --dry-run
    python migrate_call_logs_to_ai_calls.py --yes
"""

import argparse
import re
import sys
from datetime import datetime, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from database import engine, CallLog, AICall

SIM_PREFIXES = ("AI Pitch Simulation for ", "Pitch Generation for ")

_AI_CALL_COLUMN_STATEMENTS = (
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS important_notes TEXT;",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS followup_needed BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS followup_date VARCHAR(50);",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;",
)


def db_host_info() -> str:
    url = engine.url
    return f"{url.drivername}://{url.host or '(local)'}:{url.port or ''}/{url.database or ''}"


def ensure_ai_call_columns() -> None:
    with engine.connect() as conn:
        for sql in _AI_CALL_COLUMN_STATEMENTS:
            conn.execute(text(sql))
        conn.commit()


def looks_like_ai_voice(summary) -> bool:
    s = (summary or "").lstrip()
    return s.startswith("AI Voice Call") or s.startswith("AI Call")


def sim_entity_name(summary):
    s = summary or ""
    for prefix in SIM_PREFIXES:
        if s.startswith(prefix):
            return s[len(prefix):] or None
    return None


def parse_transcript_text(description):
    """Turn a stored CallLog.description ("AI: ...", "Client: ...") back into transcript turns."""
    turns = []
    role_map = {"AI": "ai", "Agent": "agent", "Client": "client"}
    for line in (description or "").splitlines():
        if ":" not in line:
            continue
        who, _, body = line.partition(":")
        role = role_map.get(who.strip())
        if role and body.strip():
            turns.append({"role": role, "text": body.strip()})
    return turns


def digits(value) -> str:
    return re.sub(r"\D", "", value or "")


def match_existing_ai_call(row, ai_calls):
    """An AICall that already represents this call_logs row (same phone + duration + time).

    A call_logs row is written when a call *ends*, while AICall.created_at is when it was *dialed*,
    so the log time should be roughly dial time + duration. Same heuristic the original
    migrate_ai_calls.py uses so already-migrated rows are not duplicated.
    """
    row_phone = digits(row.phone_number)
    row_time = row.createdAt or row.received_at
    if not row_phone or row_time is None:
        return None
    for a in ai_calls:
        if digits(a.to_number) != row_phone:
            continue
        if a.created_at is None:
            continue
        if row.duration_seconds is not None or a.duration_seconds is not None:
            if row.duration_seconds != a.duration_seconds:
                continue
        delta = (row_time - a.created_at).total_seconds()
        if delta < -300:  # call log predates the call start: definitely not this call
            continue
        if row.duration_seconds is not None:
            if abs(delta - row.duration_seconds) <= 900:
                return a
        elif delta <= 3600:
            return a
    return None


def main():
    parser = argparse.ArgumentParser(description="Empty call_logs by moving everything to ai_calls.")
    parser.add_argument("--dry-run", action="store_true", help="show what would change, write nothing")
    parser.add_argument("--yes", action="store_true", help="confirm writing to the database")
    args = parser.parse_args()

    print("=" * 78)
    print("Move ALL call_logs rows into ai_calls (call_logs ends empty)")
    print(f"Database host : {db_host_info()}")
    print('REMINDER      : back up first, e.g. pg_dump "$DATABASE_URL" -t call_logs -t ai_calls > backup.sql')
    print("=" * 78)

    if not args.dry_run and not args.yes:
        print("\nRefusing to write without --yes. Re-run with --dry-run to preview, or --yes to apply.")
        return 1

    if not args.dry_run:
        ensure_ai_call_columns()

    with Session(engine) as session:
        logs = session.exec(select(CallLog)).all()
        ai_calls = session.exec(select(AICall)).all()
        linked_ids = {a.call_log_id for a in ai_calls if a.call_log_id}
        existing_keys = {(a.summary, a.created_at) for a in ai_calls}

        to_import = []  # (row, entity_name_from_summary)
        skipped = []    # rows already represented by an AICall
        for row in logs:
            if row.id in linked_ids:
                skipped.append(row)
                continue
            if looks_like_ai_voice(row.summary) and match_existing_ai_call(row, ai_calls) is not None:
                skipped.append(row)
                continue
            to_import.append((row, sim_entity_name(row.summary)))

        ai_voice = sum(1 for r in logs if looks_like_ai_voice(r.summary))
        print(f"\ncall_logs rows scanned     : {len(logs)}")
        print(f"  -> AI-voice-prefixed     : {ai_voice}")
        print(f"  -> simulation/other      : {len(to_import)}")
        print(f"Already represented (skip) : {len(skipped)}")
        print(f"Would create new AICalls   : {len(to_import)}")
        print(f"Would delete call_logs row : {len(logs)}  (all)")

        if to_import:
            print("\n-- rows that would become AI Calls --")
            for row, name in to_import:
                print(f"  call_logs#{row.id}: {row.phone_number} | {row.duration_seconds}s | "
                      f"{name or row.client_id or '(no entity)'} | {row.summary}")

        if args.dry_run:
            print("\nDRY RUN - nothing was written.")
            return 0

        # ── Apply ────────────────────────────────────────────────────────────
        created = 0
        for row, name in to_import:
            started = row.createdAt or row.received_at
            key = (row.summary, started)
            if key in existing_keys:
                continue
            talk = parse_transcript_text(row.description)
            if not talk and row.description:
                talk = [{"role": "ai", "text": row.description}]
            is_sim = name is not None
            session.add(AICall(
                tenant_id=row.tenant_id,
                entity_type="client" if row.client_id else None,
                entity_id=row.client_id,
                entity_name=name,
                to_number=row.phone_number or "Unknown",
                status="completed",
                mode="simulation" if is_sim else "imported",
                summary=row.summary,
                transcript=talk or [],
                important_notes=("Simulated AI pitch script generated from the CRM (not a live call)."
                                 if is_sim else None),
                next_steps=row.work_done,
                assigned_to=row.assigned_to,
                followup_needed=bool(row.followup_needed),
                followup_date=row.followup_date,
                duration_seconds=row.duration_seconds,
                created_at=started,
                ended_at=started,
                finalized_at=datetime.now(timezone.utc),
            ))
            existing_keys.add(key)
            created += 1

        # Sever the FK link (ai_calls.call_log_id -> call_logs.id) before deleting.
        unlinked = 0
        for a in ai_calls:
            if a.call_log_id is not None:
                a.call_log_id = None
                session.add(a)
                unlinked += 1
        session.commit()

        # Empty call_logs.
        deleted = 0
        for row in logs:
            db_row = session.get(CallLog, row.id)
            if db_row is not None:
                session.delete(db_row)
                deleted += 1
        session.commit()

        remaining = session.exec(select(CallLog)).all()
        total_ai = len(session.exec(select(AICall)).all())
        print(f"\nAICalls created            : {created}")
        print(f"AICalls unlinked           : {unlinked}")
        print(f"call_logs rows deleted     : {deleted}")
        print(f"call_logs rows remaining   : {len(remaining)}")
        print(f"ai_calls total now         : {total_ai}")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
