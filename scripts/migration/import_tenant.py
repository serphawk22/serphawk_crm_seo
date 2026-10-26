"""
Import ONE client's data from a deployment's database (a fork such as SCM BPO, SCM HB or DaPros) into a tenant of the
shared multi-tenant database, remapping every id so nothing collides with other clients' rows.

    python -m scripts.migration.import_tenant \\
        --source "postgresql://.../fork_db" --target "postgresql://.../shared_db" \\
        --source-tenant 1 --tenant-name scmbpo --business-name "SCM BPO" --preset bpo --dry-run

What it does
  * Creates (or, with --replace, empties and refills) the target tenant, then copies every tenant-owned table in
    foreign-key order. Primary keys get new values from the target's sequences; every foreign key, every known "soft"
    reference (plain integer columns such as follow_ups.lead_id or tasks.student_id) and the polymorphic entity_id
    columns are rewritten through the id maps. A reference to a row that was not imported becomes NULL and is counted.
  * Users are copied with their password hashes. SuperAdmins are never copied. An e-mail that already exists in the
    target (another client) is a conflict: --email-conflict fail (default) | skip | rename.
  * Naive timestamps (older sqlmodel) are stored as UTC.
  * Verifies referential integrity of the imported rows and prints per-table counts.
  * --dry-run runs everything inside a transaction and rolls it back.

It never reads a .env file and never defaults to any database: both URLs are explicit. Run it against a COPY of the
production data first, compare against the live dashboard, repeat with --replace as often as needed, and only
switch a client over after sign-off.
"""
import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import MetaData, create_engine, delete, func, insert, or_, select, text, update
from sqlalchemy.engine import Connection, Engine, make_url

# Tables that are never imported: global lookups, secrets that must not travel, and the tenant itself.
ALWAYS_SKIP = {
    "tenants", "password_reset_tokens", "email_otps", "tenant_features", "tenant_settings", "client_statuses",
    "service_catalog", "api_usage_logs", "chatbotsession", "chatbotmessage", "livechatsession", "livechatmessage",
    "whatsappsession",
    # the AI's "already read this note" ledger: its keys name SOURCE row ids (note-12) that are renumbered here, and its
    # source_key is unique across the whole database. Rebuilt on its own; only the last few days of notes are re-read.
    "follow_up_note_scans",
}
# Tables that one client deployment calls by another name. SCM HB named its follow-ups (and the AI note ledger)
# crm_follow_ups because an older, unrelated follow_ups table existed in one SCM database; here follow_ups is the one
# standard name, so that table is read as follow_ups without any flag. An explicit --table-map always wins.
DEFAULT_TABLE_ALIASES: Dict[str, str] = {"follow_ups": "crm_follow_ups", "follow_up_note_scans": "crm_follow_up_note_scans"}


def resolve_table_map(source_tables: Iterable[str], explicit: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """target table -> the source table it is read from: the built-in aliases that apply to this source, then the explicit ones."""
    source_tables = set(source_tables)
    resolved = {t: a for t, a in DEFAULT_TABLE_ALIASES.items() if a in source_tables}
    resolved.update(explicit or {})
    return resolved


# Plain integer columns (no database foreign key) that still point at another table's primary key.
SOFT_REFS: Dict[Tuple[str, str], str] = {
    ("client_profiles", "lead_source_id"): "lead_sources", ("client_profiles", "assignedEmployeeId"): "users",
    ("client_profiles", "discovered_from_client_id"): "client_profiles",
    ("leads", "course_interest_id"): "courses", ("leads", "converted_student_id"): "students",
    ("leads", "lead_source_id"): "lead_sources",
    ("business_costs", "employee_id"): "users", ("call_logs", "assigned_to"): "users",
    ("deal_negotiations", "deal_id"): "deals", ("deal_negotiations", "author_id"): "users",
    ("dropped_clients", "client_id"): "client_profiles", ("email_campaigns", "created_by"): "users",
    ("follow_up_note_scans", "follow_up_id"): "follow_ups",
    ("follow_ups", "lead_id"): "leads", ("follow_ups", "client_id"): "client_profiles", ("follow_ups", "assigned_to"): "users",
    ("follow_ups", "created_by"): "users", ("follow_ups", "sent_email_id"): "sent_emails",
    ("follow_ups", "contact_id"): "contacts", ("follow_ups", "completed_by"): "users",
    ("inbox_messages", "lead_id"): "leads", ("inbox_messages", "client_id"): "client_profiles",
    ("inbox_messages", "contact_id"): "contacts", ("inbox_messages", "sent_email_id"): "sent_emails",
    ("ownership_history", "from_user_id"): "users", ("ownership_history", "to_user_id"): "users",
    ("salesperson_history", "client_id"): "client_profiles", ("salesperson_history", "from_user_id"): "users",
    ("salesperson_history", "to_user_id"): "users", ("scheduled_calls", "assigned_to"): "users",
    ("stock_movements", "item_id"): "inventory_items", ("stock_movements", "author_id"): "users",
    ("email_campaign_recipients", "sent_email_id"): "sent_emails", ("email_campaign_recipients", "lead_id"): "leads",
    ("email_campaign_recipients", "client_id"): "client_profiles", ("email_campaign_recipients", "follow_up_id"): "follow_ups",
    ("tasks", "student_id"): "students", ("tasks", "batch_id"): "batches", ("ai_calls", "assigned_to"): "users",
}
# entity_id columns whose target table depends on a sibling "type" column.
_ENTITY_TABLES = {"lead": "leads", "client": "client_profiles", "contact": "contacts"}
POLYMORPHIC: Dict[Tuple[str, str], Tuple[str, Dict[str, str]]] = {
    ("ownership_history", "entity_id"): ("entity_type", _ENTITY_TABLES),
    ("scheduled_calls", "entity_id"): ("entity_type", _ENTITY_TABLES),
    ("voice_pitches", "entity_id"): ("entity_type", _ENTITY_TABLES),
    ("ai_calls", "entity_id"): ("entity_type", _ENTITY_TABLES),
    ("call_questions", "entity_id"): ("entity_type", _ENTITY_TABLES),
}
_USER_SUFFIX = re.compile(r"(_by|_user_id)$")


def _adapt_follow_up(row: dict) -> dict:
    """
    SCM BPO's follow_ups table (owner_id, completion_note, reminder_minutes, capitalised channel / priority, nullable
    due date) -> the shared shape (assigned_to, outcome, remind_at, lower case, a date is required). A row that is
    already in the shared shape passes through unchanged.
    """
    row = dict(row)
    if "owner_id" in row and row.get("assigned_to") is None:
        row["assigned_to"] = row["owner_id"]
    if "completion_note" in row and row.get("outcome") is None:
        row["outcome"] = row["completion_note"]
    created = _aware(row.get("created_at")) or datetime.now(timezone.utc)
    row["created_at"] = created
    row["updated_at"] = _aware(row.get("updated_at")) or created
    due = _aware(row.get("due_at")) or created
    row["due_at"] = due
    if "reminder_minutes" in row and row.get("remind_at") is None:
        minutes = int(row.get("reminder_minutes") or 0)
        row["remind_at"] = due - timedelta(minutes=minutes) if minutes > 0 else due
    for col in ("channel", "priority"):
        if isinstance(row.get(col), str):
            row[col] = row[col].strip().lower()
    if row.get("status") not in ("Pending", "In Progress", "Completed", "Cancelled"):
        row["status"] = "Pending"          # e.g. a stored "Overdue": that is derived from the date now
    return row


# target table -> function that reshapes a source row, and the target columns it can fill that the source lacks
ROW_ADAPTERS = {"follow_ups": _adapt_follow_up}
ADAPTER_COLUMNS = {"follow_ups": ("assigned_to", "outcome", "remind_at")}


# Rows that belong to ONE person (their notifications, their connected mailbox): when that person is a skipped test account
# they are left out, never handed to the admin that inherits the skipped accounts' records.
PERSONAL_TABLES = {"notifications", "user_email_integrations", "email_agent_profiles"}


def _ensure_admin(conn: Connection, users_table, tenant_id: int, email: str, name: Optional[str]) -> Tuple[int, Optional[str]]:
    """The tenant's admin that inherits the skipped accounts' records: reuse the user if the client already has it,
    otherwise create it with a random one-time password (returned once, never stored in clear)."""
    import hashlib
    import secrets
    email = email.strip()
    row = conn.execute(select(users_table.c.id, users_table.c.tenant_id).where(func.lower(users_table.c.email) == email.lower())).first()
    if row:
        if row[1] != tenant_id:
            raise ImportConflict(f"{email} already exists in the target as a user of another company")
        return row[0], None
    password = secrets.token_urlsafe(9)
    now = datetime.now(timezone.utc)
    values = {"email": email, "password": hashlib.sha256(password.encode()).hexdigest(), "hashed_password": "", "name": name or email.split("@")[0],
              "role": "Admin", "is_active": True, "status": "Active", "tenant_id": tenant_id, "created_at": now, "updated_at": now}
    res = conn.execute(insert(users_table).values(**{k: v for k, v in values.items() if k in users_table.c}))
    return res.inserted_primary_key[0], password


class ImportConflict(Exception):
    pass


@dataclass
class TableReport:
    name: str
    selected: int = 0
    copied: int = 0
    skipped: int = 0
    dangling: Dict[str, int] = field(default_factory=dict)
    note: str = ""


@dataclass
class Report:
    tenant_id: Optional[int] = None
    dry_run: bool = False
    tables: Dict[str, TableReport] = field(default_factory=dict)
    fk_violations: Dict[str, int] = field(default_factory=dict)
    unmapped_id_columns: List[str] = field(default_factory=list)
    email_conflicts: List[str] = field(default_factory=list)
    preset: Optional[dict] = None
    admin: Optional[dict] = None          # the admin that inherited the skipped accounts' records
    admin_password: Optional[str] = None  # one-time password of a newly created admin: printed once, not part of as_dict

    def as_dict(self) -> dict:
        return {
            "tenant_id": self.tenant_id, "dry_run": self.dry_run,
            "tables": {k: vars(v) for k, v in self.tables.items()},
            "fk_violations": self.fk_violations, "unmapped_id_columns": self.unmapped_id_columns,
            "email_conflicts": self.email_conflicts, "preset": self.preset, "admin": self.admin,
            "totals": {"copied": sum(t.copied for t in self.tables.values()),
                       "skipped": sum(t.skipped for t in self.tables.values())},
        }


def _aware(value: Any) -> Any:
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _describe(engine: Engine) -> str:
    u = make_url(engine.url.render_as_string(hide_password=True))
    return f"{u.get_backend_name()} host={u.host or 'local file'} db={u.database}"


def _tenant_filter(table, source_tenant_id: Optional[int], include_null: bool):
    if "tenant_id" not in table.c:
        return None
    col = table.c.tenant_id
    if source_tenant_id is None:
        return col.is_not(None) | col.is_(None)    # everything
    cond = col == source_tenant_id
    return (cond | col.is_(None)) if include_null else cond


def _widen_text_columns(conn: Connection, source: Engine, src, tgt, columns, cond) -> List[str]:
    """
    A client's database may hold longer text than the shared column allows (a lead website with a 700 character tracking
    URL against VARCHAR(500)). Never cut the text: widen the target column to TEXT first (PostgreSQL; the change is part of
    the import's transaction, so a dry run rolls it back). Returns the columns widened.
    """
    if conn.dialect.name != "postgresql":
        return []
    from sqlalchemy import inspect as sa_inspect
    actual = {c["name"]: getattr(c["type"], "length", None) for c in sa_inspect(conn).get_columns(tgt.name)}
    candidates = [c for c in columns if c.name in src.c and actual.get(c.name)]       # only VARCHAR(n) columns report a length
    if not candidates:
        return []
    q = select(*[func.max(func.char_length(src.c[c.name])) for c in candidates])
    if cond is not None:
        q = q.where(cond)
    with source.connect() as sc:
        longest = sc.execute(q).first()
    widened = []
    for c, n in zip(candidates, longest):
        if n and n > actual[c.name]:
            conn.execute(text(f'ALTER TABLE "{tgt.name}" ALTER COLUMN "{c.name}" TYPE TEXT'))
            widened.append(c.name)
    return widened


def import_tenant(source: Engine, target: Engine, *, source_tenant_id: Optional[int], tenant_name: str,
                  business_name: Optional[str] = None, preset: Optional[str] = None, settings: Optional[dict] = None,
                  include_null_tenant: bool = False, email_conflict: str = "fail", skip_tables: Iterable[str] = (),
                  dry_run: bool = False, replace: bool = False, table_map: Optional[Dict[str, str]] = None,
                  assign_skipped_to: Optional[str] = None, admin_name: Optional[str] = None, log=print) -> Report:
    if email_conflict not in ("fail", "skip", "rename"):
        raise ValueError("email_conflict must be fail, skip or rename")
    # Imported lazily: loading the models registers every table (including the add-ons).
    import addons  # noqa: F401
    import database
    from sqlmodel import SQLModel, Session

    src_md = MetaData()
    src_md.reflect(bind=source)
    table_map = resolve_table_map(src_md.tables, table_map)      # target table -> the source table to read it from
    for tgt_name, src_name in table_map.items():
        if src_name not in src_md.tables:
            raise ValueError(f"--table-map {tgt_name}={src_name}: the source database has no table '{src_name}'")
    target_tables = {t.name: t for t in SQLModel.metadata.sorted_tables}
    order = [t for t in SQLModel.metadata.sorted_tables
             if table_map.get(t.name, t.name) in src_md.tables and t.name not in ALWAYS_SKIP and t.name not in set(skip_tables)]
    in_plan = {t.name for t in order}
    report = Report(dry_run=dry_run)

    with target.connect() as conn:
        trans = conn.begin()
        try:
            # ── tenant row ──────────────────────────────────────────────────────────────────────────────
            existing = conn.execute(select(target_tables["tenants"].c.id).where(target_tables["tenants"].c.name == tenant_name)).first()
            if existing and not replace:
                raise ImportConflict(f"tenant '{tenant_name}' already exists (id {existing[0]}); use --replace to empty and refill it")
            if existing:
                tenant_id = existing[0]
                _empty_tenant(conn, tenant_id, target_tables, log)
            else:
                with Session(bind=conn) as s:
                    tenant = database.Tenant(name=tenant_name, business_name=business_name, is_trial=False,
                                             limit_clients=1_000_000, limit_emails=1_000_000, limit_searches=1_000_000,
                                             limit_projects=1_000_000, limit_calls=1_000_000)
                    s.add(tenant)
                    s.flush()
                    tenant_id = tenant.id
            report.tenant_id = tenant_id

            idmap: Dict[str, Dict[Any, Any]] = {t.name: {} for t in order}
            deferred: List[Tuple[Any, Any, str, str, Any]] = []   # (table, new pk, column, parent table, old value)
            done: Set[str] = set()
            skipped_users: List[Any] = []        # source ids of users left out because their e-mail already exists
            remapped_users: Set[Any] = set()     # ... once they are handed to the admin

            for tgt in order:
                name = tgt.name
                src = src_md.tables[table_map.get(name, name)]
                tr = report.tables.setdefault(name, TableReport(name))
                if src.name != name:
                    tr.note = f"read from '{src.name}'" + (f" ('{name}' in the source is a different, older table and is not imported)"
                                                           if name in src_md.tables else "")
                adapter = ROW_ADAPTERS.get(name)
                pk_cols = [c for c in tgt.primary_key.columns]
                single_pk = pk_cols[0].name if len(pk_cols) == 1 else None
                filled = ADAPTER_COLUMNS.get(name, ()) if adapter else ()
                common = [c for c in tgt.columns if (c.name in src.c or c.name in filled) and c.name != single_pk]
                fk_parent = {fk.parent.name: fk.column.table.name for fk in tgt.foreign_keys}

                cond = _tenant_filter(src, source_tenant_id, include_null_tenant)
                if name == "users" and "role" in src.c:
                    not_super = or_(src.c.role.is_(None), func.lower(src.c.role) != "superadmin")
                    cond = not_super if cond is None else (cond & not_super)
                needs_parent = cond is None      # no tenant column: keep only rows that hang off imported rows
                widened = _widen_text_columns(conn, source, src, tgt, common, cond)
                if widened:
                    tr.note = (tr.note + "; " if tr.note else "") + "widened to TEXT: " + ", ".join(widened)
                rows_iter = conn_rows(source, select(src) if cond is None else select(src).where(cond))

                for row in rows_iter:
                    tr.selected += 1
                    if adapter:
                        row = adapter(row)
                    values: Dict[str, Any] = {}
                    row_deferred: List[Tuple[str, str, Any]] = []     # (column, parent table, old id)
                    anchored = not needs_parent
                    orphan = False        # a required link points at a row that is not imported (e.g. a SuperAdmin's profile)
                    for c in common:
                        v = _aware(row.get(c.name))
                        if c.name == "tenant_id":
                            values[c.name] = tenant_id
                            continue
                        parent = fk_parent.get(c.name) or SOFT_REFS.get((name, c.name))
                        if (name, c.name) in POLYMORPHIC:
                            type_col, tmap = POLYMORPHIC[(name, c.name)]
                            parent = tmap.get(str(row.get(type_col) or "").lower())
                        elif parent is None and _USER_SUFFIX.search(c.name) and "users" in in_plan:
                            parent = "users"
                        if parent is not None and v is not None and not isinstance(v, (dict, list)):
                            if parent not in idmap:
                                tr.dangling[c.name] = tr.dangling.get(c.name, 0) + 1
                                orphan = orphan or not c.nullable
                                v = None                                   # parent table is not part of this import
                            elif v in idmap[parent]:
                                if parent == "users" and v in remapped_users and name in PERSONAL_TABLES:
                                    orphan = True                          # one person's own notifications / mailbox: not handed over
                                v = idmap[parent][v]
                                anchored = True
                            elif parent == name or parent not in done:
                                row_deferred.append((c.name, parent, v))   # parent not copied yet: patch afterwards
                                v = None
                            else:
                                tr.dangling[c.name] = tr.dangling.get(c.name, 0) + 1
                                orphan = orphan or not c.nullable
                                v = None                                   # points at a row of another client
                        values[c.name] = v
                    if orphan:
                        tr.skipped += 1
                        continue
                    for k in [k for k, val in values.items() if val is None and not tgt.c[k].nullable and tgt.c[k].default is not None]:
                        del values[k]                  # an explicit NULL in a NOT NULL column: let the column's own default apply
                    if needs_parent and not anchored and not row_deferred:
                        tr.skipped += 1
                        continue
                    if "tenant_id" in tgt.c and "tenant_id" not in values:
                        values["tenant_id"] = tenant_id          # the source table had no tenant column
                    if name == "users":
                        values, skip = _resolve_email(conn, tgt, values, tenant_name, email_conflict, report)
                        if skip:
                            tr.skipped += 1
                            skipped_users.append(row.get(single_pk))
                            continue
                    old_pk = row.get(single_pk) if single_pk else None
                    res = conn.execute(insert(tgt).values(**values))
                    new_pk = res.inserted_primary_key[0] if single_pk and res.inserted_primary_key else None
                    if single_pk and old_pk is not None:
                        idmap[name][old_pk] = new_pk
                    for col, parent, old in row_deferred:
                        deferred.append((tgt, new_pk, col, parent, old))
                    tr.copied += 1
                done.add(name)
                if name == "users" and assign_skipped_to:
                    admin_id, admin_pw = _ensure_admin(conn, tgt, tenant_id, assign_skipped_to, admin_name)
                    idmap["users"].update({old: admin_id for old in skipped_users})
                    remapped_users.update(skipped_users)
                    report.admin = {"email": assign_skipped_to, "id": admin_id, "created": admin_pw is not None, "inherited_accounts": len(skipped_users)}
                    report.admin_password = admin_pw

            # ── deferred (cyclic / forward) references ─────────────────────────────────────────────────
            for tgt, new_pk, col, parent, old in deferred:
                tr = report.tables[tgt.name]
                newv = idmap.get(parent, {}).get(old)
                if newv is None:
                    tr.dangling[col] = tr.dangling.get(col, 0) + 1
                    continue
                pk = list(tgt.primary_key.columns)[0]
                conn.execute(update(tgt).where(pk == new_pk).values({col: newv}))

            # ── verification ───────────────────────────────────────────────────────────────────────────
            for tgt in order:
                if "tenant_id" not in tgt.c:
                    continue
                for fk in tgt.foreign_keys:
                    parent_t = fk.column.table.alias("fk_parent")        # alias: a table may reference itself
                    parent_key = parent_t.c[fk.column.name]
                    col = fk.parent
                    q = (select(func.count()).select_from(tgt.outerjoin(parent_t, col == parent_key))
                         .where(tgt.c.tenant_id == tenant_id, col.is_not(None), parent_key.is_(None)))
                    bad = conn.execute(q).scalar() or 0
                    if bad:
                        report.fk_violations[f"{tgt.name}.{col.name}"] = bad
            # id-like columns with data that we have no mapping for: the operator must review these
            for tgt in order:
                src = src_md.tables[table_map.get(tgt.name, tgt.name)]
                fkcols = {fk.parent.name for fk in tgt.foreign_keys}
                for c in tgt.columns:
                    if c.name in fkcols or c.primary_key or c.name not in src.c:
                        continue
                    if re.search(r"(_id|Id)$", c.name) and (tgt.name, c.name) not in SOFT_REFS \
                            and (tgt.name, c.name) not in POLYMORPHIC and c.name != "tenant_id":
                        n = conn.execute(select(func.count()).select_from(tgt).where(
                            tgt.c.tenant_id == tenant_id, c.is_not(None))).scalar() if "tenant_id" in tgt.c else 0
                        if n:
                            report.unmapped_id_columns.append(f"{tgt.name}.{c.name} ({n} rows)")

            # ── features / settings ────────────────────────────────────────────────────────────────────
            if preset:
                from modules import presets
                with Session(bind=conn) as s:
                    base = {"brand_name": business_name or tenant_name}
                    base.update(settings or {})
                    report.preset = presets.apply_preset(s, tenant_id, preset, base)
        except Exception:
            trans.rollback()
            raise
        if dry_run:
            trans.rollback()
            log("dry run: everything rolled back")
        else:
            trans.commit()
    return report


def conn_rows(engine: Engine, stmt, chunk: int = 2000):
    """Stream rows from the source as plain dicts."""
    with engine.connect() as c:
        result = c.execution_options(stream_results=True).execute(stmt)
        for r in result.mappings():
            yield dict(r)


def _resolve_email(conn: Connection, users_table, values: dict, tenant_name: str, policy: str, report: Report):
    email = (values.get("email") or "").strip()
    if not email:
        return values, False
    exists = conn.execute(select(users_table.c.id).where(func.lower(users_table.c.email) == email.lower())).first()
    if not exists:
        return values, False
    report.email_conflicts.append(email)
    if policy == "fail":
        raise ImportConflict(f"user e-mail already exists in the target: {email} (use --email-conflict skip|rename)")
    if policy == "skip":
        return values, True
    local, _, domain = email.partition("@")
    slug = re.sub(r"[^a-z0-9]+", "", tenant_name.lower()) or "tenant"
    values = {**values, "email": f"{local}+{slug}@{domain}"}
    return values, False


def _empty_tenant(conn: Connection, tenant_id: int, tables: Dict[str, Any], log) -> None:
    """Delete every row of the tenant. Foreign keys form cycles (leads <-> clients <-> users ...), so there is no
    single safe order: delete what can be deleted, retry what a constraint refused (each attempt in a savepoint),
    until nothing is left. Run --replace against a copy, never against production."""
    from sqlalchemy.exc import IntegrityError
    from sqlmodel import SQLModel
    pending = [t for t in reversed(SQLModel.metadata.sorted_tables) if t.name != "tenants" and "tenant_id" in t.c]
    for _ in range(len(pending) + 2):
        still = []
        for t in pending:
            try:
                with conn.begin_nested():
                    n = conn.execute(delete(t).where(t.c.tenant_id == tenant_id)).rowcount
            except IntegrityError:
                still.append(t)
                continue
            if n:
                log(f"  emptied {t.name}: {n} rows")
        if not still:
            return
        if len(still) == len(pending):
            names = ", ".join(t.name for t in still)
            raise ImportConflict(f"could not empty the tenant: rows are still referenced from other tenants ({names})")
        pending = still


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", help="SQLAlchemy URL of the deployment database to read (read-only)")
    ap.add_argument("--target", help="SQLAlchemy URL of the shared database to write")
    ap.add_argument("--source-env", help="name of an environment variable that holds the source URL (keeps it off the command line)")
    ap.add_argument("--target-env", help="name of an environment variable that holds the target URL")
    ap.add_argument("--table-map", action="append", default=[], metavar="TARGET=SOURCE",
                    help="read a shared table from a differently named source table. SCM HB's crm_follow_ups is read as follow_ups on its own; use this for any other renamed table")
    ap.add_argument("--source-tenant", type=int, default=None, help="tenant id inside the source database (omit = all rows)")
    ap.add_argument("--tenant-name", required=True, help="unique name of the tenant to create in the target")
    ap.add_argument("--business-name")
    ap.add_argument("--preset", help="apply a product preset (features + settings), e.g. bpo, institute, design-agency")
    ap.add_argument("--include-null-tenant", action="store_true", help="also import rows whose tenant_id is NULL")
    ap.add_argument("--email-conflict", default="fail", choices=["fail", "skip", "rename"])
    ap.add_argument("--skip-tables", default="", help="comma separated table names to leave out (e.g. audit_logs)")
    ap.add_argument("--assign-skipped-to", metavar="EMAIL",
                    help="make this e-mail the company's Admin (created if missing) and give it every record owned by a user left out by --email-conflict skip")
    ap.add_argument("--admin-name", help="display name for the admin created by --assign-skipped-to")
    ap.add_argument("--replace", action="store_true", help="empty and refill the tenant if it already exists")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", action="store_true", help="required to write to a non-SQLite target")
    ap.add_argument("--report", help="write the JSON report to this file")
    a = ap.parse_args(argv)
    import os
    a.source = a.source or (os.environ.get(a.source_env or "") if a.source_env else None)
    a.target = a.target or (os.environ.get(a.target_env or "") if a.target_env else None)
    if not a.source or not a.target:
        print("give the source and the target database (--source / --source-env and --target / --target-env)")
        return 2
    table_map = {}
    for item in a.table_map:
        if "=" not in item:
            print(f"--table-map expects TARGET=SOURCE, got '{item}'")
            return 2
        k, _, v = item.partition("=")
        table_map[k.strip()] = v.strip()
    if a.source == a.target:
        print("source and target are the same database; refusing")
        return 2
    source, target = create_engine(a.source), create_engine(a.target)
    print(f"source: {_describe(source)}\ntarget: {_describe(target)}")
    if target.dialect.name != "sqlite" and not a.dry_run and not a.yes:
        print("refusing to write to a non-SQLite target without --yes (use --dry-run to rehearse)")
        return 2
    try:
        report = import_tenant(source, target, source_tenant_id=a.source_tenant, tenant_name=a.tenant_name,
                               business_name=a.business_name, preset=a.preset, include_null_tenant=a.include_null_tenant,
                               email_conflict=a.email_conflict, skip_tables=[s for s in a.skip_tables.split(",") if s],
                               dry_run=a.dry_run, replace=a.replace, table_map=table_map,
                               assign_skipped_to=a.assign_skipped_to, admin_name=a.admin_name)
    except ImportConflict as e:
        print(f"CONFLICT: {e}")
        return 3
    out = report.as_dict()
    print(json.dumps({k: out[k] for k in ("tenant_id", "dry_run", "totals", "fk_violations", "unmapped_id_columns", "email_conflicts", "admin")}, indent=2))
    if report.admin_password:
        print(f"ADMIN CREATED: {report.admin['email']}  one-time password: {report.admin_password}   (shown once; the admin should change it)")
    for t in report.tables.values():
        if t.selected:
            print(f"  {t.name:32s} selected={t.selected:6d} copied={t.copied:6d} skipped={t.skipped:4d} dangling={t.dangling or ''}")
    if a.report:
        with open(a.report, "w", encoding="utf8") as f:
            json.dump(out, f, indent=2, default=str)
    return 1 if report.fk_violations else 0


if __name__ == "__main__":
    sys.exit(main())
