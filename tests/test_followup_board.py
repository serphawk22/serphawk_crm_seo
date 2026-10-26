"""The follow-up board (SCM BPO's /follow-ups screens) on the shared follow_ups table."""
import os
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import ConversationLog, EmailSettings, FollowUp, Lead, LeadNote, Notification, User
from modules import company_mailer, features, tenant_settings
from modules import followups_core as core

NOW = datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class BoardBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        p = mock.patch.dict(os.environ, {"OPENAI_API_KEY": "", "FOLLOWUP_REMINDER_EMAILS": "1"})
        p.start()
        self.addCleanup(p.stop)
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"followup_board": True})
            emp = User(email="emp@t2.test", password="x", name="Eve Employee", role="Employee", tenant_id=2)
            emp3 = User(email="emp@t3.test", password="x", name="Tom", role="Employee", tenant_id=3)
            s.add(emp)
            s.add(emp3)
            s.commit()
            s.refresh(emp)
            self.emp_id = emp.id
            lead = Lead(company_name="Emp Lead", email="buyer@emplead.test", tenant_id=2, owner_id=emp.id)
            s.add(lead)
            s.add(EmailSettings(tenant_id=2, smtp_host="smtp.t2.test", smtp_port=587, smtp_user="mail@t2.test", smtp_pass="pw",
                                from_name="T2", from_email="mail@t2.test"))
            s.commit()
            s.refresh(lead)
            self.emp_lead = lead.id
            s.add(LeadNote(lead_id=lead.id, tenant_id=2, content="They want a quote for 40 pallets by Friday."))
            s.commit()
        self.sent = []

        def fake_send(account, *, to, subject, body, **kw):
            self.sent.append({"from": account.email, "to": to, "subject": subject, "body": body})

        p = mock.patch.object(company_mailer, "send_via", fake_send)
        p.start()
        self.addCleanup(p.stop)

    def admin(self):
        return {"X-User-ID": str(self.users[2])}

    def emp(self):
        return {"X-User-ID": str(self.emp_id)}

    def create(self, headers=None, **over):
        body = {"title": "Call about pallets", "due_at": iso(NOW + timedelta(days=3)), "lead_id": self.emp_lead,
                "channel": "Call", "priority": "High", **over}
        return self.client.post("/follow-ups", json=body, headers=headers or self.admin())

    def row(self, fid):
        with Session(S.ENGINE) as s:
            return s.exec(select(FollowUp).where(FollowUp.id == fid).execution_options(skip_tenant=True)).first()


class Access(BoardBase):
    def test_off_for_tenants_without_the_feature(self):
        r = self.client.get("/follow-ups", headers=self.as_tenant(3))
        self.assertEqual(r.status_code, 403, r.text)
        self.assertEqual(self.client.get("/follow-ups", headers=self.admin()).status_code, 200)

    def test_requires_login(self):
        self.assertEqual(self.client.get("/follow-ups").status_code, 401)

    def test_a_tenant_never_sees_anothers_follow_ups(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 3, {"followup_board": True})
        fid = self.create().json()["follow_up"]["id"]
        theirs = self.client.get("/follow-ups", headers=self.as_tenant(3)).json()["follow_ups"]
        self.assertEqual(theirs, [])
        for method, url in (("put", f"/follow-ups/{fid}"), ("post", f"/follow-ups/{fid}/complete"), ("delete", f"/follow-ups/{fid}")):
            r = self.client.request(method.upper(), url, json={"title": "hijack"} if method == "put" else None, headers=self.as_tenant(3))
            self.assertEqual(r.status_code, 404, f"{method} {r.text}")
        self.assertIsNotNone(self.row(fid))

    def test_an_employee_only_touches_what_is_theirs(self):
        mine = self.create(self.emp(), lead_id=self.emp_lead).json()["follow_up"]["id"]
        others = self.create(self.admin(), lead_id=self.leads[2]).json()["follow_up"]["id"]
        listed = {f["id"] for f in self.client.get("/follow-ups", headers=self.emp()).json()["follow_ups"]}
        self.assertEqual(listed, {mine})
        self.assertEqual(self.client.put(f"/follow-ups/{others}", json={"title": "x"}, headers=self.emp()).status_code, 404)
        self.assertEqual(self.client.delete(f"/follow-ups/{others}", headers=self.emp()).status_code, 404)
        self.assertEqual(self.client.post(f"/follow-ups/{mine}/complete", json={}, headers=self.emp()).status_code, 200)

    def test_an_employee_cannot_attach_a_follow_up_to_someone_elses_lead(self):
        r = self.create(self.emp(), lead_id=self.leads[2])
        self.assertEqual(r.status_code, 403, r.text)

    def test_an_employee_cannot_assign_to_others_but_an_admin_can(self):
        self.assertEqual(self.create(self.emp(), owner_id=self.users[2]).status_code, 403)
        r = self.create(self.admin(), owner_id=self.emp_id, lead_id=self.leads[2])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["follow_up"]["owner_id"], self.emp_id)
        with Session(S.ENGINE) as s:
            note = s.exec(select(Notification).where(Notification.user_id == self.emp_id).execution_options(skip_tenant=True)).first()
        self.assertIn("New follow-up assigned", note.title)

    def test_the_assignee_must_be_in_the_same_company(self):
        r = self.create(self.admin(), owner_id=self.users[3])
        self.assertEqual(r.status_code, 400, r.text)

    def test_other_roles_get_403(self):
        with Session(S.ENGINE) as s:
            c = User(email="client@t2.test", password="x", name="C", role="Client", tenant_id=2)
            s.add(c)
            s.commit()
            s.refresh(c)
        self.assertEqual(self.client.get("/follow-ups", headers={"X-User-ID": str(c.id)}).status_code, 403)


class Lifecycle(BoardBase):
    def test_create_shows_the_board_vocabulary(self):
        r = self.create(channel="walk-in", priority="urgent", reminder_minutes=90, timezone="Asia/Kolkata",
                        due_at="2031-05-01T10:00", notes="Bring the sample")
        self.assertEqual(r.status_code, 200, r.text)
        f = r.json()["follow_up"]
        self.assertEqual((f["channel"], f["priority"], f["status"]), ("Walk-in", "Urgent", "Pending"))
        self.assertEqual(f["reminder_minutes"], 90)
        self.assertEqual(f["due_at"], "2031-05-01T04:30:00Z", "10:00 in Kolkata is 04:30 UTC")
        self.assertEqual(f["due_at_local"], "2031-05-01T10:00")
        self.assertEqual((f["entity_type"], f["entity_name"]), ("lead", "Emp Lead"))
        row = self.row(f["id"])
        self.assertEqual((row.channel, row.priority, row.assigned_to), ("walk-in", "urgent", self.emp_id), "stored lower case, owner = lead owner")
        self.assertEqual(core.as_utc(row.due_at) - core.as_utc(row.remind_at), timedelta(minutes=90))

    def test_a_date_is_required_and_a_title(self):
        self.assertEqual(self.create(due_at=None).status_code, 400)
        self.assertEqual(self.create(title="  ").status_code, 400)
        self.assertEqual(self.create(due_at="not a date").status_code, 400)

    def test_buckets_and_counts(self):
        mk = lambda title, delta, **kw: self.create(title=title, due_at=iso(NOW + delta), **kw).json()["follow_up"]["id"]  # noqa: E731
        overdue = mk("overdue", timedelta(days=-2))
        soon = mk("soon", timedelta(hours=5))
        later = mk("later", timedelta(days=4))
        done = mk("done", timedelta(days=1))
        cancelled = mk("cancelled", timedelta(days=-1))
        self.client.post(f"/follow-ups/{done}/complete", json={"note": "sorted"}, headers=self.admin())
        self.client.put(f"/follow-ups/{cancelled}/status", json={"status": "cancelled"}, headers=self.admin())
        body = self.client.get("/follow-ups", headers=self.admin()).json()
        self.assertEqual(body["counts"], {"upcoming": 1, "pending": 1, "overdue": 1, "completed": 2})
        by = lambda b: {f["id"] for f in self.client.get(f"/follow-ups?bucket={b}", headers=self.admin()).json()["follow_ups"]}  # noqa: E731
        self.assertEqual((by("overdue"), by("pending"), by("upcoming"), by("completed")), ({overdue}, {soon}, {later}, {done, cancelled}))
        s = self.client.get("/follow-ups/summary", headers=self.admin()).json()
        self.assertEqual((s["total"], s["open"], s["next_due"]["id"]), (5, 3, soon))
        q = self.client.get("/follow-ups?q=later", headers=self.admin()).json()["follow_ups"]
        self.assertEqual([f["id"] for f in q], [later])

    def test_update_status_and_rearm(self):
        fid = self.create(due_at=iso(NOW + timedelta(days=2))).json()["follow_up"]["id"]
        with Session(S.ENGINE) as s:
            fu = s.exec(select(FollowUp).where(FollowUp.id == fid).execution_options(skip_tenant=True)).first()
            fu.reminder_sent_at = fu.overdue_notified_at = NOW
            s.add(fu)
            s.commit()
        r = self.client.put(f"/follow-ups/{fid}", json={"title": "New title", "priority": "low", "channel": "Meeting",
                                                       "status": "In Progress", "due_at": iso(NOW + timedelta(days=5)),
                                                       "reminder_minutes": 15}, headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        f = r.json()["follow_up"]
        self.assertEqual((f["title"], f["priority"], f["channel"], f["status"], f["reminder_minutes"]),
                         ("New title", "Low", "Meeting", "In Progress", 15))
        row = self.row(fid)
        self.assertIsNone(row.reminder_sent_at)
        self.assertIsNone(row.overdue_notified_at)
        self.assertEqual(self.client.put(f"/follow-ups/{fid}", json={"title": " "}, headers=self.admin()).status_code, 400)

    def test_status_endpoint_accepts_put_and_patch_and_ignores_junk(self):
        fid = self.create().json()["follow_up"]["id"]
        for method in ("PUT", "PATCH"):
            r = self.client.request(method, f"/follow-ups/{fid}/status", json={"status": "completed", "completion_note": "Done by phone"},
                                    headers=self.admin())
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual((r.json()["follow_up"]["status"], r.json()["follow_up"]["completion_note"]), ("Completed", "Done by phone"))
        r = self.client.put(f"/follow-ups/{fid}/status", json={"status": "bogus"}, headers=self.admin())
        self.assertEqual(r.json()["follow_up"]["status"], "Pending")
        self.assertIsNone(r.json()["follow_up"]["completed_at"])

    def test_reschedule_reopen_delete(self):
        fid = self.create().json()["follow_up"]["id"]
        self.client.post(f"/follow-ups/{fid}/complete", json={}, headers=self.admin())
        r = self.client.post(f"/follow-ups/{fid}/reschedule", json={"due_at": iso(NOW + timedelta(days=9))}, headers=self.admin())
        f = r.json()["follow_up"]
        self.assertEqual((f["status"], f["completed_at"]), ("Pending", None))
        self.client.post(f"/follow-ups/{fid}/complete", json={}, headers=self.admin())
        self.assertEqual(self.client.post(f"/follow-ups/{fid}/reopen", headers=self.admin()).json()["follow_up"]["status"], "Pending")
        self.assertEqual(self.client.post(f"/follow-ups/{fid}/reschedule", json={"due_at": "x"}, headers=self.admin()).status_code, 400)
        self.assertEqual(self.client.delete(f"/follow-ups/{fid}", headers=self.admin()).json(), {"ok": True})
        self.assertIsNone(self.row(fid))
        self.assertEqual(self.client.delete(f"/follow-ups/{fid}", headers=self.admin()).status_code, 404)

    def test_notification_email_goes_to_the_owner_from_the_company_mailbox(self):
        r = self.create(send_notification=True, notify_email="buyer@emplead.test")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["notification"]["errors"], [])
        self.assertEqual(sorted(m["to"] for m in self.sent), ["buyer@emplead.test", "emp@t2.test"])
        self.assertTrue(all(m["from"] == "mail@t2.test" for m in self.sent))

    def test_a_failed_notification_is_reported_not_fatal(self):
        with Session(S.ENGINE) as s:
            for e in s.exec(select(EmailSettings).execution_options(skip_tenant=True)).all():
                s.delete(e)
            s.commit()
        r = self.create(send_notification=True, notify_email="buyer@emplead.test")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["notification"]["sent"], 0)
        self.assertTrue(r.json()["notification"]["errors"])


class SharedTable(BoardBase):
    def test_board_and_email_stack_see_the_same_rows(self):
        fid = self.create(channel="Call", priority="High").json()["follow_up"]["id"]
        stack = self.client.get("/followups", headers=self.admin()).json()["items"]
        item = next(i for i in stack if i["id"] == fid)
        self.assertEqual((item["channel"], item["priority"], item["assigned_to"]["id"]), ("call", "high", self.emp_id))
        made = self.client.post("/followups", json={"title": "From the email screen", "lead_id": self.leads[2],
                                                    "due_at": iso(NOW - timedelta(days=1))}, headers=self.admin())
        self.assertEqual(made.status_code, 200, made.text)
        board = {f["id"]: f for f in self.client.get("/follow-ups", headers=self.admin()).json()["follow_ups"]}
        self.assertEqual(board[made.json()["item"]["id"]]["bucket"], "overdue")
        self.assertEqual(board[made.json()["item"]["id"]]["owner_id"], self.users[2])

    def test_in_progress_is_still_open_for_the_email_screen_and_the_scheduler(self):
        fid = self.create(due_at=iso(NOW - timedelta(minutes=5)), reminder_minutes=0).json()["follow_up"]["id"]
        self.client.put(f"/follow-ups/{fid}/status", json={"status": "In Progress"}, headers=self.admin())
        pending = self.client.get("/followups?view=pending", headers=self.admin()).json()["items"]
        self.assertIn(fid, [i["id"] for i in pending])
        calls = []
        n = core.process_due_reminders(engine=S.ENGINE, send_email=lambda a, **kw: calls.append(kw), now=NOW)
        self.assertEqual(n, 1)
        self.assertEqual(calls[0]["to"], "emp@t2.test")
        self.client.put(f"/follow-ups/{fid}/status", json={"status": "Completed"}, headers=self.admin())
        done = self.client.get("/followups?view=completed", headers=self.admin()).json()["items"]
        self.assertIn(fid, [i["id"] for i in done])

    def test_closing_it_on_the_email_screen_closes_it_on_the_board(self):
        fid = self.create(due_at=iso(NOW + timedelta(days=1))).json()["follow_up"]["id"]
        r = self.client.post(f"/followups/{fid}/complete", json={"outcome": "Spoke to them"}, headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        f = next(x for x in self.client.get("/follow-ups", headers=self.admin()).json()["follow_ups"] if x["id"] == fid)
        self.assertEqual((f["status"], f["bucket"], f["completion_note"]), ("Completed", "completed", "Spoke to them"))


class Scheduler(BoardBase):
    def add(self, tenant=2, **kw):
        base = dict(tenant_id=tenant, title="Chase", due_at=NOW - timedelta(hours=2), remind_at=NOW - timedelta(hours=3),
                    assigned_to=self.emp_id if tenant == 2 else self.users[3], created_by=self.users[tenant],
                    lead_id=self.emp_lead if tenant == 2 else self.leads[3], status="Pending")
        base.update(kw)
        with Session(S.ENGINE) as s:
            fu = FollowUp(**base)
            s.add(fu)
            s.commit()
            return fu.id

    def test_overdue_notice_is_sent_once_and_only_for_board_tenants(self):
        mine = self.add(2)
        other = self.add(3)                                  # tenant 3 has no board
        calls = []
        send = lambda account, **kw: calls.append(kw)        # noqa: E731
        self.assertEqual(core.process_overdue_notices(engine=S.ENGINE, now=NOW, send_email=send), 1)
        self.assertEqual(core.process_overdue_notices(engine=S.ENGINE, now=NOW, send_email=send), 0)
        self.assertEqual([c["to"] for c in calls], ["emp@t2.test"])
        self.assertIn("Overdue follow-up", calls[0]["subject"])
        self.assertIsNotNone(self.row(mine).overdue_notified_at)
        self.assertIsNone(self.row(other).overdue_notified_at)
        with Session(S.ENGINE) as s:
            notes = s.exec(select(Notification).where(Notification.title.like("Overdue%")).execution_options(skip_tenant=True)).all()
        self.assertEqual([(n.tenant_id, n.user_id) for n in notes], [(2, self.emp_id)])

    def test_completed_and_future_ones_are_left_alone_and_a_new_date_rearms(self):
        self.add(2, status="Completed")
        self.add(2, due_at=NOW + timedelta(days=1), remind_at=NOW + timedelta(hours=20))
        self.assertEqual(core.process_overdue_notices(engine=S.ENGINE, now=NOW, send_email=lambda a, **k: None), 0)
        fid = self.add(2)
        self.assertEqual(core.process_overdue_notices(engine=S.ENGINE, now=NOW, send_email=lambda a, **k: None), 1)
        self.client.post(f"/follow-ups/{fid}/reschedule", json={"due_at": iso(NOW - timedelta(minutes=10))}, headers=self.admin())
        self.assertEqual(core.process_overdue_notices(engine=S.ENGINE, now=NOW, send_email=lambda a, **k: None), 1)

    def test_the_whole_cycle_includes_the_overdue_step(self):
        self.add(2)
        with mock.patch.dict(os.environ, {"FOLLOWUP_AI_SCAN": "0", "FOLLOWUP_REMINDER_EMAILS": "0"}):
            out = core.run_cycle(S.ENGINE)
        self.assertEqual(out["overdue"], 1)


class Email(BoardBase):
    def test_draft_uses_the_records_history_and_falls_back_to_a_template(self):
        r = self.client.post("/follow-ups/email-draft", json={"lead_id": self.emp_lead, "goal": "chase the pallet quote"}, headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertFalse(d["ai"], "no AI key: the template draft is used")
        self.assertTrue(d["subject"] and d["body"])
        self.assertEqual((d["to_email"], d["company"]), ("buyer@emplead.test", "Emp Lead"))
        self.assertGreaterEqual(d["context_total"], 1)

    def test_draft_needs_something_to_ground_it_in_and_respects_scope(self):
        self.assertEqual(self.client.post("/follow-ups/email-draft", json={"goal": "x"}, headers=self.admin()).status_code, 400)
        self.assertEqual(self.client.post("/follow-ups/email-draft", json={"lead_id": self.leads[2]}, headers=self.emp()).status_code, 403)
        self.assertEqual(self.client.post("/follow-ups/email-draft", json={"lead_id": self.leads[3]}, headers=self.admin()).status_code, 404)

    def test_send_records_the_mail_completes_and_logs_it(self):
        fid = self.create().json()["follow_up"]["id"]
        r = self.client.post("/follow-ups/send-email", json={"follow_up_id": fid, "to_email": "buyer@emplead.test", "subject": "Following up",
                                                             "body": "Hi, any news on the quote?", "mark_complete": True}, headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["from"], "mail@t2.test")
        self.assertEqual([(m["to"], m["from"]) for m in self.sent], [("buyer@emplead.test", "mail@t2.test")])
        f = r.json()["follow_up"]
        self.assertEqual(f["status"], "Completed")
        self.assertIsNotNone(f["last_email_at"])
        with Session(S.ENGINE) as s:
            logs = s.exec(select(ConversationLog).where(ConversationLog.lead_id == self.emp_lead).execution_options(skip_tenant=True)).all()
        self.assertEqual([l.title for l in logs], ["Following up"])

    def test_send_without_a_follow_up_still_records_it_on_the_lead(self):
        r = self.client.post("/follow-ups/send-email", json={"lead_id": self.emp_lead, "to_email": "buyer@emplead.test", "subject": "Hello",
                                                             "body": "Just checking in"}, headers=self.admin())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json()["follow_up"])
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(ConversationLog).where(ConversationLog.lead_id == self.emp_lead).execution_options(skip_tenant=True)).all()), 1)

    def test_send_validates_and_respects_scope_and_mailbox(self):
        ok = {"lead_id": self.emp_lead, "to_email": "buyer@emplead.test", "subject": "s", "body": "b"}
        self.assertEqual(self.client.post("/follow-ups/send-email", json={**ok, "to_email": "nope"}, headers=self.admin()).status_code, 400)
        self.assertEqual(self.client.post("/follow-ups/send-email", json={**ok, "subject": " "}, headers=self.admin()).status_code, 400)
        self.assertEqual(self.client.post("/follow-ups/send-email", json={**ok, "lead_id": self.leads[2]}, headers=self.emp()).status_code, 403)
        self.assertEqual(self.sent, [])
        with Session(S.ENGINE) as s:
            for e in s.exec(select(EmailSettings).execution_options(skip_tenant=True)).all():
                s.delete(e)
            s.commit()
        r = self.client.post("/follow-ups/send-email", json=ok, headers=self.admin())
        self.assertEqual(r.status_code, 503, r.text)
        self.assertEqual(self.sent, [])
