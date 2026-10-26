"""Brand identity in generated documents follows the tenant; tenants without a brand keep the original."""
import unittest

from reportlab import rl_config
from sqlmodel import Session

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from modules import branding, tenant_settings
from modules.tenant_scope import current_tenant_id


def _pdf_text(data: bytes) -> str:
    # compression is off in these tests, so text shows up as literal strings in the content streams
    return data.decode("latin-1")


class BrandingTests(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        rl_config.pageCompression = 0
        self.addCleanup(setattr, rl_config, "pageCompression", 1)
        tenant_settings.invalidate()
        self.addCleanup(tenant_settings.invalidate)

    def set_brand(self, tid, **settings):
        with Session(S.ENGINE) as s:
            tenant_settings.update_settings(s, tid, settings)

    def test_default_brand_is_unchanged(self):
        b = branding.current_brand(None)
        self.assertEqual((b.name, b.email, b.phone), ("SerpHawk", "crm@serphawk.in", "+91 9502901416"))
        self.assertEqual(b.contact_line(), "crm@serphawk.in  |  +91 9502901416")
        self.assertEqual(b.footer_line(), "SerpHawk | crm@serphawk.in | +91 9502901416 | BTM Layout, Bengaluru, India")

    def test_tenant_brand_replaces_identity_and_never_leaks_serphawk_contacts(self):
        self.set_brand(2, brand_name="Alpha & Co", contact_email="hello@alpha.test")
        b = branding.current_brand(2)
        self.assertEqual((b.name, b.email, b.phone, b.address), ("Alpha & Co", "hello@alpha.test", "", ""))
        self.assertEqual(branding.current_brand(3).name, "SerpHawk")

    def test_follows_request_tenant_context(self):
        self.set_brand(2, brand_name="Alpha Co")
        token = current_tenant_id.set(2)
        try:
            self.assertEqual(branding.current_brand().name, "Alpha Co")
        finally:
            current_tenant_id.reset(token)
        self.assertEqual(branding.current_brand().name, "SerpHawk")

    def test_quote_and_invoice_pdfs(self):
        from modules import pdf_export
        data = {"currency": "$", "items": [{"name": "Widget", "quantity": 1, "unit_price": 10, "price": 10}],
                "client_name": "Client Ltd", "quote_number": "Q-1", "invoice_number": "INV-1"}
        for make in (pdf_export.quote_pdf, pdf_export.invoice_pdf):
            default_pdf = _pdf_text(make(dict(data)))
            self.assertIn("SerpHawk", default_pdf)
            self.assertIn("crm@serphawk.in", default_pdf)
            self.set_brand(2, brand_name="Alpha &amp; Co", contact_phone="+1 555 0100")
            token = current_tenant_id.set(2)
            try:
                branded = _pdf_text(make(dict(data)))
            finally:
                current_tenant_id.reset(token)
            self.assertIn("Alpha", branded)
            self.assertIn("+1 555 0100", branded)
            self.assertNotIn("crm@serphawk.in", branded)
            self.assertNotIn("+91 9502901416", branded)
            tenant_settings.invalidate()
            self.set_brand(2, brand_name=None, contact_phone=None)

    def test_branded_email_wrapper(self):
        from modules import email_sender
        default_html = email_sender.branded_email("Hello", "<p>Body</p>")
        self.assertIn("cid:serphawk_logo", default_html)
        self.assertIn("crm@serphawk.in", default_html)
        self.set_brand(2, brand_name="Alpha Co", brand_tagline="Training", contact_email="hi@alpha.test")
        html = email_sender.branded_email("Hello", "<p>Body</p>", tenant_id=2)
        self.assertIn("Alpha Co", html)
        self.assertIn("hi@alpha.test", html)
        self.assertNotIn("cid:serphawk_logo", html)
        self.assertNotIn("crm@serphawk.in", html)
        self.assertNotIn("Digital Marketing Agency", html)

    def test_logo_is_not_stamped_on_other_tenants_mail(self):
        from modules import email_sender
        self.assertIn("cid:serphawk_logo", email_sender._inject_logo("<html><body><p>x</p></body></html>"))
        self.set_brand(2, brand_name="Alpha Co")
        token = current_tenant_id.set(2)
        try:
            self.assertNotIn("cid:serphawk_logo", email_sender._inject_logo("<html><body><p>x</p></body></html>"))
        finally:
            current_tenant_id.reset(token)

    def test_product_name_for_subjects(self):
        from modules import email_sender
        self.assertEqual(email_sender._product_name(None), "SERP Hawk CRM")
        self.set_brand(2, brand_name="Alpha Co")
        self.assertEqual(email_sender._product_name(2), "Alpha Co")

    def _captured_prompt(self, tenant_id):
        import json
        from unittest import mock
        from modules import llm_engine
        seen = []

        class C:
            def create(self, **kw):
                seen.append(kw["messages"][0]["content"])
                msg = type("M", (), {"content": json.dumps({"subject": "s", "english_body": "e", "spanish_body": "x", "whatsapp_draft": "w"})})()
                return type("R", (), {"choices": [type("X", (), {"message": msg})()]})()

        fake = type("Cl", (), {"chat": type("Ch", (), {"completions": C()})()})()
        token = current_tenant_id.set(tenant_id)
        try:
            with mock.patch.object(llm_engine, "get_openai_client", lambda: fake):
                llm_engine.generate_email({"company_name": "Acme", "what_they_do": "widgets", "website": "a.test"})
        finally:
            current_tenant_id.reset(token)
        return seen[0]

    def test_outreach_prompt_uses_tenant_identity(self):
        default = self._captured_prompt(3)
        self.assertIn("writing on behalf of SerpHawk", default)
        self.assertIn("Relation Manager- SerpHawk", default)
        self.set_brand(2, brand_name="Alpha Institute", contact_email="admissions@alpha.test",
                       ai_company_description="We run weekend coding bootcamps in Pune.")
        branded = self._captured_prompt(2)
        self.assertIn("writing on behalf of Alpha Institute", branded)
        self.assertIn("We run weekend coding bootcamps in Pune.", branded)
        self.assertIn("admissions@alpha.test", branded)
        self.assertNotIn("SerpHawk", branded)
        self.assertNotIn("serphawk", branded)
        self.assertNotIn("Organic SEO", branded)

    def test_fallback_draft_never_contains_error_text_and_follows_tenant(self):
        from unittest import mock
        from modules import llm_engine
        boom = mock.Mock(side_effect=RuntimeError("quota exceeded sk-secret"))
        with mock.patch.object(llm_engine, "get_openai_client", boom):
            default = llm_engine.generate_email({"company_name": "Acme"}, contact={"name": "Bob"})
        self.assertTrue(default["fallback"])
        self.assertNotEqual(default["subject"], "Error")
        self.assertNotIn("quota exceeded", default["english_body"] + default["spanish_body"])
        self.assertIn("Hi Bob,", default["english_body"])
        self.assertIn("SerpHawk", default["english_body"])
        self.set_brand(2, brand_name="Alpha Co", outreach_fallback_subject="Idea for {company}",
                       outreach_fallback_en="{salutation} {company}: {brand} here. -{owner}",
                       outreach_fallback_es="{salutation} {company}: habla {brand}.")
        token = current_tenant_id.set(2)
        try:
            with mock.patch.object(llm_engine, "get_openai_client", boom):
                branded = llm_engine.generate_email({"company_name": "Acme"}, contact={"name": "Bob"}, owner_name="Ana")
        finally:
            current_tenant_id.reset(token)
        self.assertEqual(branded["subject"], "Idea for Acme")
        self.assertEqual(branded["english_body"], "Hi Bob, Acme: Alpha Co here. -Ana")
        self.assertEqual(branded["spanish_body"], "Hola Bob, Acme: habla Alpha Co.")
        self.assertNotIn("SerpHawk", branded["english_body"] + branded["spanish_body"])


if __name__ == "__main__":
    unittest.main()
