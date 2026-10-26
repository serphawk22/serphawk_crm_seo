"""
Read-only pre-deploy check: what would booting this code change in a live database?

    set DATABASE_URL_TO_CHECK=postgresql://...        (never put the URL on the command line)
    python -m scripts.check_schema --url-env DATABASE_URL_TO_CHECK

It only reads the catalogue (information_schema); it never writes, creates or alters anything and never reads a .env.

  * tables the code has that the database lacks      created automatically on boot (create_all)
  * columns the code has that the database lacks     added automatically on boot when an ALTER for them is in the code
                                                     (database.py / main.py); otherwise NEEDS A MANUAL MIGRATION
  * tables and columns the database has that the code does not know about are listed for information and never touched

Exit code 0: a boot will bring the database up to date. 1: some column has no automatic ALTER (the code would fail on it).
2: bad arguments / could not connect.
"""
import argparse
import os
import re
import sys
from pathlib import Path
from typing import Dict, List

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parent.parent


def _boot_sql() -> str:
    parts = []
    for name in ("database.py", "main.py"):
        try:
            parts.append((ROOT / name).read_text(encoding="utf8", errors="ignore"))
        except OSError:
            pass
    return "\n".join(parts)


def _has_auto_alter(sql_text: str, table: str, column: str) -> bool:
    pattern = rf'ALTER\s+TABLE\s+"?{re.escape(table)}"?\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?{re.escape(column)}"?\b'
    return re.search(pattern, sql_text, re.IGNORECASE) is not None


def check(engine) -> dict:
    import addons  # noqa: F401  (registers the add-on tables)
    import database  # noqa: F401
    from sqlmodel import SQLModel

    boot = _boot_sql()
    insp = inspect(engine)
    live_tables = set(insp.get_table_names())
    wanted = {t.name: t for t in SQLModel.metadata.tables.values()}
    report: Dict[str, object] = {"missing_tables": [], "missing_columns_auto": [], "missing_columns_manual": [],
                                 "unknown_tables": sorted(live_tables - set(wanted)), "unknown_columns": {}}
    for name, table in sorted(wanted.items()):
        if name not in live_tables:
            report["missing_tables"].append(name)
            continue
        live_cols = {c["name"] for c in insp.get_columns(name)}
        for col in table.columns:
            if col.name in live_cols:
                continue
            entry = f"{name}.{col.name}"
            (report["missing_columns_auto"] if _has_auto_alter(boot, name, col.name) else report["missing_columns_manual"]).append(entry)
        extra = sorted(live_cols - {c.name for c in table.columns})
        if extra:
            report["unknown_columns"][name] = extra
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url-env", required=True, help="name of the environment variable that holds the database URL")
    a = ap.parse_args(argv)
    url = os.environ.get(a.url_env)
    if not url:
        print(f"the environment variable {a.url_env} is not set")
        return 2
    try:
        engine = create_engine(url)
        shown = make_url(engine.url.render_as_string(hide_password=True))
        print(f"checking: {shown.get_backend_name()} host={shown.host or 'local file'} db={shown.database}")
        report = check(engine)
    except Exception as e:
        print(f"could not read the database: {type(e).__name__}")
        return 2

    def section(title: str, items: List[str], note: str = ""):
        print(f"\n{title}: {len(items)}{(' ' + note) if note else ''}")
        for i in items[:200]:
            print(f"  - {i}")

    section("Tables a boot will create", report["missing_tables"])
    section("Columns a boot will add", report["missing_columns_auto"])
    section("Columns with NO automatic ALTER (need a manual migration)", report["missing_columns_manual"])
    print(f"\nTables only the database has (never touched): {len(report['unknown_tables'])}")
    if report["missing_columns_manual"]:
        print("\nRESULT: a boot will NOT fully update this database.")
        return 1
    print("\nRESULT: a boot brings this database up to date; nothing is dropped or deleted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
