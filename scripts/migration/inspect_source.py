"""
Read-only audit of a client's deployment database BEFORE importing it: what will carry over, what will not, and what needs a
decision.

    set BPO_URL=postgresql://...        (a Neon BRANCH or a read-only role; never the URL on the command line)
    python -m scripts.migration.inspect_source --source-env BPO_URL [--source-tenant 1] [--target-env SHARED_URL]
                                               [--table-map TARGET=SOURCE] [--json report.json]

It only runs SELECTs, never reads a .env, and prints no credentials. It reports

  * the companies (tenants) in that database and how big each is, so you pick ``--source-tenant``
  * every table: carried over / translated (columns renamed on the way) / skipped on purpose / NO HOME in this product
    (its rows would be left behind)
  * columns that hold data here but do not exist in this product (that data would be dropped)
  * things the database cannot carry: files that sit on the old server's disk, encrypted mailbox passwords (they need the
    old deployment's EMAIL_CREDENTIAL_ENCRYPTION_KEY), Google tokens, rows with no company, users that would clash with
    users already in the shared database
"""
import argparse
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

from sqlalchemy import MetaData, String, Text, and_, create_engine, func, or_, select
from sqlalchemy.engine import Engine, make_url

from scripts.migration import import_tenant as imp

_FILE_COLUMN = re.compile(r"(url|path|file|photo|image|logo|avatar|attachment|document|upload|slip|proof)", re.IGNORECASE)
_DISK_MARKERS = ("/uploads/", "static/uploads", "uploads/")
_REASONS = {
    "tenants": "the company row itself is created fresh in the shared database",
    "password_reset_tokens": "short-lived secrets are never copied", "email_otps": "short-lived secrets are never copied",
    "tenant_features": "this product's own switches: set from the preset", "tenant_settings": "this product's own settings: set from the preset",
    "client_statuses": "shared lookup", "service_catalog": "shared lookup", "api_usage_logs": "telemetry",
    "chatbotsession": "anonymous website chat sessions", "chatbotmessage": "anonymous website chat sessions",
    "livechatsession": "anonymous website chat sessions", "livechatmessage": "anonymous website chat sessions",
    "whatsappsession": "live WhatsApp conversation state",
    "follow_up_note_scans": "the AI's 'note already read' ledger: it names old row ids, so it is rebuilt (only the last few days of notes are re-read)",
}


def _desc(engine: Engine) -> str:
    u = make_url(engine.url.render_as_string(hide_password=True))
    return f"{u.get_backend_name()} host={u.host or 'local file'} db={u.database}"


def _count(conn, table, cond=None) -> int:
    q = select(func.count()).select_from(table)
    if cond is not None:
        q = q.where(cond)
    return conn.execute(q).scalar() or 0


def inspect(source: Engine, *, source_tenant: Optional[int] = None, include_null_tenant: bool = False,
            table_map: Optional[Dict[str, str]] = None, target: Optional[Engine] = None) -> Dict[str, Any]:
    import addons  # noqa: F401  (registers the add-on tables)
    import database  # noqa: F401
    from sqlmodel import SQLModel

    md = MetaData()
    md.reflect(bind=source)
    table_map = imp.resolve_table_map(md.tables, table_map)       # includes the built-in crm_follow_ups -> follow_ups (SCM HB)
    wanted = {t.name: t for t in SQLModel.metadata.tables.values()}
    reverse_map = {v: k for k, v in table_map.items()}
    report: Dict[str, Any] = {"source": _desc(source), "tenants": [], "tables": [], "attention": [], "dropped_columns": []}

    with source.connect() as c:
        # ── the companies in this database ──
        if "tenants" in md.tables and "tenant_id" in (md.tables.get("users").c if "users" in md.tables else {}):
            t, users = md.tables["tenants"], md.tables["users"]
            leads = md.tables.get("leads")
            for row in c.execute(select(t)).mappings():
                tid = row["id"]
                report["tenants"].append({
                    "id": tid, "name": row.get("name"), "business_name": row.get("business_name"),
                    "users": _count(c, users, users.c.tenant_id == tid),
                    "leads": _count(c, leads, leads.c.tenant_id == tid) if leads is not None and "tenant_id" in leads.c else None})
        if not report["tenants"]:
            report["attention"].append("This database has no tenants table: it is a single-company deployment, import it without --source-tenant.")

        # ── every table ──
        for name, src in sorted(md.tables.items()):
            target_name = reverse_map.get(name, name)
            tgt = wanted.get(target_name)
            cond = imp._tenant_filter(src, source_tenant, include_null_tenant) if "tenant_id" in src.c else None
            if name in imp.ALWAYS_SKIP or target_name in imp.ALWAYS_SKIP:
                rows = _count(c, src, cond)
                if rows:
                    report["tables"].append({"table": name, "rows": rows, "status": "skipped on purpose",
                                             "why": _REASONS.get(name) or _REASONS.get(target_name, "never copied")})
                continue
            if name in table_map and table_map[name] != name:        # this product reads that table from another source table
                rows = _count(c, src, cond)
                if rows:
                    report["tables"].append({"table": name, "rows": rows, "status": "skipped on purpose",
                                             "why": f"this product's {name} is read from '{table_map[name]}'; this older table is left behind"})
                continue
            rows = _count(c, src, cond)
            if tgt is None:
                if rows:
                    report["tables"].append({"table": name, "rows": rows, "status": "NO HOME in this product",
                                             "why": "no matching table here: these rows would be left behind"})
                continue
            status = "carried over" if target_name not in imp.ROW_ADAPTERS and name == target_name else "translated"
            entry = {"table": name, "rows": rows, "status": status, "child_of_parent": "tenant_id" not in src.c}
            if rows:
                report["tables"].append(entry)
                # columns holding data that this product does not have
                adapted = set(imp.ADAPTER_COLUMNS.get(target_name, ())) if target_name in imp.ROW_ADAPTERS else set()
                renamed_away = {"owner_id", "completion_note", "reminder_minutes"} if target_name == "follow_ups" else set()
                for col in src.c:
                    if col.name in tgt.c or col.name in renamed_away or col.name == "id":
                        continue
                    n = _count(c, src, col.is_not(None) if cond is None else and_(cond, col.is_not(None)))
                    if n:
                        report["dropped_columns"].append({"table": name, "column": col.name, "rows_with_data": n})
            # rows without a company
            if "tenant_id" in src.c and source_tenant is not None and not include_null_tenant:
                loose_cond = src.c.tenant_id.is_(None)
                if name == "users" and "role" in src.c:
                    loose_cond = and_(loose_cond, func.lower(src.c.role) != "superadmin")     # operators are reported separately
                orphans = _count(c, src, loose_cond)
                if orphans:
                    report["attention"].append(f"{name}: {orphans} row(s) have no company (tenant_id empty) and are NOT imported; use --include-null-tenant if they belong to this client.")

        # ── things a database copy cannot carry ──
        if "user_email_integrations" in md.tables:
            n = _count(c, md.tables["user_email_integrations"], imp._tenant_filter(md.tables["user_email_integrations"], source_tenant, include_null_tenant))
            if n:
                report["attention"].append(f"{n} personal mailbox connection(s) (Email Agent) hold app passwords encrypted with the OLD deployment's EMAIL_CREDENTIAL_ENCRYPTION_KEY. "
                                           "They only work if the shared deployment uses that exact same key value; otherwise each person reconnects their mailbox.")
        if "email_integrations" in md.tables:
            n = _count(c, md.tables["email_integrations"])
            if n:
                report["attention"].append(f"{n} Google / calendar connection(s) copied with their tokens: they keep working only if the shared deployment uses the same Google app (client id and secret).")
        if "email_settings" in md.tables:
            n = _count(c, md.tables["email_settings"], imp._tenant_filter(md.tables["email_settings"], source_tenant, include_null_tenant))
            if n:
                report["attention"].append(f"{n} company mailbox setting(s): copied as they are and encrypted the next time an admin saves them.")
        for name, src in md.tables.items():
            if name in imp.ALWAYS_SKIP or (reverse_map.get(name, name) not in wanted):
                continue
            cond = imp._tenant_filter(src, source_tenant, include_null_tenant) if "tenant_id" in src.c else None
            for col in src.c:
                if not isinstance(col.type, (String, Text)) or not _FILE_COLUMN.search(col.name):
                    continue
                like = or_(*[col.like(f"%{m}%") for m in _DISK_MARKERS])
                n = _count(c, src, and_(cond, like) if cond is not None else like)
                if n:
                    report["attention"].append(f"{name}.{col.name}: {n} value(s) point at files on the OLD server's disk. The database copy does not include those files: copy the uploads folder and keep the same paths, or re-upload.")
        if "users" in md.tables:
            u = md.tables["users"]
            supers = _count(c, u, func.lower(u.c.role) == "superadmin")
            if supers:
                report["attention"].append(f"{supers} SuperAdmin account(s) are never copied (operators are created in the shared deployment).")
            if "tenant_id" in u.c:
                loose = _count(c, u, (u.c.tenant_id.is_(None)) & (func.lower(u.c.role) != "superadmin"))
                if loose:
                    report["attention"].append(f"{loose} non-operator user(s) have no company (tenant_id empty): they are only imported with --include-null-tenant.")
            # users that clash with users already in the shared database
            if target is not None:
                mine = [r[0].strip().lower() for r in c.execute(select(u.c.email).where(imp._tenant_filter(u, source_tenant, include_null_tenant))) if r[0]] if "tenant_id" in u.c else []
                with target.connect() as tc:
                    tmd = MetaData()
                    tmd.reflect(bind=target, only=["users"])
                    tu = tmd.tables["users"]
                    taken = {r[0].strip().lower() for r in tc.execute(select(tu.c.email)) if r[0]}
                clashes = sorted(set(mine) & taken)
                if clashes:
                    report["attention"].append(f"{len(clashes)} user e-mail(s) already exist in the shared database (one e-mail = one account): "
                                               f"{', '.join(clashes[:8])}{' ...' if len(clashes) > 8 else ''}. Choose --email-conflict rename or skip.")
    return report


def print_report(r: Dict[str, Any]) -> None:
    print(f"source: {r['source']}\n")
    print("Companies in this database:")
    for t in r["tenants"]:
        print(f"  tenant {t['id']}: {t['name']} ({t['business_name'] or '-'})  users={t['users']} leads={t['leads']}")
    carried = [t for t in r["tables"] if t["status"] in ("carried over", "translated")]
    print(f"\nTables that carry over: {len(carried)}  ({sum(t['rows'] for t in carried)} rows)")
    for t in carried:
        print(f"  {t['table']:34s} {t['rows']:8d}  {t['status']}{'  (follows its parent)' if t['child_of_parent'] else ''}")
    for status in ("NO HOME in this product", "skipped on purpose"):
        items = [t for t in r["tables"] if t["status"] == status]
        print(f"\n{status}: {len(items)}")
        for t in items:
            print(f"  {t['table']:34s} {t['rows']:8d}  {t['why']}")
    print(f"\nColumns with data that this product does not have (that data is dropped): {len(r['dropped_columns'])}")
    for d in r["dropped_columns"]:
        print(f"  {d['table']}.{d['column']}  ({d['rows_with_data']} row(s))")
    print(f"\nNeeds your attention: {len(r['attention'])}")
    for a in r["attention"]:
        print(f"  - {a}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-env", required=True, help="environment variable holding the source database URL")
    ap.add_argument("--target-env", help="environment variable holding the shared database URL (to find e-mail clashes)")
    ap.add_argument("--source-tenant", type=int)
    ap.add_argument("--include-null-tenant", action="store_true")
    ap.add_argument("--table-map", action="append", default=[], metavar="TARGET=SOURCE")
    ap.add_argument("--json", help="also write the report to this file")
    a = ap.parse_args(argv)
    url = os.environ.get(a.source_env)
    if not url:
        print(f"the environment variable {a.source_env} is not set")
        return 2
    table_map = dict(i.split("=", 1) for i in a.table_map if "=" in i)
    try:
        source = create_engine(url)
        target = create_engine(os.environ[a.target_env]) if a.target_env and os.environ.get(a.target_env) else None
        report = inspect(source, source_tenant=a.source_tenant, include_null_tenant=a.include_null_tenant, table_map=table_map, target=target)
    except Exception as e:
        print(f"could not read the database: {type(e).__name__}: {str(e)[:200]}")
        return 2
    print_report(report)
    if a.json:
        with open(a.json, "w", encoding="utf8") as f:
            json.dump(report, f, indent=2, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
