"""
Customization requests: a client asks the platform team for something the CRM does not do yet.

The request is the product backlog entry. When it is built it becomes a feature module that any client can be given,
never a copy of the code for one client.

  Admin        GET  /tenant/requests                 my company's requests
  Admin        POST /tenant/requests                 raise one
  Admin        GET  /tenant/requests/{id}            one request with its conversation
  Admin        POST /tenant/requests/{id}/messages   add to the conversation
  SuperAdmin   GET  /superadmin/requests             every client's requests (?status=&tenant_id=)
  SuperAdmin   GET  /superadmin/requests/{id}
  SuperAdmin   PUT  /superadmin/requests/{id}        status / priority
  SuperAdmin   POST /superadmin/requests/{id}/messages   answer the client
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import CustomizationRequest, CustomizationRequestMessage, Notification, Tenant, User
from modules import onboarding
from routers.tenant_config import _ADMIN_ROLES, _my_tenant, _role, _super, _user, get_session

router = APIRouter(tags=["customization-requests"])

STATUSES = ("new", "in_review", "planned", "in_progress", "done", "declined")
CATEGORIES = ("feature", "integration", "report", "branding", "workflow", "other")
PRIORITIES = ("low", "normal", "high")
_ALL = {"skip_tenant": True}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _admin_tenant(session: Session):
    user = _user(session)
    if _role(user) not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin can raise or follow customization requests")
    tid = _my_tenant(user)
    if tid is None:
        raise HTTPException(status_code=400, detail="Pick a tenant first (X-Tenant-ID)")
    return user, tid


def _row(r: CustomizationRequest, tenant_name: Optional[str] = None) -> dict:
    out = {"id": r.id, "tenant_id": r.tenant_id, "title": r.title, "description": r.description, "category": r.category,
           "priority": r.priority, "status": r.status, "requested_by": r.requested_by,
           "requester_name": r.requester_name, "created_at": r.created_at, "updated_at": r.updated_at}
    if tenant_name is not None:
        out["tenant_name"] = tenant_name
    return out


def _messages(session: Session, request_id: int) -> list:
    rows = session.exec(select(CustomizationRequestMessage).where(CustomizationRequestMessage.request_id == request_id)
                        .order_by(CustomizationRequestMessage.id).execution_options(**_ALL)).all()
    return [{"id": m.id, "author_name": m.author_name, "from_platform": m.from_platform, "body": m.body,
             "created_at": m.created_at} for m in rows]


def _get_for_tenant(session: Session, request_id: int, tenant_id: int) -> CustomizationRequest:
    r = session.exec(select(CustomizationRequest).where(CustomizationRequest.id == request_id,
                                                        CustomizationRequest.tenant_id == tenant_id)
                     .execution_options(**_ALL)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    return r


def _add_message(session: Session, r: CustomizationRequest, user: User, body: str, from_platform: bool) -> None:
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write a message first")
    if len(text) > 5000:
        raise HTTPException(status_code=422, detail="Keep a message under 5000 characters")
    session.add(CustomizationRequestMessage(tenant_id=r.tenant_id, request_id=r.id, author_id=user.id,
                                            author_name=user.name or user.email, from_platform=from_platform, body=text))
    r.updated_at = _now()
    session.add(r)
    session.commit()


def _tell_requester(session: Session, r: CustomizationRequest, title: str, message: str) -> None:
    if not r.requested_by:
        return
    try:
        session.add(Notification(user_id=r.requested_by, tenant_id=r.tenant_id, title=title, message=message,
                                 type="info", link="/requests"))
        session.commit()
    except Exception:
        session.rollback()


# ── Client side ──────────────────────────────────────────────────────────────
class NewRequest(BaseModel):
    title: str
    description: str
    category: str = "other"
    priority: str = "normal"


class NewMessage(BaseModel):
    body: str


@router.get("/tenant/requests")
def my_requests(session: Session = Depends(get_session)):
    _, tid = _admin_tenant(session)
    rows = session.exec(select(CustomizationRequest).where(CustomizationRequest.tenant_id == tid)
                        .order_by(CustomizationRequest.id.desc()).execution_options(**_ALL)).all()
    return {"requests": [_row(r) for r in rows], "statuses": STATUSES, "categories": CATEGORIES, "priorities": PRIORITIES}


@router.post("/tenant/requests")
def create_request(body: NewRequest, session: Session = Depends(get_session)):
    user, tid = _admin_tenant(session)
    title, description = body.title.strip(), body.description.strip()
    if not title or not description:
        raise HTTPException(status_code=422, detail="Give the request a title and describe what you need")
    if len(title) > 200 or len(description) > 5000:
        raise HTTPException(status_code=422, detail="The title may have up to 200 characters and the description up to 5000")
    if body.category not in CATEGORIES or body.priority not in PRIORITIES:
        raise HTTPException(status_code=422, detail="Unknown category or priority")
    r = CustomizationRequest(tenant_id=tid, requested_by=user.id, requester_name=user.name or user.email, title=title,
                             description=description, category=body.category, priority=body.priority)
    session.add(r)
    session.commit()
    session.refresh(r)
    tenant = session.exec(select(Tenant).where(Tenant.id == tid).execution_options(**_ALL)).first()
    onboarding.notify_operators(session, "New customization request",
                                f"{tenant.name if tenant else tid}: {title}", "/superadmin/requests")
    return _row(r)


@router.get("/tenant/requests/{request_id}")
def my_request(request_id: int, session: Session = Depends(get_session)):
    _, tid = _admin_tenant(session)
    r = _get_for_tenant(session, request_id, tid)
    return {**_row(r), "messages": _messages(session, r.id)}


@router.post("/tenant/requests/{request_id}/messages")
def reply_as_client(request_id: int, body: NewMessage, session: Session = Depends(get_session)):
    user, tid = _admin_tenant(session)
    r = _get_for_tenant(session, request_id, tid)
    _add_message(session, r, user, body.body, from_platform=_role(user) == "SuperAdmin")
    if r.status in ("done", "declined"):        # the client writing again reopens it
        r.status = "in_review"
        session.add(r)
        session.commit()
    return {**_row(r), "messages": _messages(session, r.id)}


# ── Platform side ────────────────────────────────────────────────────────────
@router.get("/superadmin/requests")
def all_requests(status: Optional[str] = None, tenant_id: Optional[int] = None, session: Session = Depends(get_session)):
    _super(session)
    q = select(CustomizationRequest, Tenant.name).join(Tenant, Tenant.id == CustomizationRequest.tenant_id)
    if status:
        q = q.where(CustomizationRequest.status == status)
    if tenant_id:
        q = q.where(CustomizationRequest.tenant_id == tenant_id)
    rows = session.exec(q.order_by(CustomizationRequest.id.desc()).execution_options(**_ALL)).all()
    return {"requests": [_row(r, name) for r, name in rows], "statuses": STATUSES}


def _any(session: Session, request_id: int) -> CustomizationRequest:
    r = session.exec(select(CustomizationRequest).where(CustomizationRequest.id == request_id)
                     .execution_options(**_ALL)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    return r


@router.get("/superadmin/requests/{request_id}")
def one_request(request_id: int, session: Session = Depends(get_session)):
    _super(session)
    r = _any(session, request_id)
    tenant = session.exec(select(Tenant).where(Tenant.id == r.tenant_id).execution_options(**_ALL)).first()
    return {**_row(r, tenant.name if tenant else None), "messages": _messages(session, r.id)}


class RequestUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


@router.put("/superadmin/requests/{request_id}")
def update_request(request_id: int, body: RequestUpdate, session: Session = Depends(get_session)):
    _super(session)
    r = _any(session, request_id)
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(STATUSES)}")
        changed = body.status != r.status
        r.status = body.status
    else:
        changed = False
    if body.priority is not None:
        if body.priority not in PRIORITIES:
            raise HTTPException(status_code=422, detail="Unknown priority")
        r.priority = body.priority
    r.updated_at = _now()
    session.add(r)
    session.commit()
    if changed:
        _tell_requester(session, r, "Your request was updated", f"'{r.title}' is now {r.status.replace('_', ' ')}.")
    return _row(r)


@router.post("/superadmin/requests/{request_id}/messages")
def answer_request(request_id: int, body: NewMessage, session: Session = Depends(get_session)):
    user = _super(session)
    r = _any(session, request_id)
    _add_message(session, r, user, body.body, from_platform=True)
    if r.status == "new":
        r.status = "in_review"
        session.add(r)
        session.commit()
    _tell_requester(session, r, "Reply to your request", f"The team replied to '{r.title}'.")
    return {**_row(r), "messages": _messages(session, r.id)}
