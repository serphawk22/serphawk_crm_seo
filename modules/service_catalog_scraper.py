"""
AI Web Scraper for Product & Service Catalogs.
Scrapes a business website (homepage and services/products/pricing subpages)
and extracts structured product and service offerings ready for the CRM catalog.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from sqlmodel import Session, select

from database import Product
from modules.llm_engine import get_openai_client
from modules.tenant_scope import current_tenant_id

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

PRODUCT_KEYWORDS = [
    "service", "services", "product", "products", "solution", "solutions",
    "pricing", "plans", "offerings", "catalog", "shop", "store", "packages"
]


def _clean_url(url: str) -> str:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return url


def discover_product_pages(soup: BeautifulSoup, base_url: str, limit: int = 4) -> List[str]:
    discovered = []
    seen = {base_url.rstrip("/")}
    parsed_base = urlparse(base_url)

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = a.get_text().strip().lower()
        href_lower = href.lower()

        if href_lower.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue

        full_url = urljoin(base_url, href)
        parsed_full = urlparse(full_url)

        if parsed_full.netloc != parsed_base.netloc:
            continue

        clean_full = full_url.split("?")[0].rstrip("/")
        if clean_full in seen:
            continue

        # Check if keyword is in href path or anchor text
        path_lower = parsed_full.path.lower()
        if any(kw in path_lower or kw in text for kw in PRODUCT_KEYWORDS):
            seen.add(clean_full)
            discovered.append(full_url)
            if len(discovered) >= limit:
                break

    return discovered


def fetch_text_content(url: str, timeout: int = 8) -> str:
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
                tag.decompose()
            text = soup.get_text(separator=" ")
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            return " ".join(chunk for chunk in chunks if chunk)
    except Exception as e:
        logger.debug(f"Failed to fetch {url}: {e}")
    return ""


async def scrape_product_catalog_from_website(
    website_url: str,
    default_currency: str = "USD",
) -> List[Dict[str, Any]]:
    url = _clean_url(website_url)
    logger.info(f"Scraping product catalog from {url}")

    homepage_html = ""
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=10)
        if resp.status_code == 200:
            homepage_html = resp.text
    except Exception as e:
        logger.warning(f"Failed to fetch homepage {url}: {e}")

    subpages = []
    homepage_text = ""
    if homepage_html:
        soup = BeautifulSoup(homepage_html, "html.parser")
        subpages = discover_product_pages(soup, url)
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()
        homepage_text = soup.get_text(separator=" ")[:8000]

    all_texts = [f"--- HOMEPAGE ({url}) ---\n" + homepage_text]
    for sub in subpages:
        sub_text = fetch_text_content(sub)
        if sub_text:
            all_texts.append(f"--- SUBPAGE ({sub}) ---\n" + sub_text[:5000])

    combined_context = "\n\n".join(all_texts)[:20000]

    prompt = f"""
You are an expert CRM catalog specialist. Analyze the following website text and extract a comprehensive list of all products, services, solutions, packages, or offerings provided by this company.

Website URL: {url}
Default Currency: {default_currency}

Website Content:
{combined_context}

Return a JSON object with a "products" array containing objects with these fields:
- "name": Concise, professional name of the service or product (e.g. "Full-Stack Web Development", "SEO Audit Package", "Cloud Hosting Enterprise")
- "category": One of "Service", "Software", "Consulting", "Hardware", "Marketing", "Support", "Other"
- "description": 1-2 sentence description detailing what is included or key features
- "unit_price": Number (e.g. 500.0 or 0.0 if not listed on site)
- "currency": "{default_currency}" (or actual currency if explicitly mentioned on site)
- "sku": Short SKU slug (e.g. "SRV-WEB-DEV", "PKG-SEO-AUDIT")
- "tax_rate": 0.0
- "is_active": true

Extract up to 25 distinct items that best represent the company's catalog. If prices are not stated, use 0.0.
"""

    client = get_openai_client()
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        items = data.get("products", [])
        return items
    except Exception as e:
        logger.error(f"Catalog extraction LLM failed: {e}")
        return []


def bulk_insert_products(
    session: Session,
    items: List[Dict[str, Any]],
    tenant_id: Optional[int] = None,
) -> Dict[str, Any]:
    tid = current_tenant_id.get() if tenant_id is None else tenant_id
    existing = session.exec(select(Product.name)).all()
    existing_names = {n.strip().lower() for n in existing if n}

    created = 0
    skipped = 0
    added_products = []

    for item in items:
        name = (item.get("name") or "").strip()
        if not name or name.lower() in existing_names:
            skipped += 1
            continue

        p = Product(
            tenant_id=tid,
            name=name,
            category=item.get("category") or "Service",
            description=item.get("description") or "",
            unit_price=float(item.get("unit_price") or 0.0),
            currency=item.get("currency") or "USD",
            sku=item.get("sku"),
            tax_rate=float(item.get("tax_rate") or 0.0),
            is_active=item.get("is_active", True),
        )
        session.add(p)
        existing_names.add(name.lower())
        created += 1
        added_products.append(p)

    session.commit()
    return {
        "success": True,
        "created_count": created,
        "skipped_count": skipped,
        "total": len(items),
    }

