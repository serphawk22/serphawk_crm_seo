"""Operator-managed Turnstile credentials. No new encryption environment key."""
import base64
import hashlib
import os
import re

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlmodel import Session

import database
from database import PlatformSecuritySettings


def cipher():
    # Domain-separated encryption uses the existing stable backend session key.
    secret = os.getenv("SESSION_SECRET", "")
    if not secret:
        raise HTTPException(503, "A stable backend SESSION_SECRET is required to protect saved credentials")
    key = hashlib.sha256(b"serphawk/turnstile/v1\x00" + secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def decrypt(row):
    if not row or not row.encrypted_secret:
        raise HTTPException(503, "Configure bot protection in SuperAdmin settings")
    try:
        return cipher().decrypt(row.encrypted_secret.encode()).decode()
    except (InvalidToken, ValueError):
        raise HTTPException(503, "Re-save bot protection credentials in SuperAdmin settings") from None


def status(session):
    row = session.get(PlatformSecuritySettings, "turnstile")
    configured = False
    if row and row.site_key and row.encrypted_secret:
        try:
            decrypt(row)
            configured = True
        except HTTPException:
            pass
    return {"site_key": row.site_key if row else "", "has_secret": bool(row and row.encrypted_secret), "configured": configured}


def save(session, site_key, secret_key=None):
    if not re.fullmatch(r"[A-Za-z0-9_-]{3,200}", site_key) or re.match(r"[123]x0+", site_key):
        raise HTTPException(422, "Enter a production Turnstile site key")
    row = session.get(PlatformSecuritySettings, "turnstile") or PlatformSecuritySettings()
    if secret_key:
        if len(secret_key) > 500 or re.match(r"[123]x0+", secret_key):
            raise HTTPException(422, "Enter a production Turnstile secret key")
        row.encrypted_secret = cipher().encrypt(secret_key.encode()).decode()
    else:
        decrypt(row)  # First setup or a rotated encryption key requires re-entry.
    row.site_key = site_key
    row.updated_at = database._utcnow()
    session.add(row)
    session.commit()
    return status(session)


def credentials():
    with Session(database.engine) as session:
        row = session.get(PlatformSecuritySettings, "turnstile")
        secret = decrypt(row)
        if not row.site_key:
            raise HTTPException(503, "Configure bot protection in SuperAdmin settings")
        return row.site_key, secret
