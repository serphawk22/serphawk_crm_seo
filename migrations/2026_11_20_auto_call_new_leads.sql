-- Auto-call new leads (written but NOT executed as part of this change).
-- PostgreSQL syntax (uses ADD COLUMN IF NOT EXISTS). Run with your normal migration process
-- before deploying the code that reads these columns. Safe to re-run: every statement is conditional.
-- SQLite / startup-managed installs do NOT need this file: database.py::create_db_and_tables()
-- contains the same additive columns in its SQLite-safe migration list.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_call_status VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_called_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_call_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_call_attempts INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_leads_auto_call_status ON leads (auto_call_status);
CREATE INDEX IF NOT EXISTS ix_leads_auto_called_at ON leads (auto_called_at);

-- Existing leads stay untouched: a NULL status means "never claimed for auto-calling".
UPDATE leads SET auto_call_attempts = 0 WHERE auto_call_attempts IS NULL;
