"""
AI Brand and Contact Autofill from Website.
Scrapes a business website to extract:
- Brand name & tagline
- Contact email, phone number, address, support email
- Detailed AI company description
- Company logo (finding and downloading the best candidate PNG/JPEG/WEBP logo)
"""
import io
import json
import logging
import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from sqlmodel import Session

from modules import scraper, tenant_assets, tenant_settings
from modules.llm_engine import get_openai_client

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _clean_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url


def _extract_logo_candidates(soup: BeautifulSoup, base_url: str) -> list[str]:
    candidates = []

    # 1. OpenGraph and Twitter image meta tags
    for meta in soup.find_all("meta"):
        prop = meta.get("property", "").lower() or meta.get("name", "").lower()
        if prop in ("og:image", "og:logo", "twitter:image"):
            content = meta.get("content")
            if content:
                candidates.append(urljoin(base_url, content))

    # 2. Apple touch icon & large favicons (often high res logos)
    for link in soup.find_all("link", rel=True):
        rel = [r.lower() for r in (link["rel"] if isinstance(link["rel"], list) else [link["rel"]])]
        if any("apple-touch-icon" in r or "icon" in r for r in rel):
            href = link.get("href")
            if href:
                candidates.append(urljoin(base_url, href))

    # 3. Img tags with logo in class, id, alt, or src
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        full_src = urljoin(base_url, src)
        combined = f"{img.get('id', '')} {img.get('class', '')} {img.get('alt', '')} {src}".lower()
        if "logo" in combined or "brand" in combined:
            candidates.append(full_src)

    # 4. Filter duplicate URLs preserving order
    seen = set()
    unique_candidates = []
    for c in candidates:
        cleaned = c.split("?")[0].lower()
        if cleaned not in seen and not cleaned.endswith((".svg", ".ico", ".gif")):
            seen.add(cleaned)
            unique_candidates.append(c)

    return unique_candidates


def _download_candidate_logo(candidates: list[str]) -> Optional[bytes]:
    headers = {"User-Agent": USER_AGENT}
    for candidate_url in candidates[:6]:
        try:
            resp = requests.get(candidate_url, headers=headers, timeout=8)
            if resp.status_code == 200 and len(resp.content) > 100:
                # Check if it normalizes into a valid PNG
                try:
                    png = tenant_assets.normalize_logo(resp.content)
                    if png:
                        logger.info(f"Successfully retrieved valid logo from {candidate_url}")
                        return resp.content
                except Exception as norm_err:
                    logger.debug(f"Candidate {candidate_url} failed normalization: {norm_err}")
                    continue
        except Exception as e:
            logger.debug(f"Failed to download candidate logo {candidate_url}: {e}")
            continue
    return None


async def autofill_brand_from_website(
    website_url: str,
    session: Optional[Session] = None,
    tenant_id: Optional[int] = None,
    save_to_tenant: bool = False,
) -> Dict[str, Any]:
    url = _clean_url(website_url)
    logger.info(f"Autofilling brand info from website: {url}")

    # 1. Fetch website HTML
    html_content = ""
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=12)
        if resp.status_code == 200:
            html_content = resp.text
    except Exception as e:
        logger.warning(f"Direct GET failed for {url}: {e}")

    soup = BeautifulSoup(html_content, "html.parser") if html_content else None

    # 2. Extract and download logo
    logo_bytes = None
    if soup:
        logo_candidates = _extract_logo_candidates(soup, url)
        logo_bytes = _download_candidate_logo(logo_candidates)

    # 3. Scrape textual content and contact details
    scraped_content = await scraper.scrape_website(url)

    # 4. LLM Extraction
    prompt = f"""
You are an expert CRM onboarding assistant. Analyze this website content and extract structured brand and contact information.

Website URL: {url}
Scraped Information:
{scraped_content[:14000]}

Return a JSON object with EXACTLY these keys (use null or empty string if not found):
{{
  "brand_name": "Official company/brand name",
  "brand_tagline": "Short compelling tagline or slogan (max 10 words)",
  "contact_email": "Primary general or sales contact email",
  "contact_phone": "Primary phone number with international country code",
  "contact_address": "Physical office address if found",
  "support_email": "Customer support or help email",
  "ai_company_description": "2-3 comprehensive paragraphs describing what the company does, its core products/services, target clients, and key value propositions. This will be used by AI outreach agents.",
  "industry": "Industry slug (one of: it_services, saas, digital_agency, consulting, healthcare, real_estate, ecommerce, manufacturing, education, finance, logistics, other)"
}}
"""
    client = get_openai_client()
    extracted: Dict[str, Any] = {}
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        extracted = json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        logger.error(f"OpenAI extraction failed: {e}")
        extracted = {}

    extracted["website_url"] = url

    # Remove None values
    clean_extracted: Dict[str, Any] = {
        k: (v.strip() if isinstance(v, str) else v)
        for k, v in extracted.items()
        if v is not None and v != ""
    }

    logo_saved = False
    logo_url = None

    # 5. Optionally save directly to tenant
    if save_to_tenant and session and tenant_id:
        if logo_bytes:
            try:
                version = tenant_assets.save_logo(session, tenant_id, logo_bytes)
                logo_url = tenant_assets.logo_url(tenant_id, version)
                clean_extracted["brand_logo_url"] = logo_url
                logo_saved = True
            except Exception as e:
                logger.error(f"Failed to auto-save logo for tenant {tenant_id}: {e}")

        # Update tenant settings with extracted fields
        try:
            tenant_settings.update_settings(session, tenant_id, clean_extracted)
        except Exception as e:
            logger.error(f"Failed to update tenant settings: {e}")

    return {
        "success": True,
        "extracted": clean_extracted,
        "logo_found": logo_bytes is not None,
        "logo_saved": logo_saved,
        "logo_url": logo_url,
    }

