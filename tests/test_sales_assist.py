import json
from unittest import mock

from sqlmodel import Session, select

from database import ClientProfile, ClientResearch, Lead, LeadNote, SalesPlanDraft, SentEmail, User
from modules import features
from tests import _support as S
from tests._fixtures import TenantIsolationBase


class SalesAssist(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        self.addCleanup(features.invalidate)
        with Session(S.ENGINE) as session:
            salesperson = User(
                email="sales@t2.test", name="Salesperson", password="fixture", role="SalesManager", tenant_id=2,
            )
            portal = User(
                email="portal@t2.test", name="Portal", password="fixture", role="Client", tenant_id=2,
            )
            session.add_all([salesperson, portal])
            session.commit()
            self.sales = {"X-User-ID": str(salesperson.id)}
            self.portal = {"X-User-ID": str(portal.id)}

    def research(self, url="https://company.test"):
        result = {
            "company_analysis": {
                "company_name": "Company",
                "what_they_do": "Agency",
                "research_summary": "Builds ecommerce integrations for regional retailers.",
                "business_model": "B2B",
                "key_value_props": ["Ecommerce integrations"],
                "contacts": [
                    {"name": "Jordan Alvarez", "email": "jordan@company.test",
                     "phone_number": "+12025550123", "linkedin_intro": "Ask Jordan about integrations."},
                    {"name": "Unverified Name", "email": "guess@company.test"},
                ],
            },
            "raw_text": (
                "Extracted Emails: jordan@company.test\nExtracted Phone Numbers: +12025550123\n"
                "Website Content:\nJordan Alvarez leads the integrations team."
            ),
        }
        with mock.patch("modules.scraper.research_and_map_company", new=mock.AsyncMock(return_value=result)), \
             mock.patch("modules.llm_engine.generate_email", return_value={"subject": "Hello"}):
            response = self.client.post("/smart-research", headers=self.sales,
                                        json={"company_name": "Company", "company_url": url})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_research_and_save_reuses_exact_company_and_keeps_existing_report(self):
        with Session(S.ENGINE) as session:
            session.add(Lead(company_name="Different", website="https://other-company.test",
                             tenant_id=2, owner_id=int(self.sales["X-User-ID"])))
            client = session.get(ClientProfile, self.clients[2])
            client.websiteUrl = "http://www.company.test/about"
            client.assignedEmployeeId = int(self.sales["X-User-ID"])
            session.add(ClientResearch(tenant_id=2, client_id=client.id, company_overview="Existing overview",
                                       email_agent_data='{"__full_report": "360 report"}'))
            session.commit()
        result = self.research()
        self.assertEqual([person["name"] for person in result["outreach_research"]["people"]], ["Jordan Alvarez"])
        self.assertEqual(result["outreach_research"]["people"][0]["email"], "jordan@company.test")
        path = f"/leads/{result['lead_id']}/save-research-to-client"
        first = self.client.post(path, headers=self.sales)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["client_id"], self.clients[2])
        self.assertEqual(self.client.post(path, headers=self.sales).json(), first.json())
        research = self.client.get(f"/clients/{self.clients[2]}/research", headers=self.sales).json()["research"]
        self.assertEqual(research["company_overview"], "Existing overview")
        data = json.loads(research["email_agent_data"])
        self.assertEqual(data["__full_report"], "360 report")
        self.assertEqual(data["outreach_research"]["summary"], result["outreach_research"]["summary"])
        self.assertEqual(self.client.get(f"/clients/{self.clients[2]}/research", headers=self.portal).status_code, 403)
        self.assertEqual(self.client.post(path, headers=self.as_tenant(3)).status_code, 404)

    def test_creates_one_assigned_client_with_overview_and_no_portal_account(self):
        result = self.research()
        path = f"/leads/{result['lead_id']}/save-research-to-client"
        response = self.client.post(path, headers=self.sales)
        self.assertEqual(response.status_code, 200, response.text)
        client_id = response.json()["client_id"]
        self.assertEqual(self.client.post(path, headers=self.sales).json()["client_id"], client_id)
        with Session(S.ENGINE) as session:
            client = session.get(ClientProfile, client_id)
            self.assertEqual(client.assignedEmployeeId, int(self.sales["X-User-ID"]))
            self.assertIsNone(client.userId)
            research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).one()
            self.assertEqual(research.company_overview, result["outreach_research"]["summary"])
            self.assertFalse(session.get(Lead, result["lead_id"]).is_converted)

    def test_plan_uses_record_history_and_drafts_are_saved_without_sending(self):
        result = self.research()
        lead_id = result["lead_id"]
        with Session(S.ENGINE) as session:
            session.add_all([
                LeadNote(lead_id=lead_id, tenant_id=2, content="Asked about ERP integration"),
                LeadNote(lead_id=self.leads[3], tenant_id=3, content="Other tenant private note"),
            ])
            session.commit()
        saved = self.client.post(f"/leads/{lead_id}/save-research-to-client", headers=self.sales)
        self.assertEqual(saved.status_code, 200, saved.text)
        path = f"/clients/{saved.json()['client_id']}/sales-next-steps"
        with mock.patch("modules.sales_assist.prepare_sales_plan", return_value={"steps": ["Confirm ERP requirements"]}) as ai:
            response = self.client.post(path + "?lang=es", headers=self.sales)
            self.assertEqual(response.status_code, 200, response.text)
            context, language = ai.call_args.args
            self.assertEqual(language, "Spanish")
            self.assertIn("Asked about ERP integration", json.dumps(context))
            self.assertIn("Ecommerce integrations", json.dumps(context))
            self.assertNotIn("Other tenant private note", json.dumps(context))
        draft = {"to_email": "jordan@company.test", "subject": "Discovery", "body": "Can we review the integration?"}
        one = self.client.put(path + "/draft", headers=self.sales, json=draft)
        self.assertEqual(one.status_code, 200, one.text)
        self.assertEqual(self.client.put(path + "/draft", headers=self.sales, json=draft).json(), one.json())
        self.assertEqual(self.client.get(path + "/draft", headers=self.sales).json()["drafts"][0]["body"], draft["body"])
        self.assertEqual(self.client.get(path + "/draft", headers=self.as_tenant(2)).json()["drafts"], [])
        with Session(S.ENGINE) as session:
            row = session.get(SalesPlanDraft, one.json()["draft_id"])
            self.assertEqual(row.body, draft["body"])
            self.assertEqual(row.tenant_id, 2)
            self.assertEqual(session.exec(select(SentEmail)).all(), [])

    def test_plan_requires_record_access_and_uses_demo_budget(self):
        path = f"/leads/{self.leads[2]}/sales-next-steps"
        with mock.patch("modules.sales_assist.prepare_sales_plan") as ai:
            self.assertEqual(self.client.post(path).status_code, 401)
            self.assertEqual(self.client.post(path, headers=self.portal).status_code, 403)
            self.assertEqual(self.client.post(path, headers=self.sales).status_code, 404)
            self.assertEqual(self.client.post(path, headers=self.as_tenant(3)).status_code, 404)
            ai.assert_not_called()
        self.assertEqual(self.main.demo_usage.request_policy("POST", path), "ai")
        self.assertIsNone(self.main.demo_usage.request_policy("PUT", path + "/draft"))
