"""Platform onboarding choices remain reachable with a signed operator session."""
from sqlmodel import Session

from database import User
from modules import auth_tokens, onboarding
from tests import _support as S
from tests._fixtures import TenantIsolationBase


class OnboardingOptions(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as session:
            operator = User(email="options@platform.test", password="test-hash", role="SuperAdmin")
            session.add(operator)
            session.commit()
            session.refresh(operator)
            self.operator_headers = {"Authorization": f"Bearer {auth_tokens.issue_token(operator.id, operator.password)}"}

    def test_operator_can_load_the_same_business_and_country_choices(self):
        response = self.client.get("/superadmin/onboarding/options", headers=self.operator_headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), onboarding.options())
        self.assertTrue(any(item["key"] == "education" for item in response.json()["industries"]))
        self.assertTrue(any(item["code"] == "IN" for item in response.json()["countries"]))

    def test_options_require_platform_authorization(self):
        self.assertEqual(self.client.get("/superadmin/onboarding/options").status_code, 401)
        self.assertEqual(self.client.get("/superadmin/onboarding/options", headers=self.as_tenant(2)).status_code, 403)
