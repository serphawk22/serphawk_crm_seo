"""
The company mailbox (Settings -> SMTP, table ``email_settings``): encrypted password handling.

New passwords are stored Fernet-encrypted (the same ``EMAIL_CREDENTIAL_ENCRYPTION_KEY`` as the per-user Email
Integration). Rows saved before this change hold the password in plain text; ``reveal`` still reads them, and they are
encrypted the next time the admin saves the mailbox. Where no key is configured the password is stored as before and
``is_encrypted`` tells the UI to warn the admin.
"""
from typing import Optional

from modules.email_crypto import (EmailCredentialEncryptionError, decrypt_app_password, encrypt_app_password)

_TOKEN_PREFIX = "gAAAA"          # every Fernet token starts with this


def looks_encrypted(stored: Optional[str]) -> bool:
    return bool(stored) and stored.startswith(_TOKEN_PREFIX)


def protect(plain: str) -> str:
    """Encrypt for storage; falls back to the plain value when no key is configured (the pre-existing behaviour)."""
    try:
        return encrypt_app_password(plain)
    except EmailCredentialEncryptionError:
        print("[mailbox] EMAIL_CREDENTIAL_ENCRYPTION_KEY is not set: the company mailbox password is stored unencrypted")
        return plain


def reveal(stored: Optional[str]) -> Optional[str]:
    """The usable password, or None when it cannot be read (an encrypted value but no key)."""
    if not stored:
        return None
    if not looks_encrypted(stored):
        return stored
    try:
        return decrypt_app_password(stored)
    except EmailCredentialEncryptionError:
        return None


def is_encrypted(stored: Optional[str]) -> bool:
    return looks_encrypted(stored)
