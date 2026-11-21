"""Bounded, source-backed research presented in Email Agent and client records."""

import json
import re
from urllib.parse import urlsplit

from modules.research_contacts import email_addresses, extracted_field


def website_host(value: str | None) -> str:
    try:
        value = (value or "").strip()
        parts = urlsplit(value if "://" in value else f"https://{value}")
        if parts.scheme not in {"http", "https"} or parts.username or parts.password:
            return ""
        host = (parts.hostname or "").lower().rstrip(".").removeprefix("www.")
        return host if re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*", host) else ""
    except ValueError:
        return ""


def text_field(value, length: int) -> str:
    return value.strip()[:length] if isinstance(value, str) else ""


def json_object(value) -> dict:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def preserve_outreach(existing, replacement) -> str | None:
    outreach = json_object(existing).get("outreach_research")
    if not outreach and (replacement is None or isinstance(replacement, str)):
        return replacement
    data = json_object(replacement)
    if outreach:
        data["outreach_research"] = outreach
    return json.dumps(data, default=str)


def build_research(analysis: dict, raw_text: str, url: str) -> dict:
    source_text = raw_text.casefold()
    found_emails = {email.lower() for email in email_addresses(extracted_field(raw_text, "Emails"), raw_text)}
    found_phones = {
        re.sub(r"\D", "", phone) for phone in extracted_field(raw_text, "Phone Numbers").split(",")
    }
    people = []
    seen = set()
    for person in analysis.get("contacts") or []:
        if not isinstance(person, dict):
            continue
        name = text_field(person.get("name"), 160)
        key = name.casefold()
        if not key or key not in source_text or key in seen:
            continue
        seen.add(key)
        socials = person.get("personal_social_media")
        linkedin = text_field(socials.get("linkedin"), 500) if isinstance(socials, dict) else ""
        if not (website_host(linkedin) == "linkedin.com" and "/in/" in linkedin and linkedin.casefold() in source_text):
            linkedin = ""
        email = text_field(person.get("email"), 255).lower()
        phone = text_field(person.get("phone_number"), 60)
        if re.sub(r"\D", "", phone) not in found_phones:
            phone = ""
        updates = person.get("recent_updates")
        people.append({
            "name": name,
            "role": text_field(person.get("role"), 160),
            "profile": text_field(person.get("context"), 1200),
            "recent_updates": [item[:400] for item in updates[:3] if isinstance(item, str)] if isinstance(updates, list) else [],
            "email": email if email in found_emails else "",
            "phone": phone,
            "linkedin": linkedin,
            "linkedin_intro": text_field(person.get("linkedin_intro"), 1500),
            "whatsapp_intro": text_field(person.get("whatsapp_intro"), 1500),
        })
        if len(people) == 5:
            break

    products = analysis.get("key_value_props")
    news = analysis.get("recent_news")
    return {
        "summary": text_field(analysis.get("research_summary") or analysis.get("what_they_do"), 18000),
        "business_model": text_field(analysis.get("business_model"), 400),
        "products": [item[:300] for item in products[:20] if isinstance(item, str)] if isinstance(products, list) else [],
        "recent_news": [item[:600] for item in news[:5] if isinstance(item, str)] if isinstance(news, list) and not raw_text.startswith("ERROR") else [],
        "people": people,
        "source_url": url if not raw_text.startswith("ERROR") and raw_text else "",
    }
