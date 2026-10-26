"""Chat: the WebSocket and the message routes need a signed-in participant of a thread in their own tenant."""
import json
import unittest

from starlette.websockets import WebSocketDisconnect
from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import ChatMessage, ClientProfile, MessageThread, ServiceCatalog, ServiceRequest, User
from modules import auth_tokens


class ChatBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            svc = ServiceCatalog(name="SEO", intro_description="x")
            s.add(svc)
            s.commit()
            s.refresh(svc)
            # a client login for tenant 2 and its thread; a second client login in the same tenant
            cu = User(email="cl2@t2.test", password="x", name="Client Two", role="Client", tenant_id=2)
            other_cu = User(email="cl2b@t2.test", password="x", name="Other Client", role="Client", tenant_id=2)
            s.add(cu)
            s.add(other_cu)
            s.commit()
            s.refresh(cu)
            s.refresh(other_cu)
            cp = s.get(ClientProfile, self.clients[2])
            cp.userId = cu.id
            s.add(cp)
            s.commit()
            req = ServiceRequest(service_id=svc.id, client_id=cp.id, tenant_id=2)
            s.add(req)
            s.commit()
            s.refresh(req)
            thread = MessageThread(service_request_id=req.id, client_id=cp.id, tenant_id=2)
            s.add(thread)
            s.commit()
            s.refresh(thread)
            self.thread, self.client_user, self.other_client_user = thread.id, cu.id, other_cu.id

    def token(self, user_id):
        with Session(S.ENGINE) as s:
            u = s.get(User, user_id)
            return auth_tokens.issue_token(u.id, u.password)

    def ws(self, user_id=None, token=True, thread=None):
        url = f"/ws/chat/{thread or self.thread}"
        if user_id and token:
            url += f"?token={self.token(user_id)}"
        elif user_id:
            url += f"?user_id={user_id}"
        return self.client.websocket_connect(url)


class WebSocketAccess(ChatBase):
    def test_anonymous_is_refused(self):
        with self.assertRaises(WebSocketDisconnect) as ctx:
            with self.ws():
                pass
        self.assertEqual(ctx.exception.code, 4401)

    def test_forged_and_unknown_credentials_are_refused(self):
        for url in (f"/ws/chat/{self.thread}?token=v1.bad.token", f"/ws/chat/{self.thread}?user_id=999999"):
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect(url):
                    pass

    def test_another_tenants_user_cannot_join_a_thread(self):
        with self.assertRaises(WebSocketDisconnect) as ctx:
            with self.ws(self.users[3]):
                pass
        self.assertEqual(ctx.exception.code, 4403)

    def test_a_client_who_is_not_the_threads_client_cannot_join(self):
        with self.assertRaises(WebSocketDisconnect) as ctx:
            with self.ws(self.other_client_user):
                pass
        self.assertEqual(ctx.exception.code, 4403)

    def test_participants_can_chat_and_the_sender_cannot_be_spoofed(self):
        with self.ws(self.client_user) as a, self.ws(self.users[2]) as b:
            a.send_text(json.dumps({"action": "message", "content": "hello team", "sender_id": self.users[3]}))   # spoof attempt
            got = b.receive_json()
            self.assertEqual(got["type"], "new_message")
            self.assertEqual(got["message"]["content"], "hello team")
            self.assertEqual(got["message"]["sender_id"], self.client_user)
        with Session(S.ENGINE) as s:
            msg = s.exec(select(ChatMessage).execution_options(skip_tenant=True)).one()
            self.assertEqual((msg.sender_id, msg.tenant_id, msg.thread_id), (self.client_user, 2, self.thread))

    def test_legacy_user_id_still_works_while_allowed(self):
        with self.ws(self.users[2], token=False) as a:
            a.send_text(json.dumps({"action": "message", "content": "legacy"}))
            self.assertEqual(a.receive_json()["message"]["content"], "legacy")


class MessageRoutes(ChatBase):
    def test_reading_threads_is_limited_to_yourself_or_an_admin(self):
        emp = self.client_user
        r = self.client.get(f"/messages/{self.users[2]}", headers={"X-User-ID": str(emp)})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client.get(f"/messages/{self.client_user}", headers={"X-User-ID": str(self.client_user)}).status_code, 200)
        self.assertEqual(self.client.get(f"/messages/{self.client_user}", headers={"X-User-ID": str(self.users[2])}).status_code, 200)
        self.assertEqual(self.client.get(f"/messages/{self.client_user}").status_code, 401)

    def test_sending_needs_participation_and_your_own_identity(self):
        body = {"thread_id": self.thread, "sender_id": self.client_user, "content": "hi"}
        self.assertEqual(self.client.post("/messages/send", json=body).status_code, 401)
        self.assertEqual(self.client.post("/messages/send", json=body, headers={"X-User-ID": str(self.client_user)}).status_code, 200)
        spoof = {**body, "sender_id": self.users[2]}
        self.assertEqual(self.client.post("/messages/send", json=spoof, headers={"X-User-ID": str(self.client_user)}).status_code, 403)
        self.assertEqual(self.client.post("/messages/send", json={**body, "sender_id": self.other_client_user},
                                          headers={"X-User-ID": str(self.other_client_user)}).status_code, 404)
        self.assertEqual(self.client.post("/messages/send", json={**body, "sender_id": self.users[3]},
                                          headers={"X-User-ID": str(self.users[3])}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
