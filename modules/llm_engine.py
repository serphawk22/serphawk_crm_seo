import os
from openai import OpenAI
import json



def get_openai_client():
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")
    return OpenAI(api_key=api_key)

def analyze_content(text):
    """
    Analyzes website text using OpenAI.
    """
    try:
        client = get_openai_client()
        prompt = f"""
        You are an expert business analyst and OSINT researcher. Given the following website text, do real research (using your knowledge and reasoning) and return a JSON object with:
        {{
            "company_name": "The real name of the company (never a placeholder)",
            "what_they_do": "A real, concise summary of what this company does (2-3 sentences, never a template)",
            "company_social_media": {{
                "linkedin": "Company LinkedIn URL or null",
                "twitter": "Company Twitter/X URL or null",
                "instagram": "Company Instagram URL or null",
                "facebook": "Company Facebook URL or null"
            }},
            "contacts": [
                {{
                    "name": "If you can infer a real contact name, otherwise null",
                    "role": "If you can infer a real role (e.g. Founder, CEO), otherwise null",
                    "email": "A real company email address (look at the 'Extracted Emails' list at the top)",
                    "phone_number": "A real company phone number (look at the 'Extracted Phone Numbers' list at the top)",
                    "personal_social_media": {{
                        "linkedin": "Personal LinkedIn URL if found, else null",
                        "twitter": "Personal Twitter/X URL if found, else null"
                    }},
                    "context": "How you found or inferred this contact, or null"
                }}
            ],
            "key_value_props": ["List of my services that best match this company (real, never prop1/prop2)"]
        }}

        My services are: Organic SEO, Local SEO, Google Ads, Meta Ads, Social Media, Content Marketing, Web Development, App Development, Automation & Consulting.
        Map the most relevant of these to the company based on their business.

        Look closely at the 'Extracted Emails', 'Extracted Phone Numbers', and any 'Social Links' in the company info below. Always prefer using the actual scraped links and emails instead of placeholders or guesses. Extract as many people/decision makers as possible.

        Company Info:
        {text[:60000]}
        """

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Error in OpenAI analysis: {e}")
        return {
            "company_name": "Unknown",
            "what_they_do": "Analysis failed",
            "contacts": [],
            "error": str(e)
        }

def generate_email(analysis, contact=None, recommended_services=None, owner_name="Varshith"):
    """
    Generates a personalized bilingual cold email using OpenAI.
    Returns english_body (para 1) and spanish_body (para 2) separately.
    """
    try:
        client = get_openai_client()
        recipient_info = f"Recipient: {contact.get('name')} ({contact.get('role')})" if contact else "General Inbox"

        company_name = analysis.get('company_name', '')
        what_they_do = analysis.get('what_they_do', analysis.get('summary', ''))
        services = analysis.get('key_value_props', [])
        website = ''
        if 'website' in analysis:
            website = analysis['website']

        # Use recommended_services if provided (from smart-research flow)
        services_to_mention = []
        if recommended_services and isinstance(recommended_services, list):
            for svc in recommended_services:
                if isinstance(svc, dict):
                    services_to_mention.append(svc.get('service_name', ''))
                elif isinstance(svc, str):
                    services_to_mention.append(svc)
        if not services_to_mention:
            services_to_mention = services

        services_list_str = ', '.join(services_to_mention) if services_to_mention else 'SEO, digital marketing, and automation'

        prompt = f"""
        You are an expert B2B outreach copywriter writing on behalf of Team DaPros (SERP Hawk Digital Agency). Use ONLY the provided company info below. Do not invent details.

        PROSPECT INFO:
        Company: {company_name}
        Website: {website}
        What they do: {what_they_do}
        {recipient_info}

        SERVICES TO HIGHLIGHT: {services_list_str}

        OUR FULL SERVICE CATALOG (for context):
        • Organic SEO — higher Google rankings, more organic traffic
        • Local SEO — dominate Google Maps & local search
        • Google Ads — targeted PPC with measurable ROI
        • Meta Ads — Facebook & Instagram campaigns that convert
        • Social Media — brand presence & audience engagement
        • Content Marketing — SEO blogs, landing pages, conversion copy
        • Web Development — fast, modern, conversion-optimized sites
        • App Development — custom mobile & web applications
        • Automation & Consulting — smart workflows & strategy

        EMAIL STRUCTURE (English):
        1. Hook (1-2 sentences) — A specific observation about {company_name}'s online presence or an opportunity you spotted. Make it personal.
        2. Problem/Opportunity (2-3 sentences) — A concrete challenge they likely face based on their industry and what they do.
        3. Service Spotlight (3-5 sentences) — For EACH service in [{services_list_str}], write one clear sentence: what it does + the measurable result for them. Use concrete outcomes like "rank on page 1", "2x local visibility", "cut ad spend waste by 30%".
        4. Social proof (1 sentence) — Mention working with similar businesses to build trust.
        5. CTA (1 sentence) — Invite them to a free 15-minute strategy call. Make it effortless.
        6. Sign-off: "Best regards,\n{owner_name} | SERP Hawk Digital Agency"

        STYLE: 120-180 words total. Short paragraphs (2-3 sentences each), separated by blank lines. Conversational, confident, zero fluff. Services are the STAR — the reader should finish knowing exactly what you offer and why it matters for them.

        Then provide the FULL Spanish translation with identical structure, signed as "Saludos cordiales,\n{owner_name} | SERP Hawk Digital Agency".

        Then provide a short, punchy WhatsApp message (English only) to send to them. Keep it under 50 words. It should be casual but professional, mention the opportunity, and ask for a quick chat.

        Then provide a short, punchy WhatsApp message (English only) to send to them. Keep it under 50 words. It should be casual but professional, mention the opportunity, and ask for a quick chat.

        Return a JSON object with exactly these fields:
        {{
            "subject": "Short benefit-focused subject (under 8 words, mention company or sector)",
            "english_body": "Full English email (short paragraphs separated by \\n\\n, plain text, no HTML)",
            "spanish_body": "Full Spanish translation (same structure, plain text, no HTML)",
            "whatsapp_draft": "Short, punchy WhatsApp message (plain text, emojis allowed)"
        }}
        """

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        # Ensure backward compatibility with 'body' key
        result["body"] = result.get("english_body", "") + "\n\n" + result.get("spanish_body", "")
        return result
    except Exception as e:
        return {"subject": "Error", "english_body": str(e), "spanish_body": "", "body": str(e)}

def analyze_document(image_bytes):
    """
    Analyzes a business card or ID card image using GPT-4o Vision and returns extracted JSON.
    Tries gpt-4o-mini first, falls back to gpt-4o on failure.
    """
    import base64
    client = get_openai_client()
    base64_image = base64.b64encode(image_bytes).decode('utf-8')

    print(f"OCR: Received image, size={len(image_bytes)} bytes")

    # Auto-detect MIME type from file magic bytes
    if len(image_bytes) >= 4 and image_bytes[:4] == b'\x89PNG':
        mime_type = "image/png"
    elif len(image_bytes) >= 2 and image_bytes[:2] == b'\xff\xd8':
        mime_type = "image/jpeg"
    elif len(image_bytes) >= 6 and image_bytes[:6] in (b'GIF87a', b'GIF89a'):
        mime_type = "image/gif"
    elif len(image_bytes) >= 12 and image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"

    print(f"OCR: Detected MIME type: {mime_type}")

    prompt = (
        "You are an expert at reading business cards and ID cards. "
        "Examine this image carefully and extract every piece of contact information visible.\n"
        "Look for: full names, company/organization names, phone numbers, mobile numbers, "
        "email addresses, and website URLs.\n"
        "Return ONLY a valid JSON object with exactly these keys:\n"
        '{\n'
        '  \"name\": \"Full name of the person (empty string if not found)\",\n'
        '  \"company_name\": \"Company or organization name (empty string if not found)\",\n'
        '  \"mobile\": \"Phone or mobile number (empty string if not found)\",\n'
        '  \"email\": \"Email address (empty string if not found)\",\n'
        '  \"website\": \"Website URL (empty string if not found)\"\n'
        '}\n'
        "Do not add any other fields or explanations. Return only the JSON."
    )

    # Try gpt-4o-mini first, fall back to gpt-4o if it fails
    for model in ["gpt-4o-mini", "gpt-4o"]:
        try:
            print(f"OCR: Trying model {model}...")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_image}",
                                    "detail": "low"
                                }
                            },
                        ],
                    }
                ],
                response_format={"type": "json_object"},
                max_tokens=500
            )

            raw = response.choices[0].message.content
            print(f"OCR raw response from {model}: {raw}")
            result = json.loads(raw)

            # Ensure all required fields exist
            result.setdefault("name", "")
            result.setdefault("company_name", "")
            result.setdefault("mobile", "")
            result.setdefault("email", "")
            result.setdefault("website", "")

            print(f"OCR Success ({model}): {result}")
            return result

        except Exception as e:
            print(f"OCR Error with {model}: {type(e).__name__}: {e}")
            if model == "gpt-4o":
                # Both models failed
                return {
                    "error": f"OCR failed: {str(e)}",
                    "name": "",
                    "company_name": "",
                    "mobile": "",
                    "email": "",
                    "website": ""
                }
            continue

def extract_tasks_from_note(note_content):
    """
    Uses GPT-4o to read a meeting note or conversation log and extract actionable tasks.
    Returns a list of dictionaries with 'title' and 'description'.
    """
    try:
        client = get_openai_client()
        prompt = f"""
        You are an expert sales assistant. Read the following meeting note or conversation log and extract all clear actionable tasks or next steps that need to be done.
        
        Note content:
        {note_content}
        
        Return ONLY a JSON object with a single key "tasks" which contains an array of objects. 
        Each task object must have exactly two keys:
        - "title": A short, clear task title (max 5-7 words).
        - "description": Additional details or context for the task.
        
        If there are no actionable tasks, return {{"tasks": []}}.
        """

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return result.get("tasks", [])
    except Exception as e:
        print(f"Error in task extraction: {e}")
        return []

def process_chatbot_command(message: str, client_context: dict = None, current_route: str = None, crm_summary: str = ""):
    """
    Analyzes user message using OpenAI Function Calling to determine one or more CRM actions.
    """
    import json
    try:
        client = get_openai_client()
        context_str = f"Client context: {json.dumps(client_context)}" if client_context else "No specific client context."
        route_str = f"User's current page route: {current_route}" if current_route else "Unknown route."
        
        system_prompt = f"""
        You are the highly advanced SERP Hawk CRM Omni-Agent. 
        Your goal is to perform operations on behalf of the user to make managing their CRM 'as easy as f***'.
        
        {route_str}
        {context_str}
        {crm_summary}
        
        You have a suite of tools available. If the user asks you to do something that matches a tool, CALL THE TOOL. 
        You can call multiple tools if necessary.
        If no tools are relevant, or after you've called tools, respond with a helpful conversational reply.
        """
        
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "research_lead",
                    "description": "Researches a company/website using AI and creates a Lead in the CRM automatically.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "company_name": {"type": "string", "description": "Name of the company"},
                            "website": {"type": "string", "description": "Website URL of the company"}
                        },
                        "required": ["company_name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "bulk_import_websites",
                    "description": "Scrapes and imports a list of website URLs into the CRM as new clients.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "urls": {"type": "array", "items": {"type": "string"}, "description": "List of URLs to scrape and add"}
                        },
                        "required": ["urls"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_client",
                    "description": "Creates a new client in the CRM manually. If the user asks to add a new client but does NOT provide a company name or URL, DO NOT call this tool. Instead, call navigate_user to '/clients?action=add'.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "company_name": {"type": "string"},
                            "website": {"type": "string"},
                            "email": {"type": "string"},
                            "phone": {"type": "string"}
                        },
                        "required": ["company_name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "draft_email",
                    "description": "Drafts an email for a client. IMPORTANT: When you call this tool, your conversational reply MUST say 'I will redirect you to the Email Agent, where you can enter the website URL or client details to draft the email.'",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "client_id": {"type": "integer", "description": "The target client ID"},
                            "prompt": {"type": "string", "description": "Specific instructions for the email copy"}
                        },
                        "required": ["prompt"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_note_to_client",
                    "description": "Adds a meeting note, conversation log, or general note to a client profile.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "client_id": {"type": "integer"},
                            "content": {"type": "string"}
                        },
                        "required": ["content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_deal",
                    "description": "Creates a new deal/opportunity for a client.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "client_id": {"type": "integer"},
                            "title": {"type": "string", "description": "Deal name"},
                            "value": {"type": "number", "description": "Estimated deal value in USD"},
                            "stage": {"type": "string", "description": "Stage (e.g. Lead, Negotiating, Closed Won)"}
                        },
                        "required": ["client_id", "title"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "trigger_whatsapp_support",
                    "description": "Triggers the customer support WhatsApp redirect UI.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "issue_summary": {"type": "string", "description": "Optional summary of what the user needs help with."}
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "navigate_user",
                    "description": "Teleports the user's screen to a specific page route. EXACT ROUTE MAP: Dashboard = '/', Clients = '/clients', Add New Client = '/clients?action=add', Marketplace = '/admin/marketplace', Store = '/store', Email Agent = '/email-agent', Pipeline = '/pipeline', Projects = '/projects', Tasks = '/tasks', Messages = '/messages', Setup/Settings = '/setup', Invoices = '/invoices'. NEVER guess a route outside this map.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "route": {"type": "string", "description": "The EXACT relative URL route from the map."}
                        },
                        "required": ["route"]
                    }
                }
            }
        ]

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ],
            tools=tools,
            tool_choice="auto"
        )
        
        msg = response.choices[0].message
        actions = []
        reply = msg.content or ""
        
        if msg.tool_calls:
            for tool_call in msg.tool_calls:
                args = json.loads(tool_call.function.arguments)
                actions.append({
                    "action": tool_call.function.name,
                    "parameters": args
                })
                
            # Generate a dynamic reply based on the actions taken if the LLM didn't provide one
            if not reply:
                names = [a["action"] for a in actions]
                reply = f"I've initiated the following actions: {', '.join(names)}."
                
        return {
            "actions": actions,
            "reply": reply
        }
    except Exception as e:
        print(f"Error in Omni-Agent command processing: {e}")
        return {
            "actions": [],
            "reply": "I'm sorry, my Omni-Agent processor encountered an error."
        }


def extract_client_services(website_text: str, company_name: str) -> list:
    """
    Analyzes a company's website text and extracts a structured list of services
    they OFFER — with a brief description and approximate cost estimate.
    Returns a list of dicts: [{name, brief, category, approx_cost, cost_is_estimated}]
    """
    try:
        client = get_openai_client()
        prompt = f"""You are a B2B business intelligence expert.

Analyze the following website content from "{company_name}" and extract ALL services or products this company OFFERS to their customers.

For each service:
1. Give a clean, professional service name
2. Write a 1-2 sentence brief describing what it is
3. Assign a business category from: [SEO, Web Design, Marketing, Plumbing, Legal, Accounting, Consulting, Construction, Healthcare, Real Estate, IT Services, Landscaping, Cleaning, Electrical, HVAC, Retail, Food & Beverage, Education, Finance, Transportation, Other]
4. Estimate an approximate market cost in USD. If you cannot determine the cost from the website, use your knowledge of typical market rates for this type of service.

Website content:
{website_text[:12000]}

Return ONLY valid JSON:
{{
  "services": [
    {{
      "name": "Clean service name",
      "brief": "1-2 sentence description of this service",
      "category": "One category from the list above",
      "approx_cost": 1500,
      "cost_is_estimated": true
    }}
  ]
}}

Rules:
- Extract only services/products the COMPANY OFFERS (not what they use internally)
- Include 3-10 services maximum, only the most clearly defined ones
- approx_cost should be a number in USD. Use 0 if truly impossible to estimate.
- cost_is_estimated is true unless the website explicitly states the price
"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        data = json.loads(response.choices[0].message.content)
        return data.get("services", [])
    except Exception as e:
        print(f"Error in extract_client_services: {e}")
        return []

def extract_client_profile_from_website(website_text: str, website_url: str) -> dict:
    """
    Analyzes website text to extract structured client profile fields.
    """
    try:
        import json
        from modules.llm_engine import get_openai_client
        client = get_openai_client()
        prompt = f"""You are a B2B CRM intelligence expert.

Analyze the following website content from "{website_url}" and extract details to populate a Client Profile.

Website content:
{website_text[:12000]}

Return ONLY valid JSON matching this structure:
{{
  "companyName": "The business name (don't use the URL)",
  "email": "Extract a contact email, or guess a generic one like info@company.com if missing",
  "tagline": "A short 5-10 word tagline or value proposition",
  "description": "A 2-3 sentence description of the company",
  "seoStrategy": "A 1-2 sentence suggested SEO strategy based on their industry",
  "targetKeywords": "A comma-separated string of 5-8 highly relevant target keywords",
  "industry": "The specific industry they operate in",
  "company_socials": {{
      "linkedin": "Company LinkedIn URL or null",
      "twitter": "Company Twitter/X URL or null",
      "instagram": "Company Instagram URL or null",
      "facebook": "Company Facebook URL or null"
  }},
  "people": [
      {{
          "name": "Person name or null",
          "role": "Job role or null",
          "email": "Email address or null",
          "phone": "Phone number or null",
          "linkedin": "Personal LinkedIn URL or null",
          "twitter": "Personal Twitter URL or null"
      }}
  ]
}}
"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error in extract_client_profile: {e}")
        return {}


def process_whatsapp_command(message: str, previous_state: dict = None):
    """
    Analyzes an incoming WhatsApp message to determine the CRM action using OpenAI function calling.
    If previous_state is provided, it merges the new message into the existing context.
    """
    try:
        client = get_openai_client()
        system_prompt = """
        You are an intelligent AI assistant embedded in a CRM system, processing commands from the
        business owner sent via WhatsApp — often as informal voice message transcripts.

        Your STRICT rules:
        1. ALWAYS call a tool if the user's intent matches a CRM action, NO MATTER how badly formatted, incomplete, or ambiguous the data is.
        2. NEVER ask conversational clarifying questions (e.g., "Could you confirm the email address?"). The backend will automatically ask the user for confirmation. Just extract what you can and call the tool!
        3. AGGRESSIVELY correct speech-to-text errors. For example, if you see "VarsitAdre, gmail.com", format it as "VarsitAdre@gmail.com".
        4. If a required parameter is vaguely hinted at, make your best guess.
        5. "add john doe from acme" means add_entity. "book a meeting with..." means schedule_meeting.
        6. "note that ravi is interested" means add_note. "create a task to follow up" means add_task.
        """
        
        if previous_state:
            system_prompt += f"\n\nIMPORTANT CONTEXT:\nThe user is providing a correction or additional information for their PREVIOUS command.\nPrevious intent: {previous_state.get('action')}\nPrevious parameters: {previous_state.get('parameters')}\n\nMERGE the user's new message into these previous parameters. Keep the same tool intent (unless they explicitly change it), update any fields they mentioned, and RETURN THE FULL SET of merged parameters."

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "add_entity",
                    "description": "Adds a new person or company to the CRM. Use this for Leads, Clients, or Contacts.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "The name of the company or person."},
                            "email": {"type": "string", "description": "Email address."},
                            "phone": {"type": "string", "description": "Phone number."},
                            "website": {"type": "string", "description": "Website URL, if provided."},
                            "notes": {"type": "string", "description": "Any initial notes about them."}
                        },
                        "required": ["name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "schedule_meeting",
                    "description": "Schedules a meeting or call.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "target_name": {"type": "string", "description": "The name of the lead or company to meet with."},
                            "time_str": {"type": "string", "description": "The time or date mentioned (e.g. 'tomorrow at 5pm')."}
                        },
                        "required": ["target_name", "time_str"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_note",
                    "description": "Adds a note or update to an existing client or lead.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "target_name": {"type": "string", "description": "The name of the client or company to add a note to."},
                            "content": {"type": "string", "description": "The full content/body of the note."}
                        },
                        "required": ["target_name", "content"]
                    }
                }
            },

            {
                "type": "function",
                "function": {
                    "name": "add_task",
                    "description": "Creates a new task or to-do in the CRM. Use when the owner wants to create a reminder, follow-up task, or work item.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "A short title for the task."},
                            "description": {"type": "string", "description": "More detail about what the task involves."},
                            "due_date": {"type": "string", "description": "When the task should be done (e.g. 'tomorrow', 'July 20', '2026-07-20')."},
                            "priority": {"type": "string", "description": "Priority level: Low, Medium, High, or Urgent. Default Medium."},
                            "client_name": {"type": "string", "description": "Name of the client this task is related to, if any."}
                        },
                        "required": ["title"]
                    }
                }
            }
        ]

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ],
            tools=tools,
            tool_choice="auto"
        )
        
        msg = response.choices[0].message
        
        if msg.tool_calls:
            tool_call = msg.tool_calls[0]
            import json as _json
            args = _json.loads(tool_call.function.arguments)
            return {
                "action": tool_call.function.name,
                "parameters": args,
                "reply": "Confirm action"
            }
        else:
            return {
                "action": "none",
                "parameters": {},
                "reply": msg.content or "I didn't quite catch that. Try saying something like 'add lead Microsoft microsoft.com'."
            }
    except Exception as e:
        print(f"Error in process_whatsapp_command: {e}")
        return {
            "action": "error",
            "parameters": {},
            "reply": "Sorry, I ran into an error processing your command."
        }
