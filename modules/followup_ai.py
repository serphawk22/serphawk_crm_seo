"""
AI for follow-ups: read a note / conversation and decide whether it implies a
follow-up and when ("they'll discuss internally and respond next week" ->
follow up on Friday next week), suggest the next follow-up from a record's
whole history, and draft the personalized follow-up email.

Every AI path has a deterministic fallback (heuristic date parsing, a plain
template) so the feature keeps working without OPENAI_API_KEY or when the AI
call fails. Notes and emails are untrusted text — prompts fence them as data
(email_ai.UNTRUSTED) and outputs are validated here.
"""
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from modules import email_ai
from modules.email_ai import EmailAIError

CHANNELS = ("email", "call", "meeting", "whatsapp", "other")
PRIORITIES = ("high", "medium", "low")
MAX_DAYS_AHEAD = 366

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}
_MONTHS.update({k[:3]: v for k, v in list(_MONTHS.items())})
_MONTHS["sept"] = 9
_NUMBER_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "couple of": 2, "a couple of": 2, "few": 3, "a few": 3,
                 "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "ten": 10, "fifteen": 15}

# Phrases that mean someone owes a next step.
_COMMITMENT_RE = re.compile(
    r"\b(get back|respond|revert|reply|confirm|decide|decision|discuss(?:ing)? (?:it )?internally|discuss with|"
    r"think (?:about|it over)|review|let (?:us|me) know|call (?:back|again|us|them|him|her)|follow[- ]?up|"
    r"touch base|check in|reach out|remind|reconnect|speak (?:again|next)|talk (?:again|next)|circle back|"
    r"send (?:the |a |over )?(?:proposal|quote|deck|details|pricing|contract)|budget|approval|meeting|demo)\b",
    re.I,
)


def shift_off_weekend(d: date) -> date:
    while d.weekday() >= 5:  # Saturday / Sunday -> Monday
        d += timedelta(days=1)
    return d


# Backwards-compatible private name used throughout this module.
_shift_off_weekend = shift_off_weekend

FOLLOW_UP_TYPES = ("Call", "Meeting", "Email", "WhatsApp", "Salesperson Callback", "Proposal", "Other")

_WINDOW_PATTERNS = (
    (r"\bearly next week\b", "early next week"),
    (r"\bnext week\b", "next week"),
    (r"\bthis week\b", "this week"),
    (r"\bend of (?:the |this )?(?:week|month)\b", "end of the period"),
    (r"\bnext month\b", "next month"),
    (r"\bwithin (?:a|an|one|two|three|four|five|\d+) (?:day|week|month)s?\b", "within a stated period"),
    (r"\bin (?:a|an|one|two|three|four|five|\d+) (?:day|week|month)s?\b", "in a stated period"),
    (r"\bsometime\b", "sometime"),
    (r"\bsoon\b", "soon"),
    (r"\bafter (?:the |our )?(?:proposal|demo|meeting|call|review|approval|budget)\b", "after a prerequisite"),
)

_TIME_RE = re.compile(
    r"(?:\b(?:at|around|about|by)\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b)"
    r"|(?:\b(?:at|around|about|by)\s+(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b)"
    r"|(?:\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b)"
    r"|(?:\b(noon|midday|midnight)\b)",
    re.I,
)


def _clock(hour: int, minute: int, suffix: str = "") -> Optional[str]:
    suffix = (suffix or "").replace(".", "").lower()
    if suffix == "pm" and hour < 12:
        hour += 12
    if suffix == "am" and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def parse_time_text(text: str) -> Optional[str]:
    """The clock time explicitly stated in the text as HH:MM (24h), or None.

    "tomorrow at 3 pm" -> 15:00; "15 Oct" is a date, not a time; "at 3" or "morning"
    stays unresolved so we never invent a precise appointment time.
    """
    for m in _TIME_RE.finditer(text or ""):
        if m.group(9):  # noon / midday / midnight
            word = m.group(9).lower()
            return {"noon": "12:00", "midday": "12:00", "midnight": "00:00"}[word]
        if m.group(1) is not None:
            hour, minute, suffix = m.group(1), m.group(2), m.group(3)
        elif m.group(4) is not None:
            hour, minute, suffix = m.group(4), 0, m.group(5)
        else:
            hour, minute, suffix = m.group(6), m.group(7), m.group(8)
        value = _clock(int(hour), int(minute or 0), suffix or "")
        if value:
            return value
    return None


def detect_window(text: str) -> Optional[str]:
    """The vague time window in the text ("next week", "after the proposal"), if any."""
    t = text or ""
    for pattern, label in _WINDOW_PATTERNS:
        m = re.search(pattern, t, re.I)
        if m:
            return _clip(m.group(0), 120) or label
    return None


def detect_condition(text: str) -> Optional[str]:
    """A prerequisite attached to the commitment ("if the budget is approved")."""
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text or ""):
        if re.search(r"\b(if|once|after|unless|depending on|provided that|subject to)\b", sentence, re.I):
            return _clip(sentence, 300)
    return None


def infer_follow_up_type(text: str, channel: str = "email") -> str:
    t = (text or "").lower()
    if re.search(r"\b(proposal|quote|quotation|contract|deck|pricing document)\b", t):
        return "Proposal"
    if re.search(r"\b(call me back|call back|callback|ring me back|phone me back|i(?:'ll| will) call (?:you )?back)\b", t):
        return "Salesperson Callback"
    if re.search(r"\b(whatsapp|whats app)\b", t):
        return "WhatsApp"
    if re.search(r"\b(meeting|demo|zoom|google meet|teams call|appointment|visit)\b", t):
        return "Meeting"
    if re.search(r"\b(call|phone|ring|dial)\b", t) or channel == "call":
        return "Call"
    if re.search(r"\b(email|mail|write to|send (?:me )?(?:an )?email)\b", t) or channel == "email":
        return "Email"
    if channel == "meeting":
        return "Meeting"
    if channel == "whatsapp":
        return "WhatsApp"
    return "Other"


def _priority(text: str) -> str:
    return "high" if re.search(r"\b(urgent|asap|immediately|right away|today|important|critical)\b", text or "", re.I) else "medium"


def _end_of_week(d: date) -> date:
    """Friday of d's week."""
    return d + timedelta(days=4 - d.weekday()) if d.weekday() <= 4 else d + timedelta(days=11 - d.weekday())


def _num(word: str) -> Optional[int]:
    word = word.strip().lower()
    if word.isdigit():
        return int(word)
    return _NUMBER_WORDS.get(word)


def parse_relative_date(text: str, base: date) -> Optional[date]:
    """Best-effort: the follow-up date a phrase like "respond next week" / "call me on Tuesday" /
    "in 2 weeks" / "by 15 Oct" implies, resolved against `base` (the day the note was written).

    When someone promises to get back within a period, the follow-up lands at the END of that period
    (next week -> Friday of next week), so they get the chance to respond first. Weekends roll to
    Monday. Returns None if no date phrase is found.
    """
    t = " " + (text or "").lower() + " "
    candidates = []

    def add(d: Optional[date]):
        if d and base - timedelta(days=1) <= d <= base + timedelta(days=MAX_DAYS_AHEAD):
            candidates.append(d)

    # ISO / numeric dates: 2026-10-20, 20/10/2026, 20-10
    for y, m, d in re.findall(r"\b(20\d\d)-(\d{1,2})-(\d{1,2})\b", t):
        try:
            add(date(int(y), int(m), int(d)))
        except ValueError:
            pass
    # "15 oct", "15th october", "oct 15", "october 15th"
    month_names = "|".join(sorted(_MONTHS, key=len, reverse=True))
    for dd, mon in re.findall(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?(?:\s+of)?\s+({month_names})\b", t):
        add(_next_occurrence(base, _MONTHS[mon], int(dd)))
    for mon, dd in re.findall(rf"\b({month_names})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", t):
        add(_next_occurrence(base, _MONTHS[mon], int(dd)))

    if re.search(r"\bday after tomorrow\b", t):
        add(base + timedelta(days=2))
    elif re.search(r"\btomorrow\b", t):
        add(base + timedelta(days=1))
    # "today" mostly describes when the note was written ("spoke today, they'll reply next week"),
    # so it only counts when no other date phrase is present.
    weak_today = bool(re.search(r"\b(today|tonight|this evening|later today)\b", t))
    if re.search(r"\b(this week|end of (?:the |this )?week|by (?:the )?weekend|this weekend)\b", t):
        add(_end_of_week(base))
    if re.search(r"\b(next week|following week|early next week|within a week|in a week)\b", t):
        add(_end_of_week(base + timedelta(days=7)) if "early next week" not in t else
            base + timedelta(days=7 - base.weekday()))
    if re.search(r"\b(next month|end of (?:the )?month|this month)\b", t):
        if re.search(r"\bnext month\b", t):
            first_next = (base.replace(day=1) + timedelta(days=32)).replace(day=1)
            add(first_next + timedelta(days=7))
        else:
            add((base.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1))
    for qty, unit in re.findall(r"\b(?:in|within|after|another)\s+(\d+|a|an|one|two|three|four|five|six|seven|ten|fifteen|"
                                r"a couple of|couple of|a few|few)\s+(day|week|month)s?\b", t):
        n = _num(qty)
        if n:
            add(base + timedelta(days=n * {"day": 1, "week": 7, "month": 30}[unit]))
    for qty, unit in re.findall(r"\b(\d+|two|three|four)\s+(day|week)s?\s+(?:time|later|from now)\b", t):
        n = _num(qty)
        if n:
            add(base + timedelta(days=n * (7 if unit == "week" else 1)))
    # Weekdays: "on monday", "next friday", "by thursday"
    for prefix, wd in re.findall(rf"\b(next\s+|this\s+|on\s+|by\s+|until\s+|)({'|'.join(_WEEKDAYS)})\b", t):
        target = _WEEKDAYS.index(wd)
        if prefix.strip() == "next":  # "next friday" = the friday of next week
            add(base - timedelta(days=base.weekday()) + timedelta(days=7 + target))
        else:  # "on/by/this friday" = the coming friday (a week ahead if today is friday)
            add(base + timedelta(days=(target - base.weekday()) % 7 or 7))

    if not candidates:
        return _shift_off_weekend(base) if weak_today else None
    return _shift_off_weekend(min(candidates))


def _next_occurrence(base: date, month: int, day: int) -> Optional[date]:
    for year in (base.year, base.year + 1):
        try:
            d = date(year, month, day)
        except ValueError:
            return None
        if d >= base - timedelta(days=1):
            return d
    return None


def _first_sentence_with(text: str, pattern) -> str:
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text or ""):
        if pattern.search(sentence):
            return sentence.strip()
    return (text or "").strip()


def heuristic_extract(text: str, base: date) -> dict:
    """Rule-based twin of extract_from_note, used without AI."""
    committed = bool(_COMMITMENT_RE.search(text or ""))
    # Prefer a date stated in the same sentence as the commitment over one elsewhere in the note.
    due = parse_relative_date(_first_sentence_with(text, _COMMITMENT_RE), base) if committed else None
    due = due or parse_relative_date(text, base)
    if not due or not committed:
        return {"should_follow_up": False, "due_date": None, "due_time": None, "title": "",
                "reason": "", "quote": "", "channel": "email", "priority": "medium",
                "confidence": 0.0, "engine": "rules", "follow_up_type": "Other",
                "requested_at_text": None, "requested_window": None, "condition": None,
                "ambiguous": False}
    quote = _first_sentence_with(text, _COMMITMENT_RE)
    channel = "call" if re.search(r"\b(call|phone|ring)\b", text, re.I) else (
        "meeting" if re.search(r"\b(meeting|demo|visit)\b", text, re.I) else "email")
    due_time = parse_time_text(text)
    window = detect_window(text)
    condition = detect_condition(text)
    # The exact wording the contact used about timing, kept for the "needs confirmation" UI.
    timing = re.search(
        r"\b(?:on|by|at|around|before|after|next|this|tomorrow|today|within|in)\b[^.!?\n]{0,60}",
        text or "", re.I,
    )
    return {
        "should_follow_up": True, "due_date": due.isoformat(), "due_time": due_time,
        "title": _clip(f"Follow up: {quote}", 140),
        "reason": f"From the note: “{_clip(quote, 300)}”", "quote": _clip(quote, 300),
        "channel": channel, "priority": _priority(text), "confidence": 0.6, "engine": "rules",
        "follow_up_type": infer_follow_up_type(text, channel),
        "requested_at_text": _clip(timing.group(0) if timing else quote, 200),
        "requested_window": window, "condition": condition,
        "ambiguous": bool(window or condition),
    }


def _clip(text, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _valid_date(value, base: date, floor: date) -> Optional[date]:
    try:
        d = date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    if d > base + timedelta(days=MAX_DAYS_AHEAD):
        return None
    return _shift_off_weekend(max(d, floor))


_DATE_RULES = (
    "Date rules: resolve relative dates against the date and local time the text was written. When the contact "
    "promised to get back within a period, schedule the follow-up at the END of that period so they have time to "
    "respond (\"next week\" -> Friday of next week, \"in two weeks\" -> that day, \"tomorrow\" -> the next day). "
    "If a specific day or date is named, use it. Never schedule on a Saturday or Sunday. If the text implies a "
    "follow-up but gives no timing, use 3 business days after it was written. Never invent an exact clock time: "
    "only return due_time when the text itself stated one. For a vague window (\"next week\", \"sometime after the "
    "proposal\") return the best-effort due_date, put the original wording in requested_window and set ambiguous "
    "to true so the salesperson confirms it."
)


def _str_list(value, limit: int = 8, item_chars: int = 400) -> list:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    out = []
    for item in value:
        text = _clip(item, item_chars) if not isinstance(item, dict) else _clip(
            " — ".join(str(v) for v in item.values() if v), item_chars)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _normalise_time(value) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    # Already HH:MM (24h)?
    m = re.match(r"^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$", raw, re.I)
    if m:
        return _clock(int(m.group(1)), int(m.group(2)), m.group(3) or "")
    return parse_time_text(raw)


def _valid_follow_up_type(value) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip().lower()
    for known in FOLLOW_UP_TYPES:
        if raw == known.lower():
            return known
    # Accept common AI synonyms.
    if "callback" in raw or "call back" in raw:
        return "Salesperson Callback"
    for known in FOLLOW_UP_TYPES:
        if known.lower() in raw:
            return known
    return None


def extract_from_note(text: str, written_on: date, today: date, record_label: str = "") -> dict:
    """Does this note / conversation log imply a follow-up, and when? Falls back to rules without AI."""
    text = (text or "").strip()
    if not text:
        return heuristic_extract("", written_on)
    system = (
        "You read sales CRM notes and conversation logs and decide whether they imply a follow-up the salesperson "
        "must do: the contact promised to get back, asked to be contacted later, needs to discuss internally, is "
        "waiting on budget/approval, or the salesperson promised to send something or call back. Pure facts with "
        "no pending next step, closed deals, and refusals (\"not interested\", \"unsubscribe\") need no follow-up.\n"
        f"{_DATE_RULES}\n{email_ai.UNTRUSTED}\n"
        'Respond as JSON: {"should_follow_up": bool, "due_date": "YYYY-MM-DD" or null, '
        '"due_time": "HH:MM" or null (only if explicitly stated), '
        '"follow_up_type": "Call|Meeting|Email|WhatsApp|Salesperson Callback|Proposal|Other", '
        '"title": "short imperative task, max 12 words", "reason": "one sentence on what was said and why to '
        'follow up", "quote": "the exact words from the note that justify it", '
        '"channel": "email|call|meeting|whatsapp|other", "priority": "high|medium|low", '
        '"requested_at_text": "the contact\'s own timing words", "requested_window": "next week|sometime|..." or null, '
        '"condition": "any prerequisite (\"if budget approved\")" or null, "ambiguous": bool, "confidence": 0.0-1.0}'
    )
    user = (f"Record: {record_label or 'a lead/client'}\nWritten on: {written_on.isoformat()} "
            f"({_WEEKDAYS[written_on.weekday()].title()})\nToday: {today.isoformat()}\n\n<crm_context>\n{_clip(text, 4000)}\n</crm_context>")
    try:
        data = email_ai._chat_json(system, user, max_tokens=400, timeout=30)
    except EmailAIError:
        return heuristic_extract(text, written_on)
    return _clean_suggestion(data, written_on, floor=written_on, engine="ai")


def _clean_suggestion(data: dict, base: date, floor: date, engine: str) -> dict:
    should = bool(data.get("should_follow_up"))
    due = _valid_date(data.get("due_date"), base, floor) if should else None
    if should and not due:
        due = _shift_off_weekend(base + timedelta(days=3))
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.7))))
    except (TypeError, ValueError):
        confidence = 0.7
    channel = str(data.get("channel") or "email").lower()
    priority = str(data.get("priority") or "medium").lower()
    fu_type = _valid_follow_up_type(data.get("follow_up_type") or data.get("type"))
    window = _clip(data.get("requested_window"), 120) if should else ""
    condition = _clip(data.get("condition"), 300) if should else ""
    return {
        "should_follow_up": should,
        "due_date": due.isoformat() if due else None,
        "due_time": _normalise_time(data.get("due_time")) if should else None,
        "follow_up_type": fu_type or infer_follow_up_type(str(data.get("quote") or data.get("reason") or ""), channel),
        "title": _clip(data.get("title"), 160) if should else "",
        "reason": _clip(data.get("reason"), 600) if should else "",
        "quote": _clip(data.get("quote"), 400) if should else "",
        "channel": channel if channel in CHANNELS else "email",
        "priority": priority if priority in PRIORITIES else "medium",
        "requested_at_text": _clip(data.get("requested_at_text"), 200) if should else "",
        "requested_window": window or (detect_window(str(data.get("quote") or data.get("reason") or "")) if should else ""),
        "condition": condition or (detect_condition(str(data.get("quote") or data.get("reason") or "")) if should else ""),
        "ambiguous": bool(data.get("ambiguous")) if should else False,
        "confidence": confidence,
        "engine": engine,
    }


def _crm_tz(tenant_id=None):
    from modules.tenant_scope import current_tenant_id
    from modules.tenant_settings import get_setting
    tid = current_tenant_id.get() if tenant_id is None else tenant_id
    fallback = (os.getenv("CRM_TIMEZONE") or os.getenv("FOLLOWUP_TIMEZONE") or "Asia/Kolkata").strip()
    name = get_setting(tid, "timezone", fallback)
    try:
        return ZoneInfo(name), name
    except Exception:
        offset = int(os.getenv("FOLLOWUP_DEFAULT_TZ_OFFSET_MINUTES", "330") or 330)
        return timezone(timedelta(minutes=offset)), f"UTC{offset // 60:+03d}:{abs(offset) % 60:02d}"


def _fallback_intelligence(text: str, existing_summary: str = "") -> dict:
    """Deterministic summary/intelligence used when the AI is unavailable."""
    clean = " ".join((text or "").split())
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text or "") if s.strip()]
    summary = (existing_summary or "").strip()
    if not summary:
        summary = _clip(" ".join(sentences[:4]) or clean, 1200)
    key_points = [_clip(s, 400) for s in sentences[:6]]
    requirements = [_clip(s, 400) for s in sentences if re.search(
        r"\b(need|needs|require|requires|looking for|want|wants|must|expect|budget)\b", s, re.I)][:6]
    objections = [_clip(s, 400) for s in sentences if re.search(
        r"\b(but|however|concern|worried|not sure|expensive|too much|objection|issue|problem|competitor)\b", s, re.I)][:6]
    decisions = [_clip(s, 400) for s in sentences if re.search(
        r"\b(agreed|decided|confirmed|approved|will go with|signed|chose)\b", s, re.I)][:6]
    actions = [_clip(s, 400) for s in sentences if _COMMITMENT_RE.search(s)][:6]
    return {
        "summary": summary, "key_points": key_points, "requirements": requirements,
        "objections": objections, "decisions": decisions, "follow_up_actions": actions,
    }


def analyze_conversation(text: str, written_at: datetime, record_label: str = "",
                         existing_summary: str = "", tenant_id=None) -> dict:
    """Summary + structured conversation intelligence + follow-up intent, in one AI call.

    Returns ``{"summary", "key_points", "requirements", "objections", "decisions",
    "follow_up_actions", "follow_up": {...}, "engine", "error"}``. On any AI failure the
    deterministic fallback is returned with ``error`` set; callers keep the notes and offer
    a retry.
    """
    text = (text or "").strip()
    tz, tz_name = _crm_tz(tenant_id)
    aware = written_at if written_at.tzinfo else written_at.replace(tzinfo=timezone.utc)
    local = aware.astimezone(tz)
    base = local.date()
    existing = (existing_summary or "").strip()
    if not text:
        return {"summary": existing, "key_points": [], "requirements": [], "objections": [],
                "decisions": [], "follow_up_actions": [],
                "follow_up": heuristic_extract("", base), "engine": "rules", "error": None}

    system = (
        "You are a CRM analyst. Read the untrusted conversation notes/transcript and return a summary, the "
        "structured intelligence a salesperson needs, and whether there is an explicit follow-up commitment.\n"
        "Capture only what was actually said: requirements/interests, objections, decisions/commitments, and "
        "promised follow-up actions. Do not invent facts, prices, people, dates or times.\n"
        f"{_DATE_RULES}\n"
        f"The CRM timezone is {tz_name}. The conversation happened on {local.strftime('%Y-%m-%d %H:%M (%A)')} "
        f"local time.\n{email_ai.UNTRUSTED}\n"
        'Respond as JSON: {"summary": "3-5 sentences", "key_points": ["..."], '
        '"requirements": ["..."], "objections": ["..."], "decisions": ["..."], '
        '"follow_up_actions": ["..."], "follow_up": {"should_follow_up": bool, '
        '"follow_up_type": "Call|Meeting|Email|WhatsApp|Salesperson Callback|Proposal|Other", '
        '"title": "short imperative task, max 12 words", "due_date": "YYYY-MM-DD" or null, '
        '"due_time": "HH:MM" or null (only if explicitly stated), '
        '"requested_at_text": "the contact\'s own timing words", '
        '"requested_window": "next week|sometime|..." or null, '
        '"condition": "any prerequisite" or null, "channel": "email|call|meeting|whatsapp|other", '
        '"priority": "high|medium|low", "reason": "why", "quote": "exact words", '
        '"ambiguous": bool, "confidence": 0.0-1.0}}'
    )
    reused = f"\nAn existing summary is available; reuse it verbatim unless it is clearly incomplete:\n{_clip(existing, 1200)}\n" if existing else ""
    user = (f"Record: {record_label or 'a lead/client'}\n"
            f"Conversation time: {local.isoformat()} ({tz_name})\n{reused}\n"
            f"<crm_context>\n{_clip(text, 7000)}\n</crm_context>")
    try:
        data = email_ai._chat_json(system, user, max_tokens=1200, timeout=45)
    except Exception as exc:
        # Any provider/transport/parse failure must degrade to the deterministic fallback:
        # the conversation is already saved and the UI offers a retry.
        fallback = _fallback_intelligence(text, existing)
        follow = heuristic_extract(text, base)
        return {**fallback, "follow_up": follow, "engine": "rules", "error": str(exc)}

    fallback = _fallback_intelligence(text, existing)
    follow_data = data.get("follow_up") if isinstance(data.get("follow_up"), dict) else data
    follow = _clean_suggestion(follow_data, base, floor=base, engine="ai")
    if not follow.get("should_follow_up"):
        follow = {**heuristic_extract("", base), "should_follow_up": False}
    return {
        "summary": _clip(data.get("summary"), 1800) or fallback["summary"],
        "key_points": _str_list(data.get("key_points")) or fallback["key_points"],
        "requirements": _str_list(data.get("requirements")),
        "objections": _str_list(data.get("objections")),
        "decisions": _str_list(data.get("decisions")),
        "follow_up_actions": _str_list(data.get("follow_up_actions")),
        "follow_up": follow,
        "engine": "ai",
        "error": None,
    }


def suggest_from_history(*, context_text: str, record_label: str, today: date, latest_texts: list) -> dict:
    """Propose the next follow-up for a record from its whole CRM history (not saved).

    `latest_texts` is [(written_on: date, text)] newest first — used by the rules fallback."""
    system = (
        "You are a sales assistant. From the CRM history of one lead/client, decide the single most useful next "
        "follow-up: when, through which channel, and why. Prefer explicit commitments in the most recent notes, "
        "conversations and emails (e.g. 'they will discuss internally and respond next week'). If nothing is "
        "pending and the relationship is still open, suggest a light check-in. If the record is clearly closed, "
        "lost or asked not to be contacted, set should_follow_up to false.\n"
        f"{_DATE_RULES}\n{email_ai.UNTRUSTED}\n"
        'Respond as JSON: {"should_follow_up": bool, "due_date": "YYYY-MM-DD" or null, "due_time": "HH:MM" or null, '
        '"follow_up_type": "Call|Meeting|Email|WhatsApp|Salesperson Callback|Proposal|Other", '
        '"title": "short imperative task", "reason": "1-2 sentences citing what was said and when", '
        '"quote": "exact words that triggered it, if any", "channel": "email|call|meeting|whatsapp|other", '
        '"priority": "high|medium|low", "requested_at_text": "...", "requested_window": "..." or null, '
        '"condition": "..." or null, "ambiguous": bool, "confidence": 0.0-1.0}'
    )
    user = f"Record: {record_label}\nToday: {today.isoformat()} ({_WEEKDAYS[today.weekday()].title()})\n\n<crm_context>\n{context_text}\n</crm_context>"
    try:
        data = email_ai._chat_json(system, user, max_tokens=500, timeout=40)
        return _clean_suggestion(data, today, floor=today, engine="ai")
    except EmailAIError:
        pass
    for written_on, text in latest_texts:
        s = heuristic_extract(text, written_on)
        if s["should_follow_up"]:
            due = max(date.fromisoformat(s["due_date"]), today)
            s["due_date"] = _shift_off_weekend(due).isoformat()
            return s
    due = _shift_off_weekend(today + timedelta(days=3))
    return {"should_follow_up": True, "due_date": due.isoformat(), "title": f"Check in with {record_label}",
            "reason": "No pending commitment was found in the notes; a short check-in keeps the conversation moving.",
            "quote": "", "channel": "email", "priority": "low", "confidence": 0.3, "engine": "rules"}


def template_email(*, contact_name: str, company: str, title: str, reason: str, last_discussion: str,
                   sender_name: str) -> dict:
    """Plain personalized follow-up used when AI drafting isn't available."""
    first = (contact_name or "").split()[0] if (contact_name or "").strip() else ""
    greeting = f"Hi {first}," if first else "Hello,"
    lines = [greeting, ""]
    if last_discussion:
        lines.append(f"I'm following up on our last conversation, where {last_discussion.rstrip('.')}.")
    elif reason:
        lines.append(f"I'm following up regarding {reason.rstrip('.')}.")
    else:
        lines.append(f"I wanted to follow up{(' with ' + company) if company else ''} on our recent conversation.")
    lines += ["", "Is there anything you need from my side to move forward? I'd be happy to answer any questions "
                  "or set up a quick call at a time that suits you.", "", "Best regards,"]
    if sender_name:
        lines.append(sender_name)
    subject = f"Following up{(' — ' + company) if company else ''}"
    return {"subject": subject[:300], "body": "\n".join(lines), "engine": "template"}


def draft_followup_email(*, contact_name: str, company: str, record_label: str, title: str, reason: str,
                         context_text: str, sender_name: str, sender_company: str, tone: str = "professional",
                         instructions: str = "", last_discussion: str = "") -> dict:
    """A follow-up email grounded in the previous notes/conversations, never a generic message."""
    goal = (f"This is a follow-up. The follow-up task: {title}. Why: {reason or 'see the history'}. "
            "Refer specifically to what was last discussed (who said what, and what they promised or asked for), "
            "and propose one concrete next step.")
    try:
        draft = email_ai.draft_record_email(
            purpose="custom", tone=tone if tone in email_ai.TONES else "professional",
            instructions=(goal + ("\n" + instructions if instructions else ""))[:1900],
            record_label=record_label or company or "the contact", context_text=context_text,
            recipient_name=contact_name or "", sender_name=sender_name or "", company=sender_company or "",
        )
        return {**draft, "engine": "ai"}
    except EmailAIError:
        return template_email(contact_name=contact_name, company=company, title=title, reason=reason,
                              last_discussion=last_discussion, sender_name=sender_name)
