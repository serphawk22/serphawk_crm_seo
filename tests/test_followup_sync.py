"""End-to-end verification of centralized follow-up storage and two-way sync across Lead tab, Global board, AI calls, and Manual calls."""
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import AICall, CallLog, CallQuestion, FollowUp, Lead
from modules import features, followup_ai, tenant_settings
from modules.followups_core import as_utc
from routers import voice_agent


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class CentralizedFollowUpSyncTests(TenantIsolationBase):
    def setUp(self):
        from modules import auto_calling
        p = mock.patch.object(auto_calling, "_enqueue")
        p.start()
        self.addCleanup(p.stop)
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"followups": True, "followup_board": True, "calls": True})
            lead = s.get(Lead, self.leads[2])
            lead.phone = "+919876543210"
            lead.company_name = "Acme Solar"
            s.add(lead)
            s.commit()

    def headers(self):
        return self.as_tenant(2)

    def test_two_way_sync_between_lead_tab_and_global_followups(self):
        lead_id = self.leads[2]
        due1 = datetime.now(timezone.utc) + timedelta(days=2)

        # 1. Create from Lead Follow-ups tab (/followups) -> must appear in Global Follow-ups (/follow-ups & /followups)
        r = self.client.post("/followups", headers=self.headers(), json={
            "lead_id": lead_id,
            "title": "Send revised SEO proposal",
            "notes": "Include keyword audit",
            "channel": "call",
            "priority": "high",
            "due_at": iso(due1),
        })
        self.assertEqual(r.status_code, 200, r.text)
        fid1 = r.json()["item"]["id"]

        board_items = self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]
        self.assertIn(fid1, [f["id"] for f in board_items])

        # 2. Create from Global Follow-ups (/follow-ups) with board channel & urgent priority -> must appear in Lead tab & be editable there
        due2 = datetime.now(timezone.utc) + timedelta(days=4)
        r2 = self.client.post("/follow-ups", headers=self.headers(), json={
            "lead_id": lead_id,
            "title": "Webinar walkthrough",
            "notes": "Decision maker attending",
            "channel": "Webinar",
            "priority": "Urgent",
            "due_at": iso(due2),
            "timezone": "Asia/Kolkata",
        })
        self.assertEqual(r2.status_code, 200, r2.text)
        fid2 = r2.json()["follow_up"]["id"]

        hist = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        by_id = {f["id"]: f for f in hist}
        self.assertIn(fid1, by_id)
        self.assertIn(fid2, by_id)
        self.assertEqual(by_id[fid2]["channel"], "webinar")
        self.assertEqual(by_id[fid2]["priority"], "urgent")

        # 3. Edit & mark In Progress from Global board -> reflected in Lead tab, and editable from Lead tab without 422
        r_prog = self.client.put(f"/follow-ups/{fid2}/status", headers=self.headers(), json={"status": "In Progress"})
        self.assertEqual(r_prog.status_code, 200, r_prog.text)
        r_edit = self.client.patch(f"/followups/{fid2}", headers=self.headers(), json={
            "title": "Updated Webinar walkthrough",
            "channel": "webinar",
            "priority": "urgent",
            "due_at": iso(due2 + timedelta(days=1)),
        })
        self.assertEqual(r_edit.status_code, 200, r_edit.text)
        board_after = {f["id"]: f for f in self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]}
        self.assertEqual(board_after[fid2]["title"], "Updated Webinar walkthrough")
        self.assertEqual(board_after[fid2]["status"], "In Progress")

        # 4. Complete in Global section -> reflected in Lead Follow-ups tab
        r_done = self.client.post(f"/follow-ups/{fid1}/complete", headers=self.headers(), json={"note": "Proposal sent"})
        self.assertEqual(r_done.status_code, 200, r_done.text)
        hist2 = {f["id"]: f for f in self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]}
        self.assertEqual(hist2[fid1]["status"], "Completed")
        self.assertEqual(hist2[fid1]["outcome"], "Proposal sent")

        # 5. Delete in Lead tab -> removed from Global section
        r_del = self.client.delete(f"/followups/{fid2}", headers=self.headers())
        self.assertEqual(r_del.status_code, 200, r_del.text)
        board_final = [f["id"] for f in self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]]
        self.assertNotIn(fid2, board_final)

    def test_ai_voice_call_meeting_nov22_9am_appears_in_both_without_duplicates(self):
        lead_id = self.leads[2]
        with Session(S.ENGINE) as s:
            call = AICall(
                tenant_id=2, entity_type="lead", entity_id=lead_id, lead_id=lead_id,
                entity_name="Acme Solar", to_number="+919876543210", started_by=self.users[2],
                status="completed",
                transcript=[
                    {"role": "ai", "text": "Would you like to schedule a meeting?"},
                    {"role": "client", "text": "Yes, please schedule a meeting for November 22 at 9 AM."},
                ],
            )
            s.add(call)
            s.commit()
            s.refresh(call)
            cid = call.id

        # Simulate summarize_call resolving Sunday Nov 22 at 09:00 IST while analyze_conversation misses it
        summary_resp = {
            "summary": "Prospect requested a meeting for November 22 at 9 AM.",
            "outcome": "meeting_booked",
            "next_steps": "Hold meeting on 22 Nov at 9 AM",
            "follow_up_date": "2026-11-22",
            "follow_up_time": "09:00",
            "important_notes": "Meeting requested for 22 Nov 2026, 9:00 AM.",
        }
        no_detect = {
            "summary": "Prospect requested a meeting.", "key_points": [], "requirements": [],
            "objections": [], "decisions": [], "follow_up_actions": [],
            "follow_up": {"should_follow_up": False}, "engine": "rules", "error": None,
        }
        with mock.patch.object(voice_agent.va, "summarize_call", return_value=summary_resp), \
             mock.patch.object(followup_ai, "analyze_conversation", return_value=no_detect):
            voice_agent._finalize_call(cid, 2)
            voice_agent._finalize_call(cid, 2)  # retry must not duplicate

        with Session(S.ENGINE) as s:
            rows = s.exec(select(FollowUp).where(FollowUp.tenant_id == 2).execution_options(skip_tenant=True)).all()
            self.assertEqual(len(rows), 1)
            fu = rows[0]
            self.assertEqual(fu.lead_id, lead_id)
            self.assertEqual(fu.channel, "meeting")
            # 2026-11-22 09:00 Asia/Kolkata == 2026-11-22 03:30 UTC
            self.assertEqual(as_utc(fu.due_at), datetime(2026, 11, 22, 3, 30, tzinfo=timezone.utc))

        # Visible in BOTH Lead Follow-ups tab AND Global Follow-ups board
        lead_tab = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        global_board = self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]
        self.assertEqual(len(lead_tab), 1)
        self.assertEqual(len(global_board), 1)
        self.assertEqual(lead_tab[0]["id"], global_board[0]["id"])

    def test_manual_call_and_scheduled_call_sync_to_centralized_followups(self):
        lead_id = self.leads[2]
        # 1. Log a manual call with followup_needed=True matching lead's phone
        r = self.client.post("/calls", headers=self.headers(), json={
            "phone_number": "+919876543210",
            "duration_seconds": 180,
            "description": "Discussed pricing",
            "work_done": "Call back with final quote",
            "followup_needed": True,
            "followup_date": "2026-11-25",
        })
        self.assertEqual(r.status_code, 200, r.text)
        call_id = r.json()["call"]["id"]

        lead_tab = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        global_board = self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]
        self.assertEqual(len(lead_tab), 1)
        self.assertEqual(lead_tab[0]["id"], global_board[0]["id"])
        self.assertEqual(lead_tab[0]["channel"], "call")
        self.assertEqual(lead_tab[0]["status"], "Pending")

        # 2. Mark manual call followup_needed=False -> completes the centralized follow-up
        r2 = self.client.patch(f"/calls/{call_id}", headers=self.headers(), json={"followup_needed": False})
        self.assertEqual(r2.status_code, 200, r2.text)
        lead_tab2 = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertEqual(lead_tab2[0]["status"], "Completed")

        # 3. Schedule a call for the lead -> creates centralized follow-up; deleting removes it
        r3 = self.client.post("/scheduled-calls", headers=self.headers(), json={
            "title": "Onboarding call",
            "scheduled_at": "2026-11-26T10:00:00",
            "entity_type": "lead",
            "entity_id": lead_id,
            "entity_name": "Acme Solar",
        })
        self.assertEqual(r3.status_code, 200, r3.text)
        sc_id = r3.json()["scheduled_call"]["id"]
        lead_tab3 = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertIn("Onboarding call", [f["title"] for f in lead_tab3])

        self.assertEqual(self.client.delete(f"/scheduled-calls/{sc_id}", headers=self.headers()).status_code, 200)
        lead_tab4 = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertNotIn("Onboarding call", [f["title"] for f in lead_tab4])

    def test_calling_agent_log_edit_and_question_followup_sync(self):
        lead_id = self.leads[2]
        with Session(S.ENGINE) as s:
            call = AICall(
                tenant_id=2, entity_type="lead", entity_id=lead_id, lead_id=lead_id,
                entity_name="Acme Solar", to_number="+919876543210", started_by=self.users[2],
                status="completed", summary="Initial call",
            )
            s.add(call)
            s.commit()
            s.refresh(call)
            cid = call.id
            q = CallQuestion(tenant_id=2, call_id=cid, question="What is the SLA?", status="open")
            s.add(q)
            s.commit()
            s.refresh(q)
            qid = q.id

        # Edit AI call to require follow-up -> appears in Lead tab & Global board
        r = self.client.patch(f"/calling-agent-logs/{cid}", headers=self.headers(), json={
            "followup_needed": True,
            "followup_date": "2026-11-27",
            "important_notes": "Confirm annual plan",
        })
        self.assertEqual(r.status_code, 200, r.text)
        lead_tab = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertEqual(len(lead_tab), 1)
        self.assertEqual(lead_tab[0]["notes"], "Confirm annual plan")

        # Schedule follow-up date on CallQuestion -> creates centralized follow-up; resolving completes it
        rq = self.client.put(f"/voice-agent/questions/{qid}", headers=self.headers(), json={
            "follow_up_date": "2026-11-28",
            "resolution": "Share SLA PDF",
        })
        self.assertEqual(rq.status_code, 200, rq.text)
        lead_tab2 = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertEqual(len(lead_tab2), 2)

        rq2 = self.client.put(f"/voice-agent/questions/{qid}", headers=self.headers(), json={"status": "resolved"})
        self.assertEqual(rq2.status_code, 200, rq2.text)
        lead_tab3 = {f["title"]: f for f in self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]}
        self.assertEqual(lead_tab3["Follow up: What is the SLA?"]["status"], "Completed")

    def test_preexisting_lead_call_meeting_is_backfilled_with_phone_and_meeting_channel(self):
        lead_id = self.leads[2]
        meeting_dt = datetime(2026, 11, 22, 3, 30, tzinfo=timezone.utc)  # 9:00 AM IST
        # Seed a pre-existing AI call directly in DB (as if recorded before the centralized sync change)
        with Session(S.ENGINE) as s:
            call = AICall(
                tenant_id=2, entity_type="lead", entity_id=lead_id, lead_id=lead_id,
                entity_name="Acme Solar", to_number="+919876543210", started_by=self.users[2],
                status="completed", outcome="meeting_booked",
                follow_up_needed=True, followup_needed=True, follow_up_at=meeting_dt,
                important_notes="Meeting requested for 22 Nov 2026, 9:00 AM.",
                summary="AI Voice Call - Acme Solar: Prospect scheduled a meeting for Nov 22 at 9 AM.",
            )
            s.add(call)
            s.commit()

        # Opening Global Follow-ups immediately backfills it into follow_ups as a Meeting with phone & time
        r = self.client.get("/follow-ups?scope=all", headers=self.headers())
        self.assertEqual(r.status_code, 200, r.text)
        board = r.json()["follow_ups"]
        self.assertEqual(len(board), 1)
        self.assertEqual(board[0]["channel"], "Meeting")
        self.assertEqual(board[0]["phone"], "+919876543210")
        self.assertEqual(board[0]["due_at"], "2026-11-22T03:30:00Z")
        self.assertEqual(board[0]["lead_id"], lead_id)

        # Opening Lead Follow-ups tab returns the exact same record with phone & time (no duplicate)
        hist = self.client.get(f"/followups/history?lead_id={lead_id}", headers=self.headers()).json()["followups"]
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0]["id"], board[0]["id"])
        self.assertEqual(hist[0]["channel"], "meeting")
        self.assertEqual(hist[0]["phone"], "+919876543210")

        # Deleting it must NOT resurrect it on the next read
        self.assertEqual(self.client.delete(f"/follow-ups/{board[0]['id']}", headers=self.headers()).status_code, 200)
        board_after = self.client.get("/follow-ups?scope=all", headers=self.headers()).json()["follow_ups"]
        self.assertEqual(board_after, [])
