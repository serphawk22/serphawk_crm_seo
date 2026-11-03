"""Master switch for the background pollers (inbox sync, reply checker, follow-up scheduler).

`BACKGROUND_JOBS=0` (also false / no / off) stops them from starting. Use it on any local or staging
backend whose DATABASE_URL points at a database another backend already serves: those jobs read every
configured mailbox and send reminders / auto-send emails, so only ONE environment per database should
run them. Manual actions (the Inbox "Sync now" button, /webhook/check-replies-now) still work.
"""
import os
import threading

_keepalive_started = False
_keepalive_lock = threading.Lock()


def jobs_enabled() -> bool:
    return os.getenv("BACKGROUND_JOBS", "1").strip().lower() not in ("0", "false", "no", "off")


def start_keepalive(engine):
    """Explicit opt-in only; application traffic already validates stale sockets."""
    global _keepalive_started
    if not jobs_enabled() or os.getenv("DB_KEEPALIVE", "0").strip().lower() not in ("1", "true", "yes", "on"):
        return False
    from modules.job_runtime import run_recurring
    from sqlalchemy import text
    def ping():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    with _keepalive_lock:
        if _keepalive_started:
            return False
        threading.Thread(target=run_recurring, args=("keepalive", ping, 60, 60),
                         daemon=True, name="db-keepalive").start()
        _keepalive_started = True
    return True
