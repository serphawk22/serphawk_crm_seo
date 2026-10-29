"""
Shared fixtures for tests that call main.py endpoints.

`main` is imported once, with database.engine already pointed at an in-memory SQLite engine, and each
test re-points every module-level engine reference at that same engine and overrides main.get_session.
TestClient is used without its context manager, so the startup hook (pollers, account provisioning,
migrations) never runs. Nothing here reads a .env or touches a real database or mailbox.
"""
import importlib
import os
import sys
import warnings
from unittest import mock

os.environ.setdefault("PYTHON_DOTENV_DISABLED", "1")
os.environ.setdefault("BACKGROUND_JOBS", "0")
os.environ.setdefault("DB_KEEPALIVE", "0")   # the ping thread shares the tests' single in-memory connection and rolls back whatever a test is saving

from sqlalchemy.exc import SAWarning
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import database
import addons  # noqa: F401  (registers the add-on tables before any test builds the schema)

ENGINE = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
database.engine = ENGINE

# Modules that bind `engine` (or `default_engine`) at import time.
_ENGINE_HOLDERS = ("database", "main", "routers.email_tracking", "routers.inbox", "routers.followups",
                   "routers.email_campaigns", "modules.inbox_sync", "modules.api_tracker", "routers.leaderboard",
                   "routers.voice_agent", "routers.tenant_config", "routers.registration", "routers.workspace",
                   "routers.customization_requests", "modules.conversation_store", "addons.business_suite.scm2",
                   "addons.business_suite.command_center", "addons.business_suite.extras", "addons.institute.routes")


def load_main():
    if "main" not in sys.modules:
        database.engine = ENGINE
    return importlib.import_module("main")


def reset_context():
    """Forget the "current company / user / client" of whatever ran before on this thread.

    Some code under test (the follow-up scheduler loops over companies) sets these on the calling thread and leaves the last
    value behind. A later test would then read its own fixtures through that company's filter, and which company is "last"
    depends on set ordering, i.e. on Python's hash seed: a test that passes on one run and errors on the next."""
    from modules.api_tracker import current_client_id, current_endpoint, current_salesperson_id
    from modules.tenant_scope import current_tenant_id
    current_tenant_id.set(None)
    current_salesperson_id.set(None)
    current_client_id.set(None)
    current_endpoint.set("background_task")


def reset_db(engine=ENGINE):
    reset_context()
    with warnings.catch_warnings():
        # Existing models have a leads <-> client_profiles <-> projects FK cycle SQLite can't sort.
        warnings.simplefilter("ignore", SAWarning)
        SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def use_engine(testcase, engine=ENGINE):
    """Point every module-level engine reference at `engine` for the duration of one test."""
    for name in _ENGINE_HOLDERS:
        mod = sys.modules.get(name)
        if mod is None:
            continue
        for attr in ("engine", "default_engine"):
            if hasattr(mod, attr):
                p = mock.patch.object(mod, attr, engine)
                p.start()
                testcase.addCleanup(p.stop)


def main_client(testcase, engine=ENGINE):
    """TestClient for the real main.app (real middleware, tenant filter and routes), no lifespan."""
    from fastapi.testclient import TestClient

    # Older route fixtures deliberately exercise compatibility headers. Production
    # defaults to signed sessions; tests of that default explicitly unset this flag.
    if "LEGACY_USER_HEADER" not in os.environ:
        p = mock.patch.dict(os.environ, {"LEGACY_USER_HEADER": "1"})
        p.start()
        testcase.addCleanup(p.stop)

    main = load_main()
    use_engine(testcase, engine)
    testcase.addCleanup(reset_context)
    if hasattr(main, "_USER_TENANT_CACHE"):
        main._USER_TENANT_CACHE.clear()  # the middleware caches user -> (role, tenant)

    def _session():
        with Session(engine) as s:
            yield s

    main.app.dependency_overrides[main.get_session] = _session
    testcase.addCleanup(main.app.dependency_overrides.pop, main.get_session, None)
    return TestClient(main.app, raise_server_exceptions=False)
