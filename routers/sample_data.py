"""
Sample Data management router:
Seeds realistic sample leads and clients for onboarding/demo, and provides one-click cleanup
that deletes ONLY sample records while strictly preserving real tenant data.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, delete, or_
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import random

from database import (
    get_session,
    Lead,
    ClientProfile,
    Contact,
    Tenant,
    ActivityLog,
    _utcnow
)
from modules.tenant_scope import current_tenant_id, platform_management_write

router = APIRouter(prefix="/sample-data", tags=["Sample Data"])

SAMPLE_LEAD_SEEDS = [
    {
        "company_name": "SerpHawk Tech Solutions",
        "website": "https://serphawk.io",
        "industry": "Technology",
        "email": "partners@serphawk.io",
        "phone": "+1 555-0192",
        "city": "Austin",
        "country": "United States",
        "source": "Website",
        "status": "Qualified",
        "deal_value": 14500.0,
        "notes": "Looking for high-scale enterprise SEO and multi-tenant CRM automation. Demo scheduled with CTO.",
        "contact_name": "David Vance",
        "contact_email": "david.vance@serphawk.io",
        "contact_phone": "+1 555-0192",
        "contact_designation": "VP of Engineering"
    },
    {
        "company_name": "Apex Digital Marketing",
        "website": "https://apexdigital.example.com",
        "industry": "Marketing",
        "email": "inbound@apexdigital.example.com",
        "phone": "+1 415-555-2671",
        "city": "San Francisco",
        "country": "United States",
        "source": "LinkedIn",
        "status": "Proposal Sent",
        "deal_value": 8200.0,
        "notes": "Interested in white-label rank tracking and client portal management.",
        "contact_name": "Sarah Jenkins",
        "contact_email": "sarah.j@apexdigital.example.com",
        "contact_phone": "+1 415-555-2671",
        "contact_designation": "Managing Director"
    },
    {
        "company_name": "Nova Healthcare Systems",
        "website": "https://novahealth.example.org",
        "industry": "Healthcare",
        "email": "procurement@novahealth.example.org",
        "phone": "+1 312-555-8834",
        "city": "Chicago",
        "country": "United States",
        "source": "Referral",
        "status": "Negotiation",
        "deal_value": 24000.0,
        "notes": "Multi-location medical clinic network needing HIPAA-compliant follow-ups and AI voice triage.",
        "contact_name": "Dr. Marcus Lin",
        "contact_email": "mlin@novahealth.example.org",
        "contact_phone": "+1 312-555-8834",
        "contact_designation": "Head of Operations"
    },
    {
        "company_name": "BlueWave Logistics Global",
        "website": "https://bluewavelogistics.example.com",
        "industry": "Manufacturing",
        "email": "dispatch@bluewave.example.com",
        "phone": "+1 206-555-9102",
        "city": "Seattle",
        "country": "United States",
        "source": "Google Ads",
        "status": "New",
        "deal_value": 6500.0,
        "notes": "Incoming lead via Google Ads search campaign: Freight tracking integration requested.",
        "contact_name": "Elena Rostova",
        "contact_email": "elena.r@bluewave.example.com",
        "contact_phone": "+1 206-555-9102",
        "contact_designation": "Supply Chain Coordinator"
    },
    {
        "company_name": "CloudSphere AI Cloud",
        "website": "https://cloudsphere.example.ai",
        "industry": "Technology",
        "email": "founder@cloudsphere.example.ai",
        "phone": "+1 650-555-3419",
        "city": "Palo Alto",
        "country": "United States",
        "source": "Cold Call",
        "status": "Contacted",
        "deal_value": 11000.0,
        "notes": "Spoke on initial intro call. Expressed high interest in autonomous AI voice callers for demo follow-up.",
        "contact_name": "Julian Thorne",
        "contact_email": "julian@cloudsphere.example.ai",
        "contact_phone": "+1 650-555-3419",
        "contact_designation": "Co-Founder & CEO"
    },
    {
        "company_name": "Vertex Financial Partners",
        "website": "https://vertexfin.example.com",
        "industry": "Finance",
        "email": "advisory@vertexfin.example.com",
        "phone": "+1 212-555-4920",
        "city": "New York",
        "country": "United States",
        "source": "Website",
        "status": "New",
        "deal_value": 18500.0,
        "notes": "Inquired about custom invoice generation and client ledger integration.",
        "contact_name": "Arthur Sterling",
        "contact_email": "asterling@vertexfin.example.com",
        "contact_phone": "+1 212-555-4920",
        "contact_designation": "Senior Partner"
    },
    {
        "company_name": "EcoGreen Renewable Tech",
        "website": "https://ecogreen.example.tech",
        "industry": "Construction",
        "email": "commercial@ecogreen.example.tech",
        "phone": "+1 303-555-7281",
        "city": "Denver",
        "country": "United States",
        "source": "Event",
        "status": "Proposal Sent",
        "deal_value": 9400.0,
        "notes": "Met at Clean Energy Expo 2026. Proposal sent for 12-month commercial SEO and pipeline dashboard.",
        "contact_name": "Camila Gomez",
        "contact_email": "camila@ecogreen.example.tech",
        "contact_phone": "+1 303-555-7281",
        "contact_designation": "Director of Business Development"
    },
    {
        "company_name": "OmniRetail E-Commerce Group",
        "website": "https://omniretail.example.store",
        "industry": "E-commerce",
        "email": "ecom@omniretail.example.store",
        "phone": "+1 786-555-6612",
        "city": "Miami",
        "country": "United States",
        "source": "Meta Ads",
        "status": "Qualified",
        "deal_value": 12800.0,
        "notes": "Shopify plus 10k SKU catalog. High intent for automated abandoned cart followups and lead sync.",
        "contact_name": "Mateo Rossi",
        "contact_email": "mateo@omniretail.example.store",
        "contact_phone": "+1 786-555-6612",
        "contact_designation": "Head of Growth"
    },
    {
        "company_name": "Stratford Legal & IP Counsel",
        "website": "https://stratfordlegal.example.com",
        "industry": "Legal",
        "email": "intake@stratfordlegal.example.com",
        "phone": "+1 617-555-9043",
        "city": "Boston",
        "country": "United States",
        "source": "Referral",
        "status": "Won",
        "deal_value": 15000.0,
        "notes": "Corporate legal firm retained. Client contract signed and onboarding kickoff scheduled.",
        "contact_name": "Victoria Stratford",
        "contact_email": "v.stratford@stratfordlegal.example.com",
        "contact_phone": "+1 617-555-9043",
        "contact_designation": "Managing Partner"
    },
    {
        "company_name": "HyperScale Hospitality Group",
        "website": "https://hyperscalehospitality.example.com",
        "industry": "Hospitality",
        "email": "bookings@hyperscale.example.com",
        "phone": "+1 702-555-3180",
        "city": "Las Vegas",
        "country": "United States",
        "source": "Radar",
        "status": "Contacted",
        "deal_value": 7200.0,
        "notes": "Discovered via Radar auto-scan. Local 4-star boutique hotel brand needing local map pack optimization.",
        "contact_name": "Lucas Meyer",
        "contact_email": "lucas.m@hyperscale.example.com",
        "contact_phone": "+1 702-555-3180",
        "contact_designation": "General Manager"
    }
]

SAMPLE_CLIENT_SEEDS = [
    {
        "companyName": "SerpHawk Enterprise Client",
        "phone": "+1 555-0100",
        "address": "100 Innovation Way, Suite 400, Austin TX",
        "status": "Active",
        "projectName": "Global Search Dominance & Multi-channel Pipeline",
        "websiteUrl": "https://serphawk.io",
        "tagline": "Pioneering enterprise AI workflows & search intelligence",
        "targetKeywords": ["enterprise crm", "seo lead automation", "ai sales copilot"],
        "recommended_services": "Core CRM Suite, AI Voice Caller, 360 Competitor Radar",
        "nextMilestone": "Q4 Performance Review & Strategy Alignment",
        "customFields": {"is_sample": True, "industry": "Technology", "tier": "Enterprise"}
    },
    {
        "companyName": "Starlight Dental Clinics",
        "phone": "+1 415-555-8911",
        "address": "450 Sutter St, San Francisco CA",
        "status": "Active",
        "projectName": "Local SEO & Patient Acquisition",
        "websiteUrl": "https://starlightdental.example.com",
        "tagline": "Family dentistry and cosmetic smile makeovers",
        "targetKeywords": ["san francisco dentist", "invisalign provider bay area", "emergency dental care"],
        "recommended_services": "Local Map Pack Boost, Google Ads Management",
        "nextMilestone": "Deliver monthly keyword progression report",
        "customFields": {"is_sample": True, "industry": "Healthcare", "tier": "Standard"}
    },
    {
        "companyName": "Kodiak Real Estate Group",
        "phone": "+1 303-555-4422",
        "address": "1700 Lincoln St, Denver CO",
        "status": "Active",
        "projectName": "Luxury Residential Sales Campaign",
        "websiteUrl": "https://kodiakrealestate.example.com",
        "tagline": "Modern luxury mountain properties & city living",
        "targetKeywords": ["denver luxury homes", "cherry creek real estate", "colorado mountain estates"],
        "recommended_services": "Social Lead Ads, Virtual Tour Video SEO",
        "nextMilestone": "Launch Q1 Spring Buyer Campaign",
        "customFields": {"is_sample": True, "industry": "Real Estate", "tier": "Premium"}
    },
    {
        "companyName": "Beacon Financial Advisors",
        "phone": "+1 212-555-1299",
        "address": "200 Park Ave, New York NY",
        "status": "Active",
        "projectName": "High Net Worth Lead Generation",
        "websiteUrl": "https://beaconfin.example.com",
        "tagline": "Fiduciary wealth management & retirement security",
        "targetKeywords": ["wealth advisor nyc", "fiduciary retirement planning", "private family office"],
        "recommended_services": "Content Thought Leadership, Whitepaper Funnel",
        "nextMilestone": "Publish Annual Tax Planning Guide",
        "customFields": {"is_sample": True, "industry": "Finance", "tier": "Enterprise"}
    },
    {
        "companyName": "Velocity Fitness & Wellness",
        "phone": "+1 786-555-9011",
        "address": "800 Ocean Dr, Miami FL",
        "status": "Pending",
        "projectName": "Membership Signups & Local Visibility",
        "websiteUrl": "https://velocityfitness.example.com",
        "tagline": "State of the art high-performance fitness club",
        "targetKeywords": ["miami beach gym", "personal training south beach", "athletic recovery"],
        "recommended_services": "Instagram Meta Ads, Micro-influencer Collabs",
        "nextMilestone": "Finalize brand creative assets",
        "customFields": {"is_sample": True, "industry": "Fitness", "tier": "Standard"}
    },
    {
        "companyName": "Alpine Craft Brewery",
        "phone": "+1 206-555-6677",
        "address": "1200 Pike St, Seattle WA",
        "status": "Active",
        "projectName": "E-Commerce Distribution & Taproom Footfall",
        "websiteUrl": "https://alpinecraftbrew.example.com",
        "tagline": "Small batch Pacific Northwest IPAs and stouts",
        "targetKeywords": ["craft beer delivery seattle", "best local brewery pacific northwest"],
        "recommended_services": "Shopify SEO, Local Business Citations",
        "nextMilestone": "Holiday seasonal stout release campaign",
        "customFields": {"is_sample": True, "industry": "Food & Beverage", "tier": "Standard"}
    },
    {
        "companyName": "Zenith Cloud Architecture",
        "phone": "+1 512-555-3344",
        "address": "500 W 2nd St, Austin TX",
        "status": "Active",
        "projectName": "DevOps & Cloud Migration Marketing",
        "websiteUrl": "https://zenithcloud.example.io",
        "tagline": "Kubernetes and multi-cloud infrastructure consultancy",
        "targetKeywords": ["aws migration consulting", "kubernetes devops consultants"],
        "recommended_services": "B2B Technical Content Marketing, LinkedIn Outreach",
        "nextMilestone": "Enterprise case study publication",
        "customFields": {"is_sample": True, "industry": "Technology", "tier": "Enterprise"}
    },
    {
        "companyName": "Harmony Sound & Light",
        "phone": "+1 615-555-7788",
        "address": "400 Broadway, Nashville TN",
        "status": "Hold",
        "projectName": "Concert & Event Production Bookings",
        "websiteUrl": "https://harmonysound.example.com",
        "tagline": "World-class touring concert audio and LED stage production",
        "targetKeywords": ["event sound rental nashville", "stage lighting production tennessee"],
        "recommended_services": "Google Ads Search, Industry Directory Placement",
        "nextMilestone": "Client budget reactivation review",
        "customFields": {"is_sample": True, "industry": "Entertainment", "tier": "Standard"}
    },
    {
        "companyName": "TerraNova Agro Solutions",
        "phone": "+1 515-555-2233",
        "address": "800 Locust St, Des Moines IA",
        "status": "Active",
        "projectName": "Precision Agriculture & Drone Surveying",
        "websiteUrl": "https://terranovaagro.example.com",
        "tagline": "Smart satellite data and automated soil sensors for modern farming",
        "targetKeywords": ["precision agriculture sensors", "drone crop monitoring iowa"],
        "recommended_services": "Technical SEO, Regional Ag Expo Lead Capture",
        "nextMilestone": "Spring planting season lead rollout",
        "customFields": {"is_sample": True, "industry": "Agriculture", "tier": "Standard"}
    },
    {
        "companyName": "Nexus Corporate Law",
        "phone": "+1 312-555-9988",
        "address": "233 S Wacker Dr, Chicago IL",
        "status": "Active",
        "projectName": "M&A Advisory Inbound Client Acquisition",
        "websiteUrl": "https://nexuslaw.example.com",
        "tagline": "Premier cross-border corporate mergers & legal counsel",
        "targetKeywords": ["m&a attorneys chicago", "corporate governance lawyer illinois"],
        "recommended_services": "Executive Reputation Management, High Authority Backlinks",
        "nextMilestone": "Deliver quarterly domain authority expansion",
        "customFields": {"is_sample": True, "industry": "Legal", "tier": "Enterprise"}
    }
]


@router.get("/status")
def get_sample_data_status(session: Session = Depends(get_session)):
    """Check how many sample records exist for the current tenant."""
    tenant_id = current_tenant_id.get()
    if tenant_id is None or tenant_id < 1:
        first_t = session.exec(select(Tenant)).first()
        tenant_id = first_t.id if first_t else 1
        current_tenant_id.set(tenant_id)
    platform_management_write.set(True)
    
    # Query sample leads
    leads_q = select(Lead)
    if tenant_id:
        leads_q = leads_q.where(Lead.tenant_id == tenant_id)
    all_leads = session.exec(leads_q).all()
    sample_leads = [
        l for l in all_leads 
        if getattr(l, "is_sample", False) or (l.custom_fields and l.custom_fields.get("is_sample") is True)
    ]

    # Query sample clients
    clients_q = select(ClientProfile)
    if tenant_id:
        clients_q = clients_q.where(ClientProfile.tenant_id == tenant_id)
    all_clients = session.exec(clients_q).all()
    sample_clients = [
        c for c in all_clients
        if (c.customFields and c.customFields.get("is_sample") is True)
    ]

    return {
        "ok": True,
        "has_sample_data": len(sample_leads) > 0 or len(sample_clients) > 0,
        "sample_leads_count": len(sample_leads),
        "sample_clients_count": len(sample_clients),
        "total_leads_count": len(all_leads),
        "total_clients_count": len(all_clients)
    }


@router.post("/seed")
def seed_sample_data(session: Session = Depends(get_session)):
    """
    Seeds 10 sample leads and 10 sample clients with rich fields for the current tenant.
    Leaves existing user data completely untouched.
    """
    tenant_id = current_tenant_id.get()
    if tenant_id is None or tenant_id < 1:
        first_t = session.exec(select(Tenant)).first()
        tenant_id = first_t.id if first_t else 1
        current_tenant_id.set(tenant_id)
    platform_management_write.set(True)

    # Seed Leads
    created_leads_count = 0
    for seed in SAMPLE_LEAD_SEEDS:
        # Check if already exists in this tenant
        existing_q = select(Lead).where(Lead.company_name == seed["company_name"])
        if tenant_id:
            existing_q = existing_q.where(Lead.tenant_id == tenant_id)
        if session.exec(existing_q).first():
            continue

        lead_custom = {
            "is_sample": True,
            "sample_tag": "Demo Data",
            "tier": "Sample"
        }

        lead = Lead(
            tenant_id=tenant_id,
            company_name=seed["company_name"],
            website=seed["website"],
            industry=seed["industry"],
            email=seed["email"],
            phone=seed["phone"],
            city=seed.get("city"),
            country=seed.get("country"),
            source=seed["source"],
            status=seed["status"],
            deal_value=seed.get("deal_value"),
            notes=seed["notes"],
            custom_fields=lead_custom,
            created_at=_utcnow() - timedelta(days=random.randint(1, 14))
        )
        session.add(lead)
        session.flush()

        # Add contact for the lead
        if seed.get("contact_name"):
            raw_name = seed["contact_name"].strip()
            parts = raw_name.split(" ", 1)
            fname = parts[0]
            lname = parts[1] if len(parts) > 1 else ""
            contact = Contact(
                tenant_id=tenant_id,
                lead_id=lead.id,
                first_name=fname,
                last_name=lname,
                full_name=raw_name,
                email=seed.get("contact_email"),
                mobile_number=seed.get("contact_phone"),
                designation=seed.get("contact_designation", "Decision Maker"),
                department="Management"
            )
            session.add(contact)

        created_leads_count += 1

    # Seed Clients
    created_clients_count = 0
    for seed in SAMPLE_CLIENT_SEEDS:
        existing_c = select(ClientProfile).where(ClientProfile.companyName == seed["companyName"])
        if tenant_id:
            existing_c = existing_c.where(ClientProfile.tenant_id == tenant_id)
        if session.exec(existing_c).first():
            continue

        c_fields = dict(seed.get("customFields", {}))
        c_fields["is_sample"] = True

        client = ClientProfile(
            tenant_id=tenant_id,
            companyName=seed["companyName"],
            phone=seed["phone"],
            address=seed["address"],
            status=seed["status"],
            projectName=seed["projectName"],
            websiteUrl=seed["websiteUrl"],
            tagline=seed["tagline"],
            targetKeywords=seed["targetKeywords"],
            recommended_services=seed["recommended_services"],
            nextMilestone=seed["nextMilestone"],
            customFields=c_fields
        )
        session.add(client)
        created_clients_count += 1

    session.commit()

    return {
        "ok": True,
        "message": f"Successfully seeded {created_leads_count} sample leads and {created_clients_count} sample clients.",
        "created_leads": created_leads_count,
        "created_clients": created_clients_count
    }


@router.delete("/delete")
def delete_sample_data(session: Session = Depends(get_session)):
    """
    Safely deletes ONLY sample records marked with is_sample=True.
    Persists all real, original user data untouched.
    """
    tenant_id = current_tenant_id.get()
    if tenant_id is None or tenant_id < 1:
        first_t = session.exec(select(Tenant)).first()
        tenant_id = first_t.id if first_t else 1
        current_tenant_id.set(tenant_id)
    platform_management_write.set(True)

    # 1. Fetch sample leads
    leads_q = select(Lead)
    if tenant_id:
        leads_q = leads_q.where(Lead.tenant_id == tenant_id)
    all_leads = session.exec(leads_q).all()
    
    deleted_leads_count = 0
    for lead in all_leads:
        is_sample = (
            getattr(lead, "is_sample", False) or 
            (lead.custom_fields and lead.custom_fields.get("is_sample") is True)
        )
        if is_sample:
            # Delete related contacts first
            session.exec(delete(Contact).where(Contact.lead_id == lead.id))
            session.delete(lead)
            deleted_leads_count += 1

    # 2. Fetch sample clients
    clients_q = select(ClientProfile)
    if tenant_id:
        clients_q = clients_q.where(ClientProfile.tenant_id == tenant_id)
    all_clients = session.exec(clients_q).all()

    deleted_clients_count = 0
    for client in all_clients:
        is_sample = (
            client.customFields and client.customFields.get("is_sample") is True
        )
        if is_sample:
            session.delete(client)
            deleted_clients_count += 1

    session.commit()

    return {
        "ok": True,
        "message": f"Successfully deleted {deleted_leads_count} sample leads and {deleted_clients_count} sample clients. Real data preserved.",
        "deleted_leads": deleted_leads_count,
        "deleted_clients": deleted_clients_count
    }
