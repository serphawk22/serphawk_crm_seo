"""Meetings with time zones, sales scoping, the task sheet, client / lead status changes, the AI company report and the
management dashboard: the SCM BPO / SCM HB behaviours, switched on per company."""
import os
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from addons.business_suite.models import LeadSource, OwnershipHistory
from database import ClientProfile, ClientResearch, Deal, Lead, Meeting, Proposal, TaskSheetEntry, User
from modules import features, tenant_settings


class Base(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        p = mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""})
        p.start()
        self.addCleanup(p.stop)
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, 2, {"sales_scoping": True})       # company 2 follows the sales rules, 3 does not
            self.reps = {}
            for tid in (2, 3):
                for name, role in (("anu", "SalesManager"), ("ben", "SalesManager"), ("demo", "Demo")):
                    u = User(email=f"{name}@t{tid}.test", password="x", name=name.title(), role=role, tenant_id=tid)
                    s.add(u)
                    s.commit()
                    s.refresh(u)
                    self.reps[(tid, name)] = u.id

    def h(self, tid, who="admin"):
        return {"X-User-ID": str(self.users[tid] if who == "admin" else self.reps[(tid, who)])}


class Meetings(Base):
    def make(self, tid=2, who="admin", **extra):
        body = {"title": "Kickoff", "scheduled_at": "2031-05-01T10:00", "duration_minutes": 60, **extra}
        return self.client.post("/meetings", json=body, headers=self.h(tid, who))

    def test_a_zoned_time_is_stored_in_utc_and_shown_in_both_zones(self):
        r = self.make(timezone="Asia/Kolkata", meeting_link="https://meet.test/abc")
        self.assertEqual(r.status_code, 200, r.text)
        m = r.json()["meeting"]
        self.assertEqual((m["scheduled_at"], m["end_at"]), ("2031-05-01T04:30:00Z", "2031-05-01T05:30:00Z"))
        self.assertEqual((m["scheduled_at_local"], m["timezone"], m["meeting_link"]), ("2031-05-01T10:00", "Asia/Kolkata", "https://meet.test/abc"))
        self.assertEqual(m["created_by"], self.users[2])

    def test_an_explicit_offset_wins_and_a_bad_zone_is_refused(self):
        m = self.make(timezone="Asia/Kolkata", scheduled_at="2031-05-01T10:00:00+00:00").json()["meeting"]
        self.assertEqual(m["scheduled_at"], "2031-05-01T10:00:00Z")
        self.assertEqual(self.make(timezone="Mars/Olympus").status_code, 400)

    def test_without_a_zone_the_old_shape_is_kept(self):
        m = self.make(tid=3).json()["meeting"]
        self.assertIsNone(m["timezone"])
        self.assertFalse(m["scheduled_at"].endswith("Z"))
        self.assertTrue(m["scheduled_at"].startswith("2031-05-01T10:00"))

    def test_the_organisers_saved_zone_is_the_default(self):
        with Session(S.ENGINE) as s:
            u = s.get(User, self.users[3])
            u.timezone = "America/Mexico_City"
            s.add(u)
            s.commit()
        m = self.make(tid=3).json()["meeting"]
        self.assertEqual((m["timezone"], m["scheduled_at_local"]), ("America/Mexico_City", "2031-05-01T10:00"))
        self.assertEqual(m["scheduled_at"], "2031-05-01T16:00:00Z")

    def test_links_to_other_companies_records_are_refused(self):
        self.assertEqual(self.make(lead_id=self.leads[3]).status_code, 400)
        self.assertEqual(self.make(client_id=self.clients[3]).status_code, 400)
        self.assertEqual(self.make(host_id=self.users[3]).status_code, 400)
        self.assertEqual(self.make(lead_id=self.leads[2]).status_code, 200)

    def test_salespeople_only_see_their_own_meetings_where_scoping_is_on(self):
        mine = self.make(who="anu").json()["meeting"]
        self.assertEqual(mine["host_id"], self.reps[(2, "anu")], "the creator hosts by default")
        theirs = self.make(who="ben").json()["meeting"]
        ids = lambda who: {m["id"] for m in self.client.get("/meetings", headers=self.h(2, who)).json()["meetings"]}   # noqa: E731
        self.assertEqual(ids("anu"), {mine["id"]})
        self.assertEqual(ids("ben"), {theirs["id"]})
        self.assertEqual(ids("admin"), {mine["id"], theirs["id"]})
        self.assertEqual(ids("demo"), {mine["id"], theirs["id"]}, "Demo sees everything, as in the Inbox")
        for method, path in (("get", ""), ("put", ""), ("delete", ""), ("patch", "/status")):
            r = self.client.request(method.upper(), f"/meetings/{theirs['id']}{path}", json={"status": "Completed"}, headers=self.h(2, "anu"))
            self.assertEqual(r.status_code, 403, f"{method}: {r.text}")
        self.assertEqual(self.client.get(f"/meetings/{mine['id']}", headers=self.h(2, "anu")).status_code, 200)

    def test_a_meeting_assigned_to_a_colleague_is_visible_to_both(self):
        m = self.make(who="anu", host_id=self.reps[(2, "ben")]).json()["meeting"]
        for who in ("anu", "ben"):
            self.assertEqual(self.client.get(f"/meetings/{m['id']}", headers=self.h(2, who)).status_code, 200)

    def test_companies_without_scoping_keep_everything_visible(self):
        m = self.make(tid=3, who="anu").json()["meeting"]
        self.assertIsNone(m["host_id"], "no host is invented")
        ids = {x["id"] for x in self.client.get("/meetings", headers=self.h(3, "ben")).json()["meetings"]}
        self.assertEqual(ids, {m["id"]})

    def test_patch_works_like_put_and_a_company_never_sees_anothers(self):
        m = self.make().json()["meeting"]
        r = self.client.patch(f"/meetings/{m['id']}/status", json={"status": "Completed", "outcome": "Signed"}, headers=self.h(2))
        self.assertEqual((r.status_code, r.json()["meeting"]["status"], r.json()["meeting"]["outcome"]), (200, "Completed", "Signed"))
        self.assertEqual(self.client.get(f"/meetings/{m['id']}", headers=self.h(3)).status_code, 404)
        r = self.client.put(f"/meetings/{m['id']}", json={"scheduled_at": "2031-06-01T09:00", "timezone": "Europe/London"}, headers=self.h(2))
        self.assertEqual(r.json()["meeting"]["scheduled_at"], "2031-06-01T08:00:00Z")


class TaskSheet(Base):
    def sheet(self, tid, who, **extra):
        body = {"user_id": self.reps[(tid, who)] if who != "admin" else self.users[tid], "work_date": datetime.utcnow().date().isoformat(),
                "summary": f"work by {who}", "outreaches_count": 10, "positives_count": 4, "key_focus": "Cold calls", **extra}
        return self.client.post("/task-sheet", json=body, headers=self.h(tid, who))

    def test_a_salesperson_submits_for_themselves_but_cannot_read_edit_or_delete(self):
        r = self.sheet(2, "anu", user_id=self.reps[(2, "ben")])
        self.assertEqual(r.status_code, 200, r.text)
        entry = r.json()["entry"]
        self.assertEqual(entry["user_id"], self.reps[(2, "anu")], "the user id in the request is ignored")
        self.assertEqual((entry["outreaches_count"], entry["key_focus"]), (10, "Cold calls"))
        h = self.h(2, "anu")
        self.assertEqual(self.client.get("/task-sheet", headers=h).status_code, 403)
        self.assertEqual(self.client.put(f"/task-sheet/{entry['id']}", json={**entry}, headers=h).status_code, 403)
        self.assertEqual(self.client.delete(f"/task-sheet/{entry['id']}", headers=h).status_code, 403)
        self.assertEqual(self.client.post("/task-sheet/ai-summary", json={}, headers=h).status_code, 403)

    def test_an_admin_reads_filters_edits_and_deletes(self):
        self.sheet(2, "anu")
        self.sheet(2, "ben", outreaches_count=50, positives_count=1)
        yesterday = (datetime.utcnow().date() - timedelta(days=1)).isoformat()
        self.assertEqual(self.sheet(2, "admin", work_date=yesterday).status_code, 200, "an admin may add a past day")
        rows = self.client.get("/task-sheet?period=today", headers=self.h(2)).json()["entries"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(len(self.client.get("/task-sheet?period=yesterday", headers=self.h(2)).json()["entries"]), 1)
        self.assertEqual(len(self.client.get("/task-sheet", headers=self.h(2)).json()["entries"]), 3)
        eid = rows[0]["id"]
        r = self.client.put(f"/task-sheet/{eid}", json={"user_id": rows[0]["user_id"], "work_date": rows[0]["work_date"], "summary": "edited"}, headers=self.h(2))
        self.assertEqual(r.json()["entry"]["summary"], "edited")
        self.assertEqual(self.client.delete(f"/task-sheet/{eid}", headers=self.h(2)).json()["ok"], True)
        self.assertEqual(self.client.delete(f"/task-sheet/{eid}", headers=self.h(2)).status_code, 404)

    def test_the_ai_summary_compares_people_and_works_without_an_ai_key(self):
        self.sheet(2, "anu", outreaches_count=20, positives_count=8, meetings_scheduled=3)
        self.sheet(2, "ben", outreaches_count=40, positives_count=2)
        r = self.client.post("/task-sheet/ai-summary", json={"period": "today"}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual((body["total_outreaches"], body["total_positives"], body["positive_rate"]), (60, 10, "16.7%"))
        by = {row["salesperson"]: row for row in body["comparison_table"]}
        self.assertEqual((by["Anu"]["rating"], by["Ben"]["rating"]), ("High momentum", "Needs support"))
        self.assertIn("60 outreaches", body["executive_summary"])

    def test_a_company_never_sees_anothers_entries(self):
        self.sheet(2, "anu")
        self.sheet(3, "anu")
        rows = self.client.get("/task-sheet", headers=self.h(3)).json()["entries"]
        self.assertEqual({r["user_id"] for r in rows}, {self.reps[(3, "anu")]})
        body = self.client.post("/task-sheet/ai-summary", json={"period": "today"}, headers=self.h(3)).json()
        self.assertEqual(body["total_outreaches"], 10)

    def test_companies_without_scoping_keep_their_rules(self):
        h = self.h(3, "anu")
        old = (datetime.utcnow().date() - timedelta(days=3)).isoformat()
        self.assertEqual(self.sheet(3, "anu", work_date=old).status_code, 400, "new entries are for today only")
        self.assertEqual(self.sheet(3, "anu").status_code, 200)
        self.assertEqual(self.client.get("/task-sheet", headers=h).status_code, 200, "anyone may still list")
        self.assertEqual(self.client.post("/task-sheet/ai-summary", json={}, headers=h).status_code, 403, "the summary is admin-only everywhere")
        eid = self.client.get("/task-sheet", headers=h).json()["entries"][0]["id"]
        self.assertEqual(self.client.delete(f"/task-sheet/{eid}", headers=h).status_code, 403, "delete is admin-only everywhere")


class ClientStatus(Base):
    def seed(self, tid=2):
        with Session(S.ENGINE) as s:
            d = Deal(tenant_id=tid, title="Contract", value=1000.0, client_id=self.clients[tid], stage="Negotiation")
            p = Proposal(tenant_id=tid, title="Offer", client_id=self.clients[tid], status="Sent")
            s.add(d)
            s.add(p)
            s.commit()
            return d.id, p.id

    def rows(self, did, pid):
        with Session(S.ENGINE) as s:
            return (s.exec(select(Deal).where(Deal.id == did).execution_options(skip_tenant=True)).one(),
                    s.exec(select(Proposal).where(Proposal.id == pid).execution_options(skip_tenant=True)).one())

    def test_winning_a_client_closes_its_deals_and_accepts_its_proposals(self):
        did, pid = self.seed()
        r = self.client.patch(f"/clients/{self.clients[2]}/status", json={"status": "Won"}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        deal, prop = self.rows(did, pid)
        self.assertEqual((deal.stage, deal.final_value, prop.status), ("Closed Won", 1000.0, "Accepted"))
        self.assertIsNotNone(deal.won_at)
        self.assertIsNotNone(prop.signed_at)
        self.client.patch(f"/clients/{self.clients[2]}", json={"status": "Lost"}, headers=self.h(2))
        deal, prop = self.rows(did, pid)
        self.assertEqual((deal.stage, deal.won_at, prop.status), ("Closed Lost", None, "Rejected"))

    def test_other_statuses_only_change_the_client(self):
        did, pid = self.seed()
        self.client.patch(f"/clients/{self.clients[2]}/status", json={"status": "Active"}, headers=self.h(2))
        deal, prop = self.rows(did, pid)
        self.assertEqual((deal.stage, prop.status), ("Negotiation", "Sent"))

    def test_only_editable_fields_are_accepted(self):
        r = self.client.patch(f"/clients/{self.clients[2]}", json={"companyName": "Renamed", "tenant_id": 3, "userId": 99, "id": 77,
                                                                   "projectId": 5}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            cp = s.exec(select(ClientProfile).where(ClientProfile.id == self.clients[2]).execution_options(skip_tenant=True)).one()
        self.assertEqual((cp.companyName, cp.tenant_id, cp.userId, cp.projectId), ("Renamed", 2, None, None))

    def test_the_assignee_must_be_in_the_company_and_other_companies_are_invisible(self):
        own = self.client.patch(f"/clients/{self.clients[2]}", json={"employee_id": self.reps[(2, "ben")]}, headers=self.h(2))
        self.assertEqual(own.json()["client"]["assignedEmployeeId"], self.reps[(2, "ben")])
        self.assertEqual(self.client.patch(f"/clients/{self.clients[2]}", json={"assignedEmployeeId": self.users[3]}, headers=self.h(2)).status_code, 400)
        self.assertEqual(self.client.patch(f"/clients/{self.clients[3]}", json={"status": "Won"}, headers=self.h(2)).status_code, 404)

    def test_a_salesperson_cannot_change_a_client_that_is_not_theirs_when_scoped(self):
        r = self.client.patch(f"/clients/{self.clients[2]}", json={"status": "Won"}, headers=self.h(2, "anu"))
        self.assertEqual(r.status_code, 403, r.text)
        self.client.patch(f"/clients/{self.clients[2]}", json={"assignedEmployeeId": self.reps[(2, "anu")]}, headers=self.h(2))
        self.assertEqual(self.client.patch(f"/clients/{self.clients[2]}", json={"status": "Won"}, headers=self.h(2, "anu")).status_code, 200)


class LeadStatus(Base):
    def test_status_and_fields_change_but_not_tenant_or_links(self):
        r = self.client.patch(f"/leads/{self.leads[2]}", json={"status": "Hot", "notes": "called", "tenant_id": 3, "converted_client_id": 1,
                                                               "is_converted": True}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        row = self.lead_row(2)
        self.assertEqual((row.status, row.notes, row.tenant_id, row.converted_client_id, row.is_converted), ("Hot", "called", 2, None, False))

    def test_a_status_route_works_for_companies_without_the_institute(self):
        r = self.client.patch(f"/leads/{self.leads[2]}/status", json={"status": "Interested"}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.lead_row(2).status, "Interested")

    def test_converted_makes_a_client(self):
        r = self.client.patch(f"/leads/{self.leads[2]}/status", json={"status": "Converted"}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        row = self.lead_row(2)
        self.assertTrue(row.is_converted)
        self.assertIsNotNone(row.converted_client_id)
        self.assertEqual(self.client.patch(f"/leads/{self.leads[2]}/status", json={"status": "Converted"}, headers=self.h(2)).status_code, 200,
                         "asking again is harmless")

    def test_the_institute_keeps_its_admission_stages(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"institute": True})
        bad = self.client.patch(f"/leads/{self.leads[2]}/status", json={"status": "Interested"}, headers=self.h(2))
        self.assertEqual(bad.status_code, 422, bad.text)
        ok = self.client.patch(f"/leads/{self.leads[2]}/status", json={"status": "Follow-up"}, headers=self.h(2))
        self.assertEqual(ok.status_code, 200, ok.text)

    def test_owner_changes_stay_inside_the_company_and_use_the_ownership_log(self):
        self.assertEqual(self.client.patch(f"/leads/{self.leads[2]}", json={"owner_id": self.users[3]}, headers=self.h(2)).status_code, 400)
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"ownership": True})
        r = self.client.patch(f"/leads/{self.leads[2]}", json={"owner_id": self.reps[(2, "ben")]}, headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.lead_row(2).owner_id, self.reps[(2, "ben")])
        with Session(S.ENGINE) as s:
            logs = s.exec(select(OwnershipHistory).where(OwnershipHistory.entity_id == self.leads[2]).execution_options(skip_tenant=True)).all()
        self.assertEqual([(l.to_user_id, l.tenant_id) for l in logs], [(self.reps[(2, "ben")], 2)])

    def test_other_companies_leads_are_invisible(self):
        self.assertEqual(self.client.patch(f"/leads/{self.leads[3]}", json={"status": "Lost"}, headers=self.h(2)).status_code, 404)


class CompanyReport(Base):
    def post(self, cid, tid=2, who="admin"):
        with mock.patch("addons.business_suite.client_tools.threading.Thread") as thread:
            r = self.client.post(f"/clients/{cid}/full-analysis", headers=self.h(tid, who))
        return r, thread

    def status(self, cid, tid=2, who="admin"):
        return self.client.get(f"/clients/{cid}/full-analysis", headers=self.h(tid, who))

    def test_not_started_then_pending_then_done_with_the_report(self):
        from addons.business_suite import client_tools
        self.assertEqual(self.status(self.clients[2]).json(), {"status": "not_started", "report": None})
        r, thread = self.post(self.clients[2])
        self.assertEqual((r.status_code, r.json()["ok"]), (200, True))
        thread.assert_called_once()
        self.assertEqual(self.status(self.clients[2]).json()["status"], "pending")
        fake = {"full_markdown_report": "# Report\\nAcme sells freight.", "company_overview": "Freight", "ideal_customer_profiles": [{"a": 1}]}
        with mock.patch("modules.llm_engine.deep_investigate_company", return_value=fake), \
                mock.patch("modules.scraper.scrape_website", new=mock.AsyncMock(return_value="site text")):
            client_tools.run_full_analysis(self.clients[2])
        out = self.status(self.clients[2]).json()
        self.assertEqual(out["status"], "done")
        self.assertIn("Acme sells freight", out["report"])
        with Session(S.ENGINE) as s:
            rec = s.exec(select(ClientResearch).where(ClientResearch.client_id == self.clients[2]).execution_options(skip_tenant=True)).one()
        self.assertEqual((rec.tenant_id, rec.company_overview), (2, "Freight"), "the report is stamped with the client's company")

    def test_a_failure_is_reported_not_hidden(self):
        from addons.business_suite import client_tools
        self.post(self.clients[2])
        with mock.patch("modules.llm_engine.deep_investigate_company", side_effect=RuntimeError("no key")), \
                mock.patch("modules.scraper.scrape_website", new=mock.AsyncMock(return_value="")):
            client_tools.run_full_analysis(self.clients[2])
        self.assertEqual(self.status(self.clients[2]).json(), {"status": "error", "report": None})

    def test_access_follows_the_company_and_the_assignment(self):
        self.assertEqual(self.post(self.clients[3], tid=2)[0].status_code, 404)
        self.assertEqual(self.status(self.clients[3], tid=2).status_code, 404)
        self.assertEqual(self.post(self.clients[2], who="anu")[0].status_code, 403, "scoped: not this salesperson's client")
        self.client.patch(f"/clients/{self.clients[2]}", json={"assignedEmployeeId": self.reps[(2, "anu")]}, headers=self.h(2))
        self.assertEqual(self.post(self.clients[2], who="anu")[0].status_code, 200)

    def test_trial_limits_apply(self):
        from database import Tenant
        with Session(S.ENGINE) as s:
            t = s.get(Tenant, 2)
            t.is_trial, t.limit_searches, t.usage_searches = True, 1, 1
            s.add(t)
            s.commit()
        r, _ = self.post(self.clients[2], who="demo")                  # trial limits are counted for the Demo role
        self.assertEqual(r.status_code, 403, r.text)
        self.assertEqual(r.json()["detail"]["error"], "LIMIT_REACHED")


class ManagementDashboard(Base):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"command_center": True})
            features.set_features(s, 3, {"command_center": True})

    def test_numbers_are_the_companys_own(self):
        with Session(S.ENGINE) as s:
            src = LeadSource(tenant_id=2, name="Website")
            s.add(src)
            s.commit()
            s.refresh(src)
            lead = s.exec(select(Lead).where(Lead.id == self.leads[2]).execution_options(skip_tenant=True)).one()
            lead.lead_source_id = src.id
            s.add(lead)
            s.add(Deal(tenant_id=2, title="D1", value=500.0, client_id=self.clients[2], stage="Demo", assigned_to=self.users[2]))
            s.add(Deal(tenant_id=2, title="D2", value=700.0, client_id=self.clients[2], stage="Demo", assigned_to=self.users[2]))
            s.add(Deal(tenant_id=3, title="Other", value=9999.0, client_id=self.clients[3], stage="Demo"))
            s.commit()
        r = self.client.get("/management/dashboard", headers=self.h(2))
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertEqual(d["lead_sources"], [{"source": "Website", "count": 1}])
        self.assertEqual(d["pipeline"], [{"stage": "Demo", "count": 2, "total_value": 1200.0}])
        self.assertEqual(d["salesperson_performance"][0]["deals"], 2)
        self.assertEqual((len(d["monthly_leads"]), d["monthly_leads"][-1]["leads"]), (6, 1))
        other = self.client.get("/management/dashboard", headers=self.h(3)).json()
        self.assertEqual(other["pipeline"], [{"stage": "Demo", "count": 1, "total_value": 9999.0}])

    def test_roles(self):
        self.assertEqual(self.client.get("/management/dashboard", headers=self.h(2, "anu")).status_code, 403)
        self.assertEqual(self.client.get("/management/dashboard", headers=self.h(2, "demo")).status_code, 200)
