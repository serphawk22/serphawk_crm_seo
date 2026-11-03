"""Synthetic-only regression benchmark. Run in the test container, never with a live DB.

python -m scripts.performance.neon_benchmark --output docs/performance/neon-before.json
"""
import argparse
import json
import statistics
import time
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path
from unittest import mock

from sqlalchemy import event
from sqlmodel import Session
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Lead, SentEmail, EmailReply, LeadNote, FollowUpNoteScan
from modules import email_sender, followups_core


class Mailbox:
    def __init__(self, count=1000):
        self.raws = {}
        self.body_fetches = 0
        for i in range(1, count + 1):
            msg = MIMEText("Synthetic reply")
            msg["From"] = "prospect@example.test"
            msg["Message-ID"] = f"<bench-{i}@example.test>"
            msg["Subject"] = "Synthetic"
            self.raws[str(i)] = msg.as_bytes()

    def search(self, *args):
        return "OK", [" ".join(self.raws).encode()]

    def fetch(self, ids, spec):
        ids = ids.decode() if isinstance(ids, bytes) else str(ids)
        out = []
        for uid in ids.split(","):
            raw = self.raws[uid]
            if "HEADER" in spec:
                raw = raw.split(b"\n\n", 1)[0] + b"\n\n"
            else:
                self.body_fetches += 1
            out.extend([(f"{uid} (UID {uid} BODY[] {{{len(raw)}}}".encode(), raw), b")"])
        return "OK", out

    def uid(self, command, *args):
        return self.search(*args) if command == "SEARCH" else self.fetch(*args)


def measure(fn, repeats=7):
    samples, queries, loaded = [], [], []
    for _ in range(repeats):
        counters = [0, 0]
        def sql(*args):
            counters[0] += 1
        def load(*args):
            counters[1] += 1
        event.listen(S.ENGINE, "before_cursor_execute", sql)
        event.listen(Session, "loaded_as_persistent", load)
        started = time.perf_counter()
        try:
            fn()
        finally:
            samples.append((time.perf_counter() - started) * 1000)
            queries.append(counters[0])
            loaded.append(counters[1])
            event.remove(S.ENGINE, "before_cursor_execute", sql)
            event.remove(Session, "loaded_as_persistent", load)
    return {"queries": queries, "orm_rows_loaded": loaded,
            "median_ms": round(statistics.median(samples), 3),
            "p95_ms": round(sorted(samples)[-1], 3), "samples_ms": samples}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--compare", help="Assert the dashboard contract against a previous synthetic run")
    args = parser.parse_args()
    fixture = TenantIsolationBase()
    fixture.setUp()
    now = datetime.now(timezone.utc)
    with Session(S.ENGINE) as session:
        session._is_auditing = True
        session.add_all([Lead(tenant_id=2, owner_id=fixture.users[2], company_name=f"Synthetic {i}",
                             status="New", source="Web") for i in range(1000)])
        session.add(SentEmail(id=100, tenant_id=2, subject="Synthetic", to_email="prospect@example.test", sent_at=now))
        session.commit()
        session.add_all([EmailReply(tenant_id=2, sent_email_id=100, message_id=f"<bench-{i}@example.test>")
                         for i in range(1, 1001)])
        for i in range(1, 101):
            session.add(LeadNote(id=1000+i, tenant_id=2, lead_id=fixture.leads[2], content="Already scanned", created_at=now))
            session.add(FollowUpNoteScan(tenant_id=2, source_key=f"leadnote-{1000+i}", scanned_at=now))
        session.commit()
    box = Mailbox()
    result = {}
    with mock.patch.object(email_sender, "_product_name", return_value="Synthetic"):
        result["known_replies_1000"] = measure(lambda: email_sender._process_inbox_replies(
            box, "sender@example.test", 5, tenant_id=2))
    result["known_replies_1000"]["body_fetches_per_cycle"] = box.body_fetches // 7
    result["scanned_notes_100"] = measure(lambda: followups_core.scan_notes(S.ENGINE, tenant_id=2))
    def dashboard():
        response = fixture.client.get("/dashboard-stats", headers=fixture.as_tenant(2))
        assert response.status_code == 200, response.text
        result["dashboard_response"] = response.json()
    dashboard()  # warm feature/settings caches
    result["dashboard_1000_leads"] = measure(dashboard)
    if args.compare:
        previous = json.loads(Path(args.compare).read_text(encoding="utf-8"))
        assert result["dashboard_response"] == previous["dashboard_response"], "Dashboard contract changed"
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2), encoding="utf-8")
    fixture.doCleanups()
    print(json.dumps({k: v for k, v in result.items() if k != "dashboard_response"}, indent=2))


if __name__ == "__main__":
    main()
