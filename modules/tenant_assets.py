"""
A tenant's uploaded logo, stored in the database (local disk is wiped on every redeploy).

Uploads are decoded and re-encoded as PNG, so what is stored is always a plain image: no metadata, no embedded
scripts, no SVG. The public URL is ``GET /tenant/logo/{tenant_id}``; PDFs and e-mails read the bytes directly
through ``logo_bytes``.
"""
import io
import time
from typing import Dict, Optional, Tuple

from sqlmodel import Session, select

import database
from database import TenantAsset

MAX_UPLOAD_BYTES = 2_000_000          # what a user may upload
MAX_PIXELS = 25_000_000               # refuse decompression bombs before decoding
MAX_EDGE = 512                        # stored size: longest side
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
KIND = "logo"

_TTL_SECONDS = 30.0
# tenant id -> (loaded at, (png bytes, version) or None)
_cache: Dict[int, Tuple[float, Optional[Tuple[bytes, int]]]] = {}


def invalidate(tenant_id: Optional[int] = None) -> None:
    if tenant_id is None:
        _cache.clear()
    else:
        _cache.pop(int(tenant_id), None)


def normalize_logo(raw: bytes) -> bytes:
    """Validate an uploaded image and return it as a PNG no larger than MAX_EDGE. Raises ValueError with a user message."""
    if not raw:
        raise ValueError("The file is empty")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError(f"The image is larger than {MAX_UPLOAD_BYTES // 1_000_000} MB")
    from PIL import Image, UnidentifiedImageError
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt, size = probe.format, probe.size
    except (UnidentifiedImageError, OSError):
        raise ValueError("That file is not an image. Upload a PNG, JPEG or WebP.")
    if fmt not in ALLOWED_FORMATS:
        raise ValueError("Upload a PNG, JPEG or WebP image (SVG and other formats are not accepted)")
    if size[0] * size[1] > MAX_PIXELS:
        raise ValueError("The image has too many pixels; use one up to 5000 x 5000")
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        im = im.convert("RGBA")
    except Exception:
        raise ValueError("The image could not be read; it may be damaged")
    im.thumbnail((MAX_EDGE, MAX_EDGE))
    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


def save_logo(session: Session, tenant_id: int, raw: bytes) -> int:
    """Validate and store a tenant's logo, replacing any earlier one. Returns the version (changes on every upload)."""
    png = normalize_logo(raw)
    row = session.exec(select(TenantAsset).where(TenantAsset.tenant_id == tenant_id, TenantAsset.kind == KIND)
                       .execution_options(skip_tenant=True)).first()
    if row is None:
        row = TenantAsset(tenant_id=tenant_id, kind=KIND, content_type="image/png", data=png, size=len(png))
    row.content_type, row.data, row.size, row.updated_at = "image/png", png, len(png), database._utcnow()
    session.add(row)
    session.commit()
    invalidate(tenant_id)
    return version_of(row)


def delete_logo(session: Session, tenant_id: int) -> bool:
    row = session.exec(select(TenantAsset).where(TenantAsset.tenant_id == tenant_id, TenantAsset.kind == KIND)
                       .execution_options(skip_tenant=True)).first()
    if row is None:
        return False
    session.delete(row)
    session.commit()
    invalidate(tenant_id)
    return True


def version_of(row: TenantAsset) -> int:
    return int(row.updated_at.timestamp()) if row.updated_at else 0


def logo(tenant_id: Optional[int]) -> Optional[Tuple[bytes, int]]:
    """(png bytes, version) of a tenant's logo, or None. Cached for a short time."""
    if tenant_id is None or int(tenant_id) < 1:
        return None
    tenant_id = int(tenant_id)
    hit = _cache.get(tenant_id)
    now = time.monotonic()
    if hit and now - hit[0] < _TTL_SECONDS:
        return hit[1]
    with Session(database.engine) as session:
        row = session.exec(select(TenantAsset).where(TenantAsset.tenant_id == tenant_id, TenantAsset.kind == KIND)
                           .execution_options(skip_tenant=True)).first()
        value = (bytes(row.data), version_of(row)) if row else None
    _cache[tenant_id] = (now, value)
    return value


def logo_bytes(tenant_id: Optional[int]) -> Optional[bytes]:
    found = logo(tenant_id)
    return found[0] if found else None


def logo_url(tenant_id: int, version: int) -> str:
    """The path stored in the ``brand_logo_url`` setting; the frontend prefixes the API address."""
    return f"/tenant/logo/{tenant_id}?v={version}"
