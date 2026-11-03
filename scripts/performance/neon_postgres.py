"""Execution-plan experiments on a disposable LOCAL PostgreSQL database only."""
import argparse
import json
import os
import statistics
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import create_engine, text, insert
from sqlalchemy.engine import make_url
from sqlmodel import SQLModel
import database
import addons  # register all models
from database import Tenant, SentEmail, InboxMessage, FollowUp

INDEXES = {
    "recipient": "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sent_emails_tenant_recipient_time ON sent_emails (tenant_id, lower(to_email), sent_at DESC)",
    "unclassified": "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inbox_pending_classification ON inbox_messages (received_at DESC) WHERE ai_classified_at IS NULL",
    "due": "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_follow_ups_pending_reminder ON follow_ups ((COALESCE(remind_at, due_at)), due_at) WHERE status IN ('Pending', 'In Progress') AND reminder_sent_at IS NULL",
}
QUERIES = {
    "recipient": "SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY lower(to_email) ORDER BY sent_at DESC) AS position FROM sent_emails WHERE tenant_id=2 AND lower(to_email) IN ('user7@example.test')) candidates WHERE position <= 1",
    "unclassified": "SELECT * FROM inbox_messages WHERE ai_classified_at IS NULL ORDER BY received_at DESC LIMIT 30",
    "due": "SELECT * FROM follow_ups WHERE status IN ('Pending', 'In Progress') AND reminder_sent_at IS NULL AND COALESCE(remind_at, due_at) <= CURRENT_TIMESTAMP ORDER BY due_at LIMIT 50",
    "dashboard": "SELECT date(sent_at AT TIME ZONE 'UTC'), count(id) FROM sent_emails WHERE tenant_id=2 AND sent_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' GROUP BY date(sent_at AT TIME ZONE 'UTC')",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    base = make_url(os.environ["TEST_POSTGRES_URL"])
    if base.host not in {"crm-neon-audit-db", "localhost", "127.0.0.1", "db"}:
        raise SystemExit("Refusing non-local PostgreSQL")
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text("DROP DATABASE IF EXISTS crm_neon_compute_bench WITH (FORCE)"))
        connection.execute(text("CREATE DATABASE crm_neon_compute_bench"))
    engine = create_engine(base.set(database="crm_neon_compute_bench"), isolation_level="AUTOCOMMIT")
    SQLModel.metadata.create_all(engine)
    now = datetime.now(timezone.utc)
    def write_trials():
        samples = []
        for _ in range(7):
            with engine.connect().execution_options(isolation_level="READ COMMITTED") as writer:
                transaction = writer.begin()
                started = time.perf_counter()
                writer.execute(insert(SentEmail), [dict(tenant_id=2, subject="Synthetic write", to_email=f"write{i}@example.test", sent_at=now) for i in range(100)])
                writer.execute(insert(InboxMessage), [dict(tenant_id=2, mailbox="write@example.test", message_id=f"<write-{i}>", from_address="write@example.test", received_at=now) for i in range(100)])
                writer.execute(insert(FollowUp), [dict(tenant_id=2, title="Synthetic write", due_at=now) for _ in range(100)])
                samples.append((time.perf_counter() - started) * 1000)
                transaction.rollback()
        return samples
    with engine.connect() as connection:
        for name in ("ix_sent_emails_tenant_recipient_time", "ix_inbox_pending_classification", "ix_follow_ups_pending_reminder"):
            connection.execute(text(f"DROP INDEX IF EXISTS {name}"))
        connection.execute(insert(Tenant), [{"id": 2, "name": "synthetic-two"}, {"id": 3, "name": "synthetic-three"}])
        for offset in range(0, 20000, 1000):
            connection.execute(insert(SentEmail), [dict(tenant_id=2 if i % 2 else 3,
                subject="Synthetic", to_email=f"user{i % 1000}@example.test", sent_at=now-timedelta(days=i % 730))
                for i in range(offset, offset+1000)])
            connection.execute(insert(InboxMessage), [dict(tenant_id=2, mailbox="synthetic@example.test",
                message_id=f"<synthetic-{i}>", from_address="sender@example.test", received_at=now-timedelta(minutes=i),
                ai_classified_at=None if i % 997 == 0 else now) for i in range(offset, offset+1000)])
            connection.execute(insert(FollowUp), [dict(tenant_id=2, title="Synthetic", due_at=now-timedelta(minutes=i),
                status="Pending" if i % 997 == 0 else "Completed") for i in range(offset, offset+1000)])
        connection.execute(text("ANALYZE"))
        writes_before = write_trials()
        result = {}
        for name, query in QUERIES.items():
            def plans():
                return [connection.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query)).scalar_one()[0] for _ in range(7)]
            before = plans()
            if name in INDEXES:
                connection.execute(text(INDEXES[name]))
                connection.execute(text("ANALYZE"))
            after = plans()
            result[name] = {"query": query, "candidate_index": INDEXES.get(name),
                "before_median_ms": statistics.median(p["Execution Time"] for p in before),
                "after_median_ms": statistics.median(p["Execution Time"] for p in after),
                "before": before[-1], "after": after[-1]}
        writes_after = write_trials()
        result["writes_300_rows_rollback"] = {"before_median_ms": statistics.median(writes_before),
            "after_median_ms": statistics.median(writes_after), "before_samples_ms": writes_before, "after_samples_ms": writes_after}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({name: {key: value for key, value in row.items() if key.endswith("median_ms")} for name, row in result.items()}, indent=2))
    engine.dispose()
    with admin.connect() as connection:
        connection.execute(text("DROP DATABASE crm_neon_compute_bench WITH (FORCE)"))
    admin.dispose()


if __name__ == "__main__":
    main()
