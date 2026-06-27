import os
import requests
from requests.auth import HTTPBasicAuth

def send_whatsapp_message(message: str, to_number: str = None):
    """
    Sends a WhatsApp message using the Twilio API.
    If keys are missing, falls back to logging to the console.
    """
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_number = os.environ.get("TWILIO_WHATSAPP_NUMBER")
    admin_number = os.environ.get("ADMIN_WHATSAPP_NUMBER")

    recipient = to_number or admin_number

    if not account_sid or not auth_token or not twilio_number or not recipient:
        print("====== WHATSAPP NOTIFICATION (MOCK) ======")
        print(f"To: {recipient or '[ADMIN_WHATSAPP_NUMBER MISSING]'}")
        print(f"Message:\n{message}")
        print("==========================================")
        return

    # Twilio requires whatsapp: prefix
    if not recipient.startswith("whatsapp:"):
        recipient = f"whatsapp:{recipient}"
    if not twilio_number.startswith("whatsapp:"):
        twilio_number = f"whatsapp:{twilio_number}"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    
    payload = {
        "From": twilio_number,
        "To": recipient,
        "Body": message
    }
    
    try:
        response = requests.post(
            url, 
            data=payload, 
            auth=HTTPBasicAuth(account_sid, auth_token)
        )
        response.raise_for_status()
        print(f"Twilio WhatsApp message sent to {recipient}")
    except Exception as e:
        print(f"Failed to send Twilio WhatsApp message: {e}")
        if isinstance(e, requests.exceptions.HTTPError):
            print(f"Response: {e.response.text}")

def send_ai_polished_whatsapp_message(event_type: str, raw_data: dict, link: str = None):
    import json
    import openai

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY. Falling back to basic formatting.")
        # Basic fallback formatting
        info_lines = [f"- {str(k).replace('_', ' ').title()}: {v}" for k, v in raw_data.items() if v and k not in ["id", "created_at", "updated_at"]]
        info_str = "\n".join(info_lines)
        msg = f"🚨 *{event_type}*\n\n{info_str}"
        if link:
            msg += f"\n\n🔗 Link: {link}"
        send_whatsapp_message(msg)
        return

    client = openai.OpenAI(api_key=api_key)
    
    prompt = f"""
    You are an executive assistant for a cold outreach CRM agency.
    An event of type '{event_type}' just occurred. 
    Here is the raw JSON data associated with the event:
    {json.dumps(raw_data, indent=2)}
    
    Your task:
    Write a highly detailed, polished, and beautifully formatted WhatsApp message to alert the business owner.
    - Extract and highlight the most critical details (subject, services, company info, actionable items).
    - Use appropriate emojis, bullet points, and bold text (*text*) to make it readable.
    - Keep it professional, concise, but dense with value.
    - DO NOT include the link in your output. I will append the link manually at the end.
    - Just output the message directly. No preamble.
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        ai_message = response.choices[0].message.content.strip()
        if link:
            ai_message += f"\n\n🔗 Link: {link}"
        
        send_whatsapp_message(ai_message)
    except Exception as e:
        print("Failed to polish message with AI:", e)
        # Fallback
        info_lines = [f"- {str(k).replace('_', ' ').title()}: {v}" for k, v in raw_data.items() if v and k not in ["id", "created_at", "updated_at"]]
        msg = f"🚨 *{event_type}*\n\n" + "\n".join(info_lines)
        if link: msg += f"\n\n🔗 Link: {link}"
        send_whatsapp_message(msg)
