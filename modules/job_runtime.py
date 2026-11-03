"""Small job runtime: cross-process exclusion and credential-free activity summaries.

Postgres locks MUST use direct connections, never transaction pooling. Their
dedicated sockets use autocommit, so IMAP/AI/sleeps do not hold a transaction.
SQLite uses local locks; integration tests cover the PostgreSQL implementation.
"""
import atexit
import hashlib
import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from sqlalchemy import create_engine, event, text
from sqlalchemy.pool import NullPool

INSTANCE = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"
STOP = threading.Event()
atexit.register(STOP.set)
_metrics = ContextVar("job_metrics", default=None)
_owners = ContextVar("job_owners", default=())
_local_locks = {}
_mutex = threading.Lock()


class OwnershipLost(RuntimeError):
    """Stop a worker without treating control-connection loss as a business failure."""


def install_metrics(engine):
    """Install once; queries outside a measured operation incur no logging."""
    if getattr(engine, "_job_metrics_installed", False):
        return
    engine._job_metrics_installed = True

    @event.listens_for(engine, "connect")
    def connected(dbapi_connection, record):
        stats = _metrics.get()
        if stats is not None:
            stats["new_connections"] += 1

    @event.listens_for(engine, "checkout")
    def checkout(dbapi_connection, record, proxy):
        stats = _metrics.get()
        if stats is not None:
            stats["pool_checkouts"] += 1

    @event.listens_for(engine, "before_cursor_execute")
    def before(conn, cursor, statement, parameters, context, executemany):
        context._job_started = time.perf_counter()
        stats = _metrics.get()
        if stats is not None:
            stats["queries"] += 1

    @event.listens_for(engine, "after_cursor_execute")
    def after(conn, cursor, statement, parameters, context, executemany):
        stats = _metrics.get()
        if stats is not None:
            elapsed = (time.perf_counter() - context._job_started) * 1000
            stats["sql_ms"] += elapsed
            stats["slow_queries"] += int(elapsed >= 500)


@contextmanager
def activity(name, engine):
    install_metrics(engine)
    stats = {"job": name, "instance": INSTANCE, "queries": 0, "sql_ms": 0,
             "slow_queries": 0, "examined": 0, "changed": 0, "skipped": 0, "failed": 0,
             "new_connections": 0, "pool_checkouts": 0}
    token = _metrics.set(stats)
    started = time.perf_counter()
    try:
        yield stats
    except Exception:
        stats["failed"] += 1
        raise
    finally:
        _metrics.reset(token)
        parent = _metrics.get()
        if parent is not None:
            for key in ("queries", "sql_ms", "slow_queries", "examined", "changed", "skipped", "failed", "new_connections", "pool_checkouts"):
                parent[key] += stats[key]
        stats["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        stats["sql_ms"] = round(stats["sql_ms"], 2)
        print("[job] " + json.dumps(stats, sort_keys=True))


def tally(**counts):
    stats = _metrics.get()
    if stats is not None:
        for key, value in counts.items():
            stats[key] += value


class Guard:
    def __init__(self, engine, resource):
        self.engine, self.resource = engine, resource
        self.conn = self.control_engine = self.local = None
        self.acquired = False
        self.key = int.from_bytes(hashlib.sha256(resource.encode()).digest()[:8], "big", signed=True)

    def __enter__(self):
        if self.engine.dialect.name != "postgresql":
            with _mutex:
                self.local = _local_locks.setdefault((id(self.engine), self.resource), threading.Lock())
            self.acquired = self.local.acquire(blocking=False)
        else:
            if "-pooler." in (self.engine.url.host or ""):
                raise RuntimeError("Job locks require a direct PostgreSQL endpoint")
            import database
            self.control_engine = create_engine(self.engine.url, poolclass=NullPool,
                                                isolation_level="AUTOCOMMIT", connect_args=database.connect_args)
            install_metrics(self.control_engine)
            try:
                self.conn = self.control_engine.connect()
                self.pid, self.acquired = self.conn.execute(text(
                    "SELECT pg_backend_pid(), pg_try_advisory_lock(:key)"), {"key": self.key}).one()
            except Exception:
                self.__exit__(None, None, None)
                raise
        self.token = _owners.set(_owners.get() + ((self,) if self.acquired else ()))
        return self

    def check(self):
        if not self.acquired:
            raise OwnershipLost("Job does not own its resource")
        if self.conn is not None:
            if self.conn.invalidated or self.conn.closed:
                raise OwnershipLost("Job ownership connection lost")
            try:
                pid = self.conn.execute(text("SELECT pg_backend_pid()")).scalar_one()
            except Exception as exc:
                raise OwnershipLost("Job ownership connection lost") from exc
            if pid != self.pid:
                raise OwnershipLost("Job ownership connection changed")

    def __exit__(self, *args):
        if hasattr(self, "token"):
            _owners.reset(self.token)
        if self.local and self.acquired:
            self.local.release()
        if self.conn is not None:
            # Never return a possibly still-locked session to an application pool.
            try:
                self.conn.close()
            except Exception:
                pass
        if self.control_engine is not None:
            self.control_engine.dispose()


def assert_ownership():
    for owner in _owners.get():
        owner.check()


def exclusive(name, resource=None, busy=0):
    """Nonblocking guard for manual and automatic entrypoints; never log the key."""
    def decorate(fn):
        @wraps(fn)
        def call(*args, **kwargs):
            import database
            import inspect
            bound = inspect.signature(fn).bind(*args, **kwargs)
            engine = bound.arguments.get("engine") or database.engine
            key = resource(*args, **kwargs) if resource else name
            with activity(name, engine), Guard(engine, key) as guard:
                if not guard.acquired:
                    tally(skipped=1)
                    return busy() if callable(busy) else busy
                guard.check()
                return fn(*args, **kwargs)
        return call
    return decorate


def mailbox_resource(cfg, *args, **kwargs):
    # SSL/STARTTLS/legacy configs for the same account must share one guard.
    return "mailbox:" + repr((cfg.tenant_id, cfg.address.lower(), cfg.imap_host.lower(), cfg.login))


def run_recurring(name, step, interval, initial_delay=0):
    import database
    if STOP.wait(initial_delay):
        return
    while not STOP.is_set():
        try:
            with Guard(database.engine, "scheduler:" + name) as leader:
                if leader.acquired:
                    while not STOP.is_set():
                        leader.check()
                        with activity(name, database.engine):
                            step()
                        if STOP.wait(interval):
                            return
                else:
                    with activity(name, database.engine):
                        tally(skipped=1)
        except Exception as exc:
            # Exception messages may contain URLs/credentials supplied by drivers.
            print(f"[job] {name} failed: {type(exc).__name__}")
        STOP.wait(interval)
