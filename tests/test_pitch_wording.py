"""The spoken opening pitch must follow the reference's four-sentence sales-rep flow.

The lead's company/industry are substituted from CRM data (never from a hardcoded tenant), and
the editable pitch + audio Regenerate flows keep working unchanged.
"""
import unittest
from unittest import mock

import tests._support as S  # noqa: F401  (points the app at an in-memory database)

from database import Lead
from modules import tenant_voice
from modules import voice_agent as va
from modules.tenant_voice import TenantVoiceProfile


def _profile(**overrides):
    defaults = dict(
        tenant_id=1, company_name="SERP Hawk", company_description="SEO and link building",
        agent_name="Alex", services="SEO, link building", tone="professional and friendly",
        language="en", voice="nova", accent="american",
    )
    defaults.update(overrides)
    return TenantVoiceProfile(**defaults)


class FallbackPitchStyle(unittest.TestCase):
    def test_uses_lead_company_industry_and_relevant_audience(self):
        pitch = tenant_voice.fallback_pitch(
            {"name": "Northstar Dental", "industry": "Dental", "website": "northstar.example"},
            _profile(),
        )
        sentences = [s for s in pitch.split(". ") if s]
        self.assertEqual(len(sentences), 4, pitch)
        self.assertTrue(pitch.startswith("Hello! This is Alex from SERP Hawk,"))
        self.assertIn("help Northstar Dental increase its online visibility in the Dental sector", pitch)
        self.assertIn("allowing you to reach more patients effectively", pitch)
        self.assertIn("place Northstar Dental at the forefront of Dental innovation online", pitch)
        self.assertTrue(pitch.endswith("Can I schedule a time for us to chat further?"))
        self.assertNotIn("Allytech", pitch)

    def test_generic_persona_still_sounds_like_a_rep(self):
        pitch = tenant_voice.fallback_pitch(
            {"name": "Bright Smiles", "industry": "Dental"}, _profile(agent_name="the AI assistant")
        )
        self.assertTrue(pitch.startswith("Hello! This is Alex from SERP Hawk,"))

    def test_missing_industry_is_inferred_and_grammatical(self):
        pitch = tenant_voice.fallback_pitch(
            "Company: Bright Smiles\nWebsite: https://brightsmilesdental.example", _profile()
        )
        self.assertIn("help Bright Smiles increase its online visibility in the dental sector", pitch)
        self.assertIn("place Bright Smiles at the forefront of dental innovation online", pitch)
        self.assertNotIn("https://", pitch)


class GeneratedPitchPrompt(unittest.TestCase):
    def _capture_prompt(self, answer="A four sentence pitch."):
        captured = {}

        class _Completions:
            def create(self, **kwargs):
                captured.update(kwargs)
                return mock.Mock(choices=[mock.Mock(message=mock.Mock(content=answer))])

        client = mock.Mock()
        client.chat.completions.create.side_effect = _Completions().create
        with mock.patch.object(va, "_openai", return_value=client):
            result = va.generate_pitch_text(
                "Company: Old Name\nIndustry: Old Industry", language="English", profile=_profile(),
                prospect={"name": "Northstar Dental", "industry": "Dental", "notes": "family dentistry"},
            )
        return result, captured

    def test_prompt_uses_reference_flow_with_dynamic_lead_details(self):
        result, captured = self._capture_prompt()
        self.assertEqual(result, "A four sentence pitch.")
        prompt = captured["messages"][0]["content"]
        self.assertIn("calling to help [prospect company] increase its online visibility in the "
                      "[prospect industry] sector", prompt)
        self.assertIn("allowing you to reach more [relevant target audience] effectively", prompt)
        self.assertIn("at the forefront of [prospect industry] innovation online", prompt)
        self.assertIn("Can I schedule a time for us to chat further?", prompt)
        self.assertIn("Prospect company: Northstar Dental", prompt)
        self.assertIn("Prospect industry: Dental", prompt)
        self.assertIn("Relevant audience for this business: patients", prompt)
        self.assertIn("EXACTLY four", prompt)
        self.assertIn("60-85 words", prompt)
        self.assertNotIn("Allytech", prompt)


class LeadDetailsReachThePitchWriter(unittest.TestCase):
    def setUp(self):
        S.reset_db()
        S.use_engine(self)
        from sqlmodel import Session

        self.session = Session(S.ENGINE)
        self.addCleanup(self.session.close)

    def test_entity_info_exposes_company_and_industry(self):
        from routers import voice_agent as router

        lead = Lead(company_name="Harbor Law", industry="Legal", website="harborlaw.example",
                    phone="+15551234567", notes="personal injury attorneys")
        self.session.add(lead)
        self.session.commit()
        self.session.refresh(lead)

        info = router._entity_info(self.session, "lead", lead.id, tenant_id=None)
        self.assertEqual(info["company"], "Harbor Law")
        self.assertEqual(info["industry"], "Legal")
        self.assertIn("Industry: Legal", info["context"])
        self.assertEqual(tenant_voice.pitch_facts(info)["audience"], "clients")


if __name__ == "__main__":
    unittest.main()
