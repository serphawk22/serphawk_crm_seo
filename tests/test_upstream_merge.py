"""Pieces taken from the main-branch merge: dropped clients that remember their previous status, the SerpHawk flagship
preset, and the personal time-zone endpoint that no module gates."""
from sqlmodel import Session

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import ClientProfile
from modules import features, presets, tenant_settings


class DroppedClientsKeepHistory(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "bpo")
            cp = s.get(ClientProfile, self.clients[2])
            cp.status = "Negotiation"
            s.add(cp)
            s.commit()
        self.h = self.as_tenant(2)

    def status(self):
        with Session(S.ENGINE) as s:
            return s.get(ClientProfile, self.clients[2]).status

    def test_drop_remembers_the_status_and_reactivation_restores_it(self):
        r = self.client.post("/dropped-clients", json={"client_id": self.clients[2], "company_name": "Acme", "reason": "Budget"}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["dropped_client"]["previous_status"], "Negotiation")
        self.assertEqual(self.status(), "Dropped")
        r = self.client.post(f"/dropped-clients/by-client/{self.clients[2]}/reactivate", headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()["status"], self.status()), ("Negotiation", "Negotiation"))
        record = self.client.get("/dropped-clients", headers=self.h).json()["dropped_clients"][0]
        self.assertIsNotNone(record["reactivated_at"], "the record stays as history instead of disappearing")

    def test_a_client_cannot_be_dropped_twice(self):
        body = {"client_id": self.clients[2], "company_name": "Acme", "reason": "Budget"}
        self.assertEqual(self.client.post("/dropped-clients", json=body, headers=self.h).status_code, 200)
        self.assertEqual(self.client.post("/dropped-clients", json=body, headers=self.h).status_code, 409)

    def test_after_reactivation_the_client_can_be_dropped_again(self):
        body = {"client_id": self.clients[2], "company_name": "Acme", "reason": "Budget"}
        self.client.post("/dropped-clients", json=body, headers=self.h)
        self.client.post(f"/dropped-clients/by-client/{self.clients[2]}/reactivate", headers=self.h)
        self.assertEqual(self.client.post("/dropped-clients", json=body, headers=self.h).status_code, 200)

    def test_another_company_cannot_reactivate_it(self):
        self.client.post("/dropped-clients", json={"client_id": self.clients[2], "company_name": "Acme"}, headers=self.h)
        r = self.client.post(f"/dropped-clients/by-client/{self.clients[2]}/reactivate", headers=self.as_tenant(3))
        self.assertIn(r.status_code, (403, 404))
        self.assertEqual(self.status(), "Dropped")


class FlagshipPreset(TenantIsolationBase):
    def test_serphawk_preset_is_the_core_crm_plus_the_business_suite(self):
        p = presets.PRESETS["serphawk"]
        core = {k for k, f in features.FEATURES.items() if f.default_on}
        self.assertLessEqual(core, p["features"], "nothing the company has today is lost")
        for key in ("lead_sources", "finance_suite", "dropped_clients", "followup_board", "command_center", "ai_reports", "proposals_portal"):
            self.assertIn(key, p["features"])
        self.assertNotIn("institute", p["features"])
        tenant_settings.validate(p["settings"])

    def test_applying_it_switches_the_modules_on(self):
        features.invalidate()
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "serphawk")
        for path in ("/lead-sources", "/dropped-clients", "/follow-ups"):
            self.assertNotEqual(self.client.get(path, headers=self.as_tenant(3)).status_code, 403, path)


class TimezoneIsPersonal(TenantIsolationBase):
    def test_a_company_without_meeting_history_can_still_read_its_own_timezone(self):
        features.invalidate()
        r = self.client.get("/me/timezone", headers=self.as_tenant(3))
        self.assertNotEqual(r.status_code, 403, r.text)
