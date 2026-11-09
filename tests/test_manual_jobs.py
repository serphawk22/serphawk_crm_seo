"""Manual processing: bounded work, authorization, isolation and safe campaign recovery."""
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlmodel import Session, select
from database import EmailCampaign, EmailCampaignRecipient, FollowUp, Notification, User
from modules import company_mailer, followups_core as core
from modules.job_runtime import Guard
from routers import email_tracking
from tests import _support as S
from tests._fixtures import TenantIsolationBase


class ManualJobs(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        email_tracking._cooldowns.clear()

    def followup(self, tid, **extra):
        with Session(S.ENGINE) as s:
            row = FollowUp(tenant_id=tid, assigned_to=self.users[tid], title="Due",
                           due_at=datetime.now(timezone.utc) - timedelta(hours=1), **extra)
            s.add(row)
            s.commit()
            return row.id

    def test_manual_actions_require_admin_and_tenant(self):
        with mock.patch.object(core, "process_due_reminders") as run:
            self.assertEqual(self.client.post('/followups/run-now', json={'action': 'reminders'}).status_code, 401)
            with Session(S.ENGINE) as s:
                user = s.get(User, self.users[2])
                user.role = 'Employee'
                s.add(user)
                s.commit()
            response = self.client.post('/followups/run-now', headers=self.as_tenant(2), json={'action': 'reminders'})
            self.assertEqual(response.status_code, 403, response.text)
            run.assert_not_called()

    def test_actions_pass_authenticated_tenant_and_bounded_limits(self):
        with mock.patch.object(core, 'process_due_reminders', return_value=2) as reminders, \
             mock.patch.object(core, 'process_overdue_notices', return_value=1) as overdue:
            response = self.client.post('/followups/run-now?tenant_id=3', headers=self.as_tenant(2), json={'action': 'reminders'})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {'reminders': 2, 'overdue': 1})
            reminders.assert_called_once_with(tenant_id=2, limit=25)
            overdue.assert_called_once_with(tenant_id=2, limit=25)
            self.assertEqual(self.client.post('/followups/run-now', headers=self.as_tenant(2), json={'action': 'reminders'}).status_code, 429)
        with mock.patch.object(core, 'scan_notes', return_value={'scanned': 2, 'created': [1], 'matched': []}) as scan:
            response = self.client.post('/followups/run-now', headers=self.as_tenant(2), json={'action': 'scan'})
            self.assertEqual(response.status_code, 200, response.text)
            scan.assert_called_once_with(tenant_id=2, budget=10, max_age_days=7)
        with mock.patch.object(core, 'process_auto_sends', return_value=1) as send:
            response = self.client.post('/followups/run-now', headers=self.as_tenant(2), json={'action': 'send'})
            self.assertEqual(response.status_code, 200, response.text)
            send.assert_called_once_with(tenant_id=2, limit=20)

    def test_duplicate_company_action_is_rejected(self):
        with Guard(S.ENGINE, 'manual-followups:2'), mock.patch.object(core, 'scan_notes') as scan:
            response = self.client.post('/followups/run-now', headers=self.as_tenant(2), json={'action': 'scan'})
            self.assertEqual(response.status_code, 409, response.text)
            scan.assert_not_called()

    def test_reminders_are_tenant_scoped_bounded_and_not_duplicated(self):
        ids = [self.followup(2) for _ in range(2)]
        other = self.followup(3)
        with mock.patch.dict('os.environ', {'FOLLOWUP_REMINDER_EMAILS': '0'}):
            self.assertEqual(core.process_due_reminders(S.ENGINE, tenant_id=2, limit=1), 1)
            self.assertEqual(core.process_due_reminders(S.ENGINE, tenant_id=2, limit=1), 1)
            self.assertEqual(core.process_due_reminders(S.ENGINE, tenant_id=2, limit=1), 0)
        with Session(S.ENGINE) as s:
            self.assertTrue(all(s.get(FollowUp, row).reminder_sent_at for row in ids))
            self.assertIsNone(s.get(FollowUp, other).reminder_sent_at)
            self.assertEqual(len(s.exec(select(Notification).where(Notification.tenant_id == 2)).all()), 2)

    def test_overdue_notices_leave_other_tenants_untouched(self):
        own, other = self.followup(2), self.followup(3)
        with mock.patch.dict('os.environ', {'FOLLOWUP_REMINDER_EMAILS': '0'}), \
             mock.patch('modules.features.is_enabled', return_value=True):
            self.assertEqual(core.process_overdue_notices(S.ENGINE, tenant_id=2), 1)
            self.assertEqual(core.process_overdue_notices(S.ENGINE, tenant_id=2), 0)
        with Session(S.ENGINE) as s:
            self.assertIsNotNone(s.get(FollowUp, own).overdue_notified_at)
            self.assertIsNone(s.get(FollowUp, other).overdue_notified_at)

    def test_due_email_selection_never_uses_another_tenant(self):
        own = self.followup(2, auto_send=True, contact_email='own@example.test', email_body='Hello')
        other = self.followup(3, auto_send=True, contact_email='other@example.test', email_body='Hello')
        with mock.patch('modules.company_mailer.resolve_account', side_effect=company_mailer.MailAccountError('Configure mailbox')) as resolve:
            self.assertEqual(core.process_auto_sends(S.ENGINE, tenant_id=2), 0)
            self.assertEqual(resolve.call_count, 1)
        with Session(S.ENGINE) as s:
            self.assertFalse(s.get(FollowUp, own).auto_send)
            self.assertTrue(s.get(FollowUp, other).auto_send)
            self.assertIsNone(s.get(FollowUp, other).email_sent_at)

    def campaign(self):
        with Session(S.ENGINE) as s:
            c = EmailCampaign(tenant_id=2, created_by=self.users[2], name='Recovery', status='Sending',
                              subject_template='Hello', body_template='Hello')
            s.add(c)
            s.commit()
            cid = c.id
            for i, status in enumerate(['Sent', 'Sending', 'Pending']):
                s.add(EmailCampaignRecipient(tenant_id=2, campaign_id=cid, row_number=i + 1,
                                             email=f'recipient{i}@example.test', status=status))
            s.commit()
            return cid

    def test_resume_only_recovers_selected_campaign_and_never_retries_uncertain_delivery(self):
        cid = self.campaign()
        with mock.patch('modules.company_mailer.resolve_account'), \
             mock.patch('modules.email_campaign_worker.start_campaign') as start:
            response = self.client.post(f'/email-campaigns/{cid}/resume', headers=self.as_tenant(3))
            self.assertEqual(response.status_code, 404, response.text)
            start.assert_not_called()
            response = self.client.post(f'/email-campaigns/{cid}/resume', headers=self.as_tenant(2))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['uncertain'], 1)
            start.assert_called_once_with(cid)
        with Session(S.ENGINE) as s:
            rows = s.exec(select(EmailCampaignRecipient).order_by(EmailCampaignRecipient.row_number)).all()
            self.assertEqual([r.status for r in rows], ['Sent', 'Failed', 'Pending'])

    def test_resume_does_not_touch_a_campaign_that_is_still_running(self):
        cid = self.campaign()
        with Guard(S.ENGINE, f'campaign:{cid}'), mock.patch('modules.email_campaign_worker.start_campaign') as start:
            response = self.client.post(f'/email-campaigns/{cid}/resume', headers=self.as_tenant(2))
            self.assertEqual(response.status_code, 409, response.text)
            start.assert_not_called()

    def test_health_check_uses_no_database(self):
        with mock.patch.object(self.main, 'Session', side_effect=AssertionError('Health must not query the DB')):
            self.assertEqual(self.client.get('/health').status_code, 200)
