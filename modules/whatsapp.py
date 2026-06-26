import os
import requests

def send_whatsapp_message(message: str, to_number: str = None):
    """
    Sends a WhatsApp message using the Meta Cloud API.
    If keys are missing, falls back to logging to the console.
    """
    token = os.environ.get("META_WHATSAPP_TOKEN")
    phone_number_id = os.environ.get("META_PHONE_NUMBER_ID")
    admin_number = os.environ.get("ADMIN_WHATSAPP_NUMBER")

    recipient = to_number or admin_number

    if not token or not phone_number_id or not recipient:
        print("====== WHATSAPP NOTIFICATION (MOCK) ======")
        print(f"To: {recipient or '[ADMIN_WHATSAPP_NUMBER MISSING]'}")
        print(f"Message:\n{message}")
        print("==========================================")
        return

    url = f"https://graph.facebook.com/v17.0/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {
            "body": message
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        print(f"WhatsApp message sent to {recipient}")
    except Exception as e:
        print(f"Failed to send WhatsApp message: {e}")
        if isinstance(e, requests.exceptions.HTTPError):
            print(f"Response: {e.response.text}")
