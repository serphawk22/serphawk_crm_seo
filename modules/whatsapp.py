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
