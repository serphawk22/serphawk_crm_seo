from unittest import mock
from sqlmodel import Session
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import User


class ProjectAssignment(TenantIsolationBase):
    def test_create_persists_selected_members_and_project_context(self):
        with mock.patch('modules.whatsapp.send_ai_polished_whatsapp_message'):
            response = self.client.post('/projects', headers=self.as_tenant(2), json={
                'name': 'Selected team', 'projectMemberIds': [self.users[2], self.users[2]],
                'project_type': 'SEO', 'clientId': self.clients[2], 'leadId': self.leads[2]})
        self.assertEqual(response.status_code, 200, response.text)
        project = response.json()['project']
        detail = self.client.get(f"/projects/{project['id']}", headers=self.as_tenant(2)).json()
        self.assertEqual([u['id'] for u in detail['team']['projectMembers']], [self.users[2]])
        self.assertEqual(project['project_type'], 'SEO')
        self.assertEqual(project['clientId'], self.clients[2])
        self.assertEqual(project['leadId'], self.leads[2])

    def test_foreign_inactive_and_nonstaff_members_are_rejected(self):
        with Session(S.ENGINE) as session:
            inactive = User(tenant_id=2, email='inactive@test', name='Inactive', password='x', role='Employee', is_active=False)
            client = User(tenant_id=2, email='client@test', name='Client', password='x', role='Client')
            session.add(inactive); session.add(client); session.commit(); session.refresh(inactive); session.refresh(client)
            ids = [self.users[3], inactive.id, client.id]
        for member in ids:
            response = self.client.post('/projects', headers=self.as_tenant(2), json={'name': 'Invalid team', 'projectMemberIds': [member]})
            self.assertEqual(response.status_code, 422, response.text)

    def test_foreign_client_and_lead_are_rejected(self):
        for field, record in [('clientId', self.clients[3]), ('leadId', self.leads[3])]:
            self.assertEqual(self.client.post('/projects', headers=self.as_tenant(2), json={'name': 'Foreign context', field: record}).status_code, 404)
