"""Tenant-aware voice persona used by every AI calling prompt.

The voice agent must never speak as the platform itself. This helper resolves the owning
tenant's branding/AI settings into one small, JSON-serialisable profile that is stored on the
call and reused by the pitch generator and every live conversation turn. No cross-tenant
lookup happens here: only the tenant id passed by the caller is read.
"""
from __future__ import annotations

import os
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

from sqlmodel import Session, select

import database
from modules import tenant_settings
from modules.tts_service import VOICE_IDS, LANGUAGES, resolve_voice_locale

_TENANT_NAME_TTL = 60.0
_TENANT_NAME_CACHE: Dict[int, tuple] = {}

_DEFAULT_COMPANY = os.getenv("VOICE_AGENT_COMPANY", "your company")
_DEFAULT_DESCRIPTION = os.getenv(
    "VOICE_AGENT_COMPANY_DESC",
    "a company whose services are described in its CRM knowledge base",
)


@dataclass(frozen=True)
class TenantVoiceProfile:
    tenant_id: Optional[int]
    company_name: str
    company_description: str
    agent_name: str
    services: str
    tone: str
    language: str
    voice: str
    accent: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: Optional[Dict[str, Any]]) -> "TenantVoiceProfile":
        value = value or {}
        return cls(
            tenant_id=value.get("tenant_id"),
            company_name=value.get("company_name") or _DEFAULT_COMPANY,
            company_description=value.get("company_description") or _DEFAULT_DESCRIPTION,
            agent_name=value.get("agent_name") or "the AI assistant",
            services=value.get("services") or "",
            tone=value.get("tone") or "warm, professional and friendly",
            language=value.get("language") or "en",
            voice=value.get("voice") or "nova",
            accent=value.get("accent") or "american",
        )

    def identity_line(self) -> str:
        """One sentence safe to paste into a system prompt."""
        about = self.company_description or self.services or "the services listed in the CRM knowledge base"
        return (
            f'You are {self.agent_name}, an AI voice representative calling on behalf of '
            f'"{self.company_name}", {about}. Your tone is {self.tone}.'
        )


def default_profile() -> TenantVoiceProfile:
    """No tenant selected (env-only fallback). Keeps legacy callers working."""
    return TenantVoiceProfile(
        tenant_id=None,
        company_name=_DEFAULT_COMPANY,
        company_description=_DEFAULT_DESCRIPTION,
        agent_name="the AI assistant",
        services="",
        tone="warm, professional and friendly",
        language="en",
        voice="nova",
        accent="american",
    )


def profile_for_call(tenant_id: Optional[int], *, language: Optional[str] = None,
                     voice: Optional[str] = None, accent: Optional[str] = None) -> TenantVoiceProfile:
    """Resolve one tenant's calling identity from branding + AI settings.

    Missing keys stay on the built-in defaults, so tenants that never configured a persona
    keep the previous behaviour instead of hearing a placeholder company name.
    """
    settings = tenant_settings.get_settings(tenant_id, use_cache=True)
    tenant_name = None
    if not settings.get("brand_name") and tenant_id and int(tenant_id) > 0:
        tid_int = int(tenant_id)
        now = time.monotonic()
        cached = _TENANT_NAME_CACHE.get(tid_int)
        if cached and now - cached[0] < _TENANT_NAME_TTL:
            tenant_name = cached[1]
        else:
            try:
                with Session(database.engine) as session:
                    tenant = session.exec(
                        select(database.Tenant).where(database.Tenant.id == tid_int)
                        .execution_options(skip_tenant=True)
                    ).first()
                    tenant_name = (tenant.business_name or tenant.name) if tenant else None
                    _TENANT_NAME_CACHE[tid_int] = (now, tenant_name)
            except Exception:
                tenant_name = None

    company_name = (
        settings.get("brand_name")
        or tenant_name
        or _DEFAULT_COMPANY
    )
    services = settings.get("voice_agent_offer") or settings.get("ai_company_description") or ""
    description = (
        settings.get("ai_company_description")
        or settings.get("ai_business_type")
        or (f"offering {services}" if services else _DEFAULT_DESCRIPTION)
    )
    if settings.get("ai_triage_notes"):
        description = f"{description} ({settings['ai_triage_notes']})"

    lang = language or settings.get("locale") or "en"
    if lang not in LANGUAGES:
        lang = "en"
    default_accent = accent or settings.get("voice_agent_accent") or next(iter(LANGUAGES[lang]["accents"]))
    chosen_voice = voice or settings.get("voice_agent_voice") or "nova"
    if chosen_voice not in VOICE_IDS:
        chosen_voice = "nova"
    _, resolved_accent, _ = resolve_voice_locale(lang, default_accent)

    return TenantVoiceProfile(
        tenant_id=int(tenant_id) if tenant_id and int(tenant_id) > 0 else None,
        company_name=str(company_name),
        company_description=str(description)[:1500],
        agent_name=str(settings.get("voice_agent_name") or settings.get("contact_name") or "the AI assistant"),
        services=str(services)[:1000],
        tone=str(settings.get("voice_agent_tone") or "warm, professional and friendly"),
        language=lang,
        voice=chosen_voice,
        accent=resolved_accent,
    )


def prompt_context(profile: Optional[TenantVoiceProfile] = None) -> dict:
    """Tenant-specific facts injected into every AI calling prompt."""
    p = profile or default_profile()
    return {
        "company_name": p.company_name,
        "company_description": p.company_description or p.services or "the services listed in the CRM knowledge base",
        "agent_name": p.agent_name,
        "tone": p.tone or default_profile().tone,
        "language": p.language or default_profile().language,
        "voice": p.voice or default_profile().voice,
        "accent": p.accent or default_profile().accent,
    }


# Small hints used only when the CRM has no explicit industry. They keep the fast fallback
# (AI generation timed out) speaking about the lead's real business instead of a canned vertical.
_INDUSTRY_HINTS = (
    ("dental", "dental"), ("clinic", "healthcare"), ("medical", "healthcare"),
    ("hospital", "healthcare"), ("attorney", "legal"), ("law firm", "legal"),
    ("real estate", "real estate"), ("property", "real estate"),
    ("restaurant", "hospitality"), ("cafe", "hospitality"), ("hotel", "hospitality"),
    ("university", "education"), ("college", "education"), ("school", "education"),
    ("course", "education"), ("gym", "fitness"), ("fitness", "fitness"),
    ("e-commerce", "e-commerce"), ("ecommerce", "e-commerce"), ("retail", "retail"),
    ("software", "technology"), ("saas", "technology"),
)
_AUDIENCE_HINTS = (
    ("dental", "patients"), ("health", "patients"), ("medical", "patients"), ("clinic", "patients"),
    ("legal", "clients"), ("attorney", "clients"), ("law", "clients"),
    ("real estate", "homebuyers and sellers"), ("property", "homebuyers and sellers"),
    ("education", "students"), ("school", "students"), ("college", "students"), ("course", "students"),
    ("hospitality", "local diners"), ("restaurant", "local diners"), ("cafe", "local diners"),
    ("fitness", "members"), ("gym", "members"),
    ("retail", "shoppers"), ("e-commerce", "shoppers"), ("ecommerce", "shoppers"),
    ("technology", "businesses"), ("software", "businesses"), ("saas", "businesses"),
)
_DEFAULT_OFFER = "top-notch SEO strategies and powerful link-building"
_GENERIC_AGENT_NAMES = {"", "the ai assistant", "ai assistant", "assistant"}


def _prospect_fields(prospect: Any) -> dict:
    """Read the few pitch fields from either _entity_info's dict or its labelled context block."""
    fields = {"company": "", "industry": "", "website": "", "notes": "", "person": ""}
    if isinstance(prospect, dict):
        # A contact's `name` is a person, not a company; only use it when no company key exists.
        company = prospect.get("company") if "company" in prospect else prospect.get("name")
        fields["company"] = str(company or "").strip()
        fields["industry"] = str(prospect.get("industry") or "").strip()
        fields["website"] = str(prospect.get("website") or "").strip()
        fields["notes"] = str(prospect.get("notes") or "").strip()
        fields["person"] = str(prospect.get("person") or prospect.get("contact_person") or "").strip()
        return fields

    labels = {
        "company": ("company:",),
        "industry": ("industry:",),
        "website": ("website:",),
        "notes": ("notes:",),
        "person": ("person:", "contact person:"),
    }
    for line in (prospect or "").splitlines():
        stripped = line.strip()
        low = stripped.lower()
        for key, prefixes in labels.items():
            if next((p for p in prefixes if low.startswith(p)), None) and not fields[key]:
                fields[key] = stripped.split(":", 1)[1].strip()
    return fields


def _pitch_offer(profile: Optional[TenantVoiceProfile]) -> str:
    """Use the caller's real services when configured, otherwise the reference offer."""
    for value in ((profile.services, profile.company_description) if profile else ()):
        value = (value or "").strip()
        if value and "knowledge base" not in value.lower():
            return value.rstrip(".")
    return _DEFAULT_OFFER


def pitch_facts(prospect: Any, profile: Optional[TenantVoiceProfile] = None) -> dict:
    """Facts shared by the AI pitch prompt and the deterministic fallback pitch."""
    fields = _prospect_fields(prospect)
    industry = fields["industry"]
    if not industry:
        text = f"{fields['website']} {fields['notes']}".lower()
        industry = next((label for needle, label in _INDUSTRY_HINTS if needle in text), "your industry")
    audience_text = industry.lower() if industry.lower() != "your industry" else \
        f"{fields['notes']} {fields['website']}".lower()
    audience = next((who for needle, who in _AUDIENCE_HINTS if needle in audience_text), "customers")
    agent = (profile.agent_name if profile else "") or ""
    return {
        "company": fields["company"] or "your business",
        "industry": industry,
        "audience": audience,
        "offer": _pitch_offer(profile),
        # A generic persona name would sound robotic on the phone; use a natural rep name
        # unless the tenant configured a real one.
        "agent": "Alex" if agent.strip().lower() in _GENERIC_AGENT_NAMES else agent.strip(),
    }


def fallback_pitch(prospect: Any, profile: Optional[TenantVoiceProfile] = None,
                   language: Optional[str] = None) -> str:
    """Deterministic four-sentence pitch for the fast auto-call path when AI generation times out.

    Same flow as the reference pitch: greet, help the lead in its industry, our specialism and
    audience, a forward-looking industry line, then a short request to chat.
    """
    ctx = prompt_context(profile)
    facts = pitch_facts(prospect, profile)
    company, industry = facts["company"], facts["industry"]
    generic = industry.lower().startswith("your ")
    sector = industry if generic else f"the {industry} sector"
    focus = "your industry online" if generic else f"{industry} innovation online"
    return (
        f"Hello! This is {facts['agent']} from {ctx['company_name']}, "
        f"calling to help {company} increase its online visibility in {sector}. "
        f"We specialize in boosting your digital presence with {facts['offer']}, "
        f"allowing you to reach more {facts['audience']} effectively. "
        f"Let's explore how we can place {company} at the forefront of {focus}. "
        "Can I schedule a time for us to chat further?"
    )
