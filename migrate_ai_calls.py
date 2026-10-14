"""
One-off migration: move AI voice agent calls out of the normal call log and into AICall records.

Before this change the voice agent wrote a *CallLog* row (prefixed "AI Voice Call â€” <name>: ..."),
so AI calls showed up under "Calls Logged" and the "AI Calls" tab showed 0. This script copies
those rows into `ai_calls` (with important_notes generated from the stored transcript and the
garbled em dash fixed), then hides the originals so the Calls Logged counts drop.

Safety / idempotency
--------------------
* Only rows the voice agent created are touched:
    - call_logs rows linked from an AICall.call_log_id, or
    - call_logs rows whose summary starts with the "AI Voice Call" prefix (including the
      double-encoded mojibake variant).
  Manually logged calls are never touched.
* Rows already represented by an AICall (linked, or matching phone + duration) are skipped, and
  duplicate rows for the same call collapse into one AICall.
* Originals are hidden with an existing soft-delete/flag column when this schema has one;
  otherwise they are hard-deleted, and ONLY when --yes is passed.
* Re-running is safe: hidden / deleted originals are not processed again, and existing
  important_notes are never overwritten.

THIS MAY BE THE SHARED PRODUCTION DATABASE. The script prints the DB host first and refuses to
write without --yes. Back up first — e.g.:

    pg_dump "$DATABASE_URL" -t call_logs -t ai_calls > backup_ai_calls.sql

Usage:
    python migrate_ai_calls.py --dry-run       # show counts and the rows it would move
    python migrate_ai_calls.py --yes           # apply
    python migrate_ai_calls.py --yes --no-generate-notes
    python migrate_ai_calls.py --yes --limit 50
"""

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect, text
from sqlmodel import Session, select

from database import engine, CallLog, AICall, ClientProfile
from modules import voice_agent as va

# "AI Voice Call â€” " (mojibake) still starts with "AI Voice Call" after latin-1 repair.
SOFT_DELETE_CANDIDATES = (
    "is_deleted", "deleted", "deleted_at", "is_archived", "archived", "archived_at",
    "is_hidden", "hidden", "hidden_at", "is_trashed", "trashed", "trashed_at",
)


def db_host_info() -> str:
    url = engine.url
    return f"{url.drivername}://{url.host or '(local)'}:{url.port or ''}/{url.database or ''}"


# Same idempotent statements the app's startup migration runs; applied here too so the script can
# safely write even if the server has not been restarted yet. Only run in write mode (after --yes).
_AI_CALL_COLUMN_STATEMENTS = (
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS important_notes TEXT;",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS followup_needed BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS followup_date VARCHAR(50);",
    "ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;",
)

# Columns the migration reads. Missing ones (before deploy) simply resolve to None.
_AI_CALL_READ_COLUMNS = (
    "id", "call_log_id", "to_number", "from_number", "duration_seconds", "created_at",
    "transcript", "entity_name", "important_notes", "outcome", "recording_url",
)


class _AICallRow:
    """Lightweight read-only stand-in for an AICall row (tolerates not-yet-added columns)."""

    def __init__(self, data):
        self.__dict__.update(data)

    def __getattr__(self, name):  # missing column -> None
        return None


def ensure_ai_call_columns() -> None:
    with engine.connect() as conn:
        for sql in _AI_CALL_COLUMN_STATEMENTS:
            conn.execute(text(sql))
        conn.commit()


def load_ai_calls(session):
    existing = {c["name"] for c in inspect(engine).get_columns("ai_calls")}
    cols = [c for c in _AI_CALL_READ_COLUMNS if c in existing]
    if not cols:
        return []
    rows = session.execute(text(f"SELECT {', '.join(cols)} FROM ai_calls")).mappings().all()
    return [_AICallRow(dict(r)) for r in rows]


def fix_mojibake(text):
    """Undo UTF-8-decoded-as-cp1252 mojibake (e.g. 'â€”' -> '—') and normalise the prefix dash."""
    if not text:
        return text
    fixed = text
    try:
        fixed = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        fixed = text
    # The AI Call summary prefix must use a plain hyphen, never an em/en dash.
    for dash in ("\u2014", "\u2013", "â€”", "â€“", "â€"):
        fixed = fixed.replace(f"AI Voice Call {dash} ", "AI Voice Call - ")
        fixed = fixed.replace(dash, "-")
    return fixed


def looks_like_ai_call(summary: str) -> bool:
    if not summary:
        return False
    if summary.startswith("AI Voice Call "):
        return True
    # Tolerate the mojibake form that does not have a clean space after "Call".
    return summary.lstrip().startswith("AI Voice Call")


def digits(value) -> str:
    return re.sub(r"\D", "", value or "")


def parse_transcript_text(description):
    """Turn a stored CallLog.description ("AI: ...", "Client: ...") back into transcript turns."""
    turns = []
    role_map = {"AI": "ai", "Agent": "agent", "Client": "client"}
    for line in (description or "").splitlines():
        if ":" not in line:
            continue
        who, _, text = line.partition(":")
        role = role_map.get(who.strip())
        if role and text.strip():
            turns.append({"role": role, "text": text.strip()})
    return turns


def find_soft_delete_column():
    """Name of an existing soft-delete/flag column on call_logs, or None."""
    try:
        cols = {c["name"].lower(): c["name"] for c in inspect(engine).get_columns("call_logs")}
    except Exception:
        return None
    for name in SOFT_DELETE_CANDIDATES:
        if name in cols:
            return cols[name]
    return None


def is_hidden(row, soft_col) -> bool:
    if not soft_col:
        return False
    val = getattr(row, soft_col, None)
    if soft_col.endswith("_at"):
        return val is not None
    return bool(val)


def resolve_entity_name(session, entity_type, entity_id):
    if not entity_type or not entity_id:
        return None
    try:
        if entity_type == "client":
            cp = session.get(ClientProfile, entity_id)
            if cp:
                return cp.companyName or cp.projectName
    except Exception:
        pass
    return None


def match_existing_ai_call(row, ai_calls):
    """An AICall that already represents this call_logs row.

    A CallLog row is written when a call *ends*, while AICall.created_at is when it was *dialed*,
    so the log time should be roughly dial time + duration. Match on the same phone and the same
    Twilio duration, allowing a 15-minute drift in that relationship. This keeps different calls
    to the same number apart while reliably catching the duplicate rows for one call.
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
        # Duration is the strongest signal: it must match whenever either side has one.
        if row.duration_seconds is not None or a.duration_seconds is not None:
            if row.duration_seconds != a.duration_seconds:
                continue
        delta = (row_time - a.created_at).total_seconds()
        if delta < -300:  # call log predates the call start: definitely not this call
            continue
        duration = row.duration_seconds
        if duration is not None:
            if abs(delta - duration) <= 900:
                return a
        elif delta <= 3600:
            return a
    return None


def group_candidates(candidates):
    """Collapse call_logs rows for one call (same phone + duration, seconds apart) into groups.

    The double-save bug produced 2-3 rows per call ~3 seconds apart; this groups each set so the
    migration creates at most one AICall per real call.
    """
    ordered = sorted(candidates, key=lambda r: (
        digits(r.phone_number),
        r.duration_seconds if r.duration_seconds is not None else -1,
        (r.createdAt or r.received_at) or datetime.min.replace(tzinfo=timezone.utc),
    ))
    groups = []
    for row in ordered:
        row_time = row.createdAt or row.received_at
        placed = False
        for group in groups:
            rep = group[-1]
            rep_time = rep.createdAt or rep.received_at
            if (digits(rep.phone_number) == digits(row.phone_number)
                    and rep.duration_seconds == row.duration_seconds
                    and rep_time is not None and row_time is not None
                    and abs((row_time - rep_time).total_seconds()) <= 30):
                group.append(row)
                placed = True
                break
        if not placed:
            groups.append([row])
    return groups



def generate_notes(session, talk, entity_name, started_at, enabled):
    if not enabled or not talk:
        return ""
    if not any(t.get("role") == "client" for t in talk):
        return ""
    try:
        result = va.summarize_call(talk, entity_name or "", started_at)
        return result.get("important_notes") or ""
    except Exception as exc:  # noqa: BLE001 - migration must keep going
        print(f"    ! important_notes generation failed: {exc}")
        return ""


def _outcome_from_notes(notes: str):
    if (notes or "").startswith("Meeting requested"):
        return "meeting_booked"
    if notes == "Not interested.":
        return "not_interested"
    return None


def main():
    parser = argparse.ArgumentParser(description="Move AI voice calls from call_logs into ai_calls.")
    parser.add_argument("--dry-run", action="store_true", help="show what would change, write nothing")
    parser.add_argument("--yes", action="store_true", help="confirm writing to the database")
    parser.add_argument("--no-generate-notes", action="store_true", help="skip LLM important_notes generation")
    parser.add_argument("--limit", type=int, default=0, help="process at most N call_logs rows (0 = all)")
    args = parser.parse_args()

    print("=" * 78)
    print("AI voice call migration")
    print(f"Database host : {db_host_info()}")
    print("REMINDER      : back up first, e.g.")
    print('                pg_dump "$DATABASE_URL" -t call_logs -t ai_calls > backup_ai_calls.sql')
    print("=" * 78)

    if not args.dry_run and not args.yes:
        print("\nRefusing to write without --yes. Re-run with --dry-run to preview, or --yes to apply.")
        return 1

    soft_col = find_soft_delete_column()
    print(f"Soft-delete column on call_logs: {soft_col or '(none found)'}")

    if not args.dry_run:
        ensure_ai_call_columns()

    with Session(engine) as session:
        all_logs = session.exec(select(CallLog)).all()
        ai_calls = load_ai_calls(session)
        linked_ids = {a.call_log_id for a in ai_calls if a.call_log_id}

        candidates = [
            row for row in all_logs
            if not is_hidden(row, soft_col)
            and (row.id in linked_ids or looks_like_ai_call(row.summary))
        ]
        if args.limit and args.limit > 0:
            candidates = candidates[: args.limit]

        print(f"\ncall_logs rows scanned         : {len(all_logs)}")
        print(f"AI voice call rows to process  : {len(candidates)}")
        print(f"Existing AICall records        : {len(ai_calls)}")

        known_ai_calls = list(ai_calls)
        to_create = []   # (representative row, talk, entity_name, entity_type)
        to_skip = []     # (row, existing AICall, why)
        notes_targets = []  # (existing AICall, talk, entity_name, started_at)
        notes_seen = set()

        def add_notes_target(existing):
            if existing is None or existing.important_notes or existing.id in notes_seen:
                return
            talk = [t for t in (existing.transcript or [])
                    if isinstance(t, dict) and t.get("role") in ("ai", "client", "agent")]
            if talk:
                notes_seen.add(existing.id)
                notes_targets.append((existing, talk, existing.entity_name, existing.created_at))

        # The double-save bug wrote 2-3 call_logs rows per call, seconds apart. Group those so we
        # never create more than one AICall for one real call.
        groups = group_candidates(candidates)
        for group in groups:
            linked_ai = next(
                (a for a in known_ai_calls for row in group if a.call_log_id == row.id), None)
            if linked_ai is not None:
                for row in group:
                    to_skip.append((row, linked_ai, "linked to AICall"))
                add_notes_target(linked_ai)
                continue

            existing = match_existing_ai_call(group[0], known_ai_calls)
            if existing is not None:
                for row in group:
                    to_skip.append((row, existing, "duplicate of existing AICall"))
                add_notes_target(existing)
                continue

            # No AICall yet: create one from the most complete row in the group.
            best = max(group, key=lambda r: len(parse_transcript_text(r.description)))
            talk = parse_transcript_text(best.description)
            entity_type = "client" if best.client_id else None
            entity_name = resolve_entity_name(session, entity_type, best.client_id)
            to_create.append((best, talk, entity_name, entity_type))

        print(f"Real AI calls after de-duping  : {len(groups)}")
        print(f"\nWould create new AICall records : {len(to_create)}")
        print(f"Would skip (already represented): {len(to_skip)}")
        print(f"Would backfill important_notes : {len(notes_targets)}")
        print(f"Would hide/delete originals    : {len(candidates)}")

        if to_create:
            print("\n-- AICall records that would be created --")
            for row, _talk, entity_name, _etype in to_create:
                print(f"  call_logs#{row.id}: {row.phone_number} | {row.duration_seconds}s | "
                      f"{entity_name or row.client_id or '(no company)'} | {fix_mojibake(row.summary)}")
        if to_skip:
            print("\n-- call_logs rows skipped (already in AICall) --")
            for row, existing, why in to_skip:
                print(f"  call_logs#{row.id} -> AICall#{existing.id if existing else '?'} ({why})")

        if args.dry_run:
            print("\nDRY RUN - nothing was written.")
            return 0

        # ── Apply ────────────────────────────────────────────────────────────
        created = 0
        notes_written = 0
        for row, talk, entity_name, entity_type in to_create:
            started = (row.createdAt or row.received_at)
            if started and row.duration_seconds:
                started = started - timedelta(seconds=row.duration_seconds)
            notes = generate_notes(session, talk, entity_name, started, not args.no_generate_notes)
            ai = AICall(
                tenant_id=row.tenant_id,
                entity_type=entity_type,
                entity_id=row.client_id,
                entity_name=entity_name,
                to_number=row.phone_number,
                status="completed",
                summary=fix_mojibake(row.summary),
                important_notes=notes or None,
                next_steps=row.work_done,
                duration_seconds=row.duration_seconds,
                assigned_to=row.assigned_to,
                followup_needed=bool(row.followup_needed),
                followup_date=row.followup_date,
                transcript=talk or [],
                outcome=_outcome_from_notes(notes),
                created_at=started or (row.createdAt or row.received_at),
                ended_at=row.createdAt or row.received_at,
                finalized_at=va.utcnow(),
            )
            session.add(ai)
            created += 1
            print(f"  + AICall created from call_logs#{row.id}: {row.phone_number}")

        # Backfill important_notes on existing AICalls that lack them.
        for existing, talk, entity_name, started_at in notes_targets:
            if existing.important_notes:
                continue
            notes = generate_notes(session, talk, entity_name, started_at, not args.no_generate_notes)
            if notes:
                db_obj = session.get(AICall, existing.id)
                if db_obj is not None and not db_obj.important_notes:
                    db_obj.important_notes = notes
                    if not db_obj.outcome:
                        db_obj.outcome = _outcome_from_notes(notes)
                    session.add(db_obj)
                    notes_written += 1

        # Hide the originals (or hard-delete only when there is no alternative and --yes).
        hidden = 0
        originals = [row for row, _, _, _ in to_create] + [row for row, _, _ in to_skip]
        if soft_col:
            for row in originals:
                db_row = session.get(CallLog, row.id)
                if db_row is None or is_hidden(db_row, soft_col):
                    continue
                if soft_col.endswith("_at"):
                    setattr(db_row, soft_col, va.utcnow())
                else:
                    setattr(db_row, soft_col, True)
                session.add(db_row)
                hidden += 1
            session.commit()
            print(f"\nHid {hidden} call_logs rows using '{soft_col}'.")
        else:
            for row in originals:
                db_row = session.get(CallLog, row.id)
                if db_row is not None:
                    session.delete(db_row)
                    hidden += 1
            session.commit()
            print(f"\nNo soft-delete column exists; hard-deleted {hidden} call_logs rows.")

    print("\nDone.")
    print(f"  AICall created         : {created}")
    print(f"  important_notes set    : {notes_written}")
    print(f"  originals hidden       : {hidden}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
