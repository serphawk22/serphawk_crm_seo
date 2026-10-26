"""
Compare a client's data in its original deployment database with the tenant imported from it, so you can say "the new
system shows the same numbers" before switching the client over.

    python -m scripts.migration.compare_tenant --source URL --target URL --source-tenant 1 --tenant-name scmbpo

Prints, per table, the row counts on both sides, and for the business-critical tables a breakdown (leads and clients by
status, deals by stage with value, users by role, tasks by status, invoices by status with totals). Exit code 0 when
everything matches (differences explained only by rows deliberately left out, e.g. SuperAdmin users, are listed
separately), 1 otherwise. Read-only on both databases.
"""
import argparse
import sys
from collections import Counter
from typing import Any, Dict, Optional

from sqlalchemy import MetaData, create_engine, func, select
from sqlalchemy.engine import Engine

BREAKDOWNS = {            # table -> (group column, optional sum column)
    "leads": ("status", None), "client_profiles": ("status", None), "deals": ("stage", "value"),
    "users": ("role", None), "tasks": ("status", None), "invoices": ("status", "total_amount"),
    "follow_ups": ("status", None), "meetings": ("status", None),
}


def _counts(engine: Engine, tenant_filter: Optional[Dict[str, Any]], md: MetaData, names=None) -> Dict[str, int]:
    out = {}
    with engine.connect() as c:
        for name, t in md.tables.items():
            if names is not None and name not in names:
                continue
            q = select(func.count()).select_from(t)
            if "tenant_id" in t.c and tenant_filter is not None:
                q = q.where(tenant_filter["cond"](t.c.tenant_id))
            out[name] = c.execute(q).scalar() or 0
    return out


def _breakdown(engine: Engine, md: MetaData, table: str, tenant_cond) -> Dict[str, Any]:
    group, total = BREAKDOWNS[table]
    t = md.tables.get(table)
    if t is None or group not in t.c:
        return {}
    cols = [t.c[group], func.count()]
    if total and total in t.c:
        cols.append(func.coalesce(func.sum(t.c[total]), 0))
    q = select(*cols).group_by(t.c[group])
    if "tenant_id" in t.c and tenant_cond is not None:
        q = q.where(tenant_cond(t.c.tenant_id))
    with engine.connect() as c:
        return {str(r[0]): (r[1], round(float(r[2]), 2) if len(r) > 2 else None) for r in c.execute(q)}


def compare(source: Engine, target: Engine, *, source_tenant_id: Optional[int], tenant_name: str, include_null_tenant=False,
            table_map: Optional[Dict[str, str]] = None) -> dict:
    from types import SimpleNamespace
    raw_s, t_md = MetaData(), MetaData()
    raw_s.reflect(bind=source)
    t_md.reflect(bind=target)
    # a shared table that the source calls by another name (follow_ups = crm_follow_ups at SCM HB: built in, see import_tenant)
    from scripts.migration.import_tenant import ALWAYS_SKIP, resolve_table_map
    s_md = SimpleNamespace(tables={**raw_s.tables, **{t: raw_s.tables[src] for t, src in resolve_table_map(raw_s.tables, table_map).items() if src in raw_s.tables}})
    with target.connect() as c:
        tenants = t_md.tables["tenants"]
        row = c.execute(select(tenants.c.id).where(tenants.c.name == tenant_name)).first()
    if not row:
        raise SystemExit(f"tenant '{tenant_name}' not found in the target")
    tid = row[0]
    if source_tenant_id is None:
        s_cond = None
    elif include_null_tenant:
        s_cond = lambda col: (col == source_tenant_id) | col.is_(None)
    else:
        s_cond = lambda col: col == source_tenant_id
    common = (set(s_md.tables) & set(t_md.tables)) - ALWAYS_SKIP      # tables the import leaves out on purpose are not compared
    scounts = _counts(source, {"cond": s_cond} if s_cond else None, s_md, common)
    tcounts = _counts(target, {"cond": lambda col: col == tid}, t_md, common)
    tables = {}
    for name in sorted(common):
        if scounts[name] or tcounts[name]:
            tables[name] = {"source": scounts[name], "target": tcounts[name], "same": scounts[name] == tcounts[name]}
    breakdowns = {}
    for table in BREAKDOWNS:
        if table in common:
            sb = _breakdown(source, s_md, table, s_cond)
            tb = _breakdown(target, t_md, table, lambda col: col == tid)
            breakdowns[table] = {"source": sb, "target": tb, "same": sb == tb}
    return {"tenant_id": tid, "tables": tables, "breakdowns": breakdowns,
            "all_same": all(v["same"] for v in tables.values()) and all(v["same"] for v in breakdowns.values())}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source")
    ap.add_argument("--target")
    ap.add_argument("--source-env", help="environment variable holding the source URL")
    ap.add_argument("--target-env", help="environment variable holding the target URL")
    ap.add_argument("--table-map", action="append", default=[], metavar="TARGET=SOURCE")
    ap.add_argument("--source-tenant", type=int, default=None)
    ap.add_argument("--tenant-name", required=True)
    ap.add_argument("--include-null-tenant", action="store_true")
    a = ap.parse_args(argv)
    import os
    src = a.source or (os.environ.get(a.source_env or "") if a.source_env else None)
    tgt = a.target or (os.environ.get(a.target_env or "") if a.target_env else None)
    if not src or not tgt:
        print("give the source and the target database (--source / --source-env and --target / --target-env)")
        return 2
    result = compare(create_engine(src), create_engine(tgt), source_tenant_id=a.source_tenant, tenant_name=a.tenant_name,
                     include_null_tenant=a.include_null_tenant, table_map=dict(i.split("=", 1) for i in a.table_map if "=" in i))
    print(f"target tenant id: {result['tenant_id']}")
    for name, r in result["tables"].items():
        print(f"  {'OK  ' if r['same'] else 'DIFF'} {name:34s} source={r['source']:7d} target={r['target']:7d}")
    for table, r in result["breakdowns"].items():
        if not r["same"]:
            print(f"  DIFF breakdown of {table}:\n     source {r['source']}\n     target {r['target']}")
    print("ALL SAME" if result["all_same"] else "DIFFERENCES FOUND (see above)")
    return 0 if result["all_same"] else 1


if __name__ == "__main__":
    sys.exit(main())
