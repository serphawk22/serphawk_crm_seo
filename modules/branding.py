"""
Brand identity used in generated documents (PDFs, HTML emails): name, tagline and contact details.

A tenant that has set ``brand_name`` (modules/tenant_settings.py) gets its own identity and only the contact
details it filled in, so another company's phone number never appears on its documents. A tenant that has not
gets the original SerpHawk identity, exactly as before. The tenant comes from the request context unless one
is passed (background jobs have no request context and fall back to the default identity).
"""
from dataclasses import dataclass

from modules import tenant_settings
from modules.tenant_scope import current_tenant_id

_UNSET = object()


@dataclass(frozen=True)
class Brand:
    name: str
    tagline: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    website: str = ""

    def contact_line(self, sep: str = "  |  ") -> str:
        return sep.join(p for p in (self.email, self.phone) if p)

    def footer_line(self, sep: str = " | ") -> str:
        return sep.join(p for p in (self.name, self.email, self.phone, self.address) if p)


DEFAULT = Brand(name="SerpHawk", tagline="Digital Marketing Agency", email="crm@serphawk.in",
                phone="+91 9502901416", address="BTM Layout, Bengaluru, India", website="https://crm.serphawk.in")


def current_brand(tenant_id=_UNSET) -> Brand:
    tid = current_tenant_id.get() if tenant_id is _UNSET else tenant_id
    s = tenant_settings.get_settings(tid)
    if not s.get("brand_name"):
        return DEFAULT
    return Brand(
        name=s["brand_name"],
        tagline=s.get("brand_tagline") or "",
        email=s.get("contact_email") or s.get("support_email") or "",
        phone=s.get("contact_phone") or "",
        address=s.get("contact_address") or "",
        website=s.get("website_url") or "",
    )


def current_logo(tenant_id=_UNSET):
    """
    PNG bytes of the logo to print on documents and e-mails, or None for "no logo".

    A tenant that uploaded its own gets it. If ``brand_logo_url`` points to an external URL or local static file,
    it is loaded and normalized. A tenant with its own brand name but no upload gets none (it must never
    carry another company's logo). The default identity keeps the SerpHawk logo, which callers load themselves.
    """
    import os
    from modules import tenant_assets
    tid = current_tenant_id.get() if tenant_id is _UNSET else tenant_id
    data = tenant_assets.logo_bytes(tid)
    if data:
        return data
    logo_url = tenant_settings.get_setting(tid, "brand_logo_url", None) if tid else None
    if logo_url and isinstance(logo_url, str):
        logo_url = logo_url.strip()
        if logo_url.startswith("/static/"):
            root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            local_path = os.path.join(root, logo_url.lstrip("/"))
            if os.path.exists(local_path):
                try:
                    with open(local_path, "rb") as f:
                        return tenant_assets.normalize_logo(f.read())
                except Exception:
                    pass
        elif logo_url.startswith("http://") or logo_url.startswith("https://"):
            try:
                import requests
                resp = requests.get(logo_url, timeout=5)
                if resp.status_code == 200 and resp.content:
                    return tenant_assets.normalize_logo(resp.content)
            except Exception:
                pass
    return None


def uses_default_identity(tenant_id=_UNSET) -> bool:
    return current_brand(tenant_id) is DEFAULT


def document_style(tenant_id=_UNSET) -> dict:
    """Invoice / document look from the tenant's settings (all optional)."""
    tid = current_tenant_id.get() if tenant_id is _UNSET else tenant_id
    s = tenant_settings.get_settings(tid)
    return {
        "accent": s.get("invoice_accent_color") or s.get("primary_color"),
        "footer_note": s.get("invoice_footer_note"),
        "payment_details": s.get("invoice_payment_details"),
        "terms": s.get("invoice_terms"),
        "logo_position": s.get("invoice_logo_position") or "left",
    }
