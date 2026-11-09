"""Research recipient regression: no network, SMTP, or production data."""
import unittest
from unittest import mock
from sqlmodel import Session, select

from database import EmailCampaign, Lead, SentEmail
from modules.research_contacts import email_addresses, extracted_field, valid_email
from tests import _support as S
from tests._fixtures import TenantIsolationBase


class ContactParsing(unittest.TestCase):
    def test_empty_metadata_does_not_consume_next_heading(self):
        text = 'Extracted Emails: \r\nExtracted Phone Numbers: +15555550123\r\nExtracted LinkedIn Profiles:\r\n'
        self.assertEqual(extracted_field(text, 'Emails'), '')
        self.assertEqual(extracted_field(text, 'Phone Numbers'), '+15555550123')
        self.assertEqual(email_addresses(text), [])

    def test_formats_contacts_deduplicates_and_excludes_placeholders_and_assets(self):
        values = ['Extracted Phone Numbers:', 'test@example.com', 'support.crm@serphawk.in',
                  {'email': ['Sales <sales@site.test>', 'sales@SITE.test']},
                  'mailto:hello@site.test?subject=Hi', 'logo@2x.png']
        self.assertEqual(email_addresses(values), ['sales@site.test', 'hello@site.test'])
        self.assertFalse(valid_email('Extracted Phone Numbers:'))
        self.assertFalse(valid_email('someone@site.test\nBcc: another@site.test'))


class ResearchRecipients(TenantIsolationBase):
    def research(self, raw, contacts=None):
        result = {'company_analysis': {'company_name': 'Synthetic Website', 'contacts': contacts or []},
                  'service_mapping': [], 'raw_text': raw}
        with mock.patch('modules.scraper.research_and_map_company', new=mock.AsyncMock(return_value=result)), \
             mock.patch('modules.llm_engine.generate_email', return_value={'subject': 'Hello', 'english_body': 'Hello'}):
            response = self.client.post('/smart-research', headers=self.as_tenant(2),
                                        json={'company_name': 'Synthetic Website', 'company_url': 'https://synthetic.test'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_scraped_email_fills_primary_recipient_and_created_lead(self):
        result = self.research('Extracted Emails: sales@synthetic.test\nExtracted Phone Numbers:\n',
                               [{'email': 'Extracted Phone Numbers:'}])
        self.assertEqual(result['contact']['email'], 'sales@synthetic.test')
        self.assertEqual(result['company_info']['extracted_emails'], 'sales@synthetic.test')
        with Session(S.ENGINE) as s:
            row = s.exec(select(Lead).where(Lead.website == 'https://synthetic.test')).first()
            self.assertEqual(row.email, 'sales@synthetic.test')
            self.assertEqual(row.tenant_id, 2)

    def test_no_public_email_stays_empty_instead_of_using_phone_heading(self):
        result = self.research('Extracted Emails: \nExtracted Phone Numbers: +15555550123\nExtracted LinkedIn Profiles:\n')
        self.assertEqual(result['contact']['email'], '')
        self.assertEqual(result['company_info']['extracted_emails'], '')

    def test_uses_later_valid_contact_when_first_has_no_email(self):
        result = self.research('Extracted Emails:\n', [{'name': 'Owner'}, {'name': 'Sales', 'email': 'hello@synthetic.test'}])
        self.assertEqual(result['contact']['email'], 'hello@synthetic.test')
        self.assertEqual(result['contact']['name'], 'Sales')

    def test_address_in_website_body_is_recovered(self):
        result = self.research('Extracted Emails:\nExtracted Phone Numbers:\nWebsite Content:\nContact us: sales@synthetic.test')
        self.assertEqual(result['contact']['email'], 'sales@synthetic.test')

    def test_existing_lead_receives_missing_email_without_overwriting_other_records(self):
        with Session(S.ENGINE) as s:
            lead = s.get(Lead, self.leads[2])
            lead.website, lead.email = 'https://synthetic.test', None
            s.add(lead)
            s.commit()
        self.research('Extracted Emails: contact@synthetic.test\nExtracted Phone Numbers:\n')
        self.assertEqual(self.lead_row(2).email, 'contact@synthetic.test')
        self.assertEqual(self.lead_row(3).email, 'lead3@x.test')

    def test_invalid_to_is_rejected_before_creating_records_or_sending(self):
        with Session(S.ENGINE) as s:
            before = len(s.exec(select(Lead)).all())
        with mock.patch('modules.email_sender.send_email_outlook') as send:
            response = self.client.post('/send-manual', headers=self.as_tenant(2), json={
                'to_email': 'Extracted Phone Numbers:', 'company_name': 'Broken', 'subject': 'Hello', 'english_body': 'Hello',
            })
            self.assertEqual(response.status_code, 400, response.text)
            send.assert_not_called()
        with Session(S.ENGINE) as s:
            self.assertEqual(len(s.exec(select(Lead)).all()), before)
            self.assertEqual(s.exec(select(SentEmail)).all(), [])

    def test_recovery_filter_finds_old_pending_campaign_among_completed_campaigns(self):
        with Session(S.ENGINE) as s:
            for i in range(35):
                s.add(EmailCampaign(tenant_id=2, created_by=self.users[2], name=f'Done {i}', status='Completed',
                                    subject_template='Hello', body_template='Hello', total=1, sent_count=1))
            s.add(EmailCampaign(tenant_id=2, created_by=self.users[2], name='Own interrupted', status='Sending',
                                subject_template='Hello', body_template='Hello', total=2))
            s.add(EmailCampaign(tenant_id=3, created_by=self.users[3], name='Other interrupted', status='Sending',
                                subject_template='Hello', body_template='Hello', total=2))
            s.commit()
        response = self.client.get('/email-campaigns?needs_recovery=true&limit=100', headers=self.as_tenant(2))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([c['name'] for c in response.json()['items']], ['Own interrupted'])
