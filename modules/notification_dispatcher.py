"""
Notification Email Dispatcher
Delivers formatted email notifications to configured tenant receivers when key CRM events occur:
- lead_added
- client_added_or_converted
- followup_created
- followup_reminder (with configurable advance notice: 15m, 30m, 1h, 2h)
- meeting_synopsis
"""
import html
import os
import threading
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from sqlmodel import Session, select
from database import engine, EmailSettings, TenantSettings


def get_tenant_notification_recipients(session: Session, tenant_id: Optional[int]) -> List[Dict[str, Any]]:
    if not tenant_id:
        return []
    ts = session.exec(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)).first()
    if not ts or not isinstance(ts.settings, dict):
        return []
    recipients = ts.settings.get("notification_email_recipients")
    if isinstance(recipients, list):
        return [r for r in recipients if isinstance(r, dict) and r.get("active", True)]
    return []


def get_tenant_smtp_config(session: Session, tenant_id: Optional[int]) -> Optional[Dict[str, Any]]:
    from modules import tenant_mailbox
    if tenant_id:
        settings = session.exec(select(EmailSettings).where(EmailSettings.tenant_id == tenant_id)).first()
        if settings and settings.from_email:
            password = tenant_mailbox.reveal(settings.smtp_pass) if settings.smtp_pass else None
            if password:
                return {
                    "sender": settings.from_email,
                    "password": password,
                    "host": settings.smtp_host or "smtp.gmail.com",
                    "port": int(settings.smtp_port or 587),
                    "from_name": settings.from_name or "CRM Notifications",
                }
    # Fallback to system env
    sender = os.environ.get("EMAIL_SENDER") or os.environ.get("OUTLOOK_EMAIL")
    password = os.environ.get("EMAIL_PASSWORD") or os.environ.get("OUTLOOK_PASSWORD")
    if sender and password:
        return {
            "sender": sender,
            "password": password,
            "host": os.environ.get("EMAIL_HOST") or os.environ.get("SMTP_SERVER", "smtp.gmail.com"),
            "port": int(os.environ.get("EMAIL_PORT") or os.environ.get("SMTP_PORT", 587)),
            "from_name": "SerpHawk CRM",
        }
    return None


EVENT_META = {
    "lead_added": {
        "badge": "NEW LEAD CAPTURED",
        "badge_bg": "#4338ca",
        "badge_color": "#ffffff",
        "icon": "🎯",
        "title": "New Lead Added"
    },
    "client_added_or_converted": {
        "badge": "CLIENT CONVERTED / ADDED",
        "badge_bg": "#059669",
        "badge_color": "#ffffff",
        "icon": "🎉",
        "title": "Client Converted / Added"
    },
    "followup_created": {
        "badge": "FOLLOW-UP SCHEDULED",
        "badge_bg": "#d97706",
        "badge_color": "#ffffff",
        "icon": "📅",
        "title": "New Follow-up Scheduled"
    },
    "followup_reminder": {
        "badge": "MEETING REMINDER",
        "badge_bg": "#e11d48",
        "badge_color": "#ffffff",
        "icon": "⏰",
        "title": "Meeting Starting Soon"
    },
    "meeting_synopsis": {
        "badge": "MEETING SYNOPSIS & OUTCOME",
        "badge_bg": "#7c3aed",
        "badge_color": "#ffffff",
        "icon": "📝",
        "title": "Meeting Outcome Recorded"
    },
}


def build_notification_email_html(
    event_key: str,
    subject: str,
    headline: str,
    details: Dict[str, Any],
    action_url: Optional[str] = None,
    action_label: str = "View in CRM",
    company_name: str = "SerpHawk CRM",
    receiver_email: str = ""
) -> str:
    meta = EVENT_META.get(event_key, {
        "badge": "CRM NOTIFICATION",
        "badge_bg": "#4f46e5",
        "badge_color": "#ffffff",
        "icon": "🔔",
        "title": "Notification"
    })

    details_rows = ""
    for label, val in details.items():
        if val is None or val == "":
            continue
        safe_val = html.escape(str(val)).replace("\n", "<br/>")
        details_rows += f"""
        <tr>
            <td style="padding: 9px 12px; font-weight: 600; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #f1f5f9; width: 35%;">{html.escape(label)}</td>
            <td style="padding: 9px 12px; color: #1e293b; font-size: 13px; font-weight: 500; border-bottom: 1px solid #f1f5f9;">{safe_val}</td>
        </tr>
        """

    button_html = ""
    if action_url:
        button_html = f"""
        <div style="margin: 28px 0 10px; text-align: center;">
            <a href="{html.escape(action_url)}" style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                {html.escape(action_label)} →
            </a>
        </div>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <div style="max-width: 620px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
    
    <!-- Top Header -->
    <div style="background-color: #0f172a; padding: 22px 30px; text-align: left;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">{html.escape(company_name)}</span>
        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">CRM ALERT</span>
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px 30px;">
      
      <!-- Event Badge & Headline -->
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; background-color: {meta['badge_bg']}; color: {meta['badge_color']}; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 6px; margin-bottom: 10px;">
          {meta['icon']} {meta['badge']}
        </span>
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.3;">
          {html.escape(headline)}
        </h2>
      </div>

      <!-- Details Table -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 22px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <tbody>
            {details_rows}
          </tbody>
        </table>
      </div>

      {button_html}
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 18px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11.5px; color: #64748b; line-height: 1.5;">
      You received this because <strong>{html.escape(receiver_email)}</strong> is configured as a notification email receiver in <strong>{html.escape(company_name)}</strong> CRM Settings.
      <br/>
      Manage notification preferences in <em>Settings &gt; Email Notifications</em>.
    </div>
  </div>
</body>
</html>"""


def dispatch_event_notification(
    event_key: str,
    subject: str,
    headline: str,
    details: Dict[str, Any],
    tenant_id: Optional[int] = None,
    action_url: Optional[str] = None,
    action_label: str = "View in CRM",
    advance_minutes: Optional[int] = None,
    force_recipient_email: Optional[str] = None
) -> int:
    """
    Asynchronously delivers notification email to matching tenant receivers.
    Fails silently so background notifications never break CRM API responses.
    """
    def _runner():
        try:
            from modules.email_sender import send_email_outlook
            with Session(engine) as session:
                smtp_cfg = get_tenant_smtp_config(session, tenant_id)
                if not smtp_cfg:
                    # Mailbox not configured
                    return

                # Brand name
                brand_name = "SerpHawk CRM"
                if tenant_id:
                    from modules import tenant_settings
                    brand_name = tenant_settings.get_setting(tenant_id, "brand_name") or "SerpHawk CRM"

                if force_recipient_email:
                    recipients = [{
                        "email": force_recipient_email,
                        "name": "Receiver",
                        "active": True,
                        "events": {event_key: True},
                        "reminder_advance_minutes": advance_minutes or 60
                    }]
                else:
                    all_recipients = get_tenant_notification_recipients(session, tenant_id)
                    recipients = []
                    for r in all_recipients:
                        if not r.get("active", True):
                            continue
                        events = r.get("events", {})
                        if not events.get(event_key, True):
                            continue
                        # If advance_minutes specified (e.g. 15, 30, 60, 120), check recipient preference
                        if advance_minutes is not None:
                            rec_adv = int(r.get("reminder_advance_minutes", 60))
                            if rec_adv != advance_minutes:
                                continue
                        recipients.append(r)

                for r in recipients:
                    to_email = r.get("email")
                    if not to_email or "@" not in to_email:
                        continue
                    body_html = build_notification_email_html(
                        event_key=event_key,
                        subject=subject,
                        headline=headline,
                        details=details,
                        action_url=action_url,
                        action_label=action_label,
                        company_name=brand_name,
                        receiver_email=to_email
                    )
                    try:
                        send_email_outlook(
                            to_email=to_email,
                            subject=subject,
                            body_html=body_html,
                            sender_email=smtp_cfg["sender"],
                            sender_password=smtp_cfg["password"],
                            smtp_server=smtp_cfg["host"],
                            smtp_port=smtp_cfg["port"],
                        )
                    except Exception as ex:
                        print(f"[NotificationDispatcher] Failed to send {event_key} to {to_email}: {ex}")
        except Exception as e:
            print(f"[NotificationDispatcher] Unexpected error: {e}")

    threading.Thread(target=_runner, daemon=True).start()
    return 1


