"""Adversarial API checks against the real middleware, with signed sessions and fake data only."""
import os
from unittest import mock

from fastapi import HTTPException
from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import CallLog, ClientProfile, EmailReply, InboxMessage, Lead, ScheduledCall, SentEmail, User
from modules import auth_tokens, features, inbox_sync, presets, tenant_settings


class Stabilization(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        p = mock.patch.dict(os.environ, {"LEGACY_USER_HEADER": "0", "SESSION_SECRET": "v2-test-only"})
        p.start()
        self.addCleanup(p.stop)
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            root = User(email="operator@test.invalid", name="Operator", password="x", role="SuperAdmin")
            orphan = User(email="unassigned@test.invalid", name="Unassigned", password="x", role="Admin")
            s.add(root); s.add(orphan); s.commit()
            self.root, self.orphan = root.id, orphan.id
            self.calls, self.mail, self.scheduled = {}, {}, {}
            for tid in (1, 2, 3):
                c = CallLog(tenant_id=tid, phone_number=f"private-call-{tid}", client_id=self.clients[tid])
                m = InboxMessage(tenant_id=tid, mailbox=f"box{tid}@test.invalid", message_id=f"m{tid}",
                                 subject=f"private-mail-{tid}", from_address="sender@test.invalid")
                sc = ScheduledCall(tenant_id=tid, title=f"Scheduled {tid}")
                s.add(c); s.add(m); s.add(sc); s.commit()
                self.calls[tid], self.mail[tid], self.scheduled[tid] = c.id, m.id, sc.id

    def signed(self, tid=2, uid=None, selected=None):
        h = {"Authorization": "Bearer " + auth_tokens.issue_token(uid or self.users[tid], "x")}
        if selected is not None:
            h["X-Tenant-ID"] = str(selected)
        return h

    def test_superadmin_requires_explicit_valid_selection_for_data(self):
        for selected in (None, "invalid", 0, 999999):
            for path in ("/leads", "/clients", "/calls", "/inbox/messages", "/search?q=Lead", "/leaderboard", "/users"):
                r = self.client.get(path, headers=self.signed(uid=self.root, selected=selected))
                self.assertEqual(r.status_code, 403, (selected, path, r.text))

    def test_removed_toggle_endpoint_cannot_enable_crm_access(self):
        for h in (self.signed(), self.signed(uid=self.root), {}):
            r = self.client.put('/superadmin/inspection-policy', json={'enabled': True}, headers=h)
            self.assertEqual(r.status_code, 404, r.text)
        with mock.patch.dict(os.environ, {'TENANT_INSPECTION_ENABLED': '1'}):
            for selected in (None, 2, 3):
                h = self.signed(uid=self.root, selected=selected)
                for path in ('/leads', '/clients', '/calls', '/inbox/messages', '/search?q=Lead',
                             '/leads/export-csv', '/leaderboard', '/users', '/institute/analytics'):
                    r = self.client.get(path, headers=h)
                    self.assertEqual(r.status_code, 403, (path, r.text))
                    self.assertEqual(r.json()['code'], 'tenant_admin_required')
                r = self.client.patch(f'/calls/{self.calls[2]}', json={'summary': 'blocked'}, headers=h)
                self.assertEqual(r.status_code, 403, r.text)
            self.assertEqual(self.client.get('/leads', headers=self.signed()).status_code, 200)

    def test_overview_is_aggregate_and_has_no_contacts_or_record_content(self):
        for path in ("/superadmin/tenants/overview", "/superadmin/tenants"):
            r = self.client.get(path, headers=self.signed(uid=self.root))
            self.assertEqual(r.status_code, 200, r.text)
            for secret in ("admin2@t2.test", "private-call", "private-mail", "Lead of", '"email"', '"phone"'):
                self.assertNotIn(secret, r.text)
        self.assertEqual(self.client.get('/superadmin/tenants/overview', headers=self.signed()).status_code, 403)

    def test_unassigned_admin_and_unsigned_header_cannot_access_tenant_data(self):
        for h in (self.signed(uid=self.orphan), {"X-User-ID": str(self.users[2]), "X-Tenant-ID": "2"}):
            for path in ("/leads", "/clients", "/calls", "/inbox/messages"):
                self.assertEqual(self.client.get(path, headers=h).status_code, 401, path)

    def test_unsigned_identity_is_disabled_by_default(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("LEGACY_USER_HEADER", None)
            self.assertFalse(auth_tokens.legacy_header_allowed())

    def test_email_address_does_not_grant_platform_operator_privileges(self):
        with Session(S.ENGINE) as s:
            user = s.get(User, self.users[2])
            user.email = 'admin@serphawk.com'
            s.add(user); s.commit()
        self.assertEqual(self.client.get('/superadmin/tenants', headers=self.signed()).status_code, 403)
        r = self.client.get('/telemetry/demo-accounts', headers=self.signed())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()['is_operator'])

    def test_spoofed_tenant_header_query_and_exports_do_not_change_scope(self):
        h = self.signed(selected=3)
        for path in ("/leads?tenant_id=3", "/clients?tenant_id=3", "/calls?tenant_id=3", "/users",
                     "/leads/export-csv", "/clients/export-csv", "/search?q=Lead", "/omnisearch?q=Lead"):
            r = self.client.get(path, headers=h)
            self.assertEqual(r.status_code, 200, (path, r.text[:200]))
            for foreign in ("Lead of 3", "Client of 3", "private-call-3", "admin3@t3.test"):
                self.assertNotIn(foreign, r.text, path)

    def test_call_updates_cannot_move_rows_or_reference_foreign_clients(self):
        for body, expected in (({"tenant_id": 3}, 422), ({"id": self.calls[3]}, 422),
                               ({"client_id": self.clients[3]}, 404)):
            r = self.client.patch(f"/calls/{self.calls[2]}", json=body, headers=self.signed())
            self.assertEqual(r.status_code, expected, r.text)
        r = self.client.patch(f"/calls/{self.calls[3]}", json={"summary": "foreign"}, headers=self.signed())
        self.assertEqual(r.status_code, 404)

    def test_scheduled_calls_reject_foreign_links_tenant_moves_and_deletes(self):
        for body, expected in (({"tenant_id": 3}, 422), ({"entity_type": "lead", "entity_id": self.leads[3]}, 404)):
            r = self.client.put(f"/scheduled-calls/{self.scheduled[2]}", json=body, headers=self.signed())
            self.assertEqual(r.status_code, expected, r.text)
        r = self.client.delete(f"/scheduled-calls/{self.scheduled[3]}", headers=self.signed())
        self.assertEqual(r.status_code, 404)

    def test_inbox_list_and_bulk_delete_do_not_cross_tenants(self):
        r = self.client.get('/inbox/messages', headers=self.signed())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn('private-mail-3', r.text)
        # Sent-email bulk deletion must not delete another tenant's row.
        with Session(S.ENGINE) as s:
            sent = SentEmail(tenant_id=3, to_email="recipient@test.invalid", subject="Foreign sent")
            s.add(sent); s.commit(); sid = sent.id
        r = self.client.post('/sent-emails/bulk-delete', json={"ids": [sid]}, headers=self.signed())
        self.assertIn(r.status_code, (200, 403, 404), r.text)
        with Session(S.ENGINE) as s:
            self.assertIsNotNone(s.get(SentEmail, sid))

    def test_orm_write_boundary_rejects_moving_owned_row(self):
        token = self.main.current_tenant_id.set(2)
        try:
            with Session(S.ENGINE) as s:
                lead = s.get(Lead, self.leads[2]); lead.tenant_id = 3
                with self.assertRaises(HTTPException):
                    s.commit()
        finally:
            self.main.current_tenant_id.reset(token)

    def test_bulk_update_cannot_rehome_records(self):
        from sqlalchemy import update
        token = self.main.current_tenant_id.set(2)
        try:
            with Session(S.ENGINE) as s:
                with self.assertRaises(HTTPException):
                    s.exec(update(Lead).values(tenant_id=3))
        finally:
            self.main.current_tenant_id.reset(token)
        self.assertEqual(self.lead_row(2).tenant_id, 2)

    def test_assignee_payload_and_client_account_cannot_link_foreign_users(self):
        r = self.client.put(f'/leads/{self.leads[2]}', headers=self.signed(),
                            json={'company_name': 'Own', 'owner_id': self.users[3]})
        self.assertEqual(r.status_code, 404, r.text)
        r = self.client.put(f'/clients/{self.clients[2]}', headers=self.signed(),
                            json={'assignedEmployeeId': self.users[3]})
        self.assertEqual(r.status_code, 404, r.text)
        r = self.client.post('/clients', headers=self.signed(), json={'companyName': 'Own', 'email': 'admin3@t3.test'})
        self.assertEqual(r.status_code, 409, r.text)

    def test_admin_mailbox_scans_are_limited_to_own_tenant(self):
        from modules import email_sender
        from routers import email_tracking
        email_tracking._cooldowns.clear()
        with mock.patch.object(email_sender, 'check_email_replies', return_value=0) as scan:
            r = self.client.post('/webhook/check-replies-now', headers=self.signed())
            self.assertEqual(r.status_code, 200, r.text)
            scan.assert_called_once_with(tenant_id=2)

    def test_conversion_preserves_history_and_removes_active_list_and_csv(self):
        r = self.client.post(f'/leads/{self.leads[2]}/convert', headers=self.signed())
        self.assertEqual(r.status_code, 200, r.text)
        cid = r.json()['client_id']
        for path in ('/leads', '/leads/export-csv'):
            self.assertNotIn('Lead of 2', self.client.get(path, headers=self.signed()).text)
        detail = self.client.get(f'/leads/{self.leads[2]}', headers=self.signed())
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(self.lead_row(2).is_converted)
        self.assertEqual(self.lead_row(2).converted_client_id, cid)
        self.assertEqual(self.client.get(f'/clients/{cid}', headers=self.signed()).status_code, 200)

    def test_put_conversion_uses_the_same_lifecycle_and_preserves_owner(self):
        r = self.client.put(f'/leads/{self.leads[2]}', headers=self.signed(),
                            json={'company_name': 'Converted prospect', 'status': 'Converted'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self.lead_row(2).is_converted)
        self.assertEqual(self.lead_row(2).owner_id, self.users[2])
        self.assertEqual(self.client.get('/leads', headers=self.signed()).json()['leads'], [])

    def test_disabled_conversion_does_not_commit_partial_status(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {'clients': False})
        r = self.client.patch(f'/leads/{self.leads[2]}/status', headers=self.signed(), json={'status': 'Converted'})
        self.assertEqual(r.status_code, 403, r.text)
        self.assertEqual(self.lead_row(2).status, 'New')
        self.assertFalse(self.lead_row(2).is_converted)

    def test_repeated_conversion_does_not_duplicate_clients(self):
        for expected in (200, 400):
            r = self.client.post(f'/leads/{self.leads[2]}/convert', headers=self.signed())
            self.assertEqual(r.status_code, expected, r.text)
        with Session(S.ENGINE) as s:
            rows = s.exec(select(ClientProfile).where(ClientProfile.tenant_id == 2)).all()
            self.assertEqual(len(rows), 2)  # original client + converted prospect

    def test_institute_directory_and_leaderboards_use_local_people(self):
        from addons.institute.models import Instructor
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, 'institute')
            for tid in (2, 3):
                s.add(User(email=f'sales{tid}@test.invalid', name=f'Sales {tid}', role='Sales', tenant_id=tid, password='x'))
                s.add(Instructor(name=f'Teacher {tid}', tenant_id=tid))
            s.commit()
        for path in ('/users?role=Employee,SalesManager,Sales', '/instructors', '/institute/team-performance'):
            r = self.client.get(path, headers=self.signed())
            self.assertEqual(r.status_code, 200, r.text)
            self.assertNotIn('Sales 3', r.text)
            self.assertNotIn('Teacher 3', r.text)
        data = self.client.get('/institute/team-performance', headers=self.signed()).json()
        self.assertIn('Sales 2', str(data['sales']))
        self.assertIn('Teacher 2', str(data['instructors']))

    def test_generic_leaderboards_respect_kind_and_tenant(self):
        with Session(S.ENGINE) as s:
            for name, role, tid in (('Own sales', 'Employee', 2), ('Own developer', 'ProjectMember', 2), ('Foreign sales', 'Employee', 3)):
                s.add(User(name=name, email=name.replace(' ', '') + '@test.invalid', password='x', role=role, tenant_id=tid))
            s.commit()
        sales = self.client.get('/leaderboard?kind=sales', headers=self.signed()).json()
        tickets = self.client.get('/leaderboard?kind=tickets', headers=self.signed()).json()
        self.assertEqual({r['name'] for r in sales}, {'Own sales'})
        self.assertEqual({r['name'] for r in tickets}, {'Own developer'})

    def test_database_browser_and_exports_cannot_bypass_tenant_scope(self):
        for path in ('/admin/db/tables/leads', '/admin/db/export/leads', '/admin/db/tables/client_profiles', '/admin/db/export/client_profiles'):
            r = self.client.get(path, headers=self.signed())
            self.assertEqual(r.status_code, 200, r.text)
            self.assertNotIn('Lead of 3', r.text)
            self.assertNotIn('Client of 3', r.text)
        users = self.client.get('/admin/db/tables/users', headers=self.signed())
        self.assertEqual(users.status_code, 200, users.text)
        self.assertNotIn('"password"', users.text)
        self.assertNotIn('"hashed_password"', users.text)
        self.assertNotIn('admin3@t3.test', users.text)
        self.assertEqual(self.client.get('/admin/db/tables/tenants', headers=self.signed()).status_code, 403)
        self.assertEqual(self.client.get('/admin/db/export/leads', headers=self.signed(uid=self.root)).status_code, 403)
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {'leads': False})
        self.assertEqual(self.client.get('/admin/db/export/leads', headers=self.signed()).status_code, 403)

    def test_sales_manager_can_view_institute_metrics_without_email_details(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, 'institute')
            manager = User(name='Institute manager', email='manager@test.invalid', password='x', role='SalesManager', tenant_id=2)
            s.add(manager); s.commit(); uid = manager.id
        r = self.client.get('/institute/team-performance', headers=self.signed(uid=uid))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('Institute manager', r.text)
        self.assertNotIn('"email"', r.text)
        self.assertNotIn('Admin 3', r.text)

    def test_audit_log_details_and_counts_are_scoped(self):
        from database import AuditLog
        with Session(S.ENGINE) as s:
            for tid in (2, 3):
                s.add(AuditLog(tenant_id=tid, user_id=self.users[tid], table_name='leads', record_id=self.leads[tid],
                               action='UPDATE', changes=f'private-audit-{tid}'))
            s.commit()
        r = self.client.get('/telemetry/audit-logs', headers=self.signed())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('private-audit-2', r.text)
        self.assertNotIn('private-audit-3', r.text)
        self.assertEqual(r.json()['total_count'], len(r.json()['logs']))

    def test_operator_cannot_reset_tenant_records(self):
        r = self.client.get('/dev/reset-clients', headers=self.signed(uid=self.root, selected=2))
        self.assertEqual(r.status_code, 403, r.text)
        self.assertIsNotNone(self.client_row(2))
        self.assertIsNotNone(self.client_row(3))
        self.assertIsNotNone(self.client_row(1))

    def test_raw_lead_cleanup_never_deletes_another_tenants_records(self):
        # A historical bad foreign reference must not make another company's mail
        # disappear when this company's lead is removed.
        with Session(S.ENGINE) as s:
            sent = SentEmail(tenant_id=3, lead_id=self.leads[2], to_email='foreign@test.invalid', subject='Keep foreign mail')
            s.add(sent); s.commit(); sid = sent.id
        r = self.client.delete(f'/leads/{self.leads[2]}', headers=self.signed())
        self.assertEqual(r.status_code, 200, r.text)
        with Session(S.ENGINE) as s:
            self.assertIsNotNone(s.get(SentEmail, sid))

    def test_sections_disable_per_tenant_including_specialized_handlers(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {'leads': False, 'clients': False, 'calls': False, 'institute': True})
        for path in ('/leads', '/leads/export-csv', f'/leads/{self.leads[2]}/follow-ups', '/clients', '/clients/export-csv', '/calls', '/scheduled-calls'):
            self.assertEqual(self.client.get(path, headers=self.signed()).status_code, 403, path)
        self.assertEqual(self.client.get('/leads', headers=self.signed(tid=3)).status_code, 200)

    def test_institute_voice_requires_explicit_entitlement(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {'institute': True})
        r = self.client.get('/voice-agent/calls', headers=self.signed())
        self.assertEqual(r.status_code, 403, r.text)
        self.assertEqual(r.json().get('feature'), 'voice_agent')
        with Session(S.ENGINE) as s:
            self.assertTrue(features.set_features(s, 2, {'voice_agent': True})['voice_agent'])

    def test_tenant_mailbox_never_adopts_foreign_reply_tenant(self):
        with Session(S.ENGINE) as s:
            sent = SentEmail(tenant_id=3, lead_id=self.leads[3], to_email='sender@test.invalid', subject='foreign')
            s.add(sent); s.commit()
            s.add(EmailReply(tenant_id=3, sent_email_id=sent.id, message_id='<shared@test.invalid>')); s.commit()
            cfg = inbox_sync.MailboxConfig('box2@test.invalid', 'box2@test.invalid', 'fake', 'imap.test.invalid', 2, True)
            links = inbox_sync.link_inbound(s, cfg, {'message_id': '<shared@test.invalid>', 'from_address': 'sender@test.invalid'})
        self.assertEqual(links['tenant_id'], 2)
        self.assertIsNone(links['sent_email_id'])
        self.assertIsNone(links['lead_id'])


    def test_admissions_schedule_and_analytics_are_tenant_isolated(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, 'institute')
        config = self.client.get('/me/features', headers=self.signed()).json()
        self.assertTrue(config['features']['lead_sources'])
        self.assertIn('Webinar Scheduled', config['settings']['lead_statuses'])
        self.assertFalse(config['features']['voice_agent'])
        for suffix, status in (('webinars', 'Webinar Scheduled'), ('walk-ins', 'Walk-in Scheduled'), ('follow-ups', 'Follow-up')):
            body = {'scheduled_at': '2026-12-01T10:00:00+00:00', 'notes': 'Test schedule'}
            r = self.client.post(f'/leads/{self.leads[2]}/{suffix}', json=body, headers=self.signed())
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(self.lead_row(2).status, status)
            r = self.client.post(f'/leads/{self.leads[3]}/{suffix}', json=body, headers=self.signed())
            self.assertEqual(r.status_code, 404, r.text)
        for path in ('/institute/analytics', '/analytics/lead-sources', '/leads/sources/analytics', '/institute/team-performance'):
            r = self.client.get(path, headers=self.signed())
            self.assertEqual(r.status_code, 200, (path, r.text[:300]))
            for foreign in ('Lead of 3', 'Admin 3', 'admin3@t3.test'):
                self.assertNotIn(foreign, r.text)

