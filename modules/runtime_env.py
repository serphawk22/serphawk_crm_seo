"""
Which environment variables this process is allowed to believe.

A deployment (Railway, Docker, Heroku, ...) injects its configuration as real environment
variables. A developer also keeps a local ``.env`` file next to the code. Loading that file
with ``override=True`` made the FILE win over the platform, so a development ``.env`` could
silently take over a production deployment.

That is exactly how the production voice agent ended up pointing at a developer's ngrok
tunnel: the production process read ``VOICE_AGENT_BASE_URL`` from a local ``.env`` (or from a
value copied out of one) instead of its own public URL, Twilio fetched its TwiML from a dead
tunnel, and every call died right after the prospect answered.

The rules implemented here:

* the platform's environment variables always win;
* a local ``.env`` may only fill in what the platform did not provide;
* in a deployment the ``.env`` file is ignored completely, so a stray file can never shadow
  production configuration;
* local development keeps working exactly as before (the ``.env`` is still the source of
  truth there, because the shell has no variables to conflict with).
"""
from __future__ import annotations

import os

# Markers a hosting platform sets when the process runs as a real deployment.
# RAILWAY_ENVIRONMENT is "production"/"staging"/... on Railway, RENDER/DYNO/HEROKU_APP_NAME
# on the other PaaS providers, NODE_ENV on the frontend build.
_DEPLOYMENT_MARKERS = (
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_SERVICE_NAME",
    "RENDER",
    "DYNO",
    "HEROKU_APP_NAME",
    "FLY_APP_NAME",
    "KUBERNETES_SERVICE_HOST",
    "APP_ENV",
    "ENVIRONMENT",
    "NODE_ENV",
)


def is_deployment() -> bool:
    """True when this process looks like a real deployment rather than a local checkout.

    A local developer runs ``uvicorn`` straight from the repository, with none of the markers
    above set. ``ENVIRONMENT``/``APP_ENV``/``NODE_ENV`` are also honoured when they say
    "production" so a container that only sets one of those is still treated as a deployment.
    """
    for marker in _DEPLOYMENT_MARKERS:
        value = (os.getenv(marker) or "").strip().lower()
        if not value:
            continue
        if marker in ("APP_ENV", "ENVIRONMENT", "NODE_ENV"):
            if value == "production":
                return True
            continue
        return True
    return False


def load_local_env() -> bool:
    """Load the local ``.env`` file, if this process is allowed to use one.

    Returns True when the file was loaded. Never overrides a variable that is already set in
    the environment, and never loads the file at all inside a deployment.
    """
    if os.getenv("PYTHON_DOTENV_DISABLED", "").strip().lower() in ("1", "true", "yes"):
        return False
    if is_deployment():
        # A deployment is configured through the platform. A leftover .env file next to the
        # code must never be able to shadow those values.
        return False
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - python-dotenv is a hard requirement
        return False
    # override=False: values already present in the environment (the platform's) win.
    return bool(load_dotenv(override=False))
