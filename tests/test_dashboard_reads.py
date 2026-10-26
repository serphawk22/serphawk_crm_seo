"""Read-only dashboard endpoints that used to answer 500 on PostgreSQL (timezone-less dates, rows that were not JSON)."""
from sqlmodel import Session

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import ActivityLog


class DashboardReads(TenantIsolationBase):
    def h(self, tid=2):
        return {"X-User-ID": str(self.users[tid])}

    def test_global_activities_returns_the_companys_rows_as_json(self):
        with Session(S.ENGINE) as s:
            s.add(ActivityLog(action="Did a thing", tenant_id=2))
            s.add(ActivityLog(action="Other company", tenant_id=3))
            s.commit()
        r = self.client.get("/activities/global", headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([a["action"] for a in r.json()["activities"]], ["Did a thing"])

    def test_monitor_stats_and_api_intelligence_answer(self):
        for path in ("/monitor-stats", "/api-intelligence/overview", "/api-intelligence/charts/trend"):
            r = self.client.get(path, headers=self.h(2))
            self.assertLess(r.status_code, 500, f"{path}: {r.status_code} {r.text[:200]}")
