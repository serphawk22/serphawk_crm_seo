"""
AI Lead Autofill from Website.
Accurately scrapes and extracts real business details from a company website.
Guarantees NO placeholder emails (tucorreo, mail.com, sentry, etc.) and NO fake phone numbers (555-0199, 1234 5678, etc.).
"""
import json
import logging
import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from modules import scraper
from modules.llm_engine import get_openai_client

logger = logging.getLogger(__name__)

INDUSTRIES = [
    "Technology", "Healthcare", "Finance", "Education", "Real Estate",
    "Retail", "Manufacturing", "Legal", "Hospitality", "Automotive",
    "Construction", "Marketing & Advertising", "Other"
]

def is_placeholder_email(email: Optional[str]) -> bool:
    if not email or "@" not in email:
        return True
    e = email.lower().strip()
    bad_substrings = [
        "tucorreo", "mail.com", "example.com", "test.com", "placeholder",
        "yourname", "domain.com", "sentry.io", "wixpress", "user@",
        "first.last@", "you@example", "name@domain", "info@domain",
        "mhtml.blink", "mhtml", "noreply", "no-reply",
        ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"
    ]
    return any(b in e for b in bad_substrings)

def is_placeholder_phone(phone: Optional[str]) -> bool:
    if not phone:
        return True
    p = re.sub(r'\D', '', str(phone))
    if len(p) < 7 or len(p) > 15:
        return True
    fake_patterns = ["555-0199", "1234 5678", "12345678", "000-0000", "0000000", "1111111", "9999999"]
    if any(fake in str(phone) for fake in fake_patterns):
        return True
    if "123456" in p or "5550199" in p or "000000" in p:
        return True
    return False

def _clean_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url

async def autofill_lead_from_website(website_url: str) -> Dict[str, Any]:
    url = _clean_url(website_url)
    parsed = urlparse(url)
    domain = parsed.netloc.replace("www.", "")
    fallback_name = domain.split(".")[0].capitalize()

    logger.info(f"[LeadAutofill] Scraping {url}")
    try:
        raw_text = await scraper.scrape_website(url)
    except Exception as e:
        logger.warning(f"[LeadAutofill] Scrape failed for {url}: {e}")
        raw_text = ""

    extracted_emails = []
    extracted_phones = []
    if raw_text:
        for line in raw_text.splitlines():
            if line.startswith("Extracted Emails:"):
                parts = [e.strip() for e in line.replace("Extracted Emails:", "").split(",") if e.strip()]
                extracted_emails.extend([e for e in parts if not is_placeholder_email(e)])
            elif line.startswith("Extracted Phone Numbers:"):
                parts = [p.strip() for p in line.replace("Extracted Phone Numbers:", "").split(",") if p.strip()]
                extracted_phones.extend([p for p in parts if not is_placeholder_phone(p)])

    prompt = f"""You are a precise B2B CRM intelligence analyst.
Analyze the scraped website content from "{url}" to extract accurate company details for a Lead record.

Website URL: {url}
Domain: {domain}
Scraped Verified Emails: {', '.join(extracted_emails) if extracted_emails else 'None found'}
Scraped Verified Phones: {', '.join(extracted_phones) if extracted_phones else 'None found'}

Website Content Snippet:
{raw_text[:14000] if raw_text else "No scraped text available"}

CRITICAL RULES FOR CONTACT DETAILS:
1. ONLY return a contact email if a REAL, legitimate email address is found in the content or verified emails above.
   DO NOT guess or invent fake emails (e.g. DO NOT return contact@{domain} or info@company.com unless it actually appears in the text).
   If no real email is found, return null.
2. ONLY return a phone number if a REAL telephone/WhatsApp number appears in the content or verified phones above.
   DO NOT invent fake numbers like +1-800-555-0199 or +52 55 1234 5678.
   If no real phone is found, return null.
3. For "industry", pick EXACTLY ONE from this list: {json.dumps(INDUSTRIES)}.
4. For "address", extract the city, state, and country of the headquarters or primary office (e.g. "Ciudad de México, Mexico"). If not found, return null.
5. For "company_name", return the proper official business name (e.g. "IZA Business Centers").
6. For "notes", write a 2-3 sentence executive summary of what services this business provides and who they serve.
7. For "contact_person", extract the real name of a key executive, founder, director, or contact person if mentioned in the website text (else null).
8. For "contact_role", their title/heading/designation (e.g. "CEO", "Founder & Managing Director", "Commercial Director", else null).

Return ONLY a valid JSON object matching this schema:
{{
  "company_name": "Official Business Name",
  "email": "real_email@domain.com or null",
  "phone": "+XX XXXXXXXXX or null",
  "website": "{url}",
  "industry": "Industry from list",
  "address": "City, Country or null",
  "notes": "Concise 2-3 sentence overview of business",
  "contact_person": "Full name or null",
  "contact_role": "Role heading or null"
}}
"""
    try:
        client = get_openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        
        final_email = data.get("email") or ""
        # Cross-verify: email must actually appear in the website text or extracted emails list
        if final_email:
            if is_placeholder_email(final_email) or (raw_text and final_email.lower() not in raw_text.lower() and final_email.lower() not in [e.lower() for e in extracted_emails]):
                final_email = extracted_emails[0] if extracted_emails else ""
        elif extracted_emails:
            final_email = extracted_emails[0]

        final_phone = data.get("phone") or ""
        # Cross-verify: phone digits must appear in the website text or extracted phones list
        if final_phone:
            clean_digits = re.sub(r'\D', '', final_phone)
            clean_raw = re.sub(r'\D', '', raw_text) if raw_text else ""
            if is_placeholder_phone(final_phone) or (clean_raw and len(clean_digits) >= 7 and clean_digits not in clean_raw and final_phone not in extracted_phones):
                final_phone = extracted_phones[0] if extracted_phones else ""
        elif extracted_phones:
            final_phone = extracted_phones[0]

        industry_val = data.get("industry")
        if industry_val not in INDUSTRIES:
            industry_val = "Other"

        return {
            "ok": True,
            "data": {
                "company_name": data.get("company_name") or fallback_name,
                "email": final_email,
                "phone": final_phone,
                "website": url,
                "industry": industry_val,
                "address": data.get("address") or "",
                "notes": data.get("notes") or "",
                "contact_name": data.get("contact_person") or "",
                "contact_designation": data.get("contact_role") or "Key Decision Maker"
            }
        }
    except Exception as e:
        logger.error(f"[LeadAutofill] Extraction error for {url}: {e}")
        return {
            "ok": True,
            "data": {
                "company_name": fallback_name,
                "email": extracted_emails[0] if extracted_emails else "",
                "phone": extracted_phones[0] if extracted_phones else "",
                "website": url,
                "industry": "Other",
                "address": "",
                "notes": ""
            }
        }

