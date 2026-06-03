import smtplib
import imaplib
import time
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

DEFAULT_CC_EMAILS = []

def save_to_sent(to_email, msg, sender_email, sender_password, imap_server, imap_port=993):
    """
    Saves the email to the IMAP Sent folder.
    """
    try:
        print(f"Connecting to IMAP {imap_server} to save copy...")
        mail = imaplib.IMAP4_SSL(imap_server, imap_port)
        mail.login(sender_email, sender_password)

        # Get list of folders
        status, folder_list = mail.list('', '*')
        folders = []
        if status == 'OK' and folder_list:
            for f in folder_list:
                decoded = f.decode()
                if '"' in decoded:
                    name = decoded.split('"')[-2]
                else:
                    name = decoded.split()[-1]
                folders.append(name)

        print(f"Available folders: {folders}")

        def folder_exists(name):
            try:
                status, _ = mail.select(name, readonly=True)
                return status == 'OK'
            except Exception:
                return False

        sent_candidates = [
            '[Gmail]/Sent Mail',
            '[Gmail]/Sent',
            'Sent Mail',
            'Sent Items',
            'Sent',
            'INBOX.Sent',
            'INBOX.Sent Items',
            'Enviados',
        ]

        target_folder = None

        for candidate in sent_candidates:
            if candidate in folders and folder_exists(candidate):
                target_folder = candidate
                break

        if not target_folder:
            for candidate in sent_candidates:
                if folder_exists(candidate):
                    target_folder = candidate
                    break

        if not target_folder:
            for folder in folders:
                if 'sent' in folder.lower() and folder_exists(folder):
                    target_folder = folder
                    break

        if target_folder:
            print(f"Saving to folder: {target_folder}")
            now = imaplib.Time2Internaldate(time.time())
            try:
                mail.append(target_folder, '\\Seen', now, msg.as_bytes())
            except Exception as append_err:
                print(f"First append attempt failed for {target_folder}: {append_err}")
                try:
                    mail.append(f'"{target_folder}"', '\\Seen', now, msg.as_bytes())
                except Exception as alt_err:
                    print(f"Second append attempt failed for {target_folder}: {alt_err}")
                    mail.logout()
                    return False
            print(f"Successfully saved copy to {target_folder}")
            mail.logout()
            return True

        print(f"Could not find a Sent folder. Available: {folders}")
        mail.logout()
        return False
    except Exception as e:
        print(f"Failed to save copy to Sent folder: {e}")
        return False

def send_email_outlook(to_email, subject, body, sender_email, sender_password, smtp_server='smtp.office365.com', smtp_port=587, html=True, cc_emails=None, imap_server=None):
    """
    Sends an email using SMTP.
    Supports both HTML and plain text emails.
    Supports both TLS (port 587) and SSL (port 465).
    """
    # Use default CCs if not provided (and not explicitly empty list)
    if cc_emails is None:
        cc_emails = DEFAULT_CC_EMAILS

    msg = MIMEMultipart('alternative')
    msg['From'] = sender_email
    msg['To'] = to_email
    msg['Subject'] = subject
    
    if cc_emails:
        msg['Cc'] = ", ".join(cc_emails)

    # Add both plain text and HTML versions
    if html:
        msg.attach(MIMEText(body, 'html'))
    else:
        msg.attach(MIMEText(body, 'plain'))

    try:
        smtp_port = int(smtp_port)
        print(f"Connecting to {smtp_server}:{smtp_port}...")
        
        # Prepare SSL context
        context = ssl.create_default_context()

        # Use SSL for port 465, TLS for port 587
        if smtp_port == 465:
            # SSL connection
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, context=context, timeout=30)
        else:
            # TLS connection
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=30)
            server.starttls(context=context)
        
        server.login(sender_email, sender_password)
        text = msg.as_string()
        
        # Combine recipients for the envelope
        recipients = [to_email] + cc_emails if cc_emails else [to_email]
        
        server.sendmail(sender_email, recipients, text)
        server.quit()
        print(f"Email sent to {to_email} (CC: {cc_emails})")
        
        # Try to save to sent folder
        target_imap = imap_server
        if not target_imap:
            # Heuristic detection if not provided
            target_imap = smtp_server
            if 'smtp.' in smtp_server:
                target_imap = smtp_server.replace('smtp.', 'imap.')
            elif 'office365' in smtp_server:
                target_imap = 'outlook.office365.com'
            elif 'mail.' in smtp_server:
                target_imap = smtp_server  # Already in correct format
            
        saved = save_to_sent(to_email, msg, sender_email, sender_password, target_imap)
        if not saved:
            print(f"Warning: message sent but saving to Sent folder failed for IMAP server {target_imap}")
        
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        raise e
