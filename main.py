
from __future__ import annotations

"""
CRM V2 – SerpHawk  |  FastAPI Backend
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.websockets import WebSocket, WebSocketDisconnect
from sqlmodel import Session
from modules.scraper import research_and_map_company
from pydantic import BaseModel

from database import engine, SentEmail
from sqlmodel import select

def register_sent_emails_endpoint(app, get_session):
    from fastapi import Depends
    from sqlmodel import Session
    @app.get("/sent-emails")
    def get_sent_emails(client_id: int = None, limit: int = 50, session: Session = Depends(get_session)):
        query = select(SentEmail).order_by(SentEmail.sent_at.desc())
        if client_id:
            query = query.where(SentEmail.client_id == client_id)
        emails = session.exec(query.limit(limit)).all()
        return [
            {
                "id": e.id,
                "client_id": e.client_id,
                "to_email": e.to_email,
                "subject": e.subject,
                "english_body": e.english_body,
                "spanish_body": e.spanish_body,
                "recommended_services": e.recommended_services,
                "manual": e.manual,
                "draft_json": e.draft_json,
                "sent_at": e.sent_at.isoformat() if e.sent_at else None
            }
            for e in emails
        ]

import hashlib
import re
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

from database import (
    Account,
    ActivityLog,
    AnalyticsData,
    CallLog,
    ScheduledCall,
    ChatMessage,
    ChatbotSession,
    ChatbotMessage,
    ClientFileUpload,
    ClientNote,
    ClientProfile,
    ClientResearch,
    ClientStatus,
    ClientTicket,
    CompetitorAnalysis,
    CompetitorRelationship,
    Contact,
    ConversationLog,
    ConversationReply,
    Deal,
    Document,
    EmailIntegration,
    EmailLog,
    ExtractedEmail,
    Invoice,
    KeywordRankEntry,
    Lead,
    MessageThread,
    Milestone,
    NPSSurvey,
    Notification,
    Project,
    Proposal,
    RadarAnalysis,
    RankingTracker,
    Remark,
    MarketplaceService,
    SEOAudit,
    ServiceCatalog,
    ServiceRequest,
    SocialProfile,
    Task,
    TaskComment,
    User,
    create_db_and_tables,
    engine,
)


# ─────────────────────────────────────────────────────────────────────────────
# App + CORS
# ─────────────────────────────────────────────────────────────────────────────

def get_session():
    with Session(engine) as session:
        yield session

from modules.api_tracker import current_client_id, current_salesperson_id, current_endpoint, patch_openai
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class APIIntelligenceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Reset context for this request
        current_client_id.set(None)
        current_salesperson_id.set(None)
        current_endpoint.set(request.url.path)

        # Try to infer user from JWT token if Authorization header exists
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                import jwt
                from config import SECRET_KEY, ALGORITHM
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                user_id = payload.get("sub")
                if user_id:
                    current_salesperson_id.set(int(user_id))
            except:
                pass
        
        # Try to infer client_id from path parameters
        # Example paths: /clients/123/something or /projects/456 where we might need to lookup client
        path_parts = request.url.path.strip("/").split("/")
        if len(path_parts) >= 2 and path_parts[0] == "clients" and path_parts[1].isdigit():
            current_client_id.set(int(path_parts[1]))
            
        response = await call_next(request)
        return response

app = FastAPI(title="SerpHawk CRM", version="2.0.0")
app.add_middleware(APIIntelligenceMiddleware)

from modules.api_intelligence import router as api_intelligence_router
app.include_router(api_intelligence_router)

@app.on_event("startup")
def on_startup():
    patch_openai()
    create_db_and_tables()
    
    # Auto-migrate: Add missing columns if they don't exist
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN sidebar_preferences JSON;"))
            conn.commit()
            print("Successfully added sidebar_preferences to users table.")
    except Exception as e:
        print("sidebar_preferences column already exists or error:", e)
        
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE leads ADD COLUMN ai_analysis_results JSON;"))
            conn.commit()
            print("Successfully added ai_analysis_results to leads table.")
    except Exception as e:
        print("ai_analysis_results column already exists or error:", e)

allowed_origins = [
    "https://serphawk-crm-seo.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://web-production-6cd72.up.railway.app",
    "https://web-production-80e20.up.railway.app",
    "https://crm-seo.allytechcourses.com",
    "https://crm-seo.serphawk.in",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
from fastapi.staticfiles import StaticFiles
import os
os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ─────────────────────────────────────────────────────────────────────────────
# Email Notification Helper
# ─────────────────────────────────────────────────────────────────────────────
def _send_notification_email(to_email: str, subject: str, body_html: str):
    """Best-effort email notification. Fails silently so it never blocks API responses."""
    try:
        from modules.email_sender import send_email_outlook
        sender = os.environ.get("SENDER_EMAIL", "")
        password = os.environ.get("SENDER_PASSWORD", "")
        if sender and password:
            send_email_outlook(to_email, subject, body_html, sender, password)
    except Exception as e:
        print(f"[Notification email failed] {e}")


def get_session():
    with Session(engine) as session:
        yield session

# Register /sent-emails endpoint after app and get_session are defined
register_sent_emails_endpoint(app, get_session)

# --- Simple In-Memory Cache for Company Analysis ---
company_analysis_cache = {}

# --- Research and Service Mapping Endpoint ---
class ResearchMapRequest(BaseModel):
    company_url: str

@app.post("/research-map-company")
async def research_map_company_endpoint(body: ResearchMapRequest, background_tasks: BackgroundTasks = None):
    try:
        result = await research_and_map_company(body.company_url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Smart Research: company name → full analysis + draft + contact email ---
class SmartResearchRequest(BaseModel):
    company_name: str
    company_url: Optional[str] = None
    client_id: Optional[int] = None  # If set, link extracted services to this CRM client
    owner_name: Optional[str] = "Varshith"

@app.post("/smart-research")
async def smart_research(body: SmartResearchRequest):
    """
    Takes a company name (and optional URL), researches it via LLM,
    finds business contact email, recommends services, and generates an email draft.
    """
    import json as _json
    from modules.fallback_analyzer import analyze_company_name_fallback
    from modules.market_analyzer import match_services
    from modules.llm_engine import get_openai_client, generate_email

    company_name = body.company_name.strip()

    # Step 1: Try scraping website if URL given, otherwise use LLM knowledge
    company_info = {}
    website_content = ""
    if body.company_url and body.company_url.strip():
        try:
            from modules.scraper import scrape_website
            website_content = await scrape_website(body.company_url.strip())
            if not website_content.startswith("ERROR"):
                from modules.llm_engine import analyze_content
                company_info = analyze_content(website_content)
            else:
                company_info = analyze_company_name_fallback(company_name)
        except Exception:
            company_info = analyze_company_name_fallback(company_name)
    else:
        company_info = analyze_company_name_fallback(company_name)

    company_info.setdefault("company_name", company_name)

    extracted_emails_str = ""
    extracted_phones_str = ""
    extracted_linkedin_str = ""
    extracted_twitter_str = ""
    if website_content and not website_content.startswith("ERROR"):
        try:
            if "Extracted Emails: " in website_content:
                extracted_emails_str = website_content.split("Extracted Emails: ")[1].split("\n")[0].strip()
            if "Extracted Phone Numbers: " in website_content:
                extracted_phones_str = website_content.split("Extracted Phone Numbers: ")[1].split("\n")[0].strip()
            if "Extracted LinkedIn Profiles: " in website_content:
                extracted_linkedin_str = website_content.split("Extracted LinkedIn Profiles: ")[1].split("\n")[0].strip()
            if "Extracted Twitter Profiles: " in website_content:
                extracted_twitter_str = website_content.split("Extracted Twitter Profiles: ")[1].split("\n")[0].strip()
            company_info["extracted_emails"] = extracted_emails_str
            company_info["extracted_phone_numbers"] = extracted_phones_str
            company_info["extracted_linkedin"] = extracted_linkedin_str
            company_info["extracted_twitter"] = extracted_twitter_str
        except Exception:
            pass

    # Step 2: Find business contact details via LLM
    contact_email = None
    contact_name = None
    contact_role = None
    contact_phone = None
    contact_linkedin = None
    contact_twitter = None
    try:
        client = get_openai_client()
        email_prompt = f"""You are a professional business intelligence expert. Your job is to extract ACCURATE contact information for the company "{company_name}".

CRITICAL RULES - MUST FOLLOW:
1. ONLY use scraped data if it exists. DO NOT invent, guess, or use placeholders.
2. If scraped emails exist, use the MOST PROFESSIONAL one (e.g., prefer sales@, contact@, info@ over support@)
3. If scraped phone numbers exist, use them EXACTLY as provided.
4. If scraped LinkedIn/Twitter exist, use the primary profile URL.
5. For missing fields: use null (NOT placeholder values like +919999999999)
6. Extract person name/role ONLY if found in website content.
7. Validate all URLs are actual social profile links (not generic)

WEBSITE DATA EXTRACTED:
- Emails: {extracted_emails_str if extracted_emails_str else 'NONE FOUND'}
- Phone Numbers: {extracted_phones_str if extracted_phones_str else 'NONE FOUND'}
- LinkedIn Profiles: {extracted_linkedin_str if extracted_linkedin_str else 'NONE FOUND'}
- Twitter/X Profiles: {extracted_twitter_str if extracted_twitter_str else 'NONE FOUND'}
- Contact Records: {_json.dumps(company_info.get("contacts", [])) if company_info.get("contacts") else 'NONE FOUND'}

WEBSITE CONTENT FOR MANUAL REVIEW:
{website_content[:3000] if website_content and not website_content.startswith('ERROR') else 'No content available'}

Return ONLY valid JSON:
{{
    "email": "the actual contact email from website or null",
    "name": "contact person name if found in website data or null",
    "role": "job role if found in website data or null",
    "phone_number": "contact phone number from website or null",
    "linkedin": "actual LinkedIn profile URL or null",
    "twitter": "actual Twitter/X profile URL or null",
    "data_source": "where each value came from (scraped/website/contacts)",
    "confidence": "high/medium/low based on data quality"
}}"""

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a data extraction expert. Return ONLY accurate data found in provided sources. Use null for missing data. NEVER invent placeholder values."},
                {"role": "user", "content": email_prompt}
            ],
            response_format={"type": "json_object"}
        )
        contact_data = _json.loads(resp.choices[0].message.content)
        contact_email = contact_data.get("email") or None
        contact_name = contact_data.get("name") or None
        contact_role = contact_data.get("role") or None
        contact_phone = contact_data.get("phone_number") or None
        contact_linkedin = contact_data.get("linkedin") or None
        contact_twitter = contact_data.get("twitter") or None
    except Exception as e:
        import logging
        logging.warning(f"OpenAI contact extraction failed: {e}")

    if not contact_email:
        contacts = company_info.get("contacts", [])
        if contacts and isinstance(contacts, list) and len(contacts) > 0:
            c = contacts[0]
            contact_email = c.get("email") or contact_email
            contact_name = c.get("name") or contact_name
            contact_role = c.get("role") or contact_role
            contact_phone = c.get("phone_number") or c.get("phone") or c.get("mobile") or contact_phone

    if not contact_email and extracted_emails_str:
        contact_email = next((e.strip() for e in extracted_emails_str.split(",") if e.strip()), None)

    if not contact_linkedin and extracted_linkedin_str:
        contact_linkedin = next((s.strip() for s in extracted_linkedin_str.split(",") if s.strip()), None)

    if not contact_twitter and extracted_twitter_str:
        contact_twitter = next((s.strip() for s in extracted_twitter_str.split(",") if s.strip()), None)

    # Do NOT generate fallback emails - only use extracted/scraped data

    # Step 3: Service matching
    services_result = {}
    try:
        market_data = {
            "industry": company_info.get("likely_industry", company_info.get("industry", "")),
            "business_model": company_info.get("business_model", ""),
            "pain_points": company_info.get("common_pain_points", company_info.get("pain_points", [])),
        }
        services_result = match_services(market_data, company_info)
    except Exception:
        services_result = {
            "recommended_services": [
                {"service_name": "Organic SEO", "why_relevant": "Improve online visibility", "expected_impact": "More qualified leads"},
                {"service_name": "Local SEO", "why_relevant": "Dominate local search", "expected_impact": "Increased local customers"}
            ],
            "email_hook": f"Growth opportunities for {company_name}",
            "package_suggestion": "Growth"
        }

    # Step 4: Generate email draft (pass recommended services so they appear in draft)
    draft = {}
    owner = body.owner_name or "Varshith"
    try:
        contact_for_email = {"name": contact_name, "role": contact_role} if contact_name else None
        recommended = services_result.get("recommended_services", [])
        draft = generate_email(company_info, contact=contact_for_email, recommended_services=recommended, owner_name=owner)
    except Exception:
        draft = {
            "subject": f"Growth Partnership Opportunity – {company_name}",
            "english_body": f"Hi,\n\nI came across {company_name} and was impressed by what you do. I'd love to explore how our SEO and digital marketing services could help accelerate your growth.\n\nBest regards,\n{owner}",
            "spanish_body": f"Hola,\n\nEncontré {company_name} y me impresionó lo que hacen. Me encantaría explorar cómo nuestros servicios de SEO y marketing digital podrían ayudar a acelerar su crecimiento.\n\nSaludos cordiales,\n{owner}",
        }

    # Step 5: Extract structured services offered by this company
    extracted_services = []
    try:
        if website_content and not website_content.startswith("ERROR"):
            from modules.llm_engine import extract_client_services
            extracted_services = extract_client_services(website_content, company_info.get("company_name", company_name))
        elif company_info.get("key_value_props"):
            # Fallback: convert key_value_props to minimal service objects
            extracted_services = [
                {"name": s, "brief": "", "category": "Other", "approx_cost": 0, "cost_is_estimated": True}
                for s in company_info["key_value_props"]
            ]
    except Exception as _e:
        print(f"Service extraction warning: {_e}")

    # Step 6: If a client_id is linked, persist services to client + marketplace
    if body.client_id and extracted_services:
        try:
            from sqlmodel import Session as _Session
            with _Session(engine) as _sess:
                cp = _sess.get(ClientProfile, body.client_id)
                if cp:
                    import json as _json2
                    cp.services_offered = _json2.dumps(extracted_services)
                    _sess.add(cp)
                    # Also upsert into marketplace
                    for svc in extracted_services:
                        ms = MarketplaceService(
                            service_name=svc.get("name", ""),
                            normalized_name=svc.get("name", ""),
                            category=svc.get("category"),
                            description=svc.get("brief"),
                            estimated_cost=float(svc.get("approx_cost", 0)),
                            cost_is_estimated=svc.get("cost_is_estimated", True),
                            provider_name=cp.companyName,
                            provider_client_id=body.client_id,
                            provider_industry=cp.industry,
                            provider_address=cp.address,
                            source="email_agent",
                        )
                        _sess.add(ms)
                    _sess.commit()
        except Exception as _e2:
            print(f"Service persist warning: {_e2}")

    return {
        "company_info": company_info,
        "company_url": body.company_url or company_info.get("website") or "",
        "contact": {
            "email": contact_email,
            "name": contact_name,
            "role": contact_role,
            "phone_number": contact_phone,
            "linkedin": contact_linkedin,
            "twitter": contact_twitter,
        },
        "recommended_services": services_result.get("recommended_services", []),
        "email_hook": services_result.get("email_hook", ""),
        "package_suggestion": services_result.get("package_suggestion", ""),
        "draft": draft,
        "extracted_services": extracted_services,
    }

# --- Send Manual: create client + record email + activity ---
class SendManualRequest(BaseModel):
    to_email: str
    company_name: str
    subject: str
    english_body: str
    spanish_body: Optional[str] = None
    recommended_services: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    website_url: Optional[str] = None
    phone_number: Optional[str] = None
    manual: Optional[bool] = True
    email_agent_data: Optional[str] = None
    skip_send: Optional[bool] = False
    action_type: Optional[str] = "System"

@app.post("/send-manual")
def send_manual(body: SendManualRequest, session: Session = Depends(get_session)):
    """
    Records a manually sent email, creates a Lead if not existing,
    and logs an activity entry.
    """
    from datetime import datetime

    # Determine action string
    if body.action_type == "Gmail":
        action_str = "Outreach via Gmail"
    elif body.action_type == "WhatsApp":
        action_str = "Outreach via WhatsApp"
    elif body.action_type == "System Auto":
        action_str = "Automated email sent"
    else:
        action_str = "Manual outreach email sent"

    # Step 1: Find or create Lead by email
    to_email = (body.to_email or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")

    lead = session.exec(
        select(Lead).where(Lead.email == to_email)
    ).first()
    
    if not lead:
        lead = Lead(
            company_name=body.company_name or "Unknown Company",
            website=body.website_url or None,
            email=to_email,
            phone=body.phone_number or None,
            source="Email Agent",
            status="Contacted"
        )
        session.add(lead)
        session.commit()
        session.refresh(lead)
    else:
        lead.status = "Contacted"
        if body.phone_number:
            lead.phone = body.phone_number
        if body.website_url:
            lead.website = body.website_url
        session.add(lead)
        session.commit()
        session.refresh(lead)

    # Add Contact if there's contact info
    if body.contact_name:
        contact = session.exec(select(Contact).where(Contact.email == to_email)).first()
        if not contact:
            contact = Contact(
                first_name=body.contact_name,
                full_name=body.contact_name,
                email=to_email,
                lead_id=lead.id,
                designation=body.contact_role
            )
            session.add(contact)
            session.commit()

    # Step 2.5: Find or create ClientResearch to save email_agent_data
    if body.email_agent_data:
        client_research = session.exec(
            select(ClientResearch).where(ClientResearch.lead_id == lead.id)
        ).first()
        if not client_research:
            client_research = ClientResearch(
                lead_id=lead.id,
                email_agent_data=body.email_agent_data
            )
            session.add(client_research)
        else:
            client_research.email_agent_data = body.email_agent_data
            session.add(client_research)
        session.commit()

    # Step 3: Save SentEmail record
    sent_email = SentEmail(
        lead_id=lead.id,
        to_email=to_email,
        subject=body.subject,
        english_body=body.english_body,
        spanish_body=body.spanish_body or "",
        recommended_services=body.recommended_services or "",
        manual=body.manual if body.manual is not None else True,
        sent_at=datetime.utcnow(),
    )
    session.add(sent_email)
    session.commit()
    session.refresh(sent_email)

    # Step 3.5: Send the actual email (unless skip_send is True)
    if not body.skip_send:
        from modules.email_sender import send_email_outlook
        import os
        sender = os.getenv("EMAIL_SENDER") or os.getenv("OUTLOOK_EMAIL", "prasanthanupojuwork@gmail.com")
        password = os.getenv("EMAIL_PASSWORD") or os.getenv("OUTLOOK_PASSWORD", "")
        smtp_server = os.getenv("EMAIL_HOST") or os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("EMAIL_PORT") or os.getenv("SMTP_PORT", 587))
        imap_server = os.getenv("IMAP_SERVER", "imap.gmail.com")

        if not sender or not password:
            raise HTTPException(status_code=500, detail="Email sender credentials are not configured")

        try:
            full_body = f"{body.english_body}\n\n{body.spanish_body}" if body.spanish_body else body.english_body
            send_email_outlook(
                to_email=body.to_email,
                subject=body.subject,
                body=full_body,
                sender_email=sender,
                sender_password=password,
                smtp_server=smtp_server,
                smtp_port=smtp_port,
                imap_server=imap_server
            )
            # --- Trigger n8n Webhook ---
            try:
                import httpx
                webhook_url = "http://localhost:5678/webhook-test/serphawk-followup"
                payload = {
                    "event": "email_sent",
                    "sender": sender,
                    "to_email": body.to_email,
                    "subject": body.subject,
                    "company_name": body.company_name,
                    "contact_name": body.contact_name or "Prospect",
                    "phone_number": body.phone_number,
                    "recommended_services": body.recommended_services or "SEO",
                    "timestamp": datetime.utcnow().isoformat()
                }
                httpx.post(webhook_url, json=payload, timeout=5.0)
                print(f"Webhook successfully triggered from manual send to {webhook_url}")
            except Exception as wh_e:
                print(f"Webhook trigger failed: {wh_e}")
        except Exception as e:
            print(f"Manual Email send failed: {e}")
            raise HTTPException(status_code=500, detail=f"Manual Email send failed: {e}")


    # Step 4: Log activity
    try:
        if body.action_type == "Gmail":
            log_action = f"Sent outreach via Gmail to {body.to_email}"
        elif body.action_type == "WhatsApp":
            log_action = f"Sent outreach via WhatsApp to {body.phone_number}"
        elif body.action_type == "System Auto":
            log_action = f"Automated outreach email sent to {body.to_email}"
        else:
            log_action = f"Manual outreach email sent to {body.to_email}"

        activity = ActivityLog(
            lead_id=lead.id,
            action=log_action,
            details=f"Subject: {body.subject} | Services: {body.recommended_services or 'N/A'}",
        )
        session.add(activity)
        session.commit()
    except Exception:
        pass  # Activity logging is best-effort

    return {
        "success": True,
        "lead_id": lead.id,
        "sent_email_id": sent_email.id,
        "message": f"Lead created and email recorded for {body.to_email}",
    }


# --- Delete client endpoint ---
@app.delete("/clients/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    from sqlmodel import delete
    
    # We execute all deletes in a single transaction block.
    # No mid-loop rollbacks! We use the exact model attributes defined in database.py
    try:
        session.execute(delete(ServiceRequest).where(ServiceRequest.client_id == client_id))
        session.execute(delete(MessageThread).where(MessageThread.client_id == client_id))
        session.execute(delete(Remark).where(Remark.clientId == client_id))
        session.execute(delete(Document).where(Document.clientId == client_id))
        session.execute(delete(ActivityLog).where(ActivityLog.clientId == client_id))
        session.execute(delete(CallLog).where(CallLog.client_id == client_id))
        session.execute(delete(SentEmail).where(SentEmail.client_id == client_id))
        session.execute(delete(SocialProfile).where(SocialProfile.clientId == client_id))
        session.execute(delete(SEOAudit).where(SEOAudit.clientId == client_id))
        session.execute(delete(CompetitorAnalysis).where(CompetitorAnalysis.clientId == client_id))
        session.execute(delete(RankingTracker).where(RankingTracker.clientId == client_id))
        session.execute(delete(AnalyticsData).where(AnalyticsData.clientId == client_id))
        session.execute(delete(Task).where(Task.client_id == client_id))
        session.execute(delete(Invoice).where(Invoice.client_id == client_id))
        session.execute(delete(Milestone).where(Milestone.client_id == client_id))
        session.execute(delete(NPSSurvey).where(NPSSurvey.client_id == client_id))
        session.execute(delete(Proposal).where(Proposal.client_id == client_id))
        session.execute(delete(ClientFileUpload).where(ClientFileUpload.client_id == client_id))
        session.execute(delete(KeywordRankEntry).where(KeywordRankEntry.client_id == client_id))
        session.execute(delete(ClientNote).where(ClientNote.client_id == client_id))
        session.execute(delete(Deal).where(Deal.client_id == client_id))
        session.execute(delete(ConversationLog).where(ConversationLog.client_id == client_id))
        session.execute(delete(ClientResearch).where(ClientResearch.client_id == client_id))
        session.execute(delete(ClientTicket).where(ClientTicket.client_id == client_id))
        
        # Marketplace service provider links
        session.execute(delete(MarketplaceService).where(MarketplaceService.provider_client_id == client_id))

        # Delete the user account linked to this client (only if it's a Client-role user)
        if cp.userId:
            linked_user = session.get(User, cp.userId)
            if linked_user and linked_user.role == "Client":
                session.delete(linked_user)

        session.delete(cp)
        session.commit()
        return {"success": True}
    except Exception as e:
        session.rollback()
        print(f"[DeleteClient] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete client: {str(e)}")



# ─────────────────────────────────────────────────────────────────────────────
# Pydantic request/response models
# ─────────────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class ChatbotRequest(BaseModel):
    message: str
    client_id: Optional[int] = None
    current_route: Optional[str] = None
    chat_history: Optional[str] = None
    session_id: Optional[str] = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    role: str = "Client"


class ClientCreateRequest(BaseModel):
    companyName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: str = "Active"
    email: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None
    projectName: Optional[str] = None
    gmbName: Optional[str] = None
    seoStrategy: Optional[str] = None
    tagline: Optional[str] = None
    websiteUrl: Optional[str] = None
    targetKeywords: Optional[list[str]] = None


class ClientUpdateRequest(BaseModel):
    companyName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    gmbName: Optional[str] = None
    seoStrategy: Optional[str] = None
    tagline: Optional[str] = None
    websiteUrl: Optional[str] = None
    nextMilestone: Optional[str] = None
    nextMilestoneDate: Optional[str] = None
    lastActivity: Optional[str] = None
    lastActivityDate: Optional[str] = None
    assignedEmployeeId: Optional[int] = None
    customFields: Optional[dict] = None
    lead_score: Optional[int] = None
    lead_source: Optional[str] = None
    deal_value: Optional[float] = None
    industry: Optional[str] = None
    employee_count: Optional[str] = None
    revenue_range: Optional[str] = None
    linkedin_url: Optional[str] = None
    contact_person: Optional[str] = None
    last_contact_date: Optional[str] = None
    next_followup_date: Optional[str] = None


class DealCreateRequest(BaseModel):
    title: str
    value: float = 0.0
    client_id: int
    assigned_to: Optional[int] = None
    stage: str = "Lead"
    expected_close_date: Optional[str] = None


class DealUpdateRequest(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    assigned_to: Optional[int] = None
    stage: Optional[str] = None
    expected_close_date: Optional[str] = None


class AssignEmployeeRequest(BaseModel):
    employee_id: int


class KeywordRequest(BaseModel):
    keyword: str


class RemarkCreateRequest(BaseModel):
    content: str
    authorId: Optional[int] = None
    isInternal: bool = True


class ActivityCreateRequest(BaseModel):
    action: str
    method: Optional[str] = None
    content: Optional[str] = None
    details: Optional[str] = None
    authorId: Optional[int] = None


class ClientFollowUpRequest(BaseModel):
    content: str
    authorId: Optional[int] = None
    isInternal: bool = True
    task_title: Optional[str] = None
    task_description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[str] = None
    email_agent_data: Optional[str] = None


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "Planning"
    progress: int = 0
    employeeIds: List[int] = []
    internIds: List[int] = []
    clientIds: List[int] = []


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    employeeIds: Optional[List[int]] = None
    internIds: Optional[List[int]] = None
    clientIds: Optional[List[int]] = None


class ServiceCreateRequest(BaseModel):
    name: str
    cost: float = 0.0
    intro_description: str = ""
    full_description: Optional[str] = None
    handler_role: str = "Employee"
    image_url: Optional[str] = None
    past_results: Optional[str] = None
    is_active: bool = True


class ServiceRequestCreate(BaseModel):
    service_id: int
    client_email: str


class QuoteRequest(BaseModel):
    requestId: int
    quoted_amount: float
    quote_message: str
    team_info: Optional[str] = None
    quote_doc_url: Optional[str] = None
    assigned_employee_id: Optional[int] = None


class SendMessageRequest(BaseModel):
    thread_id: int
    sender_id: int
    content: str


class CallCreateRequest(BaseModel):
    phone_number: str
    duration_seconds: Optional[int] = None
    summary: Optional[str] = None


class CallSummaryRequest(BaseModel):
    summary: str


class SetupDomainRequest(BaseModel):
    domain: str


class GenerateEmailRequest(BaseModel):
    company_url: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    sender_email: Optional[str] = None
    to_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    manual: Optional[bool] = False
    english_body: Optional[str] = None
    spanish_body: Optional[str] = None
    recommended_services: Optional[str] = None
    client_id: Optional[int] = None


class SendLeadRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    sender_email: Optional[str] = None
    english_body: Optional[str] = None
    spanish_body: Optional[str] = None
    recommended_services: Optional[str] = None
    manual: Optional[bool] = False
    draft_json: Optional[str] = None
    client_id: Optional[int] = None


# ── New Feature Pydantic Models ───────────────────────────────────────────────

# Normalize frontend status strings -> PostgreSQL enum values
# The DB enum 'taskstatus' was created with lowercase values.
# Frontend sends 'Todo', 'InProgress', 'Done' — map them correctly.
_TASK_STATUS_MAP: dict = {
    "todo": "todo",
    "Todo": "todo",
    "TODO": "todo",
    "inprogress": "inprogress",
    "InProgress": "inprogress",
    "INPROGRESS": "inprogress",
    "in_progress": "inprogress",
    "In Progress": "inprogress",
    "done": "done",
    "Done": "done",
    "DONE": "done",
}

def _normalize_task_status(s: Optional[str]) -> Optional[str]:
    if not s:
        return s
    return _TASK_STATUS_MAP.get(s, s.lower())


class TaskCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "Medium"
    due_date: Optional[str] = None
    client_id: Optional[int] = None
    project_id: Optional[int] = None
    assigned_to: Optional[int] = None
    created_by: Optional[int] = None


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[int] = None


class TaskCommentCreateRequest(BaseModel):
    content: str
    author_id: Optional[int] = None


class InvoiceCreateRequest(BaseModel):
    client_id: int
    service_request_id: Optional[int] = None
    amount: float
    tax: float = 0.0
    due_date: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[List[dict]] = []


class InvoiceUpdateRequest(BaseModel):
    status: Optional[str] = None
    amount: Optional[float] = None
    tax: Optional[float] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[List[dict]] = None


class NotificationCreateRequest(BaseModel):
    user_id: int
    title: str
    message: str
    type: str = "info"
    link: Optional[str] = None


class MilestoneCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    client_id: Optional[int] = None
    due_date: Optional[str] = None
    status: str = "Pending"
    order: int = 0


class MilestoneUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    order: Optional[int] = None


class NPSRespondRequest(BaseModel):
    score: int
    feedback: Optional[str] = None


class ProposalCreateRequest(BaseModel):
    title: str
    client_id: Optional[int] = None
    service_request_id: Optional[int] = None
    content: Optional[str] = None
    status: str = "Draft"
    valid_until: Optional[str] = None
    total_value: Optional[float] = None
    created_by: Optional[int] = None


class ProposalUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    valid_until: Optional[str] = None
    total_value: Optional[float] = None


class FileUploadRequest(BaseModel):
    client_id: int
    uploaded_by: Optional[int] = None
    filename: str
    file_url: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    description: Optional[str] = None


class KeywordRankRequest(BaseModel):
    client_id: int
    keyword: str
    position: Optional[int] = None
    url: Optional[str] = None
    search_engine: str = "Google"
    notes: Optional[str] = None
    recorded_by: Optional[int] = None


class ClientNoteCreateRequest(BaseModel):
    content: str
    tags: Optional[List[str]] = []
    is_pinned: bool = False
    author_id: Optional[int] = None
    author_name: Optional[str] = None


class ClientNoteUpdateRequest(BaseModel):
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None


class ConversationLogCreateRequest(BaseModel):
    title: str
    type: str = "call"
    description: Optional[str] = None
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    attachment_urls: Optional[List[str]] = []


class ConversationReplyCreateRequest(BaseModel):
    content: str
    author_id: Optional[int] = None
    author_name: Optional[str] = None


class ClientResearchUpdateRequest(BaseModel):
    company_overview: Optional[str] = None
    competitors: Optional[str] = None
    tech_stack: Optional[str] = None
    recent_news: Optional[str] = None
    pain_points: Optional[str] = None
    business_goals: Optional[str] = None
    key_decision_makers: Optional[str] = None

class ClientTicketCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    author_id: Optional[int] = None
    status: str = "Pending"

class ClientTicketUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _check_password(plain: str, hashed: str) -> bool:
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


def _normalize_role(role: Optional[str]) -> str:
    if not role:
        return "Client"
    mapping = {
        "admin": "Admin",
        "employee": "Employee",
        "client": "Client",
        "intern": "Intern",
    }
    return mapping.get(role.lower(), role)


def _verify_password(plain: str, user: User) -> bool:
    """Support SHA256 (password column) and bcrypt (hashed_password column)."""
    if user.password:
        if _check_password(plain, user.password) or plain == user.password:
            return True
    stored = (user.hashed_password or "").strip()
    if not stored:
        return False
    if stored.startswith("$2"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    return _check_password(plain, stored) or plain == stored


def _user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": _normalize_role(u.role)}


def _client_dict(cp: ClientProfile, session: Session) -> dict:
    user = session.get(User, cp.userId) if cp.userId else None
    employee = session.get(User, cp.assignedEmployeeId) if cp.assignedEmployeeId else None
    cf = cp.customFields or {}
    sd = cf.get("sheet_data", {})

    # Smart fallbacks: if stored fields are empty, pull from raw sheet_data
    def _get(primary, *sheet_keys):
        if primary:
            return primary
        for k in sheet_keys:
            for sk, sv in sd.items():
                if sk.strip().lower() == k.lower() and sv and str(sv).strip():
                    return str(sv).strip()
        return None

    website         = _get(cp.websiteUrl, "Website URL", "Website", "url")
    company_name    = _get(cp.companyName, "Client Name", "Company", "Company Name", "Name")
    
    # If company name is STILL blank (e.g. legacy import with no company column), derive from website
    if not company_name and website:
        import urllib.parse
        try:
            parsed = urllib.parse.urlparse(website if "://" in website else "http://" + website)
            domain = parsed.netloc.replace("www.", "").split(".")[0]
            if domain:
                company_name = domain.capitalize()
        except Exception:
            pass

    services        = _get(cp.services_offered, "Services", "Services providing", "Services Offered")
    description     = _get(cp.tagline, "Description", "description", "Notes")
    phone           = _get(cp.phone, "Contact", "Phone")
    country         = _get(cp.address, "Country", "country", "Region")

    return {
        "id": cp.id,
        "userId": cp.userId,
        "email": user.email if user else None,
        "name": user.name if user else None,
        "companyName": company_name,
        "phone": phone,
        "address": country,
        "status": cp.status,
        "gmbName": cp.gmbName,
        "seoStrategy": cp.seoStrategy,
        "tagline": description,
        "targetKeywords": cp.targetKeywords or [],
        "keywords": cp.targetKeywords or [],
        "websiteUrl": website,
        "website": website,
        "recommended_services": cp.recommended_services,
        "nextMilestone": cp.nextMilestone,
        "nextMilestoneDate": cp.nextMilestoneDate,
        "lastActivity": cp.lastActivity,
        "lastActivityDate": cp.lastActivityDate,
        "assignedEmployeeId": cp.assignedEmployeeId,
        "assignedEmployeeName": employee.name if employee else None,
        "projectId": cp.projectId,
        "projectName": cp.projectName,
        "payment_status": cp.payment_status,
        "sitemap_url": cp.sitemap_url,
        "cms_type": cp.cms_type,
        "services_offered": services,
        "services_requested": cp.services_requested,
        "industry": cp.industry or cf.get("market_size"),
        "lead_score": cp.lead_score or 0,
        "deal_value": cp.deal_value,
        "contact_person": cp.contact_person or sd.get("Contact") or sd.get("contact"),
        "linkedin_url": cp.linkedin_url,
        "last_contact_date": cp.last_contact_date,
        "next_followup_date": cp.next_followup_date,
        "description": cf.get("ai_description") or cf.get("description") or description,
        "country": cf.get("country") or sd.get("Country") or sd.get("country"),
        "customFields": cf,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/login")
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(body.password, user):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    result = _user_dict(user)
    if user.role == "Client":
        cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).first()
        if cp:
            result["client_id"] = cp.id
    return {"user": result}


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/users")
def create_user(body: CreateUserRequest, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        email=body.email,
        password=_hash_password(body.password),
        name=body.name,
        role=body.role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    if body.role == "Client":
        cp = ClientProfile(userId=user.id)
        session.add(cp)
        session.commit()
    return {"user": _user_dict(user)}


@app.get("/users")
def list_users(role: Optional[str] = None, session: Session = Depends(get_session)):
    query = select(User)
    if role:
        roles = [r.strip() for r in role.split(",") if r.strip()]
        if roles:
            query = query.where(User.role.in_(roles))
    users = session.exec(query).all()
    return {"users": [_user_dict(u) for u in users]}


@app.delete("/users/{user_id}")
def delete_user(user_id: int, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    session.delete(user)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Employees & Interns
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/employees")
def list_employees(session: Session = Depends(get_session)):
    employees = session.exec(select(User).where(User.role == "Employee")).all()
    return {"employees": [_user_dict(u) for u in employees]}


@app.get("/interns")
def list_interns(session: Session = Depends(get_session)):
    interns = session.exec(select(User).where(User.role == "Intern")).all()
    return {"interns": [_user_dict(u) for u in interns]}


# ─────────────────────────────────────────────────────────────────────────────
# Client Statuses
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/client-statuses")
def list_client_statuses(session: Session = Depends(get_session)):
    statuses = session.exec(select(ClientStatus)).all()
    if not statuses:
        # Return sensible defaults if table is empty
        statuses = [
            {"id": 1, "name": "Active", "color": "bg-emerald-500"},
            {"id": 2, "name": "Hold", "color": "bg-amber-500"},
            {"id": 3, "name": "Pending", "color": "bg-slate-400"},
        ]
        return {"statuses": statuses}
    return {"statuses": [{"id": s.id, "name": s.name, "color": s.color} for s in statuses]}


# ─────────────────────────────────────────────────────────────────────────────
# Clients
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/clients")
def list_clients(
    status: Optional[str] = None,
    query: Optional[str] = None,
    assigned_employee_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 18,
    session: Session = Depends(get_session),
):
    q = select(ClientProfile)
    if status and status != "All":
        q = q.where(ClientProfile.status == status)
    if query:
        search_term = f"%{query}%"
        q = q.where(
            or_(
                ClientProfile.companyName.ilike(search_term),
                ClientProfile.projectName.ilike(search_term),
                ClientProfile.websiteUrl.ilike(search_term),
                ClientProfile.gmbName.ilike(search_term),
            )
        )
    if assigned_employee_id is not None:
        q = q.where(ClientProfile.assignedEmployeeId == assigned_employee_id)

    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    clients = session.exec(q.offset((page - 1) * per_page).limit(per_page)).all()
    return {
        "clients": [_client_dict(c, session) for c in clients],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@app.post("/clients")
def create_client(body: ClientCreateRequest, session: Session = Depends(get_session)):
    user = None
    if body.email:
        user = session.exec(select(User).where(User.email == body.email)).first()
        if not user:
            user = User(
                email=body.email,
                password=_hash_password(body.password or "changeme"),
                name=body.name or body.companyName or "Client",
                role="Client",
            )
            session.add(user)
            session.commit()
            session.refresh(user)

    cp = ClientProfile(
        userId=user.id if user else None,
        companyName=body.companyName,
        phone=body.phone,
        address=body.address,
        status=body.status,
        projectName=body.projectName,
        gmbName=body.gmbName,
        seoStrategy=body.seoStrategy,
        tagline=body.tagline,
        websiteUrl=body.websiteUrl,
        targetKeywords=body.targetKeywords,
    )
    session.add(cp)
    session.commit()
    session.refresh(cp)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Client Onboarded", cp.dict(), f"{base_url}/clients/{cp.id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"client": _client_dict(cp, session)}



# ─── CSV/Sheet Import ────────────────────────────────────────────────────────
from pydantic import BaseModel as _BM
from typing import Optional as _Opt
import csv as _csv
import io as _io

class SheetImportRequest(_BM):
    csv_url: _Opt[str] = None
    csv_text: _Opt[str] = None

@app.post("/clients/import-sheet")
async def import_sheet(body: SheetImportRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    import httpx

    raw_csv = body.csv_text
    if not raw_csv and body.csv_url:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as http_client:
                r = await http_client.get(body.csv_url)
                raw_csv = r.text
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not fetch CSV: {e}")

    if not raw_csv:
        raise HTTPException(status_code=400, detail="No CSV data provided")

    reader = _csv.DictReader(_io.StringIO(raw_csv))
    rows = list(reader)
    added, skipped = [], []

    for row in rows:
        def get_field(keys):
            for k in keys:
                for rk in row.keys():
                    if rk.strip().lower() == k.lower():
                        v = row[rk]
                        return v.strip() if v else None
            return None

        company  = get_field(["Client Name","Company","Company Name","companyName","Name"])
        website  = get_field(["Website URL","Website","websiteUrl","url","URL"])

        if not company and website:
            # Extract domain name as company name if missing (e.g. https://www.mosco.mx -> Mosco)
            import urllib.parse
            try:
                parsed = urllib.parse.urlparse(website if "://" in website else "http://" + website)
                domain = parsed.netloc.replace("www.", "").split(".")[0]
                if domain:
                    company = domain.capitalize()
            except Exception:
                pass

        email    = get_field(["Email","email","Email Address"])
        phone    = get_field(["Contact","Phone","phone","Contact Number"])
        country  = get_field(["Country","country","Region"])
        services = get_field(["Services","Services providing","Services Offered","services_offered","Services providing"])
        market   = get_field(["Market size","Market","Market Size"])
        desc     = get_field(["Description","description","Notes"])

        if not company and not website:
            skipped.append({"reason": "empty row"})
            continue

        dup = None
        if website:
            dup = session.exec(select(ClientProfile).where(ClientProfile.websiteUrl == website)).first()
        if not dup and company:
            dup = session.exec(select(ClientProfile).where(ClientProfile.companyName == company)).first()
        if dup:
            skipped.append({"reason": "duplicate", "company": company or website, "existing_id": dup.id})
            continue

        raw_sheet_data = {k.strip(): (v.strip() if v else "") for k, v in row.items()}

        cp = ClientProfile(
            companyName=company,
            websiteUrl=website,
            phone=phone,
            address=country,
            status="Active",
            services_offered=services,
            customFields={"sheet_data": raw_sheet_data, "market_size": market, "description": desc, "country": country}
        )

        if email:
            existing_user = session.exec(select(User).where(User.email == email)).first()
            if not existing_user:
                new_user = User(
                    email=email,
                    password=_hash_password("changeme"),
                    name=company or "Client",
                    role="Client",
                )
                session.add(new_user)
                session.commit()
                session.refresh(new_user)
                cp.userId = new_user.id

        session.add(cp)
        session.commit()
        session.refresh(cp)
        added.append({"id": cp.id, "company": company, "website": website})

        if website:
            background_tasks.add_task(_auto_research_client_bg, cp.id, website)

    return {"ok": True, "added": len(added), "skipped": len(skipped), "added_clients": added, "skipped_clients": skipped}


async def _auto_research_client_bg(client_id: int, website: str):
    from database import engine
    from sqlmodel import Session as DBSession
    from modules.scraper import scrape_website
    from modules.llm_engine import extract_client_profile_from_website
    try:
        raw = await scrape_website(website)
        if not raw:
            return
        data = extract_client_profile_from_website(raw, website)
        with DBSession(engine) as sess:
            cp = sess.get(ClientProfile, client_id)
            if not cp:
                return
            if data.get("company_name") and not cp.companyName:
                cp.companyName = data["company_name"]
            if data.get("tagline"):
                cp.tagline = data["tagline"]
            if data.get("industry"):
                cp.industry = data["industry"]
            if data.get("services"):
                svc = data["services"]
                cp.services_offered = ", ".join(svc) if isinstance(svc, list) else str(svc)
            existing_cf = cp.customFields or {}
            if data.get("description"):
                existing_cf["ai_description"] = data["description"]
            cp.customFields = existing_cf
            sess.add(cp)
            sess.commit()
            # Also create/update ClientResearch so the AI Agent tab works
            from database import ClientResearch
            research = sess.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
            if not research:
                research = ClientResearch(client_id=client_id)
                sess.add(research)
            
            # Format the output into AI Agent fields
            research.company_overview = data.get("description", cp.tagline)
            research.tech_stack = "Web presence detected"
            
            # Pack everything into email_agent_data JSON string so the UI can use it
            import json
            ai_data = {
                "tagline": cp.tagline,
                "services": data.get("services", []),
                "industry": cp.industry,
                "auto_researched": True,
                "company_socials": data.get("company_socials", {}),
                "people": data.get("people", [])
            }
            research.email_agent_data = json.dumps(ai_data)
            
            # Also store the people array natively into key_decision_makers for legacy/direct display
            if data.get("people"):
                research.key_decision_makers = json.dumps(data.get("people"))
            
            sess.commit()
            
            deal = Deal(
                title=f"Opportunity – {cp.companyName or website}",
                client_id=client_id,
                stage="Lead",
                value=0.0,
                notes=f"Auto-researched via sheet import.\n\n{data.get('description', '')}",
            )
            sess.add(deal)
            sess.commit()
    except Exception as e:
        print(f"[AutoResearch] Error for client {client_id}: {e}")


# ─── CSV Export ────────────────────────────────────────────────────────────────
@app.get("/clients/export-csv")
def export_clients_csv(session: Session = Depends(get_session)):
    from fastapi.responses import StreamingResponse

    clients_list = session.exec(select(ClientProfile)).all()
    output = _io.StringIO()
    writer = _csv.writer(output)
    writer.writerow(["S.No","Client Name","Website URL","Email","Phone/Contact","Country",
                     "Services Offered","Status","Market Size","Description","Assigned To"])
    for i, c in enumerate(clients_list, 1):
        user = session.get(User, c.userId) if c.userId else None
        emp = session.get(User, c.assignedEmployeeId) if c.assignedEmployeeId else None
        cf = c.customFields or {}
        writer.writerow([
            i, c.companyName or "", c.websiteUrl or "", user.email if user else "",
            c.phone or "", c.address or cf.get("country",""), c.services_offered or "",
            c.status or "Active", cf.get("market_size",""),
            cf.get("description", cf.get("ai_description","")), emp.name if emp else "Unassigned"
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=serphawk_clients.csv"}
    )


@app.get("/clients/{client_id}")
def get_client(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"client": _client_dict(cp, session)}

@app.post("/clients/{client_id}/simulate-call")
def simulate_client_call(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp: raise HTTPException(status_code=404, detail="Client not found")
    
    # Fetch related remarks as notes
    remarks_query = session.exec(select(Remark).where(Remark.clientId == client_id)).all()
    notes = "\n".join([r.content for r in remarks_query]) if remarks_query else ""
    activities = session.exec(select(ActivityLog).where(ActivityLog.clientId == client_id)).all()
    act_str = "\n".join([f"- {a.action}: {a.content}" for a in activities])
    
    email = cp.user.email if cp.user else ""
    keywords = ", ".join(cp.targetKeywords) if cp.targetKeywords else ""

    prompt = f"""You are an expert sales representative for "SERP Hawk" (an elite SEO and Digital Marketing Agency).
Your task is to write a highly tailored, direct sales script to be read over the phone to this specific client. 
DO NOT use generic placeholders like "[Your Name]" or "[Your Company]" - assume the persona of a SERP Hawk sales rep.

Client Profile:
Company/Project: {cp.companyName or cp.projectName or 'Unknown'}
Email: {email}
Keywords they are targeting: {keywords}
Services they need/offer: {cp.services_offered or 'SEO and Marketing Services'}

Notes from our CRM:
{notes}

Recent Activity with them:
{act_str}

Instructions:
1. Write the exact word-for-word script that the sales person will read on the call.
2. Directly reference their specific company name, their services/keywords, and especially any past notes or activities.
3. Pitch SERP Hawk's services (e.g. SEO, link building, digital marketing) as the solution to their specific needs.
4. Make it conversational, persuasive, and professional.
5. Structure it logically: Intro -> Value Proposition -> Direct referencing of their situation -> Call to Action (Next steps).
6. Output ONLY the script, no meta-commentary. Use clear Markdown for readability."""

    from modules.llm_engine import get_openai_client
    try:
        openai_client = get_openai_client()
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        pitch = response.choices[0].message.content or ""
        
        call = CallLog(
            phone_number=cp.phone or "Unknown",
            duration_seconds=180,
            summary=f"AI Pitch Simulation for {cp.companyName or cp.projectName}",
            description=pitch,
            client_id=client_id,
        )
        session.add(call)
        session.commit()
        session.refresh(call)
        
        # Add Activity
        act = ActivityLog(
            action="Call Simulated",
            method="POST",
            content=f"Generated AI Call Pitch for {cp.companyName or cp.projectName}",
            details=pitch,
            clientId=client_id,
            userId=cp.userId  # Use actual user or None
        )
        session.add(act)
        session.commit()
        
        return {"ok": True, "call_id": call.id, "pitch": pitch}
    except Exception as e:
        print("Error in simulation:", e)
        raise HTTPException(status_code=500, detail=f"Failed to simulate call: {str(e)}")

@app.get("/clients/{client_id}/competitors/scan")
def scan_competitors_openai(client_id: int, session: Session = Depends(get_session)):
    import openai
    import os
    import json
    
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
        
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured in backend.")
        
    client = openai.OpenAI(api_key=api_key)
    
    prompt = f"""
    You are an OSINT Business Intelligence Agent. Your job is to extract exact pinpoint geographic coordinates and find 3 real nearby local competitors for a given company.
    
    Target Company: {cp.companyName or cp.projectName or 'Unknown'}
    Website: {cp.websiteUrl or cp.website or 'Unknown'}
    Services: {cp.services_offered or 'Unknown'}
    
    1. Determine the EXACT real-world latitude and longitude of this target company. If you cannot find the exact address, provide the coordinates of the center of its city.
    2. Identify exactly 3 REAL local competitors that operate near them in the same industry.
    3. Calculate realistic distance, assign a type ('direct', 'partial', or 'partner'), a similarity score (0-100), Google rating, review count, and a price range estimate.
    
    Return the output STRICTLY as valid JSON with no markdown formatting, using this exact schema:
    {{
      "lat": 37.7749,
      "lng": -122.4194,
      "competitors": [
        {{
          "id": 1,
          "name": "Competitor Name",
          "distance": "1.2 km",
          "rating": 4.8,
          "reviews": 150,
          "services": ["SEO", "Web Design"],
          "website": "competitor.com",
          "similarity": 85,
          "priceRange": "$1000 - $3000/mo",
          "type": "direct",
          "lat": 37.7800,
          "lng": -122.4100
        }}
      ]
    }}
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        data = json.loads(response.choices[0].message.content)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.put("/clients/{client_id}")
def update_client(
    client_id: int, body: ClientUpdateRequest, session: Session = Depends(get_session)
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    updates = body.model_dump(exclude_unset=True)
    for field, val in updates.items():
        if field == "customFields" and val is not None:
            cp.customFields = {**(cp.customFields or {}), **val}
        else:
            setattr(cp, field, val)
    session.add(cp)
    session.commit()
    session.refresh(cp)
    return {"client": _client_dict(cp, session)}


@app.post("/clients/{client_id}/assign-employee")
def assign_employee(
    client_id: int, body: AssignEmployeeRequest, session: Session = Depends(get_session)
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    cp.assignedEmployeeId = body.employee_id
    session.add(cp)
    session.commit()
    return {"ok": True}


@app.post("/clients/{client_id}/keywords")
def add_keyword(
    client_id: int, body: KeywordRequest, session: Session = Depends(get_session)
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    kws = list(cp.targetKeywords or [])
    if body.keyword not in kws:
        kws.append(body.keyword)
    cp.targetKeywords = kws
    session.add(cp)
    session.commit()
    return {"keywords": cp.targetKeywords}


@app.delete("/clients/{client_id}/keywords")
def remove_keyword(
    client_id: int, keyword: str = Query(...), session: Session = Depends(get_session)
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    cp.targetKeywords = [k for k in (cp.targetKeywords or []) if k != keyword]
    session.add(cp)
    session.commit()
    return {"keywords": cp.targetKeywords}


@app.get("/clients/{client_id}/remarks")
def get_client_remarks(client_id: int, session: Session = Depends(get_session)):
    remarks = session.exec(
        select(Remark).where(Remark.clientId == client_id).order_by(Remark.createdAt.desc())
    ).all()
    return {
        "remarks": [
            {
                "id": r.id,
                "content": r.content,
                "authorId": r.authorId,
                "isInternal": r.isInternal,
                "createdAt": r.createdAt.isoformat(),
            }
            for r in remarks
        ]
    }


@app.post("/clients/{client_id}/remarks")
def add_client_remark(
    client_id: int, body: RemarkCreateRequest, session: Session = Depends(get_session)
):
    r = Remark(
        content=body.content,
        authorId=body.authorId,
        clientId=client_id,
        isInternal=body.isInternal,
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return {
        "id": r.id,
        "content": r.content,
        "authorId": r.authorId,
        "isInternal": r.isInternal,
        "createdAt": r.createdAt.isoformat(),
    }


@app.get("/clients/{client_id}/activities")
def get_client_activities(client_id: int, session: Session = Depends(get_session)):
    logs = session.exec(
        select(ActivityLog)
        .where(ActivityLog.clientId == client_id)
        .order_by(ActivityLog.createdAt.desc())
    ).all()
    return {
        "activities": [
            {
                "id": a.id,
                "action": a.action,
                "method": a.method,
                "content": a.content,
                "details": a.details,
                "createdAt": a.createdAt.isoformat(),
            }
            for a in logs
        ]
    }


@app.post("/clients/{client_id}/activities")
def add_client_activity(
    client_id: int, body: ActivityCreateRequest, session: Session = Depends(get_session)
):
    log = ActivityLog(
        clientId=client_id,
        userId=body.authorId,
        action=body.action,
        method=body.method,
        content=body.content,
        details=body.details,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return {"id": log.id, "action": log.action, "createdAt": log.createdAt.isoformat()}


@app.post("/clients/{client_id}/followup")
def add_client_followup(client_id: int, body: ClientFollowUpRequest, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    remark = Remark(
        content=body.content,
        authorId=body.authorId,
        clientId=client_id,
        isInternal=body.isInternal,
    )
    session.add(remark)
    session.commit()
    session.refresh(remark)

    if body.email_agent_data:
        client_research = session.exec(
            select(ClientResearch).where(ClientResearch.client_id == client_id)
        ).first()
        if not client_research:
            client_research = ClientResearch(
                client_id=client_id,
                email_agent_data=body.email_agent_data
            )
            session.add(client_research)
        else:
            client_research.email_agent_data = body.email_agent_data
            session.add(client_research)
        session.commit()

    task_response = None
    if body.task_title:
        task = Task(
            title=body.task_title,
            description=body.task_description or body.content,
            status="Todo",
            priority="Medium",
            due_date=body.due_date,
            client_id=client_id,
            assigned_to=body.assigned_to,
            created_by=body.authorId,
        )
        session.add(task)
        session.commit()
        session.refresh(task)

        if task.assigned_to:
            notif = Notification(
                user_id=task.assigned_to,
                title="New Follow-up Task Assigned",
                message=f"A follow-up task has been created for {cp.companyName or 'the client'}.",
                type="info",
                link="/tasks",
            )
            session.add(notif)
            session.commit()

        task_response = _task_dict(task, session)

    return {
        "remark": {
            "id": remark.id,
            "content": remark.content,
            "authorId": remark.authorId,
            "isInternal": remark.isInternal,
            "createdAt": remark.createdAt.isoformat(),
        },
        "task": task_response,
    }


@app.get("/clients/{client_id}/emails")
def get_client_emails(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    emails = session.exec(select(SentEmail).where(SentEmail.client_id == client_id).order_by(SentEmail.sent_at.desc())).all()
    return {"emails": emails}

# ─── Client Notes ──────────────────────────────────────────────────────────────

@app.get("/clients/{client_id}/notes")
def get_client_notes(client_id: int, session: Session = Depends(get_session)):
    notes = session.exec(
        select(ClientNote).where(ClientNote.client_id == client_id)
        .order_by(ClientNote.is_pinned.desc(), ClientNote.created_at.desc())
    ).all()
    return {"notes": [
        {
            "id": n.id, "content": n.content, "tags": n.tags or [],
            "is_pinned": n.is_pinned, "author_id": n.author_id,
            "author_name": n.author_name, "created_at": n.created_at.isoformat(),
            "updated_at": n.updated_at.isoformat(),
        } for n in notes
    ]}


@app.post("/clients/{client_id}/notes")
def create_client_note(client_id: int, body: ClientNoteCreateRequest, session: Session = Depends(get_session)):
    note = ClientNote(
        client_id=client_id, content=body.content, tags=body.tags or [],
        is_pinned=body.is_pinned, author_id=body.author_id, author_name=body.author_name,
    )
    session.add(note)
    
    cp = session.get(ClientProfile, client_id)
    client_name = cp.companyName if cp and cp.companyName else f"Client #{client_id}"
    author = body.author_name or "Someone"
    log = ActivityLog(
        clientId=client_id,
        userId=body.author_id,
        action="Added Note",
        method="Notes",
        content=f"{author} added a note for {client_name}",
        details=body.content[:200]
    )
    session.add(log)
    
    session.commit()
    session.refresh(note)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Note Added", {"client": client_name, "content": note.content, "author": author}, f"{base_url}/clients/{client_id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"id": note.id, "content": note.content, "tags": note.tags, "is_pinned": note.is_pinned,
            "author_name": note.author_name, "created_at": note.created_at.isoformat()}

@app.put("/clients/{client_id}/notes/{note_id}")
def update_client_note(client_id: int, note_id: int, body: ClientNoteUpdateRequest, session: Session = Depends(get_session)):
    note = session.get(ClientNote, note_id)
    if not note or note.client_id != client_id:
        raise HTTPException(status_code=404, detail="Note not found")
    if body.content is not None:
        note.content = body.content
    if body.tags is not None:
        note.tags = body.tags
    if body.is_pinned is not None:
        note.is_pinned = body.is_pinned
    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Note Updated", {"content": note.content, "tags": note.tags, "is_pinned": note.is_pinned}, f"{base_url}/clients/{client_id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"ok": True}


@app.delete("/clients/{client_id}/notes/{note_id}")
def delete_client_note(client_id: int, note_id: int, session: Session = Depends(get_session)):
    note = session.get(ClientNote, note_id)
    if not note or note.client_id != client_id:
        raise HTTPException(status_code=404, detail="Note not found")
    session.delete(note)
    session.commit()
    return {"ok": True}


@app.post("/clients/{client_id}/notes/{note_id}/extract-tasks")
def extract_tasks_from_client_note(client_id: int, note_id: int, session: Session = Depends(get_session)):
    note = session.get(ClientNote, note_id)
    if not note or note.client_id != client_id:
        raise HTTPException(status_code=404, detail="Note not found")
        
    from modules.llm_engine import extract_tasks_from_note
    tasks_extracted = extract_tasks_from_note(note.content)
    
    created_tasks = []
    for t in tasks_extracted:
        new_task = Task(
            title=t.get("title", "Extracted Task"),
            description=t.get("description", "") + f"\n\n(Extracted from Note #{note_id})",
            client_id=client_id,
            status="Todo",
            priority="Medium"
        )
        session.add(new_task)
        created_tasks.append(new_task)
        
    session.commit()
    return {"ok": True, "extracted_count": len(created_tasks)}


# ─── Conversation Logs ────────────────────────────────────────────────────────

@app.get("/clients/{client_id}/conversations")
def get_client_conversations(client_id: int, session: Session = Depends(get_session)):
    convs = session.exec(
        select(ConversationLog).where(ConversationLog.client_id == client_id)
        .order_by(ConversationLog.created_at.desc())
    ).all()
    result = []
    for c in convs:
        replies = session.exec(
            select(ConversationReply).where(ConversationReply.conversation_id == c.id)
            .order_by(ConversationReply.created_at.asc())
        ).all()
        result.append({
            "id": c.id, "title": c.title, "type": c.type,
            "description": c.description, "author_id": c.author_id,
            "author_name": c.author_name, "attachment_urls": c.attachment_urls or [],
            "created_at": c.created_at.isoformat(),
            "replies": [{"id": r.id, "content": r.content, "author_name": r.author_name,
                         "created_at": r.created_at.isoformat()} for r in replies],
        })
    return {"conversations": result}


@app.post("/clients/{client_id}/conversations")
def create_client_conversation(client_id: int, body: ConversationLogCreateRequest, session: Session = Depends(get_session)):
    conv = ConversationLog(
        client_id=client_id, title=body.title, type=body.type,
        description=body.description, author_id=body.author_id,
        author_name=body.author_name, attachment_urls=body.attachment_urls or [],
    )
    session.add(conv)

    cp = session.get(ClientProfile, client_id)
    client_name = cp.companyName if cp and cp.companyName else f"Client #{client_id}"
    author = body.author_name or "Someone"
    log = ActivityLog(
        clientId=client_id,
        userId=body.author_id,
        action=f"Logged {body.type.capitalize()}",
        method=body.type.capitalize(),
        content=f"{author} logged a {body.type} for {client_name}",
        details=body.title
    )
    session.add(log)

    session.commit()
    session.refresh(conv)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        event_data = {"client_name": client_name, "type": body.type, "description": body.description}
        send_ai_polished_whatsapp_message("New Client Chat Message", event_data, f"{base_url}/clients/{client_id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"id": conv.id, "title": conv.title, "type": conv.type, "created_at": conv.created_at.isoformat()}


@app.post("/clients/{client_id}/conversations/{conv_id}/replies")
def add_conversation_reply(client_id: int, conv_id: int, body: ConversationReplyCreateRequest, session: Session = Depends(get_session)):
    conv = session.get(ConversationLog, conv_id)
    if not conv or conv.client_id != client_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    reply = ConversationReply(
        conversation_id=conv_id, content=body.content,
        author_id=body.author_id, author_name=body.author_name,
    )
    session.add(reply)
    session.commit()
    session.refresh(reply)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        cp = session.get(ClientProfile, client_id)
        client_name = cp.companyName if cp and cp.companyName else f"Client #{client_id}"
        event_data = {"author": body.author_name or client_name, "content": body.content}
        send_ai_polished_whatsapp_message("New Conversation Reply", event_data, f"{base_url}/clients/{client_id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"id": reply.id, "content": reply.content, "author_name": reply.author_name,
            "created_at": reply.created_at.isoformat()}


# ─── Client Research ──────────────────────────────────────────────────────────

@app.get("/clients/{client_id}/research")
def get_client_research(client_id: int, session: Session = Depends(get_session)):
    research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
    if not research:
        return {"research": None}
    return {"research": {
        "id": research.id, "company_overview": research.company_overview,
        "competitors": research.competitors, "tech_stack": research.tech_stack,
        "recent_news": research.recent_news, "pain_points": research.pain_points,
        "business_goals": research.business_goals, "key_decision_makers": research.key_decision_makers,
        "email_agent_data": research.email_agent_data,
        "updated_at": research.updated_at.isoformat(),
    }}


@app.put("/clients/{client_id}/research")
def upsert_client_research(client_id: int, body: ClientResearchUpdateRequest, session: Session = Depends(get_session)):
    research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
    if not research:
        research = ClientResearch(client_id=client_id)
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(research, field, val)
    research.updated_at = datetime.utcnow()
    session.add(research)
    session.commit()
    return {"ok": True}


@app.post("/clients/{client_id}/auto-research")
def auto_research_client(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
        
    try:
        from modules.llm_engine import get_openai_client
        import json as _json
        client_ai = get_openai_client()
        
        prompt = f"""
        You are an expert pre-sales researcher for an SEO/Marketing agency.
        Research the following company and provide a detailed summary.
        Company Name: {cp.companyName}
        Website: {cp.websiteUrl or 'Unknown'}
        Industry: {cp.industry or 'Unknown'}
        
        Return ONLY valid JSON matching this schema exactly (no markdown formatting, no code blocks):
        {{
            "company_overview": "Detailed overview...",
            "competitors": "List 3-5 main competitors...",
            "tech_stack": "Likely technologies used...",
            "recent_news": "Any recent news or general industry trends...",
            "pain_points": "Likely pain points they face...",
            "business_goals": "Likely business goals...",
            "key_decision_makers": "Titles of key decision makers..."
        }}
        """
        
        resp = client_ai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1000,
        )
        content = resp.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
            
        data = _json.loads(content)
        
        research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
        if not research:
            research = ClientResearch(client_id=client_id)
            
        research.company_overview = data.get("company_overview", "")
        research.competitors = data.get("competitors", "")
        research.tech_stack = data.get("tech_stack", "")
        research.recent_news = data.get("recent_news", "")
        research.pain_points = data.get("pain_points", "")
        research.business_goals = data.get("business_goals", "")
        research.key_decision_makers = data.get("key_decision_makers", "")
        research.updated_at = datetime.utcnow()
        
        session.add(research)
        session.commit()
        return {"ok": True, "research": data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to auto-research: {str(e)}")


@app.post("/clients/{client_id}/generate-outbound-draft")
def generate_outbound_draft(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
        
    try:
        from modules.llm_engine import get_openai_client
        import json as _json
        client_ai = get_openai_client()
        
        # Get existing research
        research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()
        research_context = ""
        if research:
            research_context = f"""
            Company Overview: {research.company_overview or 'N/A'}
            Pain Points: {research.pain_points or 'N/A'}
            Business Goals: {research.business_goals or 'N/A'}
            """
            if research.email_agent_data:
                try:
                    ea_data = _json.loads(research.email_agent_data)
                    research_context += f"\nEmail Agent Intel: {_json.dumps(ea_data.get('company_info', {}), indent=2)}"
                except:
                    pass

        # Get Notes and Conversations
        notes = session.exec(select(ClientNote).where(ClientNote.client_id == client_id).order_by(ClientNote.created_at.desc()).limit(10)).all()
        conversations = session.exec(select(ClientConversation).where(ClientConversation.client_id == client_id).order_by(ClientConversation.date.desc()).limit(5)).all()
        
        interaction_context = ""
        if notes:
            interaction_context += "Recent Notes:\n" + "\n".join([f"- {n.content}" for n in notes]) + "\n"
        if conversations:
            interaction_context += "Recent Conversations:\n" + "\n".join([f"- {c.type} on {c.date}: {c.summary}" for c in conversations]) + "\n"

        prompt = f"""
        You are an expert SDR (Sales Development Representative) at an agency. 
        Write a highly personalized, cold outreach email draft for the following prospect.
        Company: {cp.companyName or 'Unknown'}
        Website: {cp.websiteUrl or 'Unknown'}
        {research_context}

        {interaction_context}
        If there are recent notes or conversations above, make sure the email acknowledges them appropriately as a follow-up. If none exist, write a standard cold outreach email based on the research.

        
        Return ONLY valid JSON matching this schema exactly (no markdown formatting):
        {{
            "subject": "Email subject",
            "english_body": "Email body in English",
            "spanish_body": "Email body translated to Spanish",
            "whatsapp_draft": "Short, punchy WhatsApp message (plain text, emojis allowed)"
        }}
        """
        
        resp = client_ai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=800,
        )
        content = resp.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
            
        data = _json.loads(content)
        
        # Save as a draft in SentEmail
        from database import SentEmail, User
        user = session.get(User, cp.userId) if cp.userId else None
        to_email = user.email if user else "unknown@example.com"
        
        draft = SentEmail(
            client_id=client_id,
            to_email=to_email,
            subject=data.get("subject", "Proposal"),
            english_body=data.get("english_body", ""),
            spanish_body=data.get("spanish_body", ""),
            draft_json=_json.dumps(data),
            manual=True,
            sent_at=datetime.utcnow()
        )
        session.add(draft)
        session.commit()
        return {"ok": True, "draft": data, "email_id": draft.id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate draft: {str(e)}")


# ─── Extract Client Services from Website ─────────────────────────────────────

@app.post("/clients/{client_id}/extract-services")
async def extract_client_services_endpoint(client_id: int, session: Session = Depends(get_session)):
    """
    Scrapes the client's website and uses AI to extract services they offer.
    Falls back to LLM world-knowledge when website is unreachable (DNS, timeout, bot-block).
    Stores results in: ClientProfile.services_offered + MarketplaceService table.
    """
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    website_url = cp.websiteUrl
    company_name = cp.companyName or "Unknown Company"

    if not website_url:
        raise HTTPException(
            status_code=400,
            detail="Client has no website URL. Add one in the client profile first."
        )

    # ── Step 1: Try scraping (fail gracefully on any network error) ────────────
    website_text = ""
    scrape_method = "website_scrape"
    try:
        from modules.scraper import scrape_website
        website_text = await scrape_website(website_url)
        if website_text.startswith("ERROR"):
            print(f"[extract-services] Scrape failed for {website_url}: {website_text[:100]}. Falling back to LLM.")
            website_text = ""
            scrape_method = "llm_fallback"
    except Exception as scrape_err:
        print(f"[extract-services] Scraper exception ({website_url}): {scrape_err}. Falling back to LLM.")
        scrape_method = "llm_fallback"

    # ── Step 2: Extract services (from scraped text, or via LLM knowledge) ─────
    import json as _json
    from modules.llm_engine import extract_client_services as _extract_services, get_openai_client

    services = []

    if website_text:
        services = _extract_services(website_text, company_name)

    # If scraping failed or extracted nothing → use LLM world-knowledge fallback
    if not services:
        scrape_method = "llm_fallback"
        try:
            oai = get_openai_client()
            fallback_prompt = f"""You are a B2B business intelligence expert.

The company "{company_name}" has website: {website_url}
Industry: {cp.industry or "unknown"}

We could not access their website. Based on the company name, domain, and industry,
list the most likely services they offer.

Return ONLY valid JSON:
{{
  "services": [
    {{
      "name": "Service name",
      "brief": "1-2 sentence description of this service",
      "category": "One of: SEO, Web Design, Marketing, Plumbing, Legal, Accounting, Consulting, Construction, Healthcare, Real Estate, IT Services, Landscaping, Cleaning, Electrical, HVAC, Retail, Education, Finance, Transportation, Other",
      "approx_cost": 1200,
      "cost_is_estimated": true
    }}
  ]
}}

Rules: 3-8 services max. approx_cost in USD. cost_is_estimated always true for fallback."""
            resp = oai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": fallback_prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            services = _json.loads(resp.choices[0].message.content).get("services", [])
        except Exception as llm_err:
            print(f"[extract-services] LLM fallback also failed: {llm_err}")

    if not services:
        return {
            "ok": False,
            "services": [],
            "scrape_method": scrape_method,
            "message": "Could not extract services. Try adding the Industry field to improve AI fallback accuracy.",
        }

    # ── Step 3: Save to ClientProfile.services_offered ────────────────────────
    cp.services_offered = _json.dumps(services)
    session.add(cp)

    # ── Step 4: Upsert into MarketplaceService (skip exact name duplicates) ───
    existing = session.exec(
        select(MarketplaceService).where(
            MarketplaceService.provider_client_id == client_id,
            MarketplaceService.is_active == True,
        )
    ).all()
    existing_names = {s.service_name.lower() for s in existing}

    added = 0
    for svc in services:
        svc_name = svc.get("name", "").strip()
        if not svc_name or svc_name.lower() in existing_names:
            continue
        ms = MarketplaceService(
            service_name=svc_name,
            normalized_name=svc_name,
            category=svc.get("category"),
            description=svc.get("brief"),
            estimated_cost=float(svc.get("approx_cost", 0)),
            cost_is_estimated=svc.get("cost_is_estimated", True),
            provider_name=company_name,
            provider_client_id=client_id,
            provider_industry=cp.industry,
            provider_address=cp.address,
            source=scrape_method,
        )
        session.add(ms)
        existing_names.add(svc_name.lower())
        added += 1

    session.commit()

    method_label = "live website" if scrape_method == "website_scrape" else "AI knowledge (site unreachable)"
    return {
        "ok": True,
        "services": services,
        "scrape_method": scrape_method,
        "marketplace_entries_added": added,
        "message": f"Extracted {len(services)} services via {method_label}. Added {added} to Marketplace.",
    }



# ─── AI Copilot Insights ──────────────────────────────────────────────────────


@app.post("/clients/{client_id}/ai-insights")
def get_ai_insights(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    # Gather context
    notes = session.exec(select(ClientNote).where(ClientNote.client_id == client_id).order_by(ClientNote.created_at.desc()).limit(10)).all()
    convs = session.exec(select(ConversationLog).where(ConversationLog.client_id == client_id).order_by(ConversationLog.created_at.desc()).limit(10)).all()
    activities = session.exec(select(ActivityLog).where(ActivityLog.clientId == client_id).order_by(ActivityLog.createdAt.desc()).limit(10)).all()
    research = session.exec(select(ClientResearch).where(ClientResearch.client_id == client_id)).first()

    notes_text = "\n".join([f"- {n.content[:200]}" for n in notes]) if notes else "No notes recorded."
    convs_text = "\n".join([f"- [{c.type.upper()}] {c.title}: {(c.description or '')[:200]}" for c in convs]) if convs else "No conversations recorded."
    activities_text = "\n".join([f"- {a.action}" for a in activities]) if activities else "No activities."
    research_text = ""
    if research:
        research_text = f"Pain Points: {research.pain_points or 'unknown'}\nBusiness Goals: {research.business_goals or 'unknown'}\nCompetitors: {research.competitors or 'unknown'}"

    last_contact = None
    if convs:
        last_contact = convs[0].created_at
    elif activities:
        last_contact = activities[0].createdAt

    days_since_contact = None
    if last_contact:
        days_since_contact = (datetime.utcnow() - last_contact).days

    prompt = f"""You are an AI Sales Copilot analyzing a CRM client record. Provide actionable insights.

CLIENT: {cp.companyName or 'Unknown'}
STATUS: {cp.status}
DEAL VALUE: {cp.deal_value or 'Not set'}
LEAD SCORE: {cp.lead_score or 'Not set'}/100
DAYS SINCE LAST CONTACT: {days_since_contact if days_since_contact is not None else 'Unknown'}

RESEARCH:\n{research_text}
NOTES:\n{notes_text}
CONVERSATIONS:\n{convs_text}
ACTIVITIES:\n{activities_text}

Provide a JSON response with exactly these keys:
{{
  "client_summary": "2-3 sentence overview of client relationship and status",
  "deal_health_score": <integer 0-100>,
  "risks": ["risk 1", "risk 2"],
  "next_best_action": "Single most important action to take right now",
  "follow_up_recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "deal_health_label": "Hot|Warm|Cold|At Risk"
}}"""

    try:
        from modules.llm_engine import get_openai_client
        import json as _json
        client_ai = get_openai_client()
        resp = client_ai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert CRM sales analyst. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        insights = _json.loads(resp.choices[0].message.content)
    except Exception as e:
        # Fallback insights if AI fails
        score = 75 if days_since_contact and days_since_contact < 7 else (50 if days_since_contact and days_since_contact < 14 else 30)
        insights = {
            "client_summary": f"{cp.companyName or 'This client'} is currently {cp.status}. Review recent activity to determine next steps.",
            "deal_health_score": score,
            "risks": [
                f"No contact in {days_since_contact} days" if days_since_contact and days_since_contact > 7 else "Monitor engagement levels",
                "Ensure proposal is aligned with client goals"
            ],
            "next_best_action": "Schedule a follow-up call to reaffirm value proposition",
            "follow_up_recommendations": [
                "Send a personalized follow-up email",
                "Schedule a discovery call this week",
                "Share a relevant case study"
            ],
            "deal_health_label": "Warm" if score > 60 else "Cold"
        }

    return {"insights": insights}


# ─────────────────────────────────────────────────────────────────────────────
# Client Tickets
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/clients/{client_id}/tickets")
def get_client_tickets(client_id: int, session: Session = Depends(get_session)):
    tickets = session.exec(
        select(ClientTicket)
        .where(ClientTicket.client_id == client_id)
        .order_by(ClientTicket.created_at.desc())
    ).all()
    return {"tickets": [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "author_id": t.author_id,
            "created_at": t.created_at.isoformat()
        } for t in tickets
    ]}

@app.post("/clients/{client_id}/tickets")
def create_client_ticket(client_id: int, body: ClientTicketCreateRequest, session: Session = Depends(get_session)):
    ticket = ClientTicket(
        client_id=client_id,
        title=body.title,
        description=body.description,
        status=body.status,
        author_id=body.author_id
    )
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return {"ticket": {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "author_id": ticket.author_id,
        "created_at": ticket.created_at.isoformat()
    }}

@app.put("/clients/{client_id}/tickets/{ticket_id}")
def update_client_ticket(client_id: int, ticket_id: int, body: ClientTicketUpdateRequest, session: Session = Depends(get_session)):
    ticket = session.get(ClientTicket, ticket_id)
    if not ticket or ticket.client_id != client_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if body.title is not None:
        ticket.title = body.title
    if body.description is not None:
        ticket.description = body.description
    if body.status is not None:
        ticket.status = body.status
        
    session.add(ticket)
    session.commit()
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# Admin – Client X-Ray
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/admin/client-xray/{client_id}")
def admin_client_xray(client_id: int, session: Session = Depends(get_session)):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    remarks = session.exec(select(Remark).where(Remark.clientId == client_id)).all()
    activities = session.exec(
        select(ActivityLog).where(ActivityLog.clientId == client_id)
    ).all()
    service_reqs = session.exec(
        select(ServiceRequest).where(ServiceRequest.client_id == client_id)
    ).all()
    return {
        "client": _client_dict(cp, session),
        "remarks": [
            {"id": r.id, "content": r.content, "createdAt": r.createdAt.isoformat()}
            for r in remarks
        ],
        "activities": [
            {"id": a.id, "action": a.action, "createdAt": a.createdAt.isoformat()}
            for a in activities
        ],
        "service_requests": [
            {"id": sr.id, "status": sr.status, "service_id": sr.service_id}
            for sr in service_reqs
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/projects")
def list_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(Project)).all()
    return {"projects": [_project_dict(p) for p in projects]}


@app.post("/projects")
def create_project(body: ProjectCreateRequest, session: Session = Depends(get_session)):
    p = Project(
        name=body.name,
        description=body.description,
        status=body.status,
        progress=body.progress,
        employeeIds=body.employeeIds,
        internIds=body.internIds,
        clientIds=body.clientIds,
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Project Created", _project_dict(p), f"{base_url}/projects")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"project": _project_dict(p)}


@app.get("/projects/{project_id}")
def get_project(project_id: int, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    remarks = session.exec(select(Remark).where(Remark.projectId == project_id)).all()
    return {
        "project": _project_dict(p),
        "remarks": [
            {"id": r.id, "content": r.content, "createdAt": r.createdAt.isoformat()}
            for r in remarks
        ],
    }


@app.put("/projects/{project_id}")
def update_project(
    project_id: int, body: ProjectUpdateRequest, session: Session = Depends(get_session)
):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(p, field, val)
    p.updatedAt = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Project Updated", _project_dict(p), f"{base_url}/projects")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"project": _project_dict(p)}


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(p)
    session.commit()
    return {"ok": True}


@app.post("/projects/{project_id}/remarks")
def add_project_remark(
    project_id: int, body: RemarkCreateRequest, session: Session = Depends(get_session)
):
    r = Remark(
        content=body.content,
        authorId=body.authorId,
        projectId=project_id,
        isInternal=body.isInternal,
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return {"id": r.id, "content": r.content, "createdAt": r.createdAt.isoformat()}


def _project_dict(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "progress": p.progress,
        "employeeIds": p.employeeIds or [],
        "internIds": p.internIds or [],
        "clientIds": p.clientIds or [],
        "createdAt": p.createdAt.isoformat(),
        "updatedAt": p.updatedAt.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Services (Catalog + Requests)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/services")
def list_services(session: Session = Depends(get_session)):
    svcs = session.exec(select(ServiceCatalog).where(ServiceCatalog.is_active == True)).all()
    return {
        "services": [
            {
                "id": s.id,
                "name": s.name,
                "cost": s.cost,
                "intro_description": s.intro_description,
                "full_description": s.full_description,
                "handler_role": s.handler_role,
                "image_url": s.image_url,
                "past_results": s.past_results,
            }
            for s in svcs
        ]
    }


@app.post("/services")
def create_service(body: ServiceCreateRequest, session: Session = Depends(get_session)):
    svc = ServiceCatalog(**body.model_dump())
    session.add(svc)
    session.commit()
    session.refresh(svc)
    return {"service": {"id": svc.id, "name": svc.name}}


@app.post("/services/request")
def request_service(body: ServiceRequestCreate, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.client_email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Client user not found")
    cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Client profile not found")

    sr = ServiceRequest(service_id=body.service_id, client_id=cp.id)
    session.add(sr)
    session.commit()
    session.refresh(sr)

    # Create a message thread for this request
    thread = MessageThread(
        service_request_id=sr.id,
        client_id=cp.id,
    )
    session.add(thread)
    session.commit()

    return {"request": {"id": sr.id, "status": sr.status}}


@app.get("/services/my-requests")
def my_requests(client_email: str = Query(...), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == client_email)).first()
    if not user:
        return {"requests": []}
    cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).first()
    if not cp:
        return {"requests": []}
    reqs = session.exec(select(ServiceRequest).where(ServiceRequest.client_id == cp.id)).all()
    return {
        "requests": [
            {
                "id": r.id,
                "status": r.status,
                "service_id": r.service_id,
                "service_name": r.service.name if r.service else None,
                "quoted_amount": r.quoted_amount,
                "quote_message": r.quote_message,
                "quote_doc_url": r.quote_doc_url,
                "team_info": r.team_info,
                "requested_at": r.requested_at.isoformat(),
            }
            for r in reqs
        ]
    }


@app.get("/services/requests")
def all_service_requests(session: Session = Depends(get_session)):
    reqs = session.exec(select(ServiceRequest)).all()
    result = []
    for r in reqs:
        cp = session.get(ClientProfile, r.client_id)
        user = session.get(User, cp.userId) if cp and cp.userId else None
        svc = session.get(ServiceCatalog, r.service_id)
        emp = session.get(User, r.assigned_employee_id) if r.assigned_employee_id else None
        result.append(
            {
                "id": r.id,
                "status": r.status,
                "service_id": r.service_id,
                "service_name": svc.name if svc else None,
                "client_id": r.client_id,
                "client_name": user.name if user else None,
                "client_email": user.email if user else None,
                "assigned_employee_id": r.assigned_employee_id,
                "assigned_employee_name": emp.name if emp else None,
                "quoted_amount": r.quoted_amount,
                "quote_message": r.quote_message,
                "quote_doc_url": r.quote_doc_url,
                "team_info": r.team_info,
                "requested_at": r.requested_at.isoformat(),
                "quote_sent_at": r.quote_sent_at.isoformat() if r.quote_sent_at else None,
            }
        )
    return {"requests": result}


@app.post("/services/quote")
def send_quote(body: QuoteRequest, session: Session = Depends(get_session)):
    sr = session.get(ServiceRequest, body.requestId)
    if not sr:
        raise HTTPException(status_code=404, detail="Request not found")
    sr.quoted_amount = body.quoted_amount
    sr.quote_message = body.quote_message
    sr.team_info = body.team_info
    sr.quote_doc_url = body.quote_doc_url
    sr.status = "Quoted"
    sr.quote_sent_at = datetime.utcnow()
    if body.assigned_employee_id:
        sr.assigned_employee_id = body.assigned_employee_id
    session.add(sr)
    session.commit()
    return {"ok": True}


@app.post("/services/accept-quote/{request_id}")
def accept_quote(request_id: int, session: Session = Depends(get_session)):
    sr = session.get(ServiceRequest, request_id)
    if not sr:
        raise HTTPException(status_code=404, detail="Request not found")
    sr.status = "Accepted"
    sr.client_accepted_quote = True
    sr.accepted_at = datetime.utcnow()
    session.add(sr)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Admin – Services Overview
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/admin/services-overview")
def admin_services_overview(session: Session = Depends(get_session)):
    reqs = session.exec(select(ServiceRequest)).all()
    statuses = {}
    for r in reqs:
        statuses[r.status] = statuses.get(r.status, 0) + 1
    svcs = session.exec(select(ServiceCatalog)).all()
    return {
        "total_requests": len(reqs),
        "by_status": statuses,
        "services": [{"id": s.id, "name": s.name, "active": s.is_active} for s in svcs],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Messages
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/messages/{user_id}")
def get_message_threads(user_id: int, session: Session = Depends(get_session)):
    from collections import defaultdict

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role in ("Admin", "Employee"):
        threads = session.exec(select(MessageThread)).all()
    else:
        cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user_id)).first()
        if not cp:
            return {"threads": []}
        threads = session.exec(
            select(MessageThread).where(MessageThread.client_id == cp.id)
        ).all()

    if not threads:
        return {"threads": []}

    thread_ids = [t.id for t in threads]

    # Batch-fetch service requests
    sr_ids = list({t.service_request_id for t in threads if t.service_request_id})
    service_requests: dict = {}
    if sr_ids:
        service_requests = {
            sr.id: sr
            for sr in session.exec(select(ServiceRequest).where(ServiceRequest.id.in_(sr_ids))).all()
        }

    # Batch-fetch service catalog entries
    svc_ids = list({sr.service_id for sr in service_requests.values() if sr.service_id})
    services: dict = {}
    if svc_ids:
        services = {
            s.id: s
            for s in session.exec(select(ServiceCatalog).where(ServiceCatalog.id.in_(svc_ids))).all()
        }

    # Batch-fetch all messages for all threads in one query
    all_messages = session.exec(
        select(ChatMessage)
        .where(ChatMessage.thread_id.in_(thread_ids))
        .order_by(ChatMessage.thread_id, ChatMessage.timestamp)
    ).all()

    # Collect all user IDs needed (employees + message senders)
    user_ids_needed = {t.employee_id for t in threads if t.employee_id}
    user_ids_needed.update(m.sender_id for m in all_messages)
    users_map: dict = {}
    if user_ids_needed:
        users_map = {
            u.id: u
            for u in session.exec(select(User).where(User.id.in_(list(user_ids_needed)))).all()
        }

    # Group messages by thread_id
    msgs_by_thread: dict = defaultdict(list)
    for m in all_messages:
        msgs_by_thread[m.thread_id].append(m)

    result = []
    for t in threads:
        sr = service_requests.get(t.service_request_id)
        svc = services.get(sr.service_id) if sr else None
        emp = users_map.get(t.employee_id) if t.employee_id else None
        msgs = msgs_by_thread.get(t.id, [])
        last_message = msgs[-1] if msgs else None
        last_sender_user = users_map.get(last_message.sender_id) if last_message else None
        unread_count = sum(
            1 for m in msgs if m.sender_id != user_id and not m.is_read
        )
        has_unanswered = False
        if last_message and last_message.sender_id != user_id and user.role in ("Admin", "Employee"):
            sender_role = last_sender_user.role if last_sender_user else None
            if sender_role == "Client":
                has_unanswered = True

        result.append(
            {
                "thread_id": t.id,
                "service_request_id": t.service_request_id,
                "service_name": svc.name if svc else "Service",
                "service_status": sr.status if sr else "Unknown",
                "handler": emp.name if emp else "Support Team",
                "unread_count": unread_count,
                "has_unanswered": has_unanswered,
                "last_message": last_message.content if last_message else None,
                "last_sender": _get_sender_name_from_map(last_message.sender_id, users_map) if last_message else None,
                "last_message_timestamp": last_message.timestamp.isoformat() if last_message else None,
                "messages": [
                    {
                        "id": m.id,
                        "sender": _get_sender_name_from_map(m.sender_id, users_map),
                        "content": m.content,
                        "timestamp": m.timestamp.isoformat(),
                        "isMe": m.sender_id == user_id,
                        "is_read": m.is_read,
                    }
                    for m in msgs
                ],
            }
        )
    return {"threads": result}


@app.post("/messages/send")
def send_message(body: SendMessageRequest, session: Session = Depends(get_session)):
    thread = session.get(MessageThread, body.thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    msg = ChatMessage(
        thread_id=body.thread_id,
        sender_id=body.sender_id,
        content=body.content,
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return {
        "id": msg.id,
        "sender": _get_sender_name(msg.sender_id, session),
        "content": msg.content,
        "timestamp": msg.timestamp.isoformat(),
    }


def _get_sender_name(sender_id: int, session: Session) -> str:
    u = session.get(User, sender_id)
    return u.name or u.email if u else "Unknown"


def _get_sender_name_from_map(sender_id: int, users_map: dict) -> str:
    u = users_map.get(sender_id)
    return (u.name or u.email) if u else "Unknown"


# ─────────────────────────────────────────────────────────────────────────────
# Calls
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/calls")
def list_calls(unsummarized: Optional[bool] = None, session: Session = Depends(get_session)):
    q = select(CallLog).order_by(CallLog.received_at.desc())
    calls = session.exec(q).all()
    result = []
    for c in calls:
        d = _call_dict(c, session)
        if unsummarized is True and d.get("summary"):
            continue
        result.append(d)
    return {"calls": result}


@app.post("/calls")
def log_call(body: CallCreateRequest, session: Session = Depends(get_session)):
    c = CallLog(
        phone_number=body.phone_number,
        duration_seconds=body.duration_seconds,
        description=getattr(body, "description", None),
        work_done=getattr(body, "work_done", None),
        assigned_to=getattr(body, "assigned_to", None),
        followup_needed=getattr(body, "followup_needed", False),
        followup_date=getattr(body, "followup_date", None),
        client_id=getattr(body, "client_id", None),
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        call_link = f"{base_url}/calls" if not c.client_id else f"{base_url}/clients/{c.client_id}"
        send_ai_polished_whatsapp_message("Call Logged", _call_dict(c), call_link)
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"call": _call_dict(c)}


@app.put("/calls/{call_id}")
@app.patch("/calls/{call_id}")
def update_call(
    call_id: int, body: Dict[str, Any], session: Session = Depends(get_session)
):
    c = session.get(CallLog, call_id)
    if not c:
        raise HTTPException(status_code=404, detail="Call not found")
    for field, val in body.items():
        if hasattr(c, field):
            setattr(c, field, val)
    session.add(c)
    session.commit()
    session.refresh(c)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        call_link = f"{base_url}/calls" if not c.client_id else f"{base_url}/clients/{c.client_id}"
        send_ai_polished_whatsapp_message("Call Updated", _call_dict(c), call_link)
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"call": _call_dict(c)}


@app.post("/calls/{call_id}/summary")
def add_call_summary(
    call_id: int, body: CallSummaryRequest, session: Session = Depends(get_session)
):
    c = session.get(CallLog, call_id)
    if not c:
        raise HTTPException(status_code=404, detail="Call not found")
    if hasattr(c, "summary"):
        c.summary = body.summary if hasattr(body, "summary") else None
        session.add(c)
        session.commit()
    return {"ok": True}


def _call_dict(c: CallLog, session: Session = None) -> dict:
    d = {
        "id": c.id,
        "phone_number": c.phone_number,
        "received_at": c.received_at.isoformat(),
        "duration_seconds": c.duration_seconds,
        "summary": getattr(c, "summary", None),
        "description": getattr(c, "description", None),
        "work_done": getattr(c, "work_done", None),
        "assigned_to": getattr(c, "assigned_to", None),
        "followup_needed": getattr(c, "followup_needed", False),
        "followup_date": getattr(c, "followup_date", None),
        "client_id": getattr(c, "client_id", None),
    }
    
    if session and c.client_id:
        from database import ClientProfile
        cp = session.get(ClientProfile, c.client_id)
        if cp:
            d["entity_name"] = cp.companyName or cp.projectName
            
    if not d.get("entity_name") and c.summary:
        if c.summary.startswith("AI Pitch Simulation for "):
            d["entity_name"] = c.summary.replace("AI Pitch Simulation for ", "")
        elif c.summary.startswith("Pitch Generation for "):
            d["entity_name"] = c.summary.replace("Pitch Generation for ", "")
            
    return d


# ─────────────────────────────────────────────────────────────────────────────
# Scheduled Calls
# ─────────────────────────────────────────────────────────────────────────────

class ScheduledCallCreateRequest(BaseModel):
    title: str
    scheduled_at: Optional[str] = None
    entity_type: str = "client"
    entity_id: Optional[int] = None
    entity_name: Optional[str] = None
    entity_email: Optional[str] = None
    pitch: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None

def _sched_dict(s: ScheduledCall) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
        "entity_type": s.entity_type,
        "entity_id": s.entity_id,
        "entity_name": s.entity_name,
        "entity_email": s.entity_email,
        "pitch": s.pitch,
        "notes": s.notes,
        "assigned_to": s.assigned_to,
        "status": s.status,
        "created_at": s.created_at.isoformat(),
    }

@app.get("/scheduled-calls")
def list_scheduled_calls(session: Session = Depends(get_session)):
    items = session.exec(select(ScheduledCall).order_by(ScheduledCall.scheduled_at.asc())).all()
    return {"scheduled_calls": [_sched_dict(s) for s in items]}

@app.post("/scheduled-calls")
def create_scheduled_call(body: ScheduledCallCreateRequest, session: Session = Depends(get_session)):
    dt = None
    if body.scheduled_at:
        try:
            dt = datetime.fromisoformat(body.scheduled_at)
        except Exception:
            dt = None

    sc = ScheduledCall(
        title=body.title,
        scheduled_at=dt,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        entity_name=body.entity_name,
        entity_email=body.entity_email,
        pitch=body.pitch,
        notes=body.notes,
        assigned_to=body.assigned_to,
    )
    session.add(sc)
    session.commit()
    session.refresh(sc)

    # Send email notification if entity_email provided
    if body.entity_email:
        try:
            dt_str = dt.strftime("%Y-%m-%d %H:%M") if dt else "TBD"
            pitch_section = f"\n\n📋 Pitch Prepared:\n{body.pitch}" if body.pitch else ""
            subject = f"📞 Call Scheduled: {body.title}"
            content = (
                f"Hello {body.entity_name or ''},\n\n"
                f"A call has been scheduled for you.\n\n"
                f"📅 Date & Time: {dt_str}\n"
                f"📌 Topic: {body.title}\n"
                f"{pitch_section}\n\n"
                f"Our team will reach out at the scheduled time.\n\n"
                f"Thanks,\nSerpHawk CRM"
            )
            _send_notification_email(body.entity_email, subject, content)
        except Exception as e:
            print("Scheduled call email error:", e)

    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Scheduled Call Created", _sched_dict(sc), f"{base_url}/calls")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"scheduled_call": _sched_dict(sc)}

@app.put("/scheduled-calls/{sc_id}")
def update_scheduled_call(sc_id: int, body: Dict[str, Any], session: Session = Depends(get_session)):
    sc = session.get(ScheduledCall, sc_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Scheduled call not found")
    for k, v in body.items():
        if hasattr(sc, k):
            setattr(sc, k, v)
    session.add(sc)
    session.commit()
    session.refresh(sc)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Scheduled Call Updated", _sched_dict(sc), f"{base_url}/calls")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"scheduled_call": _sched_dict(sc)}

@app.delete("/scheduled-calls/{sc_id}")
def delete_scheduled_call(sc_id: int, session: Session = Depends(get_session)):
    sc = session.get(ScheduledCall, sc_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Scheduled call not found")
    session.delete(sc)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Documents / OCR
# ─────────────────────────────────────────────────────────────────────────────
from fastapi import UploadFile, File
from modules.llm_engine import analyze_document

@app.post("/documents/ocr")
async def ocr_document(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        result = analyze_document(image_bytes)
        if "error" in result:
            return {"error": result["error"]}
        return result
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Activities (global)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/activities")
def list_activities(user_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(ActivityLog).order_by(ActivityLog.createdAt.desc())
    if user_id:
        q = q.where(ActivityLog.userId == user_id)
    logs = session.exec(q.limit(100)).all()
    return {
        "activities": [
            {
                "id": a.id,
                "action": a.action,
                "method": a.method,
                "content": a.content,
                "details": a.details,
                "clientId": a.clientId,
                "createdAt": a.createdAt.isoformat(),
            }
            for a in logs
        ]
    }


# ─────────────────────────────────────────────────────────────────────────────
# Email Agent
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/generate")
def generate_email(body: GenerateEmailRequest, background_tasks: BackgroundTasks = None):
    try:
        from modules.llm_engine import generate_email as _gen, analyze_content
        from modules.scraper import scrape_website
        from modules.email_sender import send_email_outlook
        import os
        from database import SentEmail
        import json
        session = next(get_session())

        # --- Static Email Template ---
        OUTREACH_SUBJECT = "Let's grow {company_name} together!"
        OUTREACH_BODY_EN = (
            "Hi {company_name},\n\n"
            "We'd love to help {company_name} grow online with our services: {services}.\n\n"
            "Best,\nDapros Team"
        )
        OUTREACH_BODY_ES = (
            "Hola {company_name},\n\n"
            "Nos encantaría ayudar a {company_name} a crecer en línea con nuestros servicios: {services}.\n\n"
            "Saludos,\nEquipo Dapros"
        )
        INBOUND_SUBJECT = "Thank you for reaching out, {company_name}!"
        INBOUND_BODY_EN = (
            "Hi {company_name},\n\n"
            "Thank you for your interest in our services: {services}. We'll get back to you soon.\n\n"
            "Best,\nDapros Team"
        )
        INBOUND_BODY_ES = (
            "Hola {company_name},\n\n"
            "Gracias por su interés en nuestros servicios: {services}. Nos pondremos en contacto pronto.\n\n"
            "Saludos,\nEquipo Dapros"
        )


        # Always use LLM to analyze and generate email, even if only company name or email is provided
        if body.company_url:
            text = scrape_website(body.company_url)
        else:
            text = f"{body.company_name or ''} {body.to_email or ''}"
            # Use LLM for company research, service mapping, and draft generation based on company name and website (no scraping)
            llm_input = f"Company Name: {body.company_name or ''}\nWebsite: {body.company_url or ''}"
            analysis = analyze_content(llm_input)
            company_name = analysis.get("company_name") or body.company_name or "Your Company"
            services = ", ".join(analysis.get("key_value_props") or ["SEO", "PPC", "Web Development"])
            # Try to extract company email from analysis.contacts
            company_email = None
            contacts = analysis.get("contacts") or []
            for c in contacts:
                if c.get("email"):
                    company_email = c["email"]
                    break
            # Use LLM to generate outreach and inbound drafts
            outreach_llm = _gen(analysis)
            inbound_llm = _gen(analysis)
            outreach_subject = outreach_llm.get("subject") or OUTREACH_SUBJECT.format(company_name=company_name)
            outreach_body_en = outreach_llm.get("english_body") or OUTREACH_BODY_EN.format(company_name=company_name, services=services)
            outreach_body_es = outreach_llm.get("spanish_body") or OUTREACH_BODY_ES.format(company_name=company_name, services=services)
            inbound_subject = inbound_llm.get("subject") or INBOUND_SUBJECT.format(company_name=company_name)
            inbound_body_en = inbound_llm.get("english_body") or INBOUND_BODY_EN.format(company_name=company_name, services=services)
            inbound_body_es = inbound_llm.get("spanish_body") or INBOUND_BODY_ES.format(company_name=company_name, services=services)

        sender = body.sender_email or os.getenv("EMAIL_SENDER") or os.getenv("OUTLOOK_EMAIL", "prasanth.anupoju@sasi.ac.in")
        password = os.getenv("EMAIL_PASSWORD") or os.getenv("OUTLOOK_PASSWORD", "")
        smtp_server = os.getenv("EMAIL_HOST") or os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = os.getenv("EMAIL_PORT") or os.getenv("SMTP_PORT", 587)
        imap_server = os.getenv("IMAP_SERVER", "imap.gmail.com")

        # Only send the email if manual is False and all required fields are present
        if not body.manual and all([body.to_email, body.subject, body.body, sender, password]):
            try:
                send_email_outlook(
                    to_email=body.to_email,
                    subject=body.subject,
                    body=body.body,
                    sender_email=sender,
                    sender_password=password,
                    smtp_server=smtp_server,
                    smtp_port=smtp_port,
                    imap_server=imap_server
                )
                
                # --- Trigger n8n Webhook ---
                try:
                    import httpx
                    webhook_url = "http://localhost:5678/webhook-test/serphawk-followup"
                    payload = {
                        "event": "email_sent",
                        "sender": sender,
                        "to_email": body.to_email,
                        "subject": body.subject,
                        "company": company_name,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    httpx.post(webhook_url, json=payload, timeout=5.0)
                    print(f"Webhook successfully triggered to {webhook_url}")
                except Exception as wh_e:
                    print(f"Webhook trigger failed: {wh_e}")
                    
            except Exception as e:
                print(f"Email send failed: {e}")
        # If any required field is missing, skip sending and just generate the draft

        # Only save to database if required fields are present
        # Provide default subject and content if missing, so frontend always gets a visible draft
        # Build the draft object for both outreach and inbound
        draft_obj = {
            "outreach": {
                "subject": outreach_subject,
                "english_body": outreach_body_en,
                "spanish_body": outreach_body_es,
            },
            "inbound": {
                "subject": inbound_subject,
                "english_body": inbound_body_en,
                "spanish_body": inbound_body_es,
            },
            "company_name": company_name,
            "services": services,
                "to_email": company_email or body.to_email,
            "manual": body.manual,
            "sent_at": datetime.utcnow().isoformat(),
            "client_id": body.client_id
        }
        # Always save the email and log activity, even if some fields are missing
        client_id = body.client_id
        if not client_id:
            from database import ClientProfile
            # Try to find existing client by email
            existing_client = session.exec(select(ClientProfile).where(ClientProfile.email == body.to_email)).first() if hasattr(ClientProfile, 'email') else None
            if existing_client:
                client_id = existing_client.id
            else:
                # Create new client profile
                cp = ClientProfile(
                    companyName=draft_obj["company_name"] or "Unknown Company",
                    email=body.to_email or f"unknown_contact_{datetime.utcnow().timestamp()}@placeholder.com",
                    status="Active"
                )
                session.add(cp)
                session.commit()
                session.refresh(cp)
                client_id = cp.id
        # Save the outreach draft to DB, using placeholders if needed
        email_db_obj = {
            "to_email": body.to_email or f"unknown_contact_{datetime.utcnow().timestamp()}@placeholder.com",
            "subject": draft_obj["outreach"].get("subject") or "[No Subject]",
            "english_body": draft_obj["outreach"].get("english_body") or "[No Body]",
            "spanish_body": draft_obj["outreach"].get("spanish_body") or "[No Spanish Body]",
            "recommended_services": draft_obj.get("services") or "",
            "manual": body.manual,
            "draft_json": json.dumps(draft_obj),
            "sent_at": draft_obj["sent_at"],
            "client_id": client_id
        }
        sent_email = SentEmail(**email_db_obj)
        session.add(sent_email)
        session.commit()
        session.refresh(sent_email)

        # --- Log activity for this client ---
        from database import ActivityLog
        activity = ActivityLog(
            clientId=client_id,
            action="Email Generated",
            method="Email",
            content=f"Generated outreach email for {draft_obj.get('company_name') or '[Unknown Company]'} ({body.company_url or ''}) to {body.to_email or '[Unknown Email]'}",
            details=draft_obj["outreach"].get("subject") or "[No Subject]"
        )
        session.add(activity)
        session.commit()

        # Schedule LLM draft generation in the background if needed
        if background_tasks is not None:
            background_tasks.add_task(generate_llm_draft_task, sent_email.id, body.dict())

        return {"ok": True, "email_id": sent_email.id, "draft": draft_obj, "client_id": client_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Background task to update SentEmail with LLM-generated draft
def generate_llm_draft_task(sent_email_id, body_dict):
    import time
    import json
    from modules.llm_engine import analyze_content, generate_email as llm_generate_email
    from modules.scraper import scrape_website
    from database import Session, SentEmail, engine
    session = Session(engine)
    try:
        # Scrape and analyze
        text = scrape_website(body_dict.get("company_url", "")) if body_dict.get("company_url") else ""
        analysis = analyze_content(text) if text else {}
        llm_result = llm_generate_email(analysis, None)
        # Update SentEmail record
        sent_email = session.get(SentEmail, sent_email_id)
        if sent_email:
            sent_email.subject = llm_result.get("subject", sent_email.subject)
            sent_email.english_body = llm_result.get("english_body", sent_email.english_body)
            sent_email.spanish_body = llm_result.get("spanish_body", sent_email.spanish_body)
            sent_email.draft_json = json.dumps(llm_result)
            session.add(sent_email)
            session.commit()
    except Exception as e:
        print(f"LLM draft background task failed: {e}")
    finally:
        session.close()


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard Stats
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/dashboard-stats")
def dashboard_stats(
    role: str = Query("Client"),
    email: str = Query(""),
    session: Session = Depends(get_session),
):
    if role == "Client":
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            return {"isClient": True}
        cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).first()
        if not cp:
            return {"isClient": True}

        service_reqs = session.exec(
            select(ServiceRequest).where(ServiceRequest.client_id == cp.id)
        ).all()
        active_services = [
            r for r in service_reqs if r.status in ("Accepted", "In Progress")
        ]
        pending_quotes = [r for r in service_reqs if r.status == "Quoted"]

        # Resolve service names for active services and quotes
        def _resolve_service_name(service_id):
            if not service_id:
                return "Service"
            svc = session.get(ServiceCatalog, service_id)
            return svc.name if svc else "Service"

        # Milestones for this client
        milestones = session.exec(
            select(Milestone)
            .where(Milestone.client_id == cp.id)
            .order_by(Milestone.order, Milestone.created_at)
        ).all()

        # Invoices for this client
        invoices = session.exec(
            select(Invoice)
            .where(Invoice.client_id == cp.id)
            .order_by(Invoice.created_at.desc())
        ).all()

        # Files for this client
        files = session.exec(
            select(ClientFileUpload)
            .where(ClientFileUpload.client_id == cp.id)
            .order_by(ClientFileUpload.created_at.desc())
        ).all()

        # Recent activities for this client
        activities = session.exec(
            select(ActivityLog)
            .where(ActivityLog.clientId == cp.id)
            .order_by(ActivityLog.createdAt.desc())
            .limit(20)
        ).all()

        # Notifications for this user
        notifications = session.exec(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(10)
        ).all()

        # Proposals for this client
        proposals = session.exec(
            select(Proposal)
            .where(Proposal.client_id == cp.id)
            .order_by(Proposal.created_at.desc())
        ).all()

        # Projects for this client (clientIds is a JSON list)
        all_projects = session.exec(select(Project)).all()
        projects = [p for p in all_projects if cp.id in (p.clientIds or [])]

        # Invoice summary stats
        total_billed = sum(inv.total for inv in invoices)
        total_paid = sum(inv.total for inv in invoices if inv.status == "Paid")
        total_pending_inv = sum(inv.total for inv in invoices if inv.status in ("Sent", "Draft"))
        total_overdue = sum(inv.total for inv in invoices if inv.status == "Overdue")

        return {
            "isClient": True,
            "companyName": cp.companyName or "",
            "projectName": cp.projectName or "",
            "website": cp.websiteUrl or "",
            "status": cp.status,
            "seoStrategy": cp.seoStrategy or "",
            "recommended_services": cp.recommended_services or "",
            "targetKeywords": cp.targetKeywords or [],
            "nextMilestone": cp.nextMilestone or "",
            "nextMilestoneDate": cp.nextMilestoneDate or "",
            "active_services_list": [
                {"id": r.id, "service_id": r.service_id, "status": r.status, "service_name": _resolve_service_name(r.service_id)}
                for r in active_services
            ],
            "pending_quotes_list": [
                {
                    "id": r.id,
                    "service_id": r.service_id,
                    "quoted_amount": r.quoted_amount,
                    "quote_message": r.quote_message,
                    "service_name": _resolve_service_name(r.service_id),
                }
                for r in pending_quotes
            ],
            "pending_requests_count": len([r for r in service_reqs if r.status == "Pending"]),
            "milestones": [
                {
                    "id": m.id, "title": m.title, "description": m.description,
                    "due_date": m.due_date, "status": m.status, "order": m.order,
                    "created_at": m.created_at.isoformat(),
                }
                for m in milestones
            ],
            "invoices": [
                {
                    "id": inv.id, "invoice_number": inv.invoice_number,
                    "amount": inv.amount, "tax": inv.tax, "total": inv.total,
                    "status": inv.status, "due_date": inv.due_date,
                    "notes": inv.notes, "line_items": inv.line_items or [],
                    "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
                    "created_at": inv.created_at.isoformat(),
                }
                for inv in invoices
            ],
            "invoice_summary": {
                "total_billed": total_billed,
                "total_paid": total_paid,
                "total_pending": total_pending_inv,
                "total_overdue": total_overdue,
            },
            "files": [
                {
                    "id": f.id, "filename": f.filename, "file_url": f.file_url,
                    "file_size": f.file_size, "mime_type": f.mime_type,
                    "description": f.description, "created_at": f.created_at.isoformat(),
                }
                for f in files
            ],
            "activities": [
                {
                    "id": a.id, "action": a.action, "method": a.method,
                    "content": a.content, "details": a.details,
                    "createdAt": a.createdAt.isoformat(),
                }
                for a in activities
            ],
            "notifications": [
                {
                    "id": n.id, "title": n.title, "message": n.message,
                    "type": n.type, "link": n.link, "is_read": n.is_read,
                    "created_at": n.created_at.isoformat(),
                }
                for n in notifications
            ],
            "unread_notifications_count": sum(1 for n in notifications if not n.is_read),
            "proposals": [
                {
                    "id": p.id, "title": p.title, "status": p.status,
                    "total_value": p.total_value, "valid_until": p.valid_until,
                    "created_at": p.created_at.isoformat(),
                }
                for p in proposals
            ],
            "projects": [
                {
                    "id": p.id, "name": p.name, "status": p.status,
                    "progress": p.progress,
                    "created_at": p.createdAt.isoformat(),
                }
                for p in projects
            ],
        }

    # Admin / Employee stats
    total_clients = len(session.exec(select(ClientProfile)).all())
    active_clients = len(
        session.exec(select(ClientProfile).where(ClientProfile.status == "Active")).all()
    )
    pending_clients = len(
        session.exec(select(ClientProfile).where(ClientProfile.status == "Pending")).all()
    )
    hold_clients = len(
        session.exec(select(ClientProfile).where(ClientProfile.status == "Hold")).all()
    )
    total_projects = len(session.exec(select(Project)).all())
    total_employees = len(
        session.exec(select(User).where(User.role == "Employee")).all()
    )
    total_interns = len(
        session.exec(select(User).where(User.role == "Intern")).all()
    )
    total_activities = len(session.exec(select(ActivityLog)).all())
    total_calls = len(session.exec(select(CallLog)).all())

    try:
        from database import MarketplaceService
        total_marketplace = len(session.exec(select(MarketplaceService)).all())
    except:
        total_marketplace = 0

    # Build real 7-day chart data from database
    labels = []
    activity_chart = []
    email_chart = []
    call_chart = []
    all_activities = session.exec(select(ActivityLog)).all()
    all_emails = session.exec(select(SentEmail)).all()
    all_calls_list = session.exec(select(CallLog)).all()
    total_emails_sent = len(all_emails)
    for i in range(6, -1, -1):
        day = datetime.utcnow() - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        labels.append(day.strftime("%b %d"))
        activity_chart.append(sum(1 for a in all_activities if a.createdAt and day_start <= a.createdAt < day_end))
        email_chart.append(sum(1 for e in all_emails if e.sent_at and day_start <= e.sent_at < day_end))
        call_chart.append(sum(1 for c in all_calls_list if c.createdAt and day_start <= c.createdAt < day_end))

    import calendar
    all_invoices = session.exec(select(Invoice)).all()
    all_service_reqs = session.exec(select(ServiceRequest)).all()

    revenue_data = []
    today = datetime.utcnow()
    for i in range(5, -1, -1):
        target_month = today.month - i
        target_year = today.year
        while target_month <= 0:
            target_month += 12
            target_year -= 1
            
        month_start = datetime(target_year, target_month, 1)
        next_month = target_month + 1
        next_year = target_year
        if next_month > 12:
            next_month = 1
            next_year += 1
        month_end = datetime(next_year, next_month, 1)
        
        rev = sum(inv.total for inv in all_invoices if inv.status == "Paid" and inv.created_at and month_start <= inv.created_at < month_end)
        exp = sum(inv.total for inv in all_invoices if inv.status == "Sent" and inv.created_at and month_start <= inv.created_at < month_end) * 0.3
        revenue_data.append({"name": calendar.month_abbr[target_month], "revenue": rev, "expenses": exp})
        
    pipeline_data = [
        {"stage": "Prospecting", "count": pending_clients},
        {"stage": "Qualification", "count": len([r for r in all_service_reqs if r.status == "Pending"])},
        {"stage": "Proposal", "count": len([r for r in all_service_reqs if r.status == "Quoted"])},
        {"stage": "Negotiation", "count": len([r for r in all_service_reqs if r.status == "In Progress"])},
        {"stage": "Closed Won", "count": len([r for r in all_service_reqs if r.status == "Accepted"])},
    ]

    recent_activities = session.exec(
        select(ActivityLog).order_by(ActivityLog.createdAt.desc()).limit(10)
    ).all()

    return {
        "total": total_clients,
        "active": active_clients,
        "pending": pending_clients,
        "hold": hold_clients,
        "totalProjects": total_projects,
        "totalEmployees": total_employees,
        "totalInterns": total_interns,
        "totalActivities": total_activities,
        "totalCalls": total_calls,
        "totalEmailsSent": total_emails_sent,
        "totalMarketplaceServices": total_marketplace,
        "revenueData": revenue_data,
        "pipelineData": pipeline_data,
        "chartLabels": labels,
        "activityChart": activity_chart,
        "emailChart": email_chart,
        "callChart": call_chart,
        "recentActivities": [
            {
                "id": a.id,
                "action": a.action,
                "method": a.method,
                "content": a.content,
                "createdAt": a.createdAt.isoformat() if a.createdAt else None,
            }
            for a in recent_activities
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Client Timeline (unified)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/clients/{client_id}/timeline")
def client_timeline(client_id: int, session: Session = Depends(get_session)):
    """Unified timeline: activities, emails, calls, invoices, milestones, files."""
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    events: list[dict] = []

    # Activities
    for a in session.exec(select(ActivityLog).where(ActivityLog.clientId == client_id)).all():
        events.append({
            "type": "activity", "id": a.id,
            "title": a.action or a.method or "Activity",
            "detail": a.content or "",
            "date": a.createdAt.isoformat() if a.createdAt else None,
        })

    # Emails
    for e in session.exec(select(SentEmail).where(SentEmail.client_id == client_id)).all():
        events.append({
            "type": "email", "id": e.id,
            "title": f"Email: {e.subject or 'No subject'}",
            "detail": e.to_email or "",
            "date": e.sent_at.isoformat() if e.sent_at else None,
        })

    # Calls
    for c in session.exec(select(CallLog).where(CallLog.client_id == client_id)).all():
        events.append({
            "type": "call", "id": c.id,
            "title": f"Call: {c.phone_number or 'Unknown'}",
            "detail": c.description or "",
            "date": c.createdAt.isoformat() if c.createdAt else None,
        })

    # Invoices
    for inv in session.exec(select(Invoice).where(Invoice.client_id == client_id)).all():
        events.append({
            "type": "invoice", "id": inv.id,
            "title": f"Invoice #{inv.invoice_number} — ${inv.total}",
            "detail": f"Status: {inv.status}",
            "date": inv.created_at.isoformat() if inv.created_at else None,
        })

    # Milestones
    for m in session.exec(select(Milestone).where(Milestone.client_id == client_id)).all():
        events.append({
            "type": "milestone", "id": m.id,
            "title": f"Milestone: {m.title}",
            "detail": f"Status: {m.status}",
            "date": m.created_at.isoformat() if m.created_at else None,
        })

    # Files
    for f in session.exec(select(ClientFileUpload).where(ClientFileUpload.client_id == client_id)).all():
        events.append({
            "type": "file", "id": f.id,
            "title": f"File: {f.filename}",
            "detail": f.description or "",
            "date": f.created_at.isoformat() if f.created_at else None,
        })

    # Sort newest first
    events.sort(key=lambda x: x["date"] or "", reverse=True)
    return {"timeline": events}


# ─────────────────────────────────────────────────────────────────────────────
# Global Search
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/search")
def global_search(q: str = Query("", min_length=1), session: Session = Depends(get_session)):
    results: list[dict] = []
    term = f"%{q}%"

    # Clients
    for c in session.exec(
        select(ClientProfile).where(
            (ClientProfile.companyName.ilike(term)) | (ClientProfile.projectName.ilike(term))
        ).limit(5)
    ).all():
        results.append({"type": "client", "id": c.id, "title": c.companyName or "Client", "sub": c.projectName or "", "link": f"/clients/{c.id}"})

    # Projects
    for p in session.exec(select(Project).where(Project.name.ilike(term)).limit(5)).all():
        results.append({"type": "project", "id": p.id, "title": p.name, "sub": p.status or "", "link": f"/projects/{p.id}"})

    # Tasks
    for t in session.exec(select(Task).where(Task.title.ilike(term)).limit(5)).all():
        results.append({"type": "task", "id": t.id, "title": t.title, "sub": t.status or "", "link": "/tasks"})

    # Invoices
    for inv in session.exec(select(Invoice).where(Invoice.invoice_number.ilike(term)).limit(5)).all():
        results.append({"type": "invoice", "id": inv.id, "title": f"Invoice #{inv.invoice_number}", "sub": f"${inv.total} — {inv.status}", "link": "/invoices"})

    return {"results": results, "query": q}


# ─────────────────────────────────────────────────────────────────────────────
# Monitor Stats (real data)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/monitor-stats")
def monitor_stats(session: Session = Depends(get_session)):
    """Real aggregated stats for the monitor/analytics page."""
    # Total rankings tracked
    all_rankings = session.exec(select(KeywordRankEntry)).all()
    total_keywords = len(set(r.keyword for r in all_rankings))
    avg_position = round(sum(r.position for r in all_rankings if r.position) / max(len(all_rankings), 1), 1) if all_rankings else 0

    # Recent rankings for the table
    recent = session.exec(
        select(KeywordRankEntry).order_by(KeywordRankEntry.recorded_at.desc()).limit(20)
    ).all()
    # De-duplicate by keyword (keep latest)
    seen = set()
    keyword_rows = []
    for r in recent:
        if r.keyword not in seen:
            seen.add(r.keyword)
            keyword_rows.append({
                "keyword": r.keyword,
                "position": r.position,
                "url": r.url,
                "search_engine": r.search_engine,
                "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            })

    # Project completion stats
    projects = session.exec(select(Project)).all()
    completed_projects = len([p for p in projects if p.status == "Completed"])
    total_projects = len(projects)
    avg_progress = round(sum(p.progress or 0 for p in projects) / max(total_projects, 1))

    # Invoice revenue stats
    invoices = session.exec(select(Invoice)).all()
    total_revenue = sum(inv.total for inv in invoices)
    paid_revenue = sum(inv.total for inv in invoices if inv.status == "Paid")
    pending_revenue = sum(inv.total for inv in invoices if inv.status in ("Sent", "Draft"))

    # Weekly activity counts (last 10 weeks)
    weekly_activity = []
    for i in range(9, -1, -1):
        start = datetime.utcnow() - timedelta(weeks=i + 1)
        end = datetime.utcnow() - timedelta(weeks=i)
        count = len(session.exec(
            select(ActivityLog).where(ActivityLog.createdAt >= start, ActivityLog.createdAt < end)
        ).all())
        weekly_activity.append({"week": f"W{10 - i}", "count": count})

    return {
        "total_keywords": total_keywords,
        "avg_position": avg_position,
        "keyword_rows": keyword_rows,
        "total_projects": total_projects,
        "completed_projects": completed_projects,
        "avg_progress": avg_progress,
        "total_revenue": round(total_revenue, 2),
        "paid_revenue": round(paid_revenue, 2),
        "pending_revenue": round(pending_revenue, 2),
        "weekly_activity": weekly_activity,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Setup / Audit
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/setup/verify-domain")
def verify_domain(body: SetupDomainRequest):
    domain = re.sub(r"https?://", "", body.domain).strip("/")
    return {"domain": domain, "verified": True, "message": "Domain looks good"}


@app.post("/audit/trigger")
def trigger_audit(body: dict = {}, session: Session = Depends(get_session)):
    """Real SEO audit: fetches the domain, analyzes HTML for common SEO issues."""
    import httpx
    from bs4 import BeautifulSoup
    import time

    domain = body.get("domain") or body.get("email", "")
    # Try to resolve a client domain from email
    if "@" in domain:
        user = session.exec(select(User).where(User.email == domain)).first()
        if user:
            cp = session.exec(select(ClientProfile).where(ClientProfile.userId == user.id)).first()
            if cp and cp.websiteUrl:
                domain = cp.websiteUrl
    if not domain:
        return {"success": False, "message": "No domain to audit"}

    url = domain if domain.startswith("http") else f"https://{domain}"
    url = url.rstrip("/")

    issues = {}
    health = 100
    page_speed = 0
    issues_count = 0

    try:
        start = time.time()
        r = httpx.get(url, follow_redirects=True, timeout=15, headers={"User-Agent": "SerpHawk-Audit/1.0"})
        load_time = round(time.time() - start, 2)
        page_speed = max(10, min(100, int(100 - load_time * 15)))
        html = r.text
        soup = BeautifulSoup(html, "html.parser")

        # Title
        title_tag = soup.find("title")
        title_text = title_tag.get_text(strip=True) if title_tag else ""
        if not title_text:
            issues["title_tag"] = "Missing — add a unique <title> tag"
            health -= 15
            issues_count += 1
        elif len(title_text) > 70:
            issues["title_tag"] = f"Too long ({len(title_text)} chars) — keep under 60-70"
            health -= 5
            issues_count += 1
        else:
            issues["title_tag"] = f"Pass — '{title_text[:50]}..." if len(title_text) > 50 else f"Pass — '{title_text}'"

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        desc_content = meta_desc["content"] if meta_desc and meta_desc.get("content") else ""
        if not desc_content:
            issues["meta_description"] = "Missing — add a 150-160 char meta description"
            health -= 10
            issues_count += 1
        elif len(desc_content) > 160:
            issues["meta_description"] = f"Too long ({len(desc_content)} chars)"
            health -= 3
            issues_count += 1
        else:
            issues["meta_description"] = "Pass"

        # H1
        h1s = soup.find_all("h1")
        if len(h1s) == 0:
            issues["h1_tag"] = "Missing — every page needs one H1"
            health -= 10
            issues_count += 1
        elif len(h1s) > 1:
            issues["h1_tag"] = f"Multiple H1s found ({len(h1s)}) — use only one"
            health -= 5
            issues_count += 1
        else:
            issues["h1_tag"] = f"Pass — '{h1s[0].get_text(strip=True)[:50]}'"

        # Images without alt
        imgs = soup.find_all("img")
        no_alt = [i for i in imgs if not i.get("alt")]
        if no_alt:
            issues["image_alt_tags"] = f"{len(no_alt)} of {len(imgs)} images missing alt text"
            health -= min(10, len(no_alt) * 2)
            issues_count += len(no_alt)
        else:
            issues["image_alt_tags"] = f"Pass — all {len(imgs)} images have alt text" if imgs else "No images found"

        # HTTPS
        if not url.startswith("https"):
            issues["https"] = "Not using HTTPS — critical security issue"
            health -= 15
            issues_count += 1
        else:
            issues["https"] = "Pass — HTTPS enabled"

        # Canonical
        canonical = soup.find("link", attrs={"rel": "canonical"})
        if not canonical:
            issues["canonical_tag"] = "Missing — add a canonical URL"
            health -= 5
            issues_count += 1
        else:
            issues["canonical_tag"] = "Pass"

        # Viewport
        viewport = soup.find("meta", attrs={"name": "viewport"})
        if not viewport:
            issues["mobile_viewport"] = "Missing — not mobile-friendly"
            health -= 10
            issues_count += 1
        else:
            issues["mobile_viewport"] = "Pass — viewport meta present"

        # Open Graph
        og = soup.find("meta", attrs={"property": "og:title"})
        if not og:
            issues["open_graph"] = "Missing OG tags — poor social sharing"
            health -= 3
            issues_count += 1
        else:
            issues["open_graph"] = "Pass"

        # Internal links count
        links = soup.find_all("a", href=True)
        internal = [l for l in links if l["href"].startswith("/") or domain.replace("https://", "").replace("http://", "") in l["href"]]
        issues["internal_links"] = f"{len(internal)} internal links found" if internal else "No internal links — poor for SEO"
        if not internal:
            health -= 5
            issues_count += 1

        health = max(0, min(100, health))

    except Exception as e:
        return {"success": True, "audit": {
            "health_score": 0, "page_speed_desktop": 0, "issues_count": 1,
            "tech_seo_issues": {"connection": f"Could not reach {url}: {str(e)}"},
            "domain": url, "load_time": 0,
        }}

    return {
        "success": True,
        "audit": {
            "health_score": health,
            "page_speed_desktop": page_speed,
            "issues_count": issues_count,
            "tech_seo_issues": issues,
            "domain": url,
            "load_time": load_time,
        },
    }


@app.get("/audit/export")
def export_audit_pdf(email: str = Query(""), domain: str = Query(""), session: Session = Depends(get_session)):
    """Generate PDF audit report."""
    from fastapi.responses import StreamingResponse
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    # Run a quick audit to get fresh data
    audit_result = trigger_audit({"domain": domain or email}, session)
    audit = audit_result.get("audit", {})

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=50, bottomMargin=40)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("AuditTitle", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#1e293b"))
    heading = ParagraphStyle("AuditH2", parent=styles["Heading2"], fontSize=14, textColor=colors.HexColor("#334155"), spaceBefore=20)
    normal = styles["Normal"]

    elements = []
    elements.append(Paragraph("SERP Hawk — SEO Audit Report", title_style))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f"Domain: {audit.get('domain', domain or 'N/A')}", normal))
    elements.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%B %d, %Y')}", normal))
    elements.append(Spacer(1, 20))

    # Summary table
    summary_data = [
        ["Health Score", f"{audit.get('health_score', 0)}/100"],
        ["Page Speed", f"{audit.get('page_speed_desktop', 0)}/100"],
        ["Issues Found", str(audit.get('issues_count', 0))],
        ["Load Time", f"{audit.get('load_time', 0)}s"],
    ]
    t = Table(summary_data, colWidths=[200, 250])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))

    # Technical findings
    elements.append(Paragraph("Technical SEO Findings", heading))
    for key, val in audit.get("tech_seo_issues", {}).items():
        label = key.replace("_", " ").title()
        status = "PASS" if "Pass" in str(val) else "ISSUE"
        color = "#059669" if status == "PASS" else "#dc2626"
        elements.append(Paragraph(f'<font color="{color}"><b>[{status}]</b></font> {label}: {val}', normal))
        elements.append(Spacer(1, 4))

    elements.append(Spacer(1, 30))
    elements.append(Paragraph("— Generated by SERP Hawk | Team DaPros", ParagraphStyle("Footer", parent=normal, fontSize=9, textColor=colors.grey)))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="serphawk-audit-{(domain or "report").replace("https://","").replace("/","_")}.pdf"'
    })


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "app": "SerpHawk CRM API", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# Tasks & Kanban Board
# ─────────────────────────────────────────────────────────────────────────────
def _task_dict(t: Task, session: Session) -> dict:
    assignee = session.get(User, t.assigned_to) if t.assigned_to else None
    creator = session.get(User, t.created_by) if t.created_by else None
    client = session.get(ClientProfile, t.client_id) if t.client_id else None
    client_user = session.get(User, client.userId) if client and client.userId else None
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "due_date": t.due_date,
        "client_id": t.client_id,
        "client_name": client_user.name if client_user else (client.companyName if client else None),
        "project_id": t.project_id,
        "assigned_to": t.assigned_to,
        "assignee_name": assignee.name if assignee else None,
        "created_by": t.created_by,
        "creator_name": creator.name if creator else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@app.get("/tasks")
def list_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    client_id: Optional[int] = None,
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    from sqlalchemy import cast, String as SAString
    q = select(Task).order_by(Task.created_at.desc())
    if status:
        # Cast the enum column to String for comparison to avoid
        # PostgreSQL "invalid input value for enum taskstatus" errors
        # when the stored enum casing differs from what the client passes.
        q = q.where(cast(Task.status, SAString).ilike(status))
    if assigned_to:
        q = q.where(Task.assigned_to == assigned_to)
    if client_id:
        q = q.where(Task.client_id == client_id)
    if project_id:
        q = q.where(Task.project_id == project_id)
    tasks = session.exec(q).all()
    return {"tasks": [_task_dict(t, session) for t in tasks]}


@app.post("/tasks")
def create_task(body: TaskCreateRequest, session: Session = Depends(get_session)):
    data = body.model_dump()
    data["status"] = _normalize_task_status(data.get("status"))
    t = Task(**data)
    session.add(t)
    session.commit()
    session.refresh(t)
    # Notify assigned user
    if t.assigned_to:
        notif = Notification(
            user_id=t.assigned_to,
            title="New Task Assigned",
            message=f"You have been assigned: {t.title}",
            type="info",
            link="/tasks",
        )
        session.add(notif)
        session.commit()
        
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Task Created", _task_dict(t, session), f"{base_url}/tasks")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"task": _task_dict(t, session)}


@app.get("/tasks/{task_id}")
def get_task(task_id: int, session: Session = Depends(get_session)):
    t = session.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    comments = session.exec(
        select(TaskComment).where(TaskComment.task_id == task_id).order_by(TaskComment.created_at)
    ).all()
    result = _task_dict(t, session)
    result["comments"] = [
        {
            "id": c.id,
            "content": c.content,
            "author_id": c.author_id,
            "author_name": (lambda u: u.name if u else "Unknown")(session.get(User, c.author_id)),
            "created_at": c.created_at.isoformat(),
        }
        for c in comments
    ]
    return {"task": result}


@app.put("/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdateRequest, session: Session = Depends(get_session)):
    t = session.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates:
        updates["status"] = _normalize_task_status(updates["status"])
    for field, val in updates.items():
        setattr(t, field, val)
    t.updated_at = datetime.utcnow()
    session.add(t)
    session.commit()
    session.refresh(t)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Task Updated", _task_dict(t, session), f"{base_url}/tasks")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"task": _task_dict(t, session)}


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    t = session.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(t)
    session.commit()
    return {"ok": True}


@app.post("/tasks/{task_id}/comments")
def add_task_comment(
    task_id: int, body: TaskCommentCreateRequest, session: Session = Depends(get_session)
):
    t = session.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    c = TaskComment(task_id=task_id, author_id=body.author_id, content=body.content)
    session.add(c)
    session.commit()
    session.refresh(c)
    author = session.get(User, c.author_id) if c.author_id else None
    return {
        "id": c.id,
        "content": c.content,
        "author_id": c.author_id,
        "author_name": author.name if author else "Unknown",
        "created_at": c.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Invoices & Payments
# ─────────────────────────────────────────────────────────────────────────────
def _invoice_dict(inv: Invoice, session: Session) -> dict:
    cp = session.get(ClientProfile, inv.client_id) if inv.client_id else None
    u = session.get(User, cp.userId) if cp and cp.userId else None
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "client_id": inv.client_id,
        "client_name": u.name if u else (cp.companyName if cp else None),
        "client_email": u.email if u else None,
        "service_request_id": inv.service_request_id,
        "amount": inv.amount,
        "tax": inv.tax,
        "total": inv.total,
        "status": inv.status,
        "due_date": inv.due_date,
        "notes": inv.notes,
        "line_items": inv.line_items or [],
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "created_at": inv.created_at.isoformat(),
        "updated_at": inv.updated_at.isoformat(),
    }


def _generate_invoice_number(session: Session) -> str:
    count = len(session.exec(select(Invoice)).all())
    return f"INV-{datetime.utcnow().year}-{str(count + 1).zfill(4)}"


@app.get("/invoices")
def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    q = select(Invoice).order_by(Invoice.created_at.desc())
    if client_id:
        q = q.where(Invoice.client_id == client_id)
    if status:
        q = q.where(Invoice.status == status)
    invoices = session.exec(q).all()
    return {"invoices": [_invoice_dict(i, session) for i in invoices]}


@app.post("/invoices")
def create_invoice(body: InvoiceCreateRequest, session: Session = Depends(get_session)):
    total = round(body.amount + body.tax, 2)
    inv = Invoice(
        invoice_number=_generate_invoice_number(session),
        client_id=body.client_id,
        service_request_id=body.service_request_id,
        amount=body.amount,
        tax=body.tax,
        total=total,
        due_date=body.due_date,
        notes=body.notes,
        line_items=body.line_items or [],
    )
    session.add(inv)
    session.commit()
    session.refresh(inv)

    # --- Add invoice to client my-files ---
    from database import ClientFileUpload
    invoice_filename = f"Invoice_{inv.invoice_number}.json"
    invoice_file_url = f"/api/invoices/{inv.id}/download"  # You may want to implement this endpoint to serve PDF/JSON
    file_entry = ClientFileUpload(
        client_id=inv.client_id,
        uploaded_by=None,  # Admin
        filename=invoice_filename,
        file_url=invoice_file_url,
        file_size=None,
        mime_type="application/json",
        description=f"Invoice {inv.invoice_number} generated for client.",
    )
    session.add(file_entry)
    session.commit()

    # Email notification to client
    if inv.client_id:
        cp = session.get(ClientProfile, inv.client_id)
        if cp and cp.userId:
            user = session.get(User, cp.userId)
            if user and user.email:
                _send_notification_email(
                    user.email,
                    f"New Invoice #{inv.invoice_number} from DaPros",
                    f"<h2>New Invoice</h2><p>Hi {cp.companyName or 'there'},</p><p>A new invoice <strong>#{inv.invoice_number}</strong> for <strong>${inv.total}</strong> has been created.</p><p>Please log in to your dashboard to view details.</p><p>— Team DaPros</p>",
                )
            notif = Notification(
                user_id=cp.userId,
                title="New Invoice Created",
                message=f"Invoice #{inv.invoice_number} for ${inv.total} is ready.",
                type="info",
                link="/invoices",
            )
            session.add(notif)
            session.commit()

    return {"invoice": _invoice_dict(inv, session)}


@app.post("/invoices/from-quote/{request_id}")
def invoice_from_quote(request_id: int, session: Session = Depends(get_session)):
    sr = session.get(ServiceRequest, request_id)
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    if not sr.quoted_amount:
        raise HTTPException(status_code=400, detail="No quoted amount on this request")
    svc = session.get(ServiceCatalog, sr.service_id)
    inv = Invoice(
        invoice_number=_generate_invoice_number(session),
        client_id=sr.client_id,
        service_request_id=sr.id,
        amount=sr.quoted_amount,
        tax=0.0,
        total=sr.quoted_amount,
        line_items=[{"description": svc.name if svc else "Service", "amount": sr.quoted_amount}],
    )
    session.add(inv)
    session.commit()
    session.refresh(inv)
    # Notify client
    cp = session.get(ClientProfile, sr.client_id)
    if cp and cp.userId:
        notif = Notification(
            user_id=cp.userId,
            title="New Invoice Generated",
            message=f"Invoice {inv.invoice_number} for ${inv.total:.2f} has been created.",
            type="info",
            link="/invoices",
        )
        session.add(notif)
        session.commit()
    return {"invoice": _invoice_dict(inv, session)}


@app.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, session: Session = Depends(get_session)):
    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"invoice": _invoice_dict(inv, session)}


@app.put("/invoices/{invoice_id}")
def update_invoice(
    invoice_id: int, body: InvoiceUpdateRequest, session: Session = Depends(get_session)
):
    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    updates = body.model_dump(exclude_unset=True)
    for field, val in updates.items():
        setattr(inv, field, val)
    if "amount" in updates or "tax" in updates:
        inv.total = round((inv.amount or 0) + (inv.tax or 0), 2)
    if updates.get("status") == "Paid":
        inv.paid_at = datetime.utcnow()
    inv.updated_at = datetime.utcnow()
    session.add(inv)
    session.commit()
    session.refresh(inv)

    # Notify client when invoice is sent
    if updates.get("status") == "Sent" and inv.client_id:
        cp = session.get(ClientProfile, inv.client_id)
        if cp and cp.userId:
            user = session.get(User, cp.userId)
            if user and user.email:
                _send_notification_email(
                    user.email,
                    f"Invoice #{inv.invoice_number} Sent — DaPros",
                    f"<h2>Invoice Ready for Payment</h2><p>Hi {cp.companyName or 'there'},</p><p>Invoice <strong>#{inv.invoice_number}</strong> for <strong>${inv.total}</strong> has been sent to you.</p><p>Due date: {inv.due_date or 'TBD'}</p><p>— Team DaPros</p>",
                )

    return {"invoice": _invoice_dict(inv, session)}


@app.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    session.delete(inv)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Notifications
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/notifications/{user_id}")
def get_notifications(
    user_id: int,
    unread_only: bool = False,
    session: Session = Depends(get_session),
):
    q = select(Notification).where(Notification.user_id == user_id).order_by(
        Notification.created_at.desc()
    )
    if unread_only:
        q = q.where(Notification.is_read == False)
    
    try:
        notifs = session.exec(q).all()
    except Exception as e:
        print(f"Warning: Failed to fetch notifications: {e}")
        notifs = []
        session.rollback()
    
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifs
        ],
        "unread_count": sum(1 for n in notifs if not n.is_read),
    }


@app.post("/notifications")
def create_notification(body: NotificationCreateRequest, session: Session = Depends(get_session)):
    n = Notification(**body.model_dump())
    session.add(n)
    session.commit()
    session.refresh(n)
    return {"id": n.id, "title": n.title}


@app.put("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, session: Session = Depends(get_session)):
    n = session.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    session.add(n)
    session.commit()
    return {"ok": True}


@app.put("/notifications/mark-all-read/{user_id}")
def mark_all_read(user_id: int, session: Session = Depends(get_session)):
    notifs = session.exec(
        select(Notification).where(Notification.user_id == user_id, Notification.is_read == False)
    ).all()
    for n in notifs:
        n.is_read = True
        session.add(n)
    session.commit()
    return {"ok": True, "marked": len(notifs)}


# ─────────────────────────────────────────────────────────────────────────────
# Milestones
# ─────────────────────────────────────────────────────────────────────────────
def _milestone_dict(m: Milestone) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "description": m.description,
        "project_id": m.project_id,
        "client_id": m.client_id,
        "due_date": m.due_date,
        "status": m.status,
        "order": m.order,
        "created_at": m.created_at.isoformat(),
    }


@app.get("/milestones")
def list_milestones(
    client_id: Optional[int] = None,
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    q = select(Milestone).order_by(Milestone.order, Milestone.created_at)
    if client_id:
        q = q.where(Milestone.client_id == client_id)
    if project_id:
        q = q.where(Milestone.project_id == project_id)
    milestones = session.exec(q).all()
    return {"milestones": [_milestone_dict(m) for m in milestones]}


@app.post("/milestones")
def create_milestone(body: MilestoneCreateRequest, session: Session = Depends(get_session)):
    m = Milestone(**body.model_dump())
    session.add(m)
    session.commit()
    session.refresh(m)
    return {"milestone": _milestone_dict(m)}


@app.put("/milestones/{milestone_id}")
def update_milestone(
    milestone_id: int, body: MilestoneUpdateRequest, session: Session = Depends(get_session)
):
    m = session.get(Milestone, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(m, field, val)
    session.add(m)
    session.commit()
    session.refresh(m)

    # Notify client when milestone is achieved
    if body.status == "Achieved" and m.client_id:
        cp = session.get(ClientProfile, m.client_id)
        if cp and cp.userId:
            notif = Notification(
                user_id=cp.userId,
                title="Milestone Achieved! 🎉",
                message=f"'{m.title}' has been marked as achieved.",
                type="success",
                link="/milestones",
            )
            session.add(notif)
            session.commit()
            user = session.get(User, cp.userId)
            if user and user.email:
                _send_notification_email(
                    user.email,
                    f"Milestone Achieved: {m.title} — DaPros",
                    f"<h2>🎉 Milestone Achieved!</h2><p>Hi {cp.companyName or 'there'},</p><p>Great news! The milestone <strong>{m.title}</strong> has been completed.</p><p>Log in to see your progress.</p><p>— Team DaPros</p>",
                )

    return {"milestone": _milestone_dict(m)}


@app.delete("/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, session: Session = Depends(get_session)):
    m = session.get(Milestone, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    session.delete(m)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# NPS Surveys
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/nps")
def list_nps_surveys(client_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(NPSSurvey).order_by(NPSSurvey.created_at.desc())
    if client_id:
        q = q.where(NPSSurvey.client_id == client_id)
    surveys = session.exec(q).all()
    return {
        "surveys": [
            {
                "id": s.id,
                "client_id": s.client_id,
                "score": s.score,
                "feedback": s.feedback,
                "triggered_by": s.triggered_by,
                "responded_at": s.responded_at.isoformat() if s.responded_at else None,
                "created_at": s.created_at.isoformat(),
            }
            for s in surveys
        ]
    }


@app.post("/nps/trigger/{client_id}")
def trigger_nps(
    client_id: int,
    triggered_by: str = "manual",
    session: Session = Depends(get_session),
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    s = NPSSurvey(client_id=client_id, triggered_by=triggered_by)
    session.add(s)
    session.commit()
    session.refresh(s)
    # Notify client
    if cp.userId:
        notif = Notification(
            user_id=cp.userId,
            title="Share Your Feedback",
            message="We'd love to know how we're doing! Please rate your experience.",
            type="info",
            link=f"/survey/{s.id}",
        )
        session.add(notif)
        session.commit()
    return {"survey_id": s.id}


@app.post("/nps/{survey_id}/respond")
def respond_nps(survey_id: int, body: NPSRespondRequest, session: Session = Depends(get_session)):
    s = session.get(NPSSurvey, survey_id)
    if not s:
        raise HTTPException(status_code=404, detail="Survey not found")
    s.score = body.score
    s.feedback = body.feedback
    s.responded_at = datetime.utcnow()
    session.add(s)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Proposals & Contracts
# ─────────────────────────────────────────────────────────────────────────────
def _proposal_dict(p: Proposal, session: Session) -> dict:
    cp = session.get(ClientProfile, p.client_id) if p.client_id else None
    u = session.get(User, cp.userId) if cp and cp.userId else None
    creator = session.get(User, p.created_by) if p.created_by else None
    return {
        "id": p.id,
        "title": p.title,
        "client_id": p.client_id,
        "client_name": u.name if u else (cp.companyName if cp else None),
        "service_request_id": p.service_request_id,
        "content": p.content,
        "status": p.status,
        "valid_until": p.valid_until,
        "total_value": p.total_value,
        "signed_at": p.signed_at.isoformat() if p.signed_at else None,
        "created_by": p.created_by,
        "creator_name": creator.name if creator else None,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


@app.get("/proposals")
def list_proposals(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    q = select(Proposal).order_by(Proposal.created_at.desc())
    if client_id:
        q = q.where(Proposal.client_id == client_id)
    if status:
        q = q.where(Proposal.status == status)
    proposals = session.exec(q).all()
    return {"proposals": [_proposal_dict(p, session) for p in proposals]}


@app.post("/proposals")
def create_proposal(body: ProposalCreateRequest, session: Session = Depends(get_session)):
    p = Proposal(**body.model_dump())
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"proposal": _proposal_dict(p, session)}


@app.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: int, session: Session = Depends(get_session)):
    p = session.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {"proposal": _proposal_dict(p, session)}


@app.put("/proposals/{proposal_id}")
def update_proposal(
    proposal_id: int, body: ProposalUpdateRequest, session: Session = Depends(get_session)
):
    p = session.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(p, field, val)
    if body.status == "Accepted":
        p.signed_at = datetime.utcnow()
    p.updated_at = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    # Notify client when proposal is sent
    if body.status == "Sent" and p.client_id:
        cp = session.get(ClientProfile, p.client_id)
        if cp and cp.userId:
            notif = Notification(
                user_id=cp.userId,
                title="New Proposal Ready",
                message=f"A proposal '{p.title}' has been sent for your review.",
                type="info",
                link=f"/proposals/{p.id}",
            )
            session.add(notif)
            session.commit()
            # Email notification
            user = session.get(User, cp.userId)
            if user and user.email:
                _send_notification_email(
                    user.email,
                    f"New Proposal: {p.title} — DaPros",
                    f"<h2>Proposal Ready for Review</h2><p>Hi {cp.companyName or 'there'},</p><p>A new proposal <strong>{p.title}</strong> has been sent for your review.</p><p>Please log in to your dashboard to accept or decline.</p><p>— Team DaPros</p>",
                )
    # Notify admins when client responds to a proposal
    if body.status in ("Accepted", "Rejected", "Demo Requested") and p.client_id:
        cp = session.get(ClientProfile, p.client_id)
        client_name = cp.companyName if cp else f"Client #{p.client_id}"
        status_label = body.status.lower()
        admins = session.exec(select(User).where(User.role == "Admin")).all()
        for admin in admins:
            notif = Notification(
                user_id=admin.id,
                title=f"Proposal {body.status}",
                message=f"{client_name} has {status_label} the proposal '{p.title}'.",
                type="success" if body.status == "Accepted" else ("warning" if body.status == "Demo Requested" else "info"),
                link="/proposals",
            )
            session.add(notif)
        session.commit()
    return {"proposal": _proposal_dict(p, session)}


@app.delete("/proposals/{proposal_id}")
def delete_proposal(proposal_id: int, session: Session = Depends(get_session)):
    p = session.get(Proposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    session.delete(p)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Client File Uploads
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/clients/{client_id}/files")
def list_client_files(client_id: int, session: Session = Depends(get_session)):
    files = session.exec(
        select(ClientFileUpload)
        .where(ClientFileUpload.client_id == client_id)
        .order_by(ClientFileUpload.created_at.desc())
    ).all()
    return {
        "files": [
            {
                "id": f.id,
                "filename": f.filename,
                "file_url": f.file_url,
                "file_size": f.file_size,
                "mime_type": f.mime_type,
                "description": f.description,
                "uploaded_by": f.uploaded_by,
                "created_at": f.created_at.isoformat(),
            }
            for f in files
        ]
    }


import uuid as _uuid

@app.post("/upload-file")
async def upload_file_to_server(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    uploaded_by: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    session: Session = Depends(get_session),
):
    """Upload a real file from device, save to static/uploads/, create DB record."""
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")

    # Sanitize filename and make unique
    safe_name = re.sub(r'[^\w.\-]', '_', file.filename or "file")
    unique_name = f"{_uuid.uuid4().hex[:8]}_{safe_name}"
    upload_dir = os.path.join("static", "uploads")
    file_path = os.path.join(upload_dir, unique_name)

    contents = await file.read()
    with open(file_path, "wb") as fh:
        fh.write(contents)

    file_url = f"/static/uploads/{unique_name}"
    file_size = len(contents)

    record = ClientFileUpload(
        client_id=client_id,
        uploaded_by=uploaded_by,
        filename=file.filename or safe_name,
        file_url=file_url,
        file_size=file_size,
        mime_type=file.content_type,
        description=description,
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    return {
        "id": record.id,
        "filename": record.filename,
        "file_url": file_url,
        "file_size": file_size,
        "mime_type": record.mime_type,
        "created_at": record.created_at.isoformat(),
    }


@app.post("/clients/{client_id}/files")
def upload_client_file(
    client_id: int, body: FileUploadRequest, session: Session = Depends(get_session)
):
    cp = session.get(ClientProfile, client_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Client not found")
    f = ClientFileUpload(
        client_id=client_id,
        uploaded_by=body.uploaded_by,
        filename=body.filename,
        file_url=body.file_url,
        file_size=body.file_size,
        mime_type=body.mime_type,
        description=body.description,
    )
    session.add(f)
    session.commit()
    session.refresh(f)
    return {
        "id": f.id,
        "filename": f.filename,
        "file_url": f.file_url,
        "created_at": f.created_at.isoformat(),
    }


@app.delete("/files/{file_id}")
def delete_file(file_id: int, session: Session = Depends(get_session)):
    f = session.get(ClientFileUpload, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    session.delete(f)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Keyword Rank Tracker
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/rankings")
def list_rankings(
    client_id: Optional[int] = None,
    keyword: Optional[str] = None,
    session: Session = Depends(get_session),
):
    q = select(KeywordRankEntry).order_by(KeywordRankEntry.recorded_at.desc())
    if client_id:
        q = q.where(KeywordRankEntry.client_id == client_id)
    if keyword:
        q = q.where(KeywordRankEntry.keyword.ilike(f"%{keyword}%"))
    entries = session.exec(q).all()
    return {
        "rankings": [
            {
                "id": e.id,
                "client_id": e.client_id,
                "keyword": e.keyword,
                "position": e.position,
                "url": e.url,
                "search_engine": e.search_engine,
                "notes": e.notes,
                "recorded_at": e.recorded_at.isoformat(),
                "recorded_by": e.recorded_by,
            }
            for e in entries
        ]
    }


@app.post("/rankings")
def add_ranking(body: KeywordRankRequest, session: Session = Depends(get_session)):
    e = KeywordRankEntry(**body.model_dump())
    session.add(e)
    session.commit()
    session.refresh(e)
    return {
        "id": e.id,
        "keyword": e.keyword,
        "position": e.position,
        "recorded_at": e.recorded_at.isoformat(),
    }


@app.get("/rankings/history/{client_id}/{keyword}")
def ranking_history(client_id: int, keyword: str, session: Session = Depends(get_session)):
    entries = session.exec(
        select(KeywordRankEntry)
        .where(
            KeywordRankEntry.client_id == client_id,
            KeywordRankEntry.keyword == keyword,
        )
        .order_by(KeywordRankEntry.recorded_at)
    ).all()
    return {
        "keyword": keyword,
        "history": [
            {"position": e.position, "recorded_at": e.recorded_at.isoformat()}
            for e in entries
        ],
    }


@app.delete("/rankings/{entry_id}")
def delete_ranking(entry_id: int, session: Session = Depends(get_session)):
    e = session.get(KeywordRankEntry, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Ranking entry not found")
    session.delete(e)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# PDF Generation — Invoices & Proposals
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, session: Session = Depends(get_session)):
    """Generate a professional PDF for an invoice."""
    from fastapi.responses import StreamingResponse
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    inv = session.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    client = session.get(ClientProfile, inv.client_id) if inv.client_id else None
    client_name = ""
    if client:
        user = session.get(User, client.userId) if client.userId else None
        client_name = client.companyName or (user.name if user else f"Client #{client.id}")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=50, bottomMargin=40)
    styles = getSampleStyleSheet()
    title_s = ParagraphStyle("ITitle", parent=styles["Title"], fontSize=24, textColor=colors.HexColor("#1e293b"))
    h2 = ParagraphStyle("IH2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#334155"), spaceBefore=18)
    normal = styles["Normal"]
    small = ParagraphStyle("Small", parent=normal, fontSize=9, textColor=colors.grey)

    els = []
    els.append(Paragraph("INVOICE", title_s))
    els.append(Spacer(1, 6))
    els.append(Paragraph(f"<b>{inv.invoice_number}</b>", ParagraphStyle("Num", parent=normal, fontSize=14, textColor=colors.HexColor("#4f46e5"))))
    els.append(Spacer(1, 12))

    # Info table
    info = [
        ["Bill To:", client_name or "—"],
        ["Date:", inv.created_at.strftime("%B %d, %Y") if inv.created_at else "—"],
        ["Due Date:", inv.due_date or "—"],
        ["Status:", inv.status],
    ]
    it = Table(info, colWidths=[100, 350])
    it.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
    ]))
    els.append(it)
    els.append(Spacer(1, 18))

    # Line items
    els.append(Paragraph("Line Items", h2))
    items_data = [["#", "Description", "Amount"]]
    for idx, li in enumerate(inv.line_items or [], 1):
        items_data.append([str(idx), li.get("description", ""), f"${float(li.get('amount', 0)):.2f}"])
    items_data.append(["", "Subtotal", f"${inv.amount:.2f}"])
    items_data.append(["", "Tax", f"${inv.tax:.2f}"])
    items_data.append(["", "TOTAL", f"${inv.total:.2f}"])

    lt = Table(items_data, colWidths=[40, 310, 100])
    lt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEABOVE", (0, -3), (-1, -3), 1, colors.HexColor("#cbd5e1")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#1e293b")),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
    ]))
    els.append(lt)

    if inv.notes:
        els.append(Spacer(1, 14))
        els.append(Paragraph("Notes", h2))
        els.append(Paragraph(inv.notes, normal))

    els.append(Spacer(1, 30))
    els.append(Paragraph("— SERP Hawk | Team DaPros", small))

    doc.build(els)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{inv.invoice_number}.pdf"'
    })


@app.get("/proposals/{proposal_id}/pdf")
def proposal_pdf(proposal_id: int, session: Session = Depends(get_session)):
    """Generate a professional PDF for a proposal."""
    from fastapi.responses import StreamingResponse
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    prop = session.get(Proposal, proposal_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Proposal not found")
    client = session.get(ClientProfile, prop.client_id) if prop.client_id else None
    client_name = ""
    if client:
        user = session.get(User, client.userId) if client.userId else None
        client_name = client.companyName or (user.name if user else f"Client #{client.id}")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=50, bottomMargin=40)
    styles = getSampleStyleSheet()
    title_s = ParagraphStyle("PTitle", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#1e293b"))
    h2 = ParagraphStyle("PH2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#334155"), spaceBefore=18)
    normal = styles["Normal"]
    small = ParagraphStyle("PSmall", parent=normal, fontSize=9, textColor=colors.grey)

    els = []
    els.append(Paragraph("PROPOSAL", title_s))
    els.append(Spacer(1, 10))

    info = [
        ["Title:", prop.title],
        ["Client:", client_name or "—"],
        ["Status:", prop.status],
        ["Value:", f"${prop.total_value:,.2f}" if prop.total_value else "—"],
        ["Valid Until:", prop.valid_until or "—"],
        ["Created:", prop.created_at.strftime("%B %d, %Y") if prop.created_at else "—"],
    ]
    it = Table(info, colWidths=[100, 350])
    it.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
    ]))
    els.append(it)
    els.append(Spacer(1, 18))

    if prop.content:
        els.append(Paragraph("Proposal Details", h2))
        for para in prop.content.split("\\n"):
            if para.strip():
                els.append(Paragraph(para.strip(), normal))
                els.append(Spacer(1, 4))

    els.append(Spacer(1, 30))
    els.append(Paragraph("— SERP Hawk | Team DaPros", small))

    doc.build(els)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="proposal-{prop.id}.pdf"'
    })


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Real-Time Chat
# ─────────────────────────────────────────────────────────────────────────────
import json as _json

class ConnectionManager:
    """Keeps track of active WebSocket connections per thread."""
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}  # thread_id -> list of ws

    async def connect(self, thread_id: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(thread_id, []).append(ws)

    def disconnect(self, thread_id: int, ws: WebSocket):
        conns = self.active.get(thread_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, thread_id: int, data: dict, exclude: WebSocket | None = None):
        for ws in self.active.get(thread_id, []):
            if ws is not exclude:
                try:
                    await ws.send_json(data)
                except Exception:
                    pass

ws_manager = ConnectionManager()

@app.websocket("/ws/chat/{thread_id}")
async def ws_chat(websocket: WebSocket, thread_id: int):
    await ws_manager.connect(thread_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            data = _json.loads(raw)
            action = data.get("action")

            if action == "message":
                # Save message to DB
                with Session(engine) as session:
                    msg = ChatMessage(
                        thread_id=thread_id,
                        sender_id=data["sender_id"],
                        content=data["content"],
                    )
                    session.add(msg)
                    session.commit()
                    session.refresh(msg)
                    sender = session.get(User, msg.sender_id)
                    payload = {
                        "type": "new_message",
                        "message": {
                            "id": msg.id,
                            "sender": (sender.name or sender.email) if sender else "Unknown",
                            "sender_id": msg.sender_id,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": False,
                        },
                    }
                await ws_manager.broadcast(thread_id, payload)

            elif action == "typing":
                await ws_manager.broadcast(
                    thread_id,
                    {"type": "typing", "user_id": data.get("user_id"), "user_name": data.get("user_name")},
                    exclude=websocket,
                )

            elif action == "stop_typing":
                await ws_manager.broadcast(
                    thread_id,
                    {"type": "stop_typing", "user_id": data.get("user_id")},
                    exclude=websocket,
                )

            elif action == "read_receipt":
                msg_ids = data.get("message_ids", [])
                if msg_ids:
                    with Session(engine) as session:
                        for mid in msg_ids:
                            m = session.get(ChatMessage, mid)
                            if m and not m.is_read and m.sender_id != data.get("user_id"):
                                m.is_read = True
                                m.read_at = datetime.utcnow()
                                session.add(m)
                        session.commit()
                    await ws_manager.broadcast(
                        thread_id,
                        {"type": "read_receipt", "message_ids": msg_ids, "read_by": data.get("user_id")},
                        exclude=websocket,
                    )

    except WebSocketDisconnect:
        ws_manager.disconnect(thread_id, websocket)
    except Exception:
        ws_manager.disconnect(thread_id, websocket)


# ─────────────────────────────────────────────────────────────────────────────
# Password Change
# ─────────────────────────────────────────────────────────────────────────────
class PasswordChangeRequest(BaseModel):
    user_id: int
    current_password: str
    new_password: str

@app.post("/change-password")
def change_password(body: PasswordChangeRequest, session: Session = Depends(get_session)):
    user = session.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not _verify_password(body.current_password, user):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    user.password = _hash_password(body.new_password)
    user.updatedAt = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"ok": True, "message": "Password updated successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# Webhooks / Zapier Integration
# ─────────────────────────────────────────────────────────────────────────────
import secrets as _secrets

# In-memory webhook store (in production, use a DB table)
_webhooks: Dict[str, dict] = {}  # id -> {url, events, secret, created_at, name}

class WebhookRegisterRequest(BaseModel):
    url: str
    events: List[str]   # e.g. ["client.created", "invoice.paid", "message.sent"]
    name: Optional[str] = None

@app.post("/webhooks")
def register_webhook(body: WebhookRegisterRequest):
    valid_events = [
        "client.created", "client.updated", "client.deleted",
        "invoice.created", "invoice.paid", "invoice.overdue",
        "message.sent", "task.created", "task.completed",
        "proposal.sent", "proposal.accepted", "proposal.rejected",
        "service.requested", "service.quoted", "service.accepted",
    ]
    for ev in body.events:
        if ev not in valid_events:
            raise HTTPException(status_code=400, detail=f"Invalid event: {ev}. Valid events: {valid_events}")
    wh_id = _secrets.token_urlsafe(16)
    wh_secret = _secrets.token_urlsafe(32)
    _webhooks[wh_id] = {
        "id": wh_id,
        "url": str(body.url),
        "events": body.events,
        "secret": wh_secret,
        "name": body.name or "Unnamed Webhook",
        "created_at": datetime.utcnow().isoformat(),
    }
    return {"webhook_id": wh_id, "secret": wh_secret, "events": body.events}

@app.get("/webhooks")
def list_webhooks():
    return {"webhooks": [
        {k: v for k, v in wh.items() if k != "secret"}
        for wh in _webhooks.values()
    ]}

@app.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: str):
    if webhook_id not in _webhooks:
        raise HTTPException(status_code=404, detail="Webhook not found")
    del _webhooks[webhook_id]
    return {"ok": True}

import httpx as _httpx
import hmac as _hmac
import hashlib as _hashlib_hmac

async def _fire_webhooks(event: str, payload: dict):
    """Fire all registered webhooks for an event. Non-blocking, best-effort."""
    body_str = _json.dumps(payload)
    for wh in _webhooks.values():
        if event in wh["events"]:
            sig = _hmac.new(wh["secret"].encode(), body_str.encode(), _hashlib_hmac.sha256).hexdigest()
            try:
                async with _httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        wh["url"],
                        content=body_str,
                        headers={
                            "Content-Type": "application/json",
                            "X-Webhook-Event": event,
                            "X-Webhook-Signature": f"sha256={sig}",
                        },
                    )
            except Exception as e:
                print(f"[Webhook fire failed] {event} -> {wh['url']}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Competitor Analysis (Real Data)
# ─────────────────────────────────────────────────────────────────────────────
class CompetitorAddRequest(BaseModel):
    client_id: int
    competitor_domain: str

@app.post("/competitors/analyze")
async def analyze_competitor(body: CompetitorAddRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    client = session.get(ClientProfile, body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get client keywords for gap analysis
    client_keywords = client.targetKeywords or []
    client_website = client.websiteUrl or ""

    # Scrape competitor site
    from modules.scraper import scrape_website
    competitor_content = await scrape_website(body.competitor_domain)
    if competitor_content.startswith("ERROR"):
        competitor_content = f"Could not scrape {body.competitor_domain}"

    # Scrape client site for comparison
    client_content = ""
    if client_website:
        client_content = await scrape_website(client_website)
        if client_content.startswith("ERROR"):
            client_content = ""

    # Use LLM to analyze competitor vs client
    from modules.llm_engine import get_openai_client
    prompt = f"""Analyze the competitive landscape between a client and their competitor.

CLIENT INFO:
- Website: {client_website}
- Target Keywords: {', '.join(client_keywords) if client_keywords else 'Not specified'}
- Site Content Summary: {client_content[:3000] if client_content else 'Not available'}

COMPETITOR INFO:
- Domain: {body.competitor_domain}
- Site Content Summary: {competitor_content[:3000]}

Return a JSON object with these exact keys:
{{
  "keyword_gap": {{
    "competitor_keywords": ["list of keywords competitor targets that client doesn't"],
    "shared_keywords": ["keywords both target"],
    "client_unique": ["keywords only client targets"],
    "opportunity_score": 1-100
  }},
  "content_analysis": {{
    "competitor_strengths": ["3-5 content strengths"],
    "competitor_weaknesses": ["2-3 content gaps"],
    "content_gap_opportunities": ["3-5 specific content ideas client should create"]
  }},
  "backlink_estimate": {{
    "competitor_authority": "Low/Medium/High",
    "estimated_referring_domains": "rough range like 50-200",
    "link_building_opportunities": ["3-5 ideas"]
  }},
  "overall_threat_level": "Low/Medium/High",
  "action_items": ["5 specific actionable recommendations"]
}}
Return ONLY valid JSON, no markdown."""

    try:
        oai = get_openai_client()
        resp = oai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        analysis_raw = resp.choices[0].message.content or ""
    except Exception as e:
        analysis_raw = "{}"

    # Parse LLM response
    try:
        import json as json_mod
        cleaned = analysis_raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        analysis = json_mod.loads(cleaned)
    except Exception:
        analysis = {
            "keyword_gap": {"competitor_keywords": [], "shared_keywords": [], "client_unique": client_keywords, "opportunity_score": 50},
            "content_analysis": {"competitor_strengths": ["Could not analyze"], "competitor_weaknesses": [], "content_gap_opportunities": []},
            "backlink_estimate": {"competitor_authority": "Unknown", "estimated_referring_domains": "Unknown", "link_building_opportunities": []},
            "overall_threat_level": "Unknown",
            "action_items": ["Manual analysis recommended"],
        }

    # Save to database
    existing = session.exec(
        select(CompetitorAnalysis)
        .where(CompetitorAnalysis.clientId == body.client_id)
        .where(CompetitorAnalysis.competitor_domain == body.competitor_domain)
    ).first()

    if existing:
        existing.keyword_gap_data = analysis.get("keyword_gap", {})
        existing.backlink_comparison = analysis.get("backlink_estimate", {})
        existing.content_benchmarks = analysis.get("content_analysis", {})
        existing.last_updated = datetime.utcnow()
        session.add(existing)
    else:
        ca = CompetitorAnalysis(
            clientId=body.client_id,
            competitor_domain=body.competitor_domain,
            keyword_gap_data=analysis.get("keyword_gap", {}),
            backlink_comparison=analysis.get("backlink_estimate", {}),
            content_benchmarks=analysis.get("content_analysis", {}),
        )
        session.add(ca)

    session.commit()

    return {
        "competitor_domain": body.competitor_domain,
        "analysis": analysis,
    }

@app.get("/competitors/{client_id}")
def get_competitors(client_id: int, session: Session = Depends(get_session)):
    analyses = session.exec(
        select(CompetitorAnalysis).where(CompetitorAnalysis.clientId == client_id)
    ).all()
    return {"competitors": [
        {
            "id": a.id,
            "competitor_domain": a.competitor_domain,
            "keyword_gap": a.keyword_gap_data or {},
            "backlink_comparison": a.backlink_comparison or {},
            "content_benchmarks": a.content_benchmarks or {},
            "overall_threat_level": (a.keyword_gap_data or {}).get("opportunity_score", "N/A"),
            "last_updated": a.last_updated.isoformat() if a.last_updated else None,
        }
        for a in analyses
    ]}

@app.delete("/competitors/{analysis_id}")
def delete_competitor(analysis_id: int, session: Session = Depends(get_session)):
    ca = session.get(CompetitorAnalysis, analysis_id)
    if not ca:
        raise HTTPException(status_code=404, detail="Analysis not found")
    session.delete(ca)
    session.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Deals (Visual Sales Pipeline)
# ─────────────────────────────────────────────────────────────────────────────

from database import Deal

@app.get("/deals")
def get_deals(user_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(Deal).order_by(Deal.created_at.desc())
    if user_id:
        q = q.where(Deal.assigned_to == user_id)
    deals = session.exec(q).all()
    
    # We fetch client names for the UI manually
    results = []
    for d in deals:
        client = session.get(ClientProfile, d.client_id)
        results.append({
            "id": d.id,
            "title": d.title,
            "value": d.value,
            "client_id": d.client_id,
            "client_name": client.companyName or client.email if client else "Unknown",
            "assigned_to": d.assigned_to,
            "stage": d.stage,
            "expected_close_date": d.expected_close_date,
            "created_at": d.created_at.isoformat()
        })
    return {"deals": results}

@app.post("/deals")
def create_deal(body: DealCreateRequest, session: Session = Depends(get_session)):
    deal = Deal(
        title=body.title,
        value=body.value,
        client_id=body.client_id,
        assigned_to=body.assigned_to,
        stage=body.stage,
        expected_close_date=body.expected_close_date
    )
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return {"ok": True, "id": deal.id}

@app.put("/deals/{deal_id}")
def update_deal(deal_id: int, body: DealUpdateRequest, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if body.title is not None: deal.title = body.title
    if body.value is not None: deal.value = body.value
    if body.assigned_to is not None: deal.assigned_to = body.assigned_to
    if body.stage is not None: deal.stage = body.stage
    if body.expected_close_date is not None: deal.expected_close_date = body.expected_close_date
    deal.updated_at = datetime.utcnow()
    session.add(deal)
    session.commit()
    return {"ok": True}

@app.delete("/deals/{deal_id}")
def delete_deal(deal_id: int, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    session.delete(deal)
    session.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# Client Portal Domain Configuration
# ────────────────────────────────────────────────────────
_portal_config: Dict[str, Any] = {
    "portal_subdomain": "portal",
    "portal_domain": "",
    "branding": {
        "company_name": "SERP Hawk",
        "logo_url": "",
        "primary_color": "#d97706",
        "accent_color": "#7c3aed",
        "favicon_url": "",
    },
    "features": {
        "show_pricing": True,
        "show_store": True,
        "show_rankings": True,
        "show_milestones": True,
        "show_proposals": True,
        "allow_file_upload": True,
    },
}

@app.get("/portal/config")
def get_portal_config():
    return _portal_config

@app.put("/portal/config")
def update_portal_config(body: Dict[str, Any]):
    for key, val in body.items():
        if key in _portal_config:
            if isinstance(_portal_config[key], dict) and isinstance(val, dict):
                _portal_config[key].update(val)
            else:
                _portal_config[key] = val
# ─── Sidebar Preferences Endpoint ──────────────────────────────────────────────
class SidebarPrefsRequest(BaseModel):
    sidebar_preferences: dict

@app.get("/users/me/sidebar-preferences")
async def get_sidebar_preferences(session: Session = Depends(get_session)):
    # Fetch from current user (Assuming admin/salesperson via APIIntelligenceMiddleware)
    from modules.api_tracker import current_salesperson_id
    user_id = current_salesperson_id.get()
    if not user_id:
        return {"ok": False, "sidebar_preferences": {}}
    from database import User
    user = session.get(User, user_id)
    if user and user.sidebar_preferences:
        return {"ok": True, "sidebar_preferences": user.sidebar_preferences}
    return {"ok": True, "sidebar_preferences": {}}

@app.post("/users/me/sidebar-preferences")
async def update_sidebar_preferences(req: SidebarPrefsRequest, session: Session = Depends(get_session)):
    from modules.api_tracker import current_salesperson_id
    user_id = current_salesperson_id.get()
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    from database import User
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.sidebar_preferences = req.sidebar_preferences
    session.add(user)
    session.commit()
    return {"ok": True, "message": "Sidebar preferences updated."}

# ─── Auto-fill Client Endpoint ───────────────────────────────────────────────
class AutoFillRequest(BaseModel):
    website: str

@app.post("/clients/auto-fill")
async def auto_fill_client(request: AutoFillRequest):
    from modules.scraper import scrape_website
    from modules.llm_engine import extract_client_profile_from_website
    
    try:
        raw_text = await scrape_website(request.website)
        if not raw_text:
            return {"ok": False, "error": "Could not extract content from the website."}
            
        profile_data = extract_client_profile_from_website(raw_text, request.website)
        return {"ok": True, "data": profile_data}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/chatbot/history/{session_id}")
async def get_chatbot_history(session_id: str, session: Session = Depends(get_session)):
    from database import ChatbotMessage
    messages = session.exec(select(ChatbotMessage).where(ChatbotMessage.session_id == session_id).order_by(ChatbotMessage.created_at.asc())).all()
    history = []
    for m in messages:
        history.append({
            "role": "bot" if m.role == "assistant" else "user",
            "text": m.content,
            "action": m.action_taken
        })
    return {"ok": True, "history": history}

# ─── Chatbot endpoint ────────────────────────────────────────────────────────
@app.post("/chatbot/message")
async def chatbot_message(
    request: ChatbotRequest, 
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session)
):
    from modules.llm_engine import process_chatbot_command
    from database import ClientProfile, ClientNote, ConversationLog, ActivityLog, Project, MarketplaceService, User, ChatbotSession, ChatbotMessage
    from modules.api_tracker import current_salesperson_id
    
    user_id = current_salesperson_id.get()

    # Handle Session Memory
    session_id = request.session_id or f"anon_{datetime.utcnow().timestamp()}"
    cb_session = session.exec(select(ChatbotSession).where(ChatbotSession.session_id == session_id)).first()
    if not cb_session:
        cb_session = ChatbotSession(session_id=session_id, user_id=user_id)
        session.add(cb_session)
        session.commit()
    
    # Save user message
    user_msg = ChatbotMessage(session_id=session_id, role="user", content=request.message)
    session.add(user_msg)
    session.commit()
    
    # Load recent history (last 10 messages)
    history_records = session.exec(select(ChatbotMessage).where(ChatbotMessage.session_id == session_id).order_by(ChatbotMessage.created_at.desc()).limit(10)).all()
    history_records.reverse()
    chat_history_str = "\n".join([f"{m.role}: {m.content}" for m in history_records])

    # Gather rich CRM summary for context
    active_clients = session.exec(select(ClientProfile).limit(10)).all()
    client_names = [c.companyName for c in active_clients if c.companyName]
    crm_summary = f"CRM Summary: {len(client_names)} active clients ({', '.join(client_names[:5])}...)\nHistory:\n{chat_history_str}"
    
    client_context = None
    if request.client_id:
        cp = session.get(ClientProfile, request.client_id)
        if cp:
            client_context = {
                "client_id": cp.id,
                "company_name": cp.companyName,
                "contact_person": cp.contact_person,
                "email": cp.user.email if cp.user else None,
                "industry": cp.industry
            }
            
    # Advanced Omni-Agent AI processing
    result = process_chatbot_command(request.message, client_context, request.current_route, crm_summary)
    
    actions = result.get("actions", [])
    action_taken = None
    route = None
    
    try:
        for action_obj in actions:
            action_name = action_obj.get("action")
            params = action_obj.get("parameters", {})
            
            if action_name == "research_lead":
                from database import Lead
                company_name = params.get("company_name", "Unknown Company")
                website = params.get("website", "")
                
                # Create lead immediately
                lead = Lead(
                    company_name=company_name,
                    website=website,
                    email="",
                    source="Chatbot Auto-Research",
                    status="New"
                )
                session.add(lead)
                session.commit()
                session.refresh(lead)
                
                # Kick off smart research endpoint logic in background or inline
                # For simplicity, we just use the background task if it was a website
                if website:
                    # We can use the existing _auto_research_client_bg, but that is for ClientProfile
                    # We should probably do a smart-research call for this Lead
                    # Let's trigger a background smart research for Lead
                    pass
                
                action_taken = "lead_created"
                route = f"/leads/{lead.id}"
                
            elif action_name == "bulk_import_websites":
                from modules.scraper import scrape_website
                from modules.llm_engine import extract_client_profile_from_website
                
                urls = params.get("urls", [])
                for website_url in urls:
                    # Create a skeleton client first
                    cp = ClientProfile(
                        companyName=website_url.replace("https://", "").replace("http://", "").split("/")[0],
                        websiteUrl=website_url,
                        status="Active",
                        tagline="Scraping in progress..."
                    )
                    session.add(cp)
                    session.commit()
                    session.refresh(cp)
                    
                    # Spawn the background task to scrape and auto-research!
                    background_tasks.add_task(_auto_research_client_bg, cp.id, website_url)
                    
                action_taken = "bulk_clients_created"
                
            elif action_name == "create_client":
                from modules.scraper import scrape_website
                from modules.llm_engine import extract_client_profile_from_website
                
                website_url = params.get("website")
                email = params.get("email") or f"bot_{datetime.utcnow().timestamp()}@placeholder.com"
                existing_user = session.exec(select(User).where(User.email == email)).first() if hasattr(User, 'email') else None
                user = existing_user
                if not user:
                    user = User(
                        email=email,
                        password="changeme",
                        name=params.get("company_name") or "Client",
                        role="Client",
                    )
                    session.add(user)
                    session.commit()
                    session.refresh(user)

                cp = ClientProfile(
                    userId=user.id,
                    companyName=params.get("company_name", "New Client"),
                    websiteUrl=website_url,
                    phone=params.get("phone", ""),
                    status="Active"
                )
                session.add(cp)
                session.commit()
                session.refresh(cp)
                action_taken = "client_created"
                route = f"/clients/{cp.id}"
                
                if website_url:
                    background_tasks.add_task(_auto_research_client_bg, cp.id, website_url)
                
            elif action_name == "create_deal":
                from database import Deal
                client_id = params.get("client_id") or request.client_id
                if client_id:
                    deal = Deal(
                        title=params.get("title", "New Deal"),
                        client_id=client_id,
                        stage=params.get("stage", "Lead"),
                        value=params.get("value", 0.0),
                        notes="Created by Omni-Agent"
                    )
                    session.add(deal)
                    session.commit()
                    action_taken = "deal_created"
                    
            elif action_name == "draft_email":
                client_id = params.get("client_id") or request.client_id
                if client_id:
                    # In a real setup, we would call generate_email() here and save it to an EmailLog.
                    # For now, navigate to the email agent
                    action_taken = "navigate"
                    route = f"/email-agent?client_id={client_id}"
                
            elif action_name == "navigate_user":
                action_taken = "navigate"
                route = params.get("route", "/")
                
            elif action_name == "trigger_whatsapp_support":
                action_taken = "trigger_whatsapp"
                
                # 1. Update the reply for the user
                result["reply"] = "I've notified our live agents. Please wait a moment while they connect."
                
                # 2. Extract issue summary
                issue_summary = params.get("issue_summary", result.get("reply", "No issue summary provided."))
                
                # 3. Create LiveChatSession and Send AI WhatsApp summary to admin
                try:
                    from database import LiveChatSession
                    if request.session_id:
                        # check if exists
                        existing_lcs = session.exec(select(LiveChatSession).where(LiveChatSession.session_id == request.session_id)).first()
                        if not existing_lcs:
                            lcs = LiveChatSession(
                                session_id=request.session_id,
                                status="pending",
                                client_id=client_context["client_id"] if client_context else None
                            )
                            session.add(lcs)
                            session.commit()
                    
                    from modules.whatsapp import send_whatsapp_message
                    
                    company = client_context["company_name"] if client_context else "Unknown Visitor"
                    msg = f"🚨 *Live Chat Request!* 🚨\n\n*From:* {company}\n*Issue:* {issue_summary}\n\n*Chat History:*\n{request.chat_history or request.message}\n\nReply *YES* to claim this chat and talk directly to the visitor!"
                    send_whatsapp_message(msg, "whatsapp:+919502901416")
                    
                    # Store a pending action in WhatsAppSession so if they reply YES it triggers live chat
                    from database import WhatsAppSession
                    import json
                    pending = session.exec(select(WhatsAppSession).where(WhatsAppSession.phone_number == "whatsapp:+919502901416")).first()
                    if pending:
                        session.delete(pending)
                    new_pending = WhatsAppSession(
                        phone_number="whatsapp:+919502901416",
                        pending_action="claim_live_chat",
                        action_data=json.dumps({"session_id": request.session_id}) if request.session_id else "{}"
                    )
                    session.add(new_pending)
                    session.commit()
                    
                except Exception as e:
                    print("WhatsApp Chatbot Handoff Error:", e)
                
            elif action_name == "add_note_to_client":
                target_client_id = request.client_id or params.get("client_id")
                if target_client_id:
                    new_note = ClientNote(
                        client_id=target_client_id,
                        content=params.get("content", ""),
                        author_name="Omni-Agent",
                        type="Note"
                    )
                    session.add(new_note)
                    log = ActivityLog(clientId=target_client_id, action="Note Added via Omni-Agent", details=new_note.content[:100], method="bot")
                    session.add(log)
                    session.commit()
                    action_taken = "note_added"
                    
    except Exception as e:
        print(f"Chatbot mutation error: {e}")

    # Save bot message
    try:
        bot_reply = result.get("reply", "I processed your request.")
        bot_msg = ChatbotMessage(session_id=session_id, role="assistant", content=bot_reply, action_taken=action_taken)
        session.add(bot_msg)
        session.commit()
    except Exception as e:
        print(f"Failed to save bot message: {e}")

    # Fallback response format for the frontend
    return {
        "reply": result.get("reply", "I processed your request."),
        "intent": "omni_agent", # Legacy
        "actions": actions,
        "action_taken": action_taken,
        "route": route
    }

class LiveChatSendRequest(BaseModel):
    message: str

@app.post("/chatbot/live-chat/{session_id}/send")
def live_chat_send(session_id: str, request: LiveChatSendRequest, db: Session = Depends(get_session)):
    from database import LiveChatSession, LiveChatMessage, WhatsAppSession
    lcs = db.exec(select(LiveChatSession).where(LiveChatSession.session_id == session_id)).first()
    if not lcs or lcs.status != "active":
        return {"ok": False, "error": "Live chat is not active"}
    
    # Save message
    msg = LiveChatMessage(session_id=session_id, sender="user", message=request.message)
    db.add(msg)
    db.commit()
    
    # Forward to WhatsApp
    from modules.whatsapp import send_whatsapp_message
    active_admin = db.exec(select(WhatsAppSession).where(WhatsAppSession.active_live_chat_session == session_id)).first()
    if active_admin:
        send_whatsapp_message(f"👤 *Visitor:* {request.message}", active_admin.phone_number)
        
    return {"ok": True}

@app.get("/chatbot/live-chat/{session_id}/sync")
def live_chat_sync(session_id: str, db: Session = Depends(get_session)):
    from database import LiveChatSession, LiveChatMessage
    lcs = db.exec(select(LiveChatSession).where(LiveChatSession.session_id == session_id)).first()
    if not lcs:
        return {"status": "inactive", "messages": []}
    
    # Fetch all admin messages
    messages = db.exec(select(LiveChatMessage).where(LiveChatMessage.session_id == session_id).order_by(LiveChatMessage.timestamp.asc())).all()
    
    return {
        "status": lcs.status,
        "messages": [
            {"sender": m.sender, "message": m.message, "timestamp": m.timestamp.isoformat()}
            for m in messages
        ]
    }



# ─────────────────────────────────────────────────────────────────────────────
# Marketplace Catalog
# ─────────────────────────────────────────────────────────────────────────────

class MarketplaceServiceCreate(BaseModel):
    service_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    estimated_cost: float = 0.0
    provider_client_id: Optional[int] = None
    provider_name: Optional[str] = None

class MarketplaceServiceUpdate(BaseModel):
    service_name: Optional[str] = None
    normalized_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    estimated_cost: Optional[float] = None
    cost_is_estimated: Optional[bool] = None
    provider_name: Optional[str] = None
    is_active: Optional[bool] = None


def _marketplace_row(s: MarketplaceService) -> dict:
    return {
        "id": s.id,
        "service_name": s.service_name,
        "normalized_name": s.normalized_name,
        "category": s.category,
        "description": s.description,
        "estimated_cost": s.estimated_cost,
        "cost_is_estimated": s.cost_is_estimated,
        "provider_name": s.provider_name,
        "provider_client_id": s.provider_client_id,
        "provider_industry": s.provider_industry,
        "provider_address": s.provider_address,
        "source": s.source,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@app.get("/marketplace/services")
def list_marketplace_services(
    search: Optional[str] = None,
    category: Optional[str] = None,
    min_cost: Optional[float] = None,
    max_cost: Optional[float] = None,
    provider: Optional[str] = None,
    page: int = 1,
    per_page: int = 18,
    session: Session = Depends(get_session),
):
    query = select(MarketplaceService).where(MarketplaceService.is_active == True)

    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                MarketplaceService.service_name.ilike(like),
                MarketplaceService.description.ilike(like),
                MarketplaceService.provider_name.ilike(like),
            )
        )
    if category:
        query = query.where(MarketplaceService.category.ilike(f"%{category}%"))
    if min_cost is not None:
        query = query.where(MarketplaceService.estimated_cost >= min_cost)
    if max_cost is not None:
        query = query.where(MarketplaceService.estimated_cost <= max_cost)
    if provider:
        query = query.where(MarketplaceService.provider_name.ilike(f"%{provider}%"))

    total = len(session.exec(query).all())
    offset = (page - 1) * per_page
    items = session.exec(query.offset(offset).limit(per_page)).all()

    return {
        "services": [_marketplace_row(s) for s in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, -(-total // per_page)),
    }


@app.post("/marketplace/services")
def create_marketplace_service(
    body: MarketplaceServiceCreate,
    session: Session = Depends(get_session),
):
    # Auto-fill provider info from CRM if client_id given
    provider_name = body.provider_name
    provider_industry = None
    provider_address = None
    if body.provider_client_id:
        cp = session.get(ClientProfile, body.provider_client_id)
        if cp:
            provider_name = provider_name or cp.companyName
            provider_industry = cp.industry
            provider_address = cp.address

    svc = MarketplaceService(
        service_name=body.service_name,
        category=body.category,
        description=body.description,
        estimated_cost=body.estimated_cost,
        provider_client_id=body.provider_client_id,
        provider_name=provider_name,
        provider_industry=provider_industry,
        provider_address=provider_address,
        source="manual",
    )
    session.add(svc)
    session.commit()
    session.refresh(svc)
    return {"service": _marketplace_row(svc)}


@app.put("/marketplace/services/{service_id}")
def update_marketplace_service(
    service_id: int,
    body: MarketplaceServiceUpdate,
    session: Session = Depends(get_session),
):
    svc = session.get(MarketplaceService, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(svc, field, value)
    svc.updated_at = datetime.utcnow()
    session.add(svc)
    session.commit()
    session.refresh(svc)
    return {"service": _marketplace_row(svc)}


@app.delete("/marketplace/services/{service_id}")
def delete_marketplace_service(
    service_id: int,
    session: Session = Depends(get_session),
):
    svc = session.get(MarketplaceService, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    svc.is_active = False
    svc.updated_at = datetime.utcnow()
    session.add(svc)
    session.commit()
    return {"success": True}


@app.get("/marketplace/categories")
def list_marketplace_categories(session: Session = Depends(get_session)):
    rows = session.exec(
        select(MarketplaceService.category)
        .where(MarketplaceService.is_active == True)
        .where(MarketplaceService.category != None)
        .distinct()
        .order_by(MarketplaceService.category)
    ).all()
    return {"categories": [r for r in rows if r]}


@app.post("/marketplace/services/{service_id}/ai-categorize")
def ai_categorize_marketplace_service(
    service_id: int,
    session: Session = Depends(get_session),
):
    svc = session.get(MarketplaceService, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    import openai, os
    client_ai = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    prompt = f"""You are a B2B service categorization expert.

Given this service:
Name: {svc.service_name}
Description: {svc.description or 'N/A'}
Provider Industry: {svc.provider_industry or 'N/A'}

Respond with ONLY valid JSON (no markdown):
{{
  "normalized_name": "<clean, professional service name>",
  "category": "<one of: SEO, Web Design, Plumbing, Legal, Accounting, Marketing, Consulting, Construction, Healthcare, Real Estate, IT Services, Landscaping, Cleaning, Electrical, HVAC, Other>",
  "estimated_cost_usd": <number or null if truly unknown>,
  "cost_is_estimated": <true or false>
}}"""

    try:
        response = client_ai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        import json
        data = json.loads(response.choices[0].message.content.strip())
        svc.normalized_name = data.get("normalized_name", svc.service_name)
        svc.category = data.get("category", svc.category)
        if data.get("estimated_cost_usd") is not None:
            svc.estimated_cost = float(data["estimated_cost_usd"])
            svc.cost_is_estimated = data.get("cost_is_estimated", True)
        svc.updated_at = datetime.utcnow()
        session.add(svc)
        session.commit()
        session.refresh(svc)
        return {"service": _marketplace_row(svc)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI categorization failed: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# RADAR ANALYSIS ENGINE — Google Maps Competitor Intelligence
# ─────────────────────────────────────────────────────────────────────────────
from modules.radar_engine import (
    find_place, find_nearby_competitors, calculate_market_density,
    sort_nearest, sort_largest_market, sort_largest_team, sort_most_similar,
    score_market_size, estimate_team_size
)
from database import RadarAnalysis, CompetitorRelationship

class RadarSearchRequest(BaseModel):
    query: str
    location_hint: Optional[str] = None
    place_id: Optional[str] = None

class RadarAnalyzeRequest(BaseModel):
    place_id: str
    target_name: str
    target_lat: float
    target_lng: float
    target_address: Optional[str] = None
    target_phone: Optional[str] = None
    target_website: Optional[str] = None
    target_rating: Optional[float] = None
    target_reviews: Optional[int] = None
    target_category: str = "digital marketing agency"
    target_types: Optional[list] = []
    radius_km: int = 5
    client_id: Optional[int] = None

class RadarAddClientRequest(BaseModel):
    competitor: dict
    source_client_id: int
    source_client_name: str
    radar_id: Optional[int] = None

@app.post("/radar/search")
async def radar_search(body: RadarSearchRequest):
    """Search for a business on Google Maps and return its exact place details."""
    try:
        if body.place_id:
            from modules.radar_engine import get_place_details
            place = await get_place_details(body.place_id)
        else:
            place = await find_place(body.query, body.location_hint)
        if not place:
            raise HTTPException(status_code=404, detail="Business not found on Google Maps")
        return {"place": place}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Radar search failed: {e}")

@app.post("/radar/analyze")
async def radar_analyze(body: RadarAnalyzeRequest, session: Session = Depends(get_session)):
    """Run full competitor discovery around target business."""
    try:
        radius_m = body.radius_km * 1000
        competitors = await find_nearby_competitors(
            lat=body.target_lat,
            lng=body.target_lng,
            radius_m=radius_m,
            keyword=body.target_category,
            target_name=body.target_name
        )
        density = calculate_market_density(len(competitors), body.radius_km)

        rankings = {
            "nearest": sort_nearest(competitors),
            "largest_market": sort_largest_market(competitors),
            "largest_team": sort_largest_team(competitors),
            "most_similar": sort_most_similar(competitors),
        }

        # Store radar analysis to DB
        radar = RadarAnalysis(
            client_id=body.client_id,
            target_name=body.target_name,
            target_place_id=body.place_id if hasattr(body, 'place_id') else None,
            target_lat=body.target_lat,
            target_lng=body.target_lng,
            target_address=body.target_address,
            target_phone=body.target_phone,
            target_website=body.target_website,
            target_rating=body.target_rating,
            target_reviews=body.target_reviews,
            target_category=body.target_category,
            radius_km=body.radius_km,
            market_density_score=density,
            competitor_count=len(competitors),
            competitors={"list": competitors},
        )
        session.add(radar)
        session.commit()
        session.refresh(radar)

        return {
            "radar_id": radar.id,
            "target": {
                "name": body.target_name,
                "lat": body.target_lat,
                "lng": body.target_lng,
                "address": body.target_address,
                "phone": body.target_phone,
                "website": body.target_website,
                "rating": body.target_rating,
                "reviews": body.target_reviews,
                "category": body.target_category,
            },
            "radius_km": body.radius_km,
            "competitor_count": len(competitors),
            "market_density_score": density,
            "competitors": competitors,
            "rankings": rankings,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Radar analysis failed: {e}")

@app.get("/radar/analyses")
def get_all_radar_analyses(session: Session = Depends(get_session)):
    """Get all radar analyses."""
    analyses = session.exec(select(RadarAnalysis).order_by(RadarAnalysis.run_date.desc()).limit(50)).all()
    return [
        {
            "id": a.id,
            "client_id": a.client_id,
            "target_name": a.target_name,
            "target_address": a.target_address,
            "radius_km": a.radius_km,
            "competitor_count": a.competitor_count,
            "market_density_score": a.market_density_score,
            "run_date": a.run_date.isoformat() if a.run_date else None,
        }
        for a in analyses
    ]

@app.get("/radar/analyses/{client_id}")
def get_client_radar_analyses(client_id: int, session: Session = Depends(get_session)):
    """Get radar analyses for a specific client."""
    analyses = session.exec(
        select(RadarAnalysis).where(RadarAnalysis.client_id == client_id).order_by(RadarAnalysis.run_date.desc())
    ).all()
    return [
        {
            "id": a.id,
            "target_name": a.target_name,
            "target_address": a.target_address,
            "target_lat": a.target_lat,
            "target_lng": a.target_lng,
            "radius_km": a.radius_km,
            "competitor_count": a.competitor_count,
            "market_density_score": a.market_density_score,
            "competitors": a.competitors,
            "run_date": a.run_date.isoformat() if a.run_date else None,
        }
        for a in analyses
    ]

@app.post("/radar/add-client")
def radar_add_client(body: RadarAddClientRequest, session: Session = Depends(get_session)):
    """Add a competitor discovered via radar to the CRM as a Lead (not a Client)."""
    try:
        comp = body.competitor
        name = comp.get("name", "Unknown Business")
        website = comp.get("website") or None
        phone = comp.get("phone") or None
        address = comp.get("address") or None
        industry = comp.get("category") or None

        # Check for existing Lead by website or name to avoid duplicates
        existing_lead = None
        if website:
            existing_lead = session.exec(select(Lead).where(Lead.website == website)).first()
        if not existing_lead:
            existing_lead = session.exec(select(Lead).where(Lead.company_name == name)).first()

        if existing_lead:
            # Update existing lead with fresher radar data
            existing_lead.last_activity = f"Re-discovered via Radar from {body.source_client_name}"
            if phone and not existing_lead.phone:
                existing_lead.phone = phone
            if address and not existing_lead.address:
                existing_lead.address = address
            if industry and not existing_lead.industry:
                existing_lead.industry = industry
            session.add(existing_lead)
            session.commit()
            lead = existing_lead
            is_new = False
        else:
            # Create new Lead
            lead = Lead(
                company_name=name,
                website=website,
                phone=phone,
                address=address,
                industry=industry,
                source="Radar Analysis",
                status="New",
                last_activity=f"Discovered via Radar Analysis of {body.source_client_name}",
            )
            session.add(lead)
            session.commit()
            session.refresh(lead)
            is_new = True

        # Log competitor relationship (still tracks which source client triggered the discovery)
        try:
            rel = CompetitorRelationship(
                source_client_id=body.source_client_id,
                source_client_name=body.source_client_name,
                discovered_client_id=None,  # no longer creating a ClientProfile
                discovered_client_name=name,
                source_radar_id=body.radar_id,
                competitor_data={
                    "distance_km": comp.get("distance_km"),
                    "overlap_pct": comp.get("overlap_pct"),
                    "market_size_score": comp.get("market_size_score"),
                    "team_size_estimate": comp.get("team_size_estimate"),
                    "matched_services": comp.get("matched_services", []),
                    "lat": comp.get("lat"),
                    "lng": comp.get("lng"),
                    "lead_id": lead.id,
                }
            )
            session.add(rel)
            session.commit()
        except Exception:
            pass  # Relationship logging is best-effort

        return {
            "success": True,
            "lead_id": lead.id,
            "client_id": lead.id,  # backwards-compat alias
            "client_name": name,
            "is_new": is_new,
            "message": f"{name} added to Leads. Discovered from: {body.source_client_name}",
            "discovered_from": body.source_client_name,
            "discovery_date": datetime.utcnow().strftime("%Y-%m-%d"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add lead: {e}")



@app.get("/radar/relationships/{client_id}")
def get_radar_relationships(client_id: int, session: Session = Depends(get_session)):
    """Get the competitor discovery graph for a client (who they found + who found them)."""
    # Clients discovered FROM this client
    discovered = session.exec(
        select(CompetitorRelationship).where(CompetitorRelationship.source_client_id == client_id)
    ).all()
    # Who discovered this client
    found_from = session.exec(
        select(CompetitorRelationship).where(CompetitorRelationship.discovered_client_id == client_id)
    ).all()

    return {
        "discovered_from": [
            {
                "source_client_id": r.source_client_id,
                "source_client_name": r.source_client_name,
                "discovery_method": r.discovery_method,
                "discovered_date": r.discovered_date.isoformat() if r.discovered_date else None,
            }
            for r in found_from
        ],
        "discovered_competitors": [
            {
                "discovered_client_id": r.discovered_client_id,
                "discovered_client_name": r.discovered_client_name,
                "discovery_method": r.discovery_method,
                "discovered_date": r.discovered_date.isoformat() if r.discovered_date else None,
                "competitor_data": r.competitor_data,
            }
            for r in discovered
        ],
    }


class AutomationScanRequest(BaseModel):
    url: str

@app.post("/automations/intelligence-scan")
async def automations_intelligence_scan(body: AutomationScanRequest):
    import json as _json
    import os
    import requests
    from modules.llm_engine import get_openai_client
    from modules.scraper import scrape_website
    
    url = body.url.strip()
    if not url.startswith("http"):
        url = "https://" + url
    
    domain = url.replace("https://", "").replace("http://", "").split("/")[0]
    
    try:
        scraped_content = await scrape_website(url)
    except Exception as e:
        scraped_content = f"Failed to scrape: {str(e)}"
        
    serp_data_str = "No Google Search API key provided, search data unavailable."
    serper_api_key = os.environ.get("SERPER_API_KEY")
    if serper_api_key:
        try:
            search_query = domain.split(".")[0].capitalize()
            payload = _json.dumps({"q": search_query})
            headers = {
                'X-API-KEY': serper_api_key,
                'Content-Type': 'application/json'
            }
            serp_response = requests.post("https://google.serper.dev/search", headers=headers, data=payload, timeout=10)
            if serp_response.ok:
                serp_json = serp_response.json()
                serp_data_str = _json.dumps({
                    "knowledgeGraph": serp_json.get("knowledgeGraph"),
                    "organic": serp_json.get("organic", [])[:10]
                })
        except Exception as e:
            serp_data_str = f"Error fetching SERP: {str(e)}"
    
    prompt = f"""
    You are an expert business intelligence gathering AI.
    We are running a scan on the website/domain: {url} ({domain}).
    
    Here is the live, scraped content of their website (which may include extracted social links):
    <scraped_content>
    {scraped_content[:15000]}
    </scraped_content>
    
    Here is live Google Search data for the company (including Organic results and Google Maps/Knowledge Graph data):
    <google_search_data>
    {serp_data_str}
    </google_search_data>
    
    Based ONLY on the provided scraped content and Google Search data:
    1. Extract their real social profiles from the scrape or organic search results. Do not guess.
    2. Extract their Google Maps rating and review count from the knowledgeGraph (if present) to formulate a review mention.
    3. Use the organic search results to populate the `webMentions`. For example, if a top organic result is their LinkedIn page, Crunchbase, or a news article, list it exactly as found in the search data.
    4. Estimate Google Search Volume, Trend, and Size based on the search presence and scraped content.
    
    Return ONLY a valid JSON object matching the following structure EXACTLY:
    {{
        "domain": "{domain}",
        "name": "Company Name (extracted or inferred)",
        "googleSearchVolume": "Number/mo (e.g. '15,000/mo')",
        "googleTrend": "rising",
        "socialProfiles": [
            {{
                "platform": "LinkedIn",
                "handle": "extracted_handle",
                "followers": "10.5K",
                "engagement": "2.5%",
                "url": "https://linkedin.com/company/handle",
                "verified": true,
                "color": "#0A66C2",
                "popularity": 85
            }}
        ],
        "webMentions": [
            {{
                "title": "Exact Title from organic search results or knowledge graph",
                "url": "https://exact-url-from-search.com",
                "domain": "exact-domain.com",
                "snippet": "Short snippet from organic result...",
                "domainAuthority": 80,
                "type": "news"
            }}
        ],
        "estimatedSize": "SMB (11-50)",
        "sizeScore": 45,
        "overallScore": 75
    }}
    
    Provide up to 4 social platforms if found. Provide 4-6 web mentions STRICTLY derived from the `<google_search_data>` and `<scraped_content>`.
    Platform colors: LinkedIn: #0A66C2, Twitter/X: #000000, Instagram: #E4405F, Facebook: #1877F2, YouTube: #FF0000
    Mention types must be: news, directory, social, review, partner, or blog.
    Estimated size must be: Startup (1-10), SMB (11-50), Mid-Market (51-200), or Enterprise (200+)
    Google trend must be: rising, stable, or declining.
    
    Do not use markdown blocks. Return only raw JSON.
    """
    
    try:
        client_ai = get_openai_client()
        resp = client_ai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        content = resp.choices[0].message.content.strip()
        data = _json.loads(content)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan: {str(e)}")

# =====================================================================
# ENHANCED CRM ARCHITECTURE - LEADS, ACCOUNTS, CONTACTS
# =====================================================================
import json
import pandas as pd


class LeadCreateRequest(BaseModel):
    company_name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    source: Optional[str] = None
    owner_id: Optional[int] = None
    status: str = "New"
    notes: Optional[str] = None

class AccountCreateRequest(BaseModel):
    company_name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    owner_id: Optional[int] = None

class ContactCreateRequest(BaseModel):
    first_name: str
    last_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    alternate_number: Optional[str] = None
    linkedin_url: Optional[str] = None
    lead_id: Optional[int] = None
    account_id: Optional[int] = None
    client_id: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = []
    owner_id: Optional[int] = None
    create_new_lead: Optional[bool] = False

# ---- LEADS API ----
@app.get("/leads")
def get_leads(session: Session = Depends(get_session)):
    leads = session.exec(select(Lead).order_by(Lead.created_at.desc())).all()
    return {"leads": leads}

@app.post("/leads")
def create_lead(body: LeadCreateRequest, session: Session = Depends(get_session)):
    lead = Lead(**body.dict())
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Lead Added", lead.dict(), f"{base_url}/leads/{lead.id}")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return lead

@app.get("/leads/{lead_id}")
def get_lead(lead_id: int, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@app.put("/leads/{lead_id}")
def update_lead(lead_id: int, body: LeadCreateRequest, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for key, value in body.dict().items():
        setattr(lead, key, value)
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead

@app.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    session.delete(lead)
    session.commit()
    return {"ok": True}

class LeadAIAnalyzeRequest(BaseModel):
    agent_type: str

@app.post("/leads/{lead_id}/ai/analyze")
async def analyze_lead_ai(lead_id: int, body: LeadAIAnalyzeRequest, session: Session = Depends(get_session)):
    from database import Lead
    lead = session.get(Lead, lead_id)
    if not lead:
        return {"ok": False, "error": "Lead not found"}
        
    url = lead.website or f"https://{lead.company_name.lower().replace(' ', '')}.com"
    
    results = lead.ai_analysis_results or {}
    
    try:
        from modules.llm_engine import get_openai_client
        import json
        client = get_openai_client()
        
        system_prompt = f"You are an elite B2B CRM intelligence AI. Analyze this target lead: Company: {lead.company_name}, Website: {url}, Industry: {lead.industry or 'Unknown'}. "
        
        prompt = None
        if body.agent_type == "scanner":
            prompt = system_prompt + """
Generate a highly detailed, professional website scan report. Return ONLY valid JSON matching exactly:
{
  "url": "the website url",
  "title": "Clean company name",
  "description": "2-3 sentence deep analysis of what they do",
  "industry": "Specific industry",
  "score": integer between 40-95,
  "issues": ["Issue 1", "Issue 2", "Issue 3", "Issue 4"],
  "opportunities": ["Opp 1", "Opp 2", "Opp 3"],
  "tech": ["Tech 1", "Tech 2", "Tech 3", "Tech 4"]
}
"""
        elif body.agent_type == "radar":
            prompt = system_prompt + """
Generate deeply researched, realistic social media and market intelligence insights. Return ONLY valid JSON matching exactly:
{
  "insights": ["Insight 1 (e.g. recent hires, funding, strategy)", "Insight 2", "Insight 3"],
  "social_links": {
    "linkedin": "Predicted company linkedin url",
    "twitter": "Predicted company twitter url"
  }
}
"""
        elif body.agent_type == "competitor":
            prompt = system_prompt + """
Identify 2 realistic competitors in their exact industry. Return ONLY valid JSON matching exactly:
{
  "competitor": [
    {
      "name": "Competitor 1",
      "url": "competitor1.com",
      "overlap": "High overlap %",
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"]
    },
    {
      "name": "Competitor 2",
      "url": "competitor2.com",
      "overlap": "Medium overlap %",
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"]
    }
  ]
}
"""
        elif body.agent_type == "email":
            prompt = system_prompt + """
Write a hyper-personalized, ultra-concise, and compelling cold outreach email to the CEO or decision-maker. 
CRITICAL RULES:
1. NO PLACEHOLDERS: Do NOT use brackets like [Your Name], [Your Company], etc. Write the email from the perspective of an elite B2B Growth/Marketing Agency (SerpHawk).
2. NO BOILERPLATE: Never use generic openers like "I hope this message finds you well" or "My name is X". Jump STRAIGHT into the value and why you are contacting them.
3. BE SPECIFIC: Use the actual insights, industry, and URL provided to make it hyper-relevant to their specific business.
4. KEEP IT SHORT: Keep it under 4 short paragraphs. Make it punchy.

Return ONLY valid JSON matching exactly:
{
  "subject": "Compelling, non-spammy subject line (lowercase, casual)",
  "body": "The full email body, formatted beautifully with line breaks."
}
"""
        elif body.agent_type == "calling":
            prompt = system_prompt + """
Write a professional, punchy, and conversational B2B sales teleprompter script for a sales agent to read on a cold call. 
CRITICAL RULES:
1. NO PLACEHOLDERS: Do NOT use brackets like [Your Name] or [Your Company]. Introduce yourself as calling from SerpHawk (an elite Growth/SEO agency).
2. SOUND HUMAN: Make it sound like a real person speaking, not a corporate robot. Use casual but professional language.
3. BE SPECIFIC: Use the lead's actual company name and industry to make the pitch highly relevant.

Return ONLY valid JSON matching exactly:
{
  "calling": {
    "intro": "The opening hook (casual, getting straight to the point)...",
    "value_prop": "The core pitch tailored to their specific industry...",
    "objections": ["If they say 'Not interested', say...", "If they say 'We already have an agency', say..."],
    "closing": "The soft call to action to book a meeting..."
  }
}
"""
        elif body.agent_type == "automations":
            results["automations"] = {
                "status": "Active",
                "workflows": [
                    "Auto-follow up if no reply in 3 days",
                    "Score lead based on email open rate",
                    "Notify Slack #sales when lead visits pricing page"
                ]
            }
            
        if prompt:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            data = json.loads(response.choices[0].message.content)
            
            if body.agent_type == "calling":
                results["calling"] = data.get("calling", data)
            elif body.agent_type == "competitor":
                results["competitor"] = data.get("competitor", [])
            else:
                results[body.agent_type] = data

    except Exception as e:
        print(f"Error generating AI analysis: {e}")
        return {"ok": False, "error": "AI generation failed."}
        
    lead.ai_analysis_results = results
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(lead, "ai_analysis_results")
    
    session.add(lead)
    session.commit()
    session.refresh(lead)
    
    return {"ok": True, "lead": lead}

@app.post("/leads/{lead_id}/convert")
def convert_lead_to_client(lead_id: int, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.is_converted:
        raise HTTPException(status_code=400, detail="Lead is already converted")
    
    # 1. Create Account
    account = Account(
        company_name=lead.company_name,
        website=lead.website,
        industry=lead.industry,
        phone=lead.phone,
        address=lead.address,
        owner_id=lead.owner_id
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    
    # 2. Create ClientProfile
    client = ClientProfile(
        companyName=lead.company_name,
        websiteUrl=lead.website,
        industry=lead.industry,
        phone=lead.phone,
        address=lead.address,
        lead_source=lead.source,
        status="Active",
        assignedEmployeeId=lead.owner_id
    )
    session.add(client)
    session.commit()
    session.refresh(client)
    
    # 3. Re-link Contacts
    contacts = session.exec(select(Contact).where(Contact.lead_id == lead.id)).all()
    for contact in contacts:
        contact.account_id = account.id
        contact.client_id = client.id
        session.add(contact)
    
    # 4. Mark Lead as converted
    lead.is_converted = True
    lead.converted_client_id = client.id
    lead.account_id = account.id
    lead.status = "Converted"
    session.add(lead)
    session.commit()
    
    return {"message": "Lead converted successfully", "client_id": client.id, "account_id": account.id}

# ---- ACCOUNTS API ----
@app.get("/accounts")
def get_accounts(session: Session = Depends(get_session)):
    accounts = session.exec(select(Account).order_by(Account.created_at.desc())).all()
    return {"accounts": accounts}

@app.post("/accounts")
def create_account(body: AccountCreateRequest, session: Session = Depends(get_session)):
    account = Account(**body.dict())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account

@app.get("/accounts/{account_id}")
def get_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

@app.put("/accounts/{account_id}")
def update_account(account_id: int, body: AccountCreateRequest, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    for key, value in body.dict().items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account

@app.delete("/accounts/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    session.delete(account)
    session.commit()
    return {"ok": True}

# ---- CONTACTS API ----
@app.get("/contacts")
def get_contacts(session: Session = Depends(get_session)):
    contacts = session.exec(select(Contact).order_by(Contact.created_at.desc())).all()
    return {"contacts": contacts}

@app.post("/contacts")
def create_contact(body: ContactCreateRequest, session: Session = Depends(get_session)):
    contact_data = body.dict(exclude={"create_new_lead"})
    contact = Contact(**contact_data)
    if contact.first_name and contact.last_name:
        contact.full_name = f"{contact.first_name} {contact.last_name}"
    elif contact.first_name:
        contact.full_name = contact.first_name
        
    if body.create_new_lead:
        lead = Lead(
            company_name=contact.full_name,
            email=contact.email,
            phone=contact.mobile_number,
            status="New",
            source="Contact Form"
        )
        session.add(lead)
        session.flush()
        contact.lead_id = lead.id

    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact

@app.get("/contacts/{contact_id}")
def get_contact(contact_id: int, session: Session = Depends(get_session)):
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact

@app.put("/contacts/{contact_id}")
def update_contact(contact_id: int, body: ContactCreateRequest, session: Session = Depends(get_session)):
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for key, value in body.dict().items():
        setattr(contact, key, value)
    
    if contact.first_name and contact.last_name:
        contact.full_name = f"{contact.first_name} {contact.last_name}"
        
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact

@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int, session: Session = Depends(get_session)):
    contact = session.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    session.delete(contact)
    session.commit()
    return {"ok": True}


# ---- IMPORT SYSTEM ----
class ImportPreviewRequest(BaseModel):
    module: str # leads, accounts, contacts, clients

@app.post("/api/import/preview")
async def import_preview(file: UploadFile = File(...)):
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only CSV, XLSX, and XLS files are supported")
    
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file.file, nrows=5)
        else:
            df = pd.read_excel(file.file, nrows=5)
            
        columns = df.columns.tolist()
        preview_data = df.fillna('').head(3).to_dict(orient='records')
        
        return {
            "columns": columns,
            "preview_data": preview_data,
            "total_columns": len(columns)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@app.post("/api/import/execute")
async def import_execute(
    module: str = Form(...),
    mapping: str = Form(...), # JSON string
    skip_duplicates: bool = Form(True),
    update_existing: bool = Form(False),
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    try:
        column_mapping = json.loads(mapping) # e.g. {"First Name": "first_name", ...}
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file)
            
        df = df.fillna('')
        records = df.to_dict(orient='records')
        
        imported_count = 0
        skipped_count = 0
        updated_count = 0
        
        for record in records:
            mapped_record = {}
            for file_col, db_col in column_mapping.items():
                if file_col in record and db_col:
                    mapped_record[db_col] = record[file_col]
                    
            if not mapped_record:
                continue
                
            if module == 'leads':
                # Duplicate check by email or website
                existing = None
                if mapped_record.get('email'):
                    existing = session.exec(select(Lead).where(Lead.email == mapped_record['email'])).first()
                if not existing and mapped_record.get('website'):
                    existing = session.exec(select(Lead).where(Lead.website == mapped_record['website'])).first()
                    
                if existing:
                    if update_existing:
                        for k, v in mapped_record.items():
                            if v: setattr(existing, k, v)
                        session.add(existing)
                        updated_count += 1
                    else:
                        skipped_count += 1
                else:
                    if 'company_name' not in mapped_record or not mapped_record['company_name']:
                        mapped_record['company_name'] = 'Unknown Company'
                    lead = Lead(**mapped_record)
                    session.add(lead)
                    imported_count += 1
                    
            elif module == 'contacts':
                existing = None
                if mapped_record.get('email'):
                    existing = session.exec(select(Contact).where(Contact.email == mapped_record['email'])).first()
                    
                if existing:
                    if update_existing:
                        for k, v in mapped_record.items():
                            if v: setattr(existing, k, v)
                        session.add(existing)
                        updated_count += 1
                    else:
                        skipped_count += 1
                else:
                    if 'first_name' not in mapped_record or not mapped_record['first_name']:
                        mapped_record['first_name'] = 'Unknown'
                    contact = Contact(**mapped_record)
                    if contact.first_name and contact.last_name:
                        contact.full_name = f"{contact.first_name} {contact.last_name}"
                    elif contact.first_name:
                        contact.full_name = contact.first_name
                    session.add(contact)
                    imported_count += 1
            
            # Additional modules (accounts, clients) follow similar logic...
        
        session.commit()
        return {
            "success": True,
            "imported": imported_count,
            "skipped": skipped_count,
            "updated": updated_count,
            "total": len(records)
        }
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")



@app.post("/leads/{lead_id}/followup")
def add_lead_followup(lead_id: int, body: ClientFollowUpRequest, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Add to notes
    existing_notes = lead.notes or ""
    new_note = f"Follow-up: {body.content}"
    lead.notes = existing_notes + "\n" + new_note if existing_notes else new_note
    session.add(lead)
    
    # Log activity
    from datetime import datetime
    activity = ActivityLog(
        lead_id=lead_id,
        action="Added Follow-up Note",
        details=body.content,
        timestamp=datetime.utcnow()
    )
    session.add(activity)

    if body.email_agent_data:
        client_research = session.exec(
            select(ClientResearch).where(ClientResearch.lead_id == lead_id)
        ).first()
        if not client_research:
            client_research = ClientResearch(
                lead_id=lead_id,
                email_agent_data=body.email_agent_data
            )
            session.add(client_research)
        else:
            client_research.email_agent_data = body.email_agent_data
            session.add(client_research)

    session.commit()
    
    return {"success": True, "message": "Follow-up added to lead."}


# ═══════════════════════════════════════════════════════════════════════════════
# ACTIVITIES: MEETINGS
# ═══════════════════════════════════════════════════════════════════════════════
from database import Meeting, Product, CRMQuote, QuoteItem, SalesOrder, PurchaseOrder, Case, Solution

class MeetingCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    meeting_type: str = "Meeting"
    status: str = "Scheduled"
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    host_id: Optional[int] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    attendees: Optional[List[str]] = []
    notes: Optional[str] = None

class MeetingUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    meeting_type: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    attendees: Optional[List[str]] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None

def _meeting_dict(m: Meeting, session: Session) -> dict:
    host = session.get(User, m.host_id) if m.host_id else None
    lead = session.get(Lead, m.lead_id) if m.lead_id else None
    client = session.get(ClientProfile, m.client_id) if m.client_id else None
    return {
        "id": m.id, "title": m.title, "description": m.description,
        "location": m.location, "meeting_type": m.meeting_type,
        "status": m.status,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "duration_minutes": m.duration_minutes,
        "host_id": m.host_id, "host_name": host.name if host else None,
        "lead_id": m.lead_id, "lead_name": lead.company_name if lead else None,
        "client_id": m.client_id, "client_name": client.companyName if client else None,
        "attendees": m.attendees or [],
        "notes": m.notes, "outcome": m.outcome,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat(),
    }

@app.get("/meetings")
def list_meetings(
    status: Optional[str] = None,
    lead_id: Optional[int] = None,
    client_id: Optional[int] = None,
    session: Session = Depends(get_session)
):
    q = select(Meeting).order_by(Meeting.scheduled_at.desc())
    if status:
        q = q.where(Meeting.status == status)
    if lead_id:
        q = q.where(Meeting.lead_id == lead_id)
    if client_id:
        q = q.where(Meeting.client_id == client_id)
    meetings = session.exec(q).all()
    return {"meetings": [_meeting_dict(m, session) for m in meetings]}

@app.post("/meetings")
def create_meeting(body: MeetingCreateRequest, session: Session = Depends(get_session)):
    data = body.model_dump()
    if data.get("scheduled_at"):
        try:
            data["scheduled_at"] = datetime.fromisoformat(data["scheduled_at"])
        except Exception:
            data["scheduled_at"] = None
    else:
        data["scheduled_at"] = None
    m = Meeting(**data)
    session.add(m)
    session.commit()
    session.refresh(m)

    to_email = None
    if m.client_id:
        c = session.get(ClientProfile, m.client_id)
        if c: to_email = c.email
    elif m.lead_id:
        l = session.get(Lead, m.lead_id)
        if l: to_email = l.email
    elif m.contact_id:
        ct = session.get(Contact, m.contact_id)
        if ct: to_email = ct.email

    if to_email:
        try:
            dt_str = m.scheduled_at.strftime("%Y-%m-%d %H:%M") if m.scheduled_at else "TBD"
            subject = f"Meeting Scheduled: {m.title}"
            content = f"Hello,\n\nA meeting has been scheduled for {dt_str}.\nTopic: {m.title}\n\nThanks,\nSerpHawk CRM"
            
            _send_notification_email(to_email, subject, content)
            
            session.add(SentEmail(
                client_id=m.client_id,
                lead_id=m.lead_id,
                to_address=to_email,
                subject=subject,
                body_content=content,
                status="Sent",
                provider="System"
            ))
            session.commit()
        except Exception as e:
            print("Failed to send meeting email:", e)
            
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("New Meeting Scheduled", _meeting_dict(m, session), f"{base_url}/meetings")
    except Exception as e:
        print("WhatsApp Error:", e)

    return {"meeting": _meeting_dict(m, session)}

@app.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: int, session: Session = Depends(get_session)):
    m = session.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"meeting": _meeting_dict(m, session)}

@app.put("/meetings/{meeting_id}")
def update_meeting(meeting_id: int, body: MeetingUpdateRequest, session: Session = Depends(get_session)):
    m = session.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    updates = body.model_dump(exclude_unset=True)
    if "scheduled_at" in updates:
        if updates["scheduled_at"]:
            try:
                updates["scheduled_at"] = datetime.fromisoformat(updates["scheduled_at"])
            except Exception:
                updates["scheduled_at"] = None
        else:
            updates["scheduled_at"] = None
    for k, v in updates.items():
        setattr(m, k, v)
    m.updated_at = datetime.utcnow()
    session.add(m)
    session.commit()
    session.refresh(m)
    
    # ── WHATSAPP NOTIFICATION ──
    try:
        from modules.whatsapp import send_ai_polished_whatsapp_message
        base_url = "https://crm-seo.allytechcourses.com"
        send_ai_polished_whatsapp_message("Meeting Updated", _meeting_dict(m, session), f"{base_url}/meetings")
    except Exception as e:
        print("WhatsApp Error:", e)
        
    return {"meeting": _meeting_dict(m, session)}

@app.delete("/meetings/{meeting_id}")
def delete_meeting(meeting_id: int, session: Session = Depends(get_session)):
    m = session.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    session.delete(m)
    session.commit()
    return {"ok": True}

@app.post("/meetings/import")
async def import_meetings(file: UploadFile = File(...), session: Session = Depends(get_session)):
    """Import meetings from CSV/Excel"""
    import pandas as pd, io
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content)) if file.filename.endswith((".xlsx",".xls")) else pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")
    imported = 0
    for _, row in df.iterrows():
        try:
            m = Meeting(
                title=str(row.get("title") or row.get("Title") or "Imported Meeting"),
                description=str(row.get("description") or row.get("Description") or "") or None,
                notes=str(row.get("notes") or row.get("Notes") or "") or None,
                status=str(row.get("status") or row.get("Status") or "Scheduled"),
                meeting_type=str(row.get("meeting_type") or row.get("Type") or "Meeting"),
            )
            session.add(m)
            imported += 1
        except Exception:
            pass
    session.commit()
    return {"imported": imported}


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY: PRODUCTS
# ═══════════════════════════════════════════════════════════════════════════════

class ProductCreateRequest(BaseModel):
    name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_price: float = 0.0
    currency: str = "USD"
    tax_rate: float = 0.0
    stock_quantity: Optional[int] = None
    is_active: bool = True

class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_price: Optional[float] = None
    tax_rate: Optional[float] = None
    stock_quantity: Optional[int] = None
    is_active: Optional[bool] = None

@app.get("/products")
def list_products(category: Optional[str] = None, active_only: bool = False, session: Session = Depends(get_session)):
    q = select(Product).order_by(Product.name)
    if category:
        q = q.where(Product.category == category)
    if active_only:
        q = q.where(Product.is_active == True)
    products = session.exec(q).all()
    return {"products": [p.model_dump() for p in products]}

@app.post("/products")
def create_product(body: ProductCreateRequest, session: Session = Depends(get_session)):
    p = Product(**body.model_dump())
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"product": p.model_dump()}

@app.get("/products/{product_id}")
def get_product(product_id: int, session: Session = Depends(get_session)):
    p = session.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"product": p.model_dump()}

@app.put("/products/{product_id}")
def update_product(product_id: int, body: ProductUpdateRequest, session: Session = Depends(get_session)):
    p = session.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"product": p.model_dump()}

@app.delete("/products/{product_id}")
def delete_product(product_id: int, session: Session = Depends(get_session)):
    p = session.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    session.delete(p)
    session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY: QUOTES
# ═══════════════════════════════════════════════════════════════════════════════

class QuoteCreateRequest(BaseModel):
    title: str
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    status: str = "Draft"
    currency: str = "USD"
    valid_until: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    owner_id: Optional[int] = None

@app.get("/quotes")
def list_quotes(status: Optional[str] = None, client_id: Optional[int] = None, lead_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(CRMQuote).order_by(CRMQuote.created_at.desc())
    if status:
        q = q.where(CRMQuote.status == status)
    if client_id:
        q = q.where(CRMQuote.client_id == client_id)
    if lead_id:
        q = q.where(CRMQuote.lead_id == lead_id)
    quotes = session.exec(q).all()
    return {"quotes": [_quote_dict(qt, session) for qt in quotes]}

def _quote_dict(qt: CRMQuote, session: Session) -> dict:
    client = session.get(ClientProfile, qt.client_id) if qt.client_id else None
    lead = session.get(Lead, qt.lead_id) if qt.lead_id else None
    items = session.exec(select(QuoteItem).where(QuoteItem.quote_id == qt.id)).all()
    d = qt.model_dump()
    d["client_name"] = client.companyName if client else None
    d["lead_name"] = lead.company_name if lead else None
    d["items"] = [i.model_dump() for i in items]
    return d

@app.post("/quotes")
def create_quote(body: QuoteCreateRequest, session: Session = Depends(get_session)):
    import random, string
    q = CRMQuote(**body.model_dump())
    q.quote_number = "QT-" + "".join(random.choices(string.digits, k=6))
    session.add(q)
    session.commit()
    session.refresh(q)
    return {"quote": _quote_dict(q, session)}

@app.get("/quotes/{quote_id}")
def get_quote(quote_id: int, session: Session = Depends(get_session)):
    q = session.get(CRMQuote, quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"quote": _quote_dict(q, session)}

@app.put("/quotes/{quote_id}")
def update_quote(quote_id: int, body: QuoteCreateRequest, session: Session = Depends(get_session)):
    q = session.get(CRMQuote, quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(q, k, v)
    q.updated_at = datetime.utcnow()
    session.add(q)
    session.commit()
    session.refresh(q)
    return {"quote": _quote_dict(q, session)}

@app.delete("/quotes/{quote_id}")
def delete_quote(quote_id: int, session: Session = Depends(get_session)):
    q = session.get(CRMQuote, quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    session.delete(q)
    session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY: SALES ORDERS
# ═══════════════════════════════════════════════════════════════════════════════

class SalesOrderCreateRequest(BaseModel):
    quote_id: Optional[int] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    status: str = "Pending"
    grand_total: float = 0.0
    currency: str = "USD"
    delivery_date: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None

@app.get("/sales-orders")
def list_sales_orders(status: Optional[str] = None, client_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(SalesOrder).order_by(SalesOrder.created_at.desc())
    if status:
        q = q.where(SalesOrder.status == status)
    if client_id:
        q = q.where(SalesOrder.client_id == client_id)
    orders = session.exec(q).all()
    return {"orders": [_so_dict(o, session) for o in orders]}

def _so_dict(o: SalesOrder, session: Session) -> dict:
    client = session.get(ClientProfile, o.client_id) if o.client_id else None
    d = o.model_dump()
    d["client_name"] = client.companyName if client else None
    return d

@app.post("/sales-orders")
def create_sales_order(body: SalesOrderCreateRequest, session: Session = Depends(get_session)):
    import random, string
    o = SalesOrder(**body.model_dump())
    o.order_number = "SO-" + "".join(random.choices(string.digits, k=6))
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": _so_dict(o, session)}

@app.put("/sales-orders/{order_id}")
def update_sales_order(order_id: int, body: SalesOrderCreateRequest, session: Session = Depends(get_session)):
    o = session.get(SalesOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Sales order not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(o, k, v)
    o.updated_at = datetime.utcnow()
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": _so_dict(o, session)}

@app.delete("/sales-orders/{order_id}")
def delete_sales_order(order_id: int, session: Session = Depends(get_session)):
    o = session.get(SalesOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Sales order not found")
    session.delete(o)
    session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY: PURCHASE ORDERS
# ═══════════════════════════════════════════════════════════════════════════════

class PurchaseOrderCreateRequest(BaseModel):
    vendor_name: str
    vendor_email: Optional[str] = None
    status: str = "Draft"
    grand_total: float = 0.0
    currency: str = "USD"
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None

@app.get("/purchase-orders")
def list_purchase_orders(status: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())
    if status:
        q = q.where(PurchaseOrder.status == status)
    orders = session.exec(q).all()
    return {"orders": [o.model_dump() for o in orders]}

@app.post("/purchase-orders")
def create_purchase_order(body: PurchaseOrderCreateRequest, session: Session = Depends(get_session)):
    import random, string
    o = PurchaseOrder(**body.model_dump())
    o.po_number = "PO-" + "".join(random.choices(string.digits, k=6))
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": o.model_dump()}

@app.put("/purchase-orders/{order_id}")
def update_purchase_order(order_id: int, body: PurchaseOrderCreateRequest, session: Session = Depends(get_session)):
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(o, k, v)
    o.updated_at = datetime.utcnow()
    session.add(o)
    session.commit()
    session.refresh(o)
    return {"order": o.model_dump()}

@app.delete("/purchase-orders/{order_id}")
def delete_purchase_order(order_id: int, session: Session = Depends(get_session)):
    o = session.get(PurchaseOrder, order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    session.delete(o)
    session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# SUPPORT: CASES
# ═══════════════════════════════════════════════════════════════════════════════

class CaseCreateRequest(BaseModel):
    subject: str
    description: Optional[str] = None
    status: str = "Open"
    priority: str = "Medium"
    category: Optional[str] = None
    lead_id: Optional[int] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    assigned_to: Optional[int] = None

class CaseUpdateRequest(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigned_to: Optional[int] = None
    resolution: Optional[str] = None

def _case_dict(c: Case, session: Session) -> dict:
    client = session.get(ClientProfile, c.client_id) if c.client_id else None
    lead = session.get(Lead, c.lead_id) if c.lead_id else None
    assignee = session.get(User, c.assigned_to) if c.assigned_to else None
    d = c.model_dump()
    d["client_name"] = client.companyName if client else None
    d["lead_name"] = lead.company_name if lead else None
    d["assignee_name"] = assignee.name if assignee else None
    d["resolved_at"] = c.resolved_at.isoformat() if c.resolved_at else None
    d["created_at"] = c.created_at.isoformat()
    d["updated_at"] = c.updated_at.isoformat()
    return d

@app.get("/cases")
def list_cases(status: Optional[str] = None, priority: Optional[str] = None, client_id: Optional[int] = None, session: Session = Depends(get_session)):
    q = select(Case).order_by(Case.created_at.desc())
    if status:
        q = q.where(Case.status == status)
    if priority:
        q = q.where(Case.priority == priority)
    if client_id:
        q = q.where(Case.client_id == client_id)
    cases = session.exec(q).all()
    return {"cases": [_case_dict(c, session) for c in cases]}

@app.post("/cases")
def create_case(body: CaseCreateRequest, session: Session = Depends(get_session)):
    import random, string
    c = Case(**body.model_dump())
    c.case_number = "CASE-" + "".join(random.choices(string.digits, k=5))
    session.add(c)
    session.commit()
    session.refresh(c)
    return {"case": _case_dict(c, session)}

@app.get("/cases/{case_id}")
def get_case(case_id: int, session: Session = Depends(get_session)):
    c = session.get(Case, case_id)
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"case": _case_dict(c, session)}

@app.put("/cases/{case_id}")
def update_case(case_id: int, body: CaseUpdateRequest, session: Session = Depends(get_session)):
    c = session.get(Case, case_id)
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    updates = body.model_dump(exclude_unset=True)
    if updates.get("status") in ("Resolved", "Closed") and not c.resolved_at:
        c.resolved_at = datetime.utcnow()
    for k, v in updates.items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)
    return {"case": _case_dict(c, session)}

@app.delete("/cases/{case_id}")
def delete_case(case_id: int, session: Session = Depends(get_session)):
    c = session.get(Case, case_id)
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    session.delete(c)
    session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# SUPPORT: SOLUTIONS
# ═══════════════════════════════════════════════════════════════════════════════

class SolutionCreateRequest(BaseModel):
    title: str
    content: str
    category: Optional[str] = None
    tags: Optional[List[str]] = []
    is_published: bool = True
    author_id: Optional[int] = None

class SolutionUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_published: Optional[bool] = None

@app.get("/solutions")
def list_solutions(category: Optional[str] = None, q: Optional[str] = None, session: Session = Depends(get_session)):
    query = select(Solution).where(Solution.is_published == True).order_by(Solution.view_count.desc())
    if category:
        query = query.where(Solution.category == category)
    solutions = session.exec(query).all()
    if q:
        solutions = [s for s in solutions if q.lower() in s.title.lower() or q.lower() in s.content.lower()]
    return {"solutions": [s.model_dump() for s in solutions]}

@app.post("/solutions")
def create_solution(body: SolutionCreateRequest, session: Session = Depends(get_session)):
    s = Solution(**body.model_dump())
    session.add(s)
    session.commit()
    session.refresh(s)
    return {"solution": s.model_dump()}

@app.get("/solutions/{solution_id}")
def get_solution(solution_id: int, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if not s:
        raise HTTPException(status_code=404, detail="Solution not found")
    s.view_count += 1
    session.add(s)
    session.commit()
    return {"solution": s.model_dump()}

@app.put("/solutions/{solution_id}")
def update_solution(solution_id: int, body: SolutionUpdateRequest, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if not s:
        raise HTTPException(status_code=404, detail="Solution not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return {"solution": s.model_dump()}

@app.delete("/solutions/{solution_id}")
def delete_solution(solution_id: int, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if not s:
        raise HTTPException(status_code=404, detail="Solution not found")
    session.delete(s)
    session.commit()
    return {"ok": True}

@app.post("/solutions/{solution_id}/helpful")
def mark_solution_helpful(solution_id: int, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if not s:
        raise HTTPException(status_code=404, detail="Solution not found")
    s.helpful_count += 1
    session.add(s)
    session.commit()
    return {"helpful_count": s.helpful_count}

@app.post("/leads/{lead_id}/simulate-call")
def simulate_lead_call(lead_id: int, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead: raise HTTPException(status_code=404, detail="Lead not found")
    
    client_name = lead.company_name or "Valued Lead"
    industry = lead.industry or "Unknown Industry"
    notes = lead.notes or "No prior notes."
    
    prompt = f"""You are an expert sales representative for "SERP Hawk" (an elite SEO and Digital Marketing Agency).
Your task is to write a highly tailored, direct sales script to be read over the phone to this specific lead. 
DO NOT use generic placeholders like "[Your Name]" or "[Your Company]" - assume the persona of a SERP Hawk sales rep.

Lead Profile:
Company Name: {client_name}
Industry: {industry}
Website: {lead.website or 'Unknown'}
Source: {lead.source or 'Unknown'}

Notes from our CRM:
{notes}

Recent Activity:
{lead.last_activity or 'No recent activity'}

Instructions:
1. Write the exact word-for-word script that the sales person will read on the call.
2. Directly reference their specific company name, their industry, and any past notes or activities.
3. Pitch SERP Hawk's services (e.g. SEO, link building, digital marketing) as the solution to their specific needs.
4. Make it conversational, persuasive, and professional.
5. Structure it logically: Intro -> Value Proposition -> Direct referencing of their situation -> Call to Action (Next steps).
6. Output ONLY the script, no meta-commentary. Use clear Markdown for readability."""

    from modules.llm_engine import get_openai_client
    try:
        openai_client = get_openai_client()
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        pitch = response.choices[0].message.content or ""
    except Exception as e:
        print("Error in lead simulation:", e)
        raise HTTPException(status_code=500, detail=f"Failed to simulate call: {str(e)}")
        
    call = CallLog(
        phone_number=lead.phone or "Unknown",
        duration_seconds=180,
        summary=f"Pitch Generation for {client_name}",
        description=pitch,
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    
    return {"ok": True, "call_id": call.id, "pitch": pitch}

@app.post("/contacts/{contact_id}/simulate-call")
def simulate_contact_call(contact_id: int, session: Session = Depends(get_session)):
    contact = session.get(Contact, contact_id)
    if not contact: raise HTTPException(status_code=404, detail="Contact not found")
    
    client_name = f"{contact.first_name} {contact.last_name or ''}".strip() or "Valued Contact"
    department = contact.department or "Unknown Department"
    designation = contact.designation or "Unknown Title"
    notes = contact.notes or "No prior notes."
    
    prompt = f"""You are an expert sales representative for "SERP Hawk" (an elite SEO and Digital Marketing Agency).
Your task is to write a highly tailored, direct sales script to be read over the phone to this specific contact. 
DO NOT use generic placeholders like "[Your Name]" or "[Your Company]" - assume the persona of a SERP Hawk sales rep.

Contact Profile:
Name: {client_name}
Title/Designation: {designation}
Department: {department}
Email: {contact.email or 'Unknown'}
LinkedIn: {contact.linkedin_url or 'Unknown'}

Notes from our CRM:
{notes}

Instructions:
1. Write the exact word-for-word script that the sales person will read on the call.
2. Directly reference their specific name, their role/title, and any past notes.
3. Pitch SERP Hawk's services (e.g. SEO, link building, digital marketing) as the solution to their specific needs.
4. Make it conversational, persuasive, and professional.
5. Structure it logically: Intro -> Value Proposition -> Direct referencing of their situation -> Call to Action (Next steps).
6. Output ONLY the script, no meta-commentary. Use clear Markdown for readability."""

    from modules.llm_engine import get_openai_client
    try:
        openai_client = get_openai_client()
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        pitch = response.choices[0].message.content or ""
    except Exception as e:
        print("Error in contact simulation:", e)
        raise HTTPException(status_code=500, detail=f"Failed to simulate call: {str(e)}")
        
    call = CallLog(
        phone_number=contact.mobile_number or "Unknown",
        duration_seconds=180,
        summary=f"Pitch Generation for {client_name}",
        description=pitch,
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    
    return {"ok": True, "call_id": call.id, "pitch": pitch}

@app.get("/work-queue")
def get_work_queue(
    user_id: int = Query(...),
    role: str = Query(...),
    date_filter: str = Query("today"),
    session: Session = Depends(get_session)
):
    try:
        today_date = date.today()
        if date_filter == "yesterday":
            target_date = today_date - timedelta(days=1)
        elif date_filter == "tomorrow":
            target_date = today_date + timedelta(days=1)
        else:
            target_date = today_date
            
        start_dt = datetime.combine(target_date, datetime.min.time())
        end_dt = datetime.combine(target_date, datetime.max.time())
        
        is_admin = role == "Admin"
        
        # 1. Tasks
        tasks_q = session.query(Task).filter(Task.due_date >= start_dt, Task.due_date <= end_dt)
        if not is_admin:
            tasks_q = tasks_q.filter(Task.assignee_id == user_id)
        tasks = tasks_q.all()
        
        # 2. Meetings
        meetings_q = session.query(Meeting).filter(Meeting.scheduled_at >= start_dt, Meeting.scheduled_at <= end_dt)
        if not is_admin:
            meetings_q = meetings_q.filter(Meeting.host_id == user_id)
        meetings = meetings_q.all()
        
        # 3. Scheduled Calls
        calls_q = session.query(ScheduledCall).filter(ScheduledCall.scheduled_at >= start_dt, ScheduledCall.scheduled_at <= end_dt)
        if not is_admin:
            calls_q = calls_q.filter(ScheduledCall.assigned_to == user_id)
        calls = calls_q.all()
        
        # 4. Leads (using created_at as proxy for activity if followup doesn't exist, wait Lead has no followup_date)
        # We'll just show leads created on that day
        leads_q = session.query(Lead).filter(Lead.created_at >= start_dt, Lead.created_at <= end_dt)
        if not is_admin:
            leads_q = leads_q.filter(Lead.owner_id == user_id)
        leads = leads_q.all()
        
        # 5. Contacts
        contacts_q = session.query(Contact).filter(Contact.created_at >= start_dt, Contact.created_at <= end_dt)
        if not is_admin:
            contacts_q = contacts_q.filter(Contact.owner_id == user_id)
        contacts = contacts_q.all()
        
        # 6. Deals
        deals_q = session.query(Deal).filter(Deal.created_at >= start_dt, Deal.created_at <= end_dt)
        if not is_admin:
            deals_q = deals_q.filter(Deal.owner_id == user_id)
        deals = deals_q.all()
        
        return {
            "ok": True,
            "date": target_date.isoformat(),
            "tasks": tasks,
            "meetings": meetings,
            "calls": calls,
            "leads": leads,
            "contacts": contacts,
            "deals": deals
        }
    except Exception as e:
        print("Work Queue Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

# ──────────────────────────────────────────────────────
# EMAIL TRACKER APIs
# ──────────────────────────────────────────────────────

import os
import json
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import google.auth.transport.requests
from google.oauth2.credentials import Credentials

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

def get_google_oauth_flow(state=None):
    client_config = {
        "web": {
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=['https://www.googleapis.com/auth/gmail.readonly'],
        redirect_uri="http://localhost:8000/auth/google/callback"
    )

@app.get("/auth/google/login")
def google_oauth_login(user_id: int):
    if not os.environ.get("GOOGLE_CLIENT_ID"):
        return RedirectResponse(url=f"http://localhost:3000/admin/settings?error=Missing_Google_Keys")
        
    flow = get_google_oauth_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=str(user_id)
    )
    return RedirectResponse(url=authorization_url)

@app.get("/auth/google/callback")
def google_oauth_callback(state: str, code: str, session: Session = Depends(get_session)):
    flow = get_google_oauth_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials
    
    service = build('gmail', 'v1', credentials=credentials)
    profile = service.users().getProfile(userId='me').execute()
    email_address = profile['emailAddress']
    
    user_id = int(state)
    integration = session.query(EmailIntegration).filter_by(user_id=user_id, email_address=email_address).first()
    
    if not integration:
        integration = EmailIntegration(
            user_id=user_id,
            email_address=email_address,
            provider="Gmail",
            status="Connected"
        )
        session.add(integration)
        
    integration.access_token = credentials.token
    integration.refresh_token = credentials.refresh_token or integration.refresh_token
    integration.token_expiry = credentials.expiry
    session.commit()
    
    return RedirectResponse(url="http://localhost:3000/admin/settings")

@app.get("/email-integrations")
def get_email_integrations(user_id: int, session: Session = Depends(get_session)):
    integrations = session.query(EmailIntegration).filter(EmailIntegration.user_id == user_id).all()
    return {"ok": True, "integrations": integrations}

@app.post("/email-integrations/{integration_id}/sync")
def sync_email_integration(integration_id: int, session: Session = Depends(get_session)):
    integration = session.get(EmailIntegration, integration_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
        
    if not integration.access_token:
        raise HTTPException(status_code=400, detail="Missing OAuth token. Please reconnect.")
        
    creds = Credentials(
        token=integration.access_token,
        refresh_token=integration.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )
    
    if creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        integration.access_token = creds.token
        integration.token_expiry = creds.expiry
        session.commit()
        
    service = build('gmail', 'v1', credentials=creds)
    results = service.users().messages().list(userId='me', maxResults=5).execute()
    messages = results.get('messages', [])
    
    if not messages:
        return {"ok": True, "count": 0, "emails": []}
        
    extracted = []
    from modules.llm_engine import get_openai_client
    import re
    
    for msg in messages:
        txt = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
        payload = txt.get('payload', {})
        headers = payload.get('headers', [])
        
        subject = "No Subject"
        sender = "Unknown Sender"
        
        for d in headers:
            if d['name'] == 'Subject':
                subject = d['value']
            if d['name'] == 'From':
                sender = d['value']
                
        snippet = txt.get('snippet', '')
        
        prompt = f"""
        Classify this inbound email for a digital marketing agency CRM.
        Sender: {sender}
        Subject: {subject}
        Body: {snippet}
        
        Return ONLY a JSON object with:
        - suggested_type: string (Lead, Client, Spam, Inquiry)
        - ai_analysis: string (Brief 1 sentence explanation)
        """
        try:
            openai_client = get_openai_client()
            response = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            data = json.loads(response.choices[0].message.content or "{}")
            suggested_type = data.get("suggested_type", "Unknown")
            ai_analysis = data.get("ai_analysis", "")
        except Exception:
            suggested_type = "Unknown"
            ai_analysis = "Failed to classify"
            
        match = re.match(r"(.*)<(.*)>", sender)
        if match:
            sender_name = match.group(1).strip()
            sender_email = match.group(2).strip()
        else:
            sender_name = sender
            sender_email = sender

        new_email = ExtractedEmail(
            integration_id=integration.id,
            sender_name=sender_name,
            sender_email=sender_email,
            subject=subject,
            body_snippet=snippet,
            suggested_type=suggested_type,
            ai_analysis=ai_analysis
        )
        session.add(new_email)
        extracted.append(new_email)
        
    integration.last_synced_at = datetime.utcnow()
    session.commit()
    
    # Refresh objects so they have DB IDs
    for e in extracted:
        session.refresh(e)
        
        # ── WHATSAPP NOTIFICATION ──
        try:
            from modules.whatsapp import send_ai_polished_whatsapp_message
            base_url = "https://crm-seo.allytechcourses.com"
            send_ai_polished_whatsapp_message("New Incoming Email", e.dict(), f"{base_url}/admin/settings?tab=email_tracker")
        except Exception as ex:
            print("WhatsApp Email Hook Error:", ex)

    return {"ok": True, "count": len(extracted), "emails": [e.dict() for e in extracted]}
@app.get("/extracted-emails")
def get_extracted_emails(user_id: int, session: Session = Depends(get_session)):
    emails = session.query(ExtractedEmail).join(EmailIntegration).filter(
        EmailIntegration.user_id == user_id,
        ExtractedEmail.status == "Pending"
    ).order_by(ExtractedEmail.created_at.desc()).all()
    return {"ok": True, "emails": emails}

class VerifyEmailRequest(BaseModel):
    action: str # convert_to_lead, convert_to_client, dismiss

@app.post("/extracted-emails/{email_id}/verify")
def verify_extracted_email(email_id: int, data: VerifyEmailRequest, session: Session = Depends(get_session)):
    email_obj = session.get(ExtractedEmail, email_id)
    if not email_obj:
        raise HTTPException(status_code=404, detail="Email not found")
        
    integration = session.get(EmailIntegration, email_obj.integration_id)
    user_id = integration.user_id if integration else None
    
    if data.action == "dismiss":
        email_obj.status = "Dismissed"
    elif data.action == "convert_to_lead":
        email_obj.status = "Verified_Lead"
        lead = Lead(
            company_name=email_obj.sender_name,
            email=email_obj.sender_email,
            source="Email Tracker",
            owner_id=user_id,
            status="New",
            notes=email_obj.body_snippet
        )
        session.add(lead)
    elif data.action == "convert_to_client":
        email_obj.status = "Verified_Client"
        client = ClientProfile(
            companyName=email_obj.sender_name,
            customFields={"email": email_obj.sender_email},
            status="Active",
            lead_source="Email Tracker",
            assignedEmployeeId=user_id
        )
        session.add(client)
        
    session.commit()
    return {"ok": True, "status": email_obj.status}

from fastapi.responses import PlainTextResponse

@app.post("/whatsapp-webhook")
async def whatsapp_webhook(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    From: str = Form(...),
    Body: str = Form(default=""),
    NumMedia: str = Form(default="0"),
    MediaUrl0: Optional[str] = Form(default=None),
    MediaContentType0: Optional[str] = Form(default=None),
):
    from database import WhatsAppSession
    from modules.llm_engine import process_whatsapp_command
    from modules.whatsapp import send_whatsapp_message
    import json

    # Helper: normalise the sender number so we can push outbound messages
    # From arrives as "whatsapp:+919502901416" — strip the prefix for our helper
    # which re-adds it internally.
    sender_number = From  # keep original for DB lookups
    # We pass From directly to send_whatsapp_message; that function handles the prefix.

    # ── Empty TwiML we always return so Twilio never waits / times-out ───
    EMPTY_TWIML = PlainTextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml"
    )

    # ── Step 0: Voice message detection & transcription ───────────────────
    # Twilio sets NumMedia >= 1 and MediaContentType0 = audio/* for voice notes.
    voice_transcript = None
    if int(NumMedia or 0) >= 1 and MediaUrl0 and (MediaContentType0 or "").startswith("audio/"):
        account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        auth_token  = os.environ.get("TWILIO_AUTH_TOKEN", "")
        try:
            from modules.whatsapp import transcribe_voice_message
            # ① Immediately ACK so the user knows we got it
            send_whatsapp_message(
                "🎙️ Got your voice note! Transcribing and processing... give me a moment ⏳",
                From
            )
            voice_transcript = transcribe_voice_message(MediaUrl0, account_sid, auth_token)
            # Use the transcript as the body for downstream processing
            Body = voice_transcript
            print(f"[Voice] Final transcript: {voice_transcript}")
        except Exception as ve:
            print(f"[Voice] Transcription failed: {ve}")
            send_whatsapp_message(
                "🎙️ I received your voice note but couldn't transcribe it. "
                "Please try again or type your request.",
                From
            )
            return EMPTY_TWIML
            
    # ── Step 0.5: Image detection & processing (Business Cards, IDs) ──────
    image_data = None
    if int(NumMedia or 0) >= 1 and MediaUrl0 and (MediaContentType0 or "").startswith("image/"):
        account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        auth_token  = os.environ.get("TWILIO_AUTH_TOKEN", "")
        try:
            send_whatsapp_message(
                "🖼️ Got your image! Scanning for details... ⏳",
                From
            )
            print(f"[Image] Downloading image from: {MediaUrl0}")
            import requests, base64
            from requests.auth import HTTPBasicAuth
            img_resp = requests.get(
                MediaUrl0,
                auth=HTTPBasicAuth(account_sid, auth_token),
                timeout=30
            )
            img_resp.raise_for_status()
            base64_img = base64.b64encode(img_resp.content).decode('utf-8')
            image_data = {
                "base64": base64_img,
                "mime_type": MediaContentType0
            }
            print(f"[Image] Successfully downloaded and encoded image ({len(img_resp.content)} bytes)")
        except Exception as e:
            print(f"[Image] Failed to download or process image: {e}")
            send_whatsapp_message(
                "❌ Sorry, I couldn't process the image you sent.",
                From
            )
            return EMPTY_TWIML

    # 1. Authorize sender
    if not From.endswith("9502901416"):
        return EMPTY_TWIML
        
    msg_text = Body.strip().lower()
    
    # 2. Check for existing session (pending action or active live chat)
    ws_session = session.exec(select(WhatsAppSession).where(WhatsAppSession.phone_number == From)).first()
    
    # 2.1 Handle Active Live Chat Messages
    if ws_session and ws_session.active_live_chat_session:
        print(f"[WhatsApp Flow] User is in active live chat session: {ws_session.active_live_chat_session}")
        if msg_text == "end":
            from database import LiveChatSession
            lcs = session.exec(select(LiveChatSession).where(LiveChatSession.session_id == ws_session.active_live_chat_session)).first()
            if lcs:
                lcs.status = "ended"
            session.delete(ws_session)
            session.commit()
            send_whatsapp_message("✅ Live chat ended. You can now send CRM commands again.", From)
            return EMPTY_TWIML
        else:
            from database import LiveChatMessage
            # Forward msg to live chat
            chat_msg = LiveChatMessage(
                session_id=ws_session.active_live_chat_session,
                sender="admin",
                message=Body.strip()
            )
            session.add(chat_msg)
            session.commit()
            print("[WhatsApp Flow] Message forwarded to live chat. Exiting.")
            return EMPTY_TWIML
    
    # 2.2 Handle Pending Actions
    previous_state = None
    if ws_session and ws_session.pending_action:
        print(f"[WhatsApp Flow] User has pending action: {ws_session.pending_action}")
        action = ws_session.pending_action
        args = json.loads(ws_session.action_data)
        
        is_confirm = False
        if action == "add_entity" and msg_text in ["1", "2", "3"]:
            is_confirm = True
        elif action != "add_entity" and msg_text in ["yes", "y"]:
            is_confirm = True

        if is_confirm:
            reply_msg = "Action confirmed and executed."
            
            # Execute actions based on type
            if action == "claim_live_chat":
                session_id = args.get("session_id")
                from database import LiveChatSession
                lcs = session.exec(select(LiveChatSession).where(LiveChatSession.session_id == session_id)).first()
                if lcs:
                    lcs.status = "active"
                    ws_session.active_live_chat_session = session_id
                    ws_session.pending_action = None
                    ws_session.action_data = None
                    session.commit()
                    send_whatsapp_message(
                        "✅ Live chat connected! Anything you type now will be sent to the visitor. Type *END* to disconnect.",
                        From
                    )
                    return EMPTY_TWIML
                else:
                    reply_msg = "Live chat session expired or not found."
                    session.delete(ws_session)
            # ── Action: add_entity (replaces add_lead and add_client) ────────
            elif action == "add_entity":
                name = args.get('name', 'Unknown')
                email = args.get('email')
                phone = args.get('phone')
                website = args.get('website')
                notes_text = args.get('notes')

                if msg_text == "1": # Client
                    from database import ClientProfile, ClientNote
                    new_client = ClientProfile(
                        companyName=name,
                        phone=phone,
                        websiteUrl=website,
                        status="Active",
                        lead_source="WhatsApp Voice",
                    )
                    if email:
                        new_client.customFields = {"email": email}
                    session.add(new_client)
                    session.commit()
                    session.refresh(new_client)

                    if notes_text:
                        initial_note = ClientNote(
                            client_id=new_client.id,
                            content=notes_text,
                            author_name="WhatsApp Agent",
                            tags=["voice", "onboarding"]
                        )
                        session.add(initial_note)
                        session.commit()
                    
                    reply_msg = (
                        f"✅ Client *{name}* added to CRM!\n"
                        + (f"📧 Email: {email}\n" if email else "")
                        + (f"📞 Phone: {phone}\n" if phone else "")
                        + (f"🌐 Website: {website}\n" if website else "")
                    )

                elif msg_text == "2": # Lead
                    from database import Lead, ClientProfile, ClientResearch
                    new_lead = Lead(
                        company_name=name,
                        website=website,
                        source="WhatsApp",
                        status="New"
                    )
                    session.add(new_lead)
                    
                    new_client = ClientProfile(
                        companyName=name,
                        websiteUrl=website,
                        status="Pending"
                    )
                    if email:
                        new_client.customFields = {"email": email}
                    if phone:
                        new_client.phone = phone
                    session.add(new_client)
                    session.commit()
                    session.refresh(new_lead)
                    session.refresh(new_client)

                    reply_msg = f"✅ Lead *{name}* added! Starting smart research in the background..."
                    
                    async def research_and_save(c_name, c_url, l_id, client_id):
                        try:
                            res = await smart_research(SmartResearchRequest(company_name=c_name, company_url=c_url))
                            with Session(engine) as db_session:
                                cr = ClientResearch(
                                    lead_id=l_id,
                                    client_id=client_id,
                                    email_agent_data=json.dumps(res)
                                )
                                db_session.add(cr)
                                db_session.commit()
                                from modules.whatsapp import send_whatsapp_message
                                send_whatsapp_message(f"✅ Research complete for *{c_name}*! AI draft is ready.", From)
                        except Exception as e:
                            print("Error in bg research:", e)

                    background_tasks.add_task(research_and_save, name, website, new_lead.id, new_client.id)

                elif msg_text == "3": # Contact
                    from database import Contact
                    new_contact = Contact(
                        first_name=name,
                        email=email,
                        mobile_number=phone
                    )
                    session.add(new_contact)
                    session.commit()
                    reply_msg = f"✅ Contact *{name}* added to CRM!"

                session.delete(ws_session)

            # ── Action: schedule_meeting ─────────────────────────────────────
            elif action == "schedule_meeting":
                from database import ScheduledCall
                target_name = args.get('target_name', 'Unknown')
                time_str    = args.get('time_str', 'TBD')

                new_call = ScheduledCall(
                    title=f"Meeting with {target_name}",
                    entity_name=target_name,
                    notes=f"Scheduled via WhatsApp voice: {time_str}",
                    assigned_to="Admin",
                    status="Scheduled"
                )
                session.add(new_call)
                session.commit()

                reply_msg = f"📅 Meeting with *{target_name}* scheduled for *{time_str}*! Added to your calendar."
                session.delete(ws_session)

            # ── Action: add_note ─────────────────────────────────────────────
            elif action == "add_note":
                from database import ClientNote, ClientProfile
                target_name = args.get('target_name', '')
                content     = args.get('content', '')

                # Try to find the client by name (case-insensitive partial match)
                client = session.exec(
                    select(ClientProfile).where(
                        ClientProfile.companyName.ilike(f"%{target_name}%")
                    )
                ).first()

                if client:
                    note = ClientNote(
                        client_id=client.id,
                        content=content,
                        author_name="WhatsApp Agent",
                        tags=["voice"]
                    )
                    session.add(note)
                    session.commit()
                    reply_msg = f"📝 Note added to *{client.companyName}*: \"{content[:80]}{'...' if len(content) > 80 else ''}\""
                else:
                    reply_msg = (
                        f"⚠️ Couldn't find a client named *{target_name}*. "
                        f"Please check the name and try again."
                    )
                session.delete(ws_session)

            # ── Action: add_task ─────────────────────────────────────────────
            elif action == "add_task":
                from database import Task, ClientProfile
                title       = args.get('title', 'Untitled Task')
                description = args.get('description')
                due_date    = args.get('due_date')
                priority    = args.get('priority', 'Medium')
                client_name = args.get('client_name')

                # Optionally link to a client
                client_id = None
                if client_name:
                    client = session.exec(
                        select(ClientProfile).where(
                            ClientProfile.companyName.ilike(f"%{client_name}%")
                        )
                    ).first()
                    if client:
                        client_id = client.id

                new_task = Task(
                    title=title,
                    description=description or f"Created via WhatsApp voice command.",
                    status="Todo",
                    priority=priority,
                    due_date=due_date,
                    client_id=client_id
                )
                session.add(new_task)
                session.commit()

                reply_msg = (
                    f"✅ Task created!\n"
                    f"📌 *{title}*\n"
                    + (f"📅 Due: {due_date}\n" if due_date else "")
                    + (f"🔥 Priority: {priority}\n" if priority else "")
                    + (f"🏢 Client: {client_name}\n" if client_name else "")
                )
                session.delete(ws_session)
            
            session.commit()
            print("[WhatsApp Flow] Executed pending action successfully.")
            # ② Proactively send the action result via WhatsApp API
            send_whatsapp_message(reply_msg, From)
            return EMPTY_TWIML

        elif msg_text in ["no", "cancel", "n"]:
            session.delete(ws_session)
            session.commit()
            print("[WhatsApp Flow] Pending action cancelled explicitly by user.")
            send_whatsapp_message("❌ Action cancelled. Send a new command whenever you're ready.", From)
            return EMPTY_TWIML
        else:
            # They didn't say yes/no/1/2/3, so they are providing a correction.
            print("[WhatsApp Flow] User provided correction to pending action.")
            previous_state = {
                "action": ws_session.pending_action,
                "parameters": json.loads(ws_session.action_data)
            }
            # We explicitly DO NOT delete the ws_session here. 
            # We pass previous_state to the LLM, and update the session in Step 3.
            
    # 3. No pending session (or a correction) — parse via AI
    print(f"[WhatsApp Flow] Processing command: {Body}")
    result = process_whatsapp_command(Body, previous_state, image_data)
    print(f"[WhatsApp Flow] AI Result: {result}")
    
    if result["action"] not in ["none", "error"]:
        # Save pending session to await YES/NO
        new_session = WhatsAppSession(
            phone_number=From,
            pending_action=result["action"],
            action_data=json.dumps(result["parameters"])
        )
        if ws_session:
            session.delete(ws_session)
        session.add(new_session)
        session.commit()

        # ── Build rich confirmation message ───────────────────────────────
        action_name = result["action"]
        params = result["parameters"]

        action_labels = {
            "add_entity":       "👤 Add New Entity",
            "add_note":         "📝 Add Note",
            "schedule_meeting": "📅 Schedule Meeting",
            "add_task":         "✅ Create Task",
        }
        label = action_labels.get(action_name, action_name.replace("_", " ").title())

        field_icons = {
            "name":           "👤", "email": "📧", "phone": "📞", 
            "website":        "🌐", "notes": "📋",
            "target_name":    "👤", "content":         "📋", "time_str": "🕐",
            "title":          "📌", "description":     "📋", "due_date": "📅",
            "priority":       "🔥", "client_name":     "🏢",
        }
        param_lines = ""
        for k, v in params.items():
            if v:
                icon = field_icons.get(k, "•")
                param_lines += f"\n{icon} {k.replace('_', ' ').title()}: {v}"

        # Show transcript snippet for voice messages
        voice_prefix = ""
        if voice_transcript:
            short_transcript = voice_transcript[:150] + ('...' if len(voice_transcript) > 150 else '')
            voice_prefix = f"🎙️ *I heard:* \"{short_transcript}\"\n\n"

        if action_name == "add_entity":
            confirm_msg = (
                f"{voice_prefix}"
                f"📋 *Proposed Action:* {label}{param_lines}\n\n"
                f"Where should I add this? *Reply with a number:*\n"
                f"1️⃣ Client\n"
                f"2️⃣ Lead\n"
                f"3️⃣ Contact\n\n"
                f"❌ Reply *NO* to cancel\n"
                f"✏️ *To edit:* Just reply with your corrections (e.g. 'change name to xyz')"
            )
        else:
            confirm_msg = (
                f"{voice_prefix}"
                f"📋 *Proposed Action:* {label}{param_lines}\n\n"
                f"✅ Reply *YES* to confirm\n"
                f"❌ Reply *NO* to cancel\n"
                f"✏️ *To edit:* Just reply with your corrections (e.g., 'change time to tomorrow')"
            )

        # ③ Proactively push the confirmation — no TwiML reliance
        print("[WhatsApp Flow] Sending confirmation message to user.")
        send_whatsapp_message(confirm_msg, From)
        return EMPTY_TWIML

    else:
        # Conversational reply or unrecognized input
        print("[WhatsApp Flow] Sending conversational fallback.")
        reply = result.get(
            "reply",
            "🤖 I didn't quite understand that.\n\nTry:\n• _Add client Acme Corp_\n• _Schedule meeting with Ravi tomorrow at 3pm_\n• _Note that Blue Barrier is interested in SEO_\n• Or just send a voice note!"
        )
        if voice_transcript:
            reply = f"🎙️ *I heard:* \"{voice_transcript[:100]}\"\n\n{reply}"
        send_whatsapp_message(reply, From)
        return EMPTY_TWIML

