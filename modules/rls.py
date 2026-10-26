"""
PostgreSQL Row-Level Security: a database-level backstop behind the ORM tenant filter.

The ORM filter (modules/tenant_scope.py) cannot see raw ``text()`` SQL or a query someone forgot to scope.
With RLS enabled, Postgres itself refuses to return or write another tenant's row, whatever the SQL says.

How it works
  * Every tenant-owned table (those with a ``tenant_id`` column, minus tenant_scope.GLOBAL_TABLES) gets a
    policy ``app_rls_allows(tenant_id)`` for reads and writes, and FORCE ROW LEVEL SECURITY so the table
    owner is bound too.
  * ``install()`` hooks ``Session.after_begin``: at the start of every transaction it sets two
    transaction-local settings: ``app.tenant_id`` (the request's tenant) or ``app.bypass_rls = 'on'`` when
    there is no tenant context (background workers, SuperAdmin without a tenant, startup code).
  * Statements marked ``skip_tenant`` switch bypass on for the rest of their transaction.
  * A connection that never set either setting sees NO rows (fails closed).

Rollout: off by default. Set ``RLS_MODE=enforce`` to enable on startup. Roles with SUPERUSER or BYPASSRLS
always bypass RLS in Postgres, so the application must connect as an ordinary role. Test on a copy first and
audit ``skip_tenant`` call sites. ``RLS_MODE=off`` plus ``disable_rls()`` reverses it.
"""
from typing import Callable, Iterable, Optional

from sqlalchemy import event, text
from sqlalchemy.orm import Session as SASession

from modules import tenant_scope

POLICY_NAME = "tenant_isolation"

_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION app_rls_allows(row_tenant integer) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on'
      OR (row_tenant IS NOT NULL
          AND row_tenant = NULLIF(current_setting('app.tenant_id', true), '')::integer)
$$
"""

_installed = False


def rls_tables() -> list:
    return sorted({m.__table__.name for m in tenant_scope.tenant_scoped_models()})


def _existing_tables(conn) -> set:
    rows = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"))
    return {r[0] for r in rows}


def enable_rls(engine, tables: Optional[Iterable[str]] = None) -> list:
    """Create the policy function and enable + force RLS with one policy per table. Idempotent.
    Returns the tables that were protected. No-op (returns []) on non-PostgreSQL databases."""
    if engine.dialect.name != "postgresql":
        return []
    done = []
    with engine.begin() as conn:
        conn.execute(text(_FUNCTION_SQL))
        present = _existing_tables(conn)
        for table in (tables or rls_tables()):
            if table not in present:
                continue
            conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
            conn.execute(text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))
            conn.execute(text(f'DROP POLICY IF EXISTS {POLICY_NAME} ON "{table}"'))
            conn.execute(text(
                f'CREATE POLICY {POLICY_NAME} ON "{table}" '
                f'USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id))'))
            done.append(table)
    return done


def disable_rls(engine, tables: Optional[Iterable[str]] = None) -> list:
    """Reverse enable_rls() (rollback path)."""
    if engine.dialect.name != "postgresql":
        return []
    done = []
    with engine.begin() as conn:
        present = _existing_tables(conn)
        for table in (tables or rls_tables()):
            if table not in present:
                continue
            conn.execute(text(f'DROP POLICY IF EXISTS {POLICY_NAME} ON "{table}"'))
            conn.execute(text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
            conn.execute(text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))
            done.append(table)
    return done


def install(tenant_getter: Callable[[], Optional[int]]) -> None:
    """Register the Session hooks that tell Postgres which tenant each transaction belongs to. Idempotent."""
    global _installed
    if _installed:
        return
    _installed = True

    @event.listens_for(SASession, "after_begin")
    def _set_context(session, transaction, connection):
        if connection.dialect.name != "postgresql":
            return
        tid = tenant_getter()
        if tid is None:
            connection.exec_driver_sql("SELECT set_config('app.bypass_rls', 'on', true), set_config('app.tenant_id', '', true)")
        else:
            connection.exec_driver_sql(
                "SELECT set_config('app.bypass_rls', 'off', true), set_config('app.tenant_id', %s, true)",
                (str(int(tid)),))

    @event.listens_for(SASession, "do_orm_execute")
    def _skip_tenant_bypass(execute_state):
        if execute_state.execution_options.get("skip_tenant"):
            conn = execute_state.session.connection()
            if conn.dialect.name == "postgresql":
                conn.exec_driver_sql("SELECT set_config('app.bypass_rls', 'on', true)")


if __name__ == "__main__":
    # python -m modules.rls enable | disable | tables      (run as the table OWNER, with DATABASE_URL set)
    import sys
    import addons  # noqa: F401  (registers every model, including the add-ons)
    import database
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tables"
    if cmd == "enable":
        print(f"RLS enabled on {len(enable_rls(database.engine))} tables")
    elif cmd == "disable":
        print(f"RLS disabled on {len(disable_rls(database.engine))} tables")
    else:
        print(chr(10).join(rls_tables()))
