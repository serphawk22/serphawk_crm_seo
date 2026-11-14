"""
The public URL this deployment answers on.

Twilio fetches the TwiML of every call from a public HTTPS URL, so the backend must know its
own address. That address can come from three places:

1. ``VOICE_AGENT_BASE_URL`` - an explicit override (a local ngrok tunnel while developing);
2. ``PUBLIC_BASE_URL``     - the app's public URL (the email tracking pixels use it too);
3. the request itself      - the address the request was actually made to.

(1) and (2) are configuration and they drift: a developer tunnel URL that was copied into a
deployment's settings outlives the tunnel, and the voice agent then points Twilio at a server
that no longer serves the app. (3) is always right for the deployment the process runs in, so
it is kept here as the last resort and is only accepted when it is a public HTTPS address
(Twilio cannot fetch plain HTTP, and a loopback address is never reachable from outside).

The value is stored in a context variable, so it is available to the code that runs for the
current request only - which is exactly the scope it describes.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional
from urllib.parse import urlsplit

# The public URL of the request currently being served ("" when there is none).
_request_base: ContextVar[str] = ContextVar("public_url_request_base", default="")

# Host names that are never reachable from the public internet.
_LOCAL_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "host.docker.internal",
}


def set_request_base(base: Optional[str]) -> None:
    """Remember the public URL the current request came in on."""
    _request_base.set((base or "").rstrip("/"))


def request_base() -> str:
    """The public URL of the request currently being served ("" when there is none)."""
    return _request_base.get()


def is_public_https(base: Optional[str]) -> bool:
    """True when ``base`` is a public HTTPS URL Twilio could actually fetch."""
    if not base:
        return False
    try:
        parts = urlsplit(base if "://" in base else f"https://{base}")
    except ValueError:
        return False
    if parts.scheme.lower() != "https":
        return False
    host = (parts.hostname or "").lower()
    if not host or host in _LOCAL_HOSTS:
        return False
    return True


def _hostname(url_or_host: str) -> str:
    return (urlsplit(url_or_host if "//" in url_or_host else f"//{url_or_host}").hostname or "").lower()


def same_host(base: Optional[str], other: Optional[str]) -> bool:
    """Do ``base`` and ``other`` name the same machine?

    The port is ignored (a deployment behind a proxy serves several ports of one host) and the
    loopback aliases (localhost / 127.0.0.1 / ::1) count as the same machine.
    """
    a, b = _hostname(base or ""), _hostname(other or "")
    if not a or not b:
        return False
    if a in _LOCAL_HOSTS or b in _LOCAL_HOSTS:
        return a in _LOCAL_HOSTS and b in _LOCAL_HOSTS
    return a == b


def from_request(headers, url_scheme: str = "https") -> str:
    """Build the public base URL of an incoming request.

    ``headers`` is the request's header mapping. The host comes from ``X-Forwarded-Host`` or
    ``Host`` and the scheme from ``X-Forwarded-Proto``: a deployment is normally served through
    a TLS-terminating proxy (Railway, nginx, Cloudflare), so the request that reaches the
    process is plain HTTP even though the public address is HTTPS.

    A loopback host is never a public address, so it is rejected - the local development
    server must be reached through the tunnel, which is what VOICE_AGENT_BASE_URL is for.
    """
    def _first(value: Optional[str]) -> str:
        return (value or "").split(",")[0].strip()

    host = _first(headers.get("x-forwarded-host")) or _first(headers.get("host"))
    if not host:
        return ""
    hostname = (urlsplit(f"//{host}").hostname or "").lower()
    if not hostname or hostname in _LOCAL_HOSTS:
        return ""
    proto = _first(headers.get("x-forwarded-proto")).lower()
    if proto not in ("http", "https"):
        # Without a forwarded scheme, a public host is served over HTTPS in practice.
        proto = "https" if hostname not in _LOCAL_HOSTS else (url_scheme or "https")
    base = f"{proto}://{host}".rstrip("/")
    return base if is_public_https(base) else ""
