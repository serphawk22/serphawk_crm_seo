"""
A small in-process sliding-window limiter for public endpoints (registration, one-time codes).

It is per process: with several API instances the effective limit is multiplied by the instance count, which is
still enough to stop a script from hammering one address. Counters live in memory only.
"""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = defaultdict(deque)
_MAX_KEYS = 20_000


def hit(key: str, limit: int, window_seconds: int, detail: str = "Too many attempts. Please try again later.") -> None:
    """Count one event for ``key``; raise 429 once more than ``limit`` happened in the last ``window_seconds``."""
    now = time.monotonic()
    with _lock:
        if len(_hits) > _MAX_KEYS:                      # bound memory: drop keys that have gone quiet
            for k in [k for k, q in _hits.items() if not q or now - q[-1] > window_seconds]:
                _hits.pop(k, None)
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            wait = int(window_seconds - (now - q[0])) + 1
            raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(wait)})
        q.append(now)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def reset() -> None:
    """For tests."""
    with _lock:
        _hits.clear()
