"""
Signed session tokens (HMAC-SHA256, no extra dependency).

Format: ``v1.<base64url(json payload)>.<base64url(hmac)>``. The payload only carries the user id, issue/expiry
times and a short fingerprint of the user's password hash (``pv``), so changing or resetting a password
invalidates every token issued before it. Role and tenant are NOT read from the token: the middleware loads
them from the database on every request, as it did before, so demoting a user takes effect immediately.

Environment:
  SESSION_SECRET            HMAC key. If unset, a random per-process key is used (tokens stop working after a
                            restart and across instances) and a warning is printed once. Set it in production.
  SESSION_TTL_SECONDS       Token lifetime, default 7 days.
  LEGACY_USER_HEADER        "1" (default) still accepts the old unsigned X-User-ID header when no
                            Authorization header is sent. Set "0" once every client sends tokens.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

_VERSION = "v1"
_warned = False
_ephemeral_secret: Optional[bytes] = None


def _secret() -> bytes:
    global _warned, _ephemeral_secret
    env = os.getenv("SESSION_SECRET")
    if env:
        return env.encode()
    if _ephemeral_secret is None:
        _ephemeral_secret = secrets.token_bytes(32)
    if not _warned:
        _warned = True
        print("[auth] SESSION_SECRET is not set: using a random per-process key. Sessions will not survive a "
              "restart or work across instances. Set SESSION_SECRET in production.")
    return _ephemeral_secret


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def password_fingerprint(password_hash: Optional[str]) -> str:
    return hashlib.sha256((password_hash or "").encode()).hexdigest()[:12]


def ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("SESSION_TTL_SECONDS", str(7 * 24 * 3600))))
    except ValueError:
        return 7 * 24 * 3600


def legacy_header_allowed() -> bool:
    return os.getenv("LEGACY_USER_HEADER", "1").strip().lower() not in ("0", "false", "no", "off")


def issue_token(user_id: int, password_hash: Optional[str], now: Optional[float] = None) -> str:
    now = int(now if now is not None else time.time())
    payload = {"uid": int(user_id), "iat": now, "exp": now + ttl_seconds(), "pv": password_fingerprint(password_hash)}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), f"{_VERSION}.{body}".encode(), hashlib.sha256).digest())
    return f"{_VERSION}.{body}.{sig}"


def verify_token(token: Optional[str], now: Optional[float] = None) -> Optional[dict]:
    """Return the payload for a well-formed, correctly signed, unexpired token, else None."""
    if not token or not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != _VERSION:
        return None
    expected = hmac.new(_secret(), f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, _unb64(parts[2])):
            return None
        payload = json.loads(_unb64(parts[1]))
    except Exception:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("uid"), int):
        return None
    if int(payload.get("exp", 0)) < int(now if now is not None else time.time()):
        return None
    return payload
