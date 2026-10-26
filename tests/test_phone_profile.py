"""One phone number to maintain: the Email Agent number follows the account profile unless set on purpose."""
import unittest

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import EmailAgentProfile, User


class PhoneFollowsProfile(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        self.h = {"X-User-ID": str(self.users[2])}

    def account_phone(self, phone):
        r = self.client.put("/users/me", json={"phone": phone}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["user"]

    def agent(self):
        return self.client.get("/users/me/agent-profile", headers=self.h).json()["agent_profile"]

    def save_agent(self, **body):
        r = self.client.put("/users/me/agent-profile", json=body, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["agent_profile"]

    def stored_agent_phone(self):
        with Session(S.ENGINE) as s:
            prof = s.exec(select(EmailAgentProfile).where(EmailAgentProfile.user_id == self.users[2]).execution_options(skip_tenant=True)).first()
            return prof.agent_phone if prof else "no-row"

    def test_the_agent_phone_starts_as_the_account_phone(self):
        self.account_phone("+91 98765 43210")
        self.assertEqual(self.agent()["agent_phone"], "+91 98765 43210")

    def test_saving_the_same_number_does_not_create_a_second_copy(self):
        self.account_phone("+91 98765 43210")
        # the Email Agent form sends the number it displayed (possibly formatted differently)
        saved = self.save_agent(agent_name="Admin Two", agent_email="admin2@t2.test", agent_phone="+91 98765-43210")
        self.assertIsNone(self.stored_agent_phone())
        self.assertEqual(saved["agent_phone"], "+91 98765 43210")
        # change the account phone later: the agent phone moves with it
        self.account_phone("+44 7400 123456")
        self.assertEqual(self.agent()["agent_phone"], "+44 7400 123456")

    def test_a_deliberately_different_number_is_kept(self):
        self.account_phone("+91 98765 43210")
        self.save_agent(agent_phone="+34 612 34 56 78")
        self.assertEqual(self.stored_agent_phone(), "+34 612 34 56 78")
        self.account_phone("+44 7400 123456")
        self.assertEqual(self.agent()["agent_phone"], "+34 612 34 56 78")
        # clearing it goes back to following the account
        self.save_agent(agent_phone="")
        self.assertIsNone(self.stored_agent_phone())
        self.assertEqual(self.agent()["agent_phone"], "+44 7400 123456")

    def test_a_generated_signature_follows_the_new_number_but_a_custom_one_is_left_alone(self):
        self.account_phone("+91 98765 43210")
        sig = self.save_agent(agent_name="Admin Two", agent_email="admin2@t2.test", agent_phone="+91 98765 43210")["signature"]
        self.assertIn("+91 98765 43210", sig)
        self.account_phone("+44 7400 123456")
        self.assertIn("+44 7400 123456", self.agent()["signature"])
        self.assertNotIn("+91 98765 43210", self.agent()["signature"])
        # a hand-written signature is never rewritten
        self.client.put("/users/me/signature", json={"signature": "Cheers,\nAdmin\nmy own words"}, headers=self.h)
        self.account_phone("+1 555 123 4567")
        self.assertEqual(self.agent()["signature"], "Cheers,\nAdmin\nmy own words")

    def test_clearing_the_account_phone_really_clears_it(self):
        self.account_phone("+91 98765 43210")
        self.assertEqual(self.account_phone("")["phone"] or "", "")


if __name__ == "__main__":
    unittest.main()
