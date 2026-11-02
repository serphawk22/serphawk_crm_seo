from sqlmodel import Session
from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import User
from modules import auth_tokens


class ProfileSettings(TenantIsolationBase):
    def test_password_change_is_self_only_and_invalidates_old_sessions(self):
        uid = self.users[2]
        token = auth_tokens.issue_token(uid, "x")
        headers = {"Authorization": f"Bearer {token}"}
        body = {"user_id": self.users[3], "current_password": "x", "new_password": "new-secret-123"}
        self.assertEqual(self.client.post("/change-password", json=body, headers=headers).status_code, 403)
        response = self.client.post("/change-password", json={**body, "user_id": uid}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/users/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.post("/login", json={"email": "admin2@t2.test", "password": "x"}).status_code, 401)
        self.assertEqual(self.client.post("/login", json={"email": "admin2@t2.test", "password": "new-secret-123"}).status_code, 200)

    def test_operator_can_change_own_password_without_entering_a_tenant(self):
        with Session(S.ENGINE) as session:
            root = User(email="root@profile.test", password="old-secret", role="SuperAdmin", name="Root")
            session.add(root); session.commit(); session.refresh(root); uid = root.id
        response = self.client.post("/change-password", headers={"Authorization": f"Bearer {auth_tokens.issue_token(uid, 'old-secret')}"}, json={"user_id": uid, "current_password": "old-secret", "new_password": "new-secret-123"})
        self.assertEqual(response.status_code, 200, response.text)
