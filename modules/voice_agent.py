"""
AI voice agent: pitch writing, real-time conversation reasoning, call summaries,
Twilio Voice REST helpers and TwiML builders.

Twilio is called through its REST API with ``requests`` (same approach as
modules/whatsapp.py), so no extra SDK dependency is needed.
"""
import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import List, Optional
from xml.sax.saxutils import escape, quoteattr

import requests
from requests.auth import HTTPBasicAuth

COMPANY_NAME = os.getenv("VOICE_AGENT_COMPANY", "SERP Hawk")
COMPANY_PITCH = os.getenv(
    "VOICE_AGENT_COMPANY_DESC",
    "an elite SEO and digital marketing agency (SEO, link building, local SEO, content, paid ads, web design)",
)
CONVERSATION_MODEL = os.getenv("VOICE_AGENT_MODEL", "gpt-4o-mini")
PITCH_MODEL = os.getenv("VOICE_AGENT_PITCH_MODEL", "gpt-4o")

INTENTS = [
    "interested", "not_interested", "question", "objection", "doubt", "request_info",
    "request_human", "callback_request", "busy", "greeting", "small_talk", "off_topic",
    "agreement", "end_call", "unclear",
]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _openai():
    from modules.llm_engine import get_openai_client
    return get_openai_client()


# ─────────────────────────────────────────────────────────────────────────────
# Pitch writing
# ─────────────────────────────────────────────────────────────────────────────

def generate_pitch_text(entity_context: str, extra_context: Optional[str] = None, language: str = "English") -> str:
    prompt = f"""You are an expert outbound sales rep for "{COMPANY_NAME}", {COMPANY_PITCH}.
Write the OPENING PITCH that an AI voice will speak on a cold/warm phone call to the prospect below.

Prospect information:
{entity_context}

Rules:
- 90-140 words, about 45-60 seconds when spoken.
- Greet the person, introduce yourself as calling from {COMPANY_NAME}, and say why you're calling in one sentence.
- Reference something specific about their business, then give one or two concrete benefits.
- End with ONE short open question that invites them to respond (e.g. about their current marketing).
- Natural spoken English: short sentences, contractions, no lists, no markdown, no placeholders like [Name], no stage directions.
- Write the pitch in {language} (natural, native-sounding {language}; keep the company name as is).
- Output ONLY the words to be spoken."""
    if extra_context:
        prompt += f"\n\nAdditional instructions from the sales rep (follow closely):\n{extra_context}"
    resp = _openai().chat.completions.create(
        model=PITCH_MODEL, messages=[{"role": "user", "content": prompt}], max_tokens=400, temperature=0.7,
    )
    return (resp.choices[0].message.content or "").strip().strip('"')


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge retrieval (lightweight keyword scoring, no vector DB needed)
# ─────────────────────────────────────────────────────────────────────────────

_STOP = set("""a an the and or but if to of in on for with at by from is are was were be been am i you we they
it this that these those my your our their me us them do does did can could would should will what how why when
where who which about just so not no yes ok okay really please thanks thank""".split())


def _tokens(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9']+", (text or "").lower()) if len(w) > 2 and w not in _STOP}


def rank_knowledge(query: str, items: List[dict], limit: int = 6) -> List[dict]:
    """items: [{id, kind, title, answer, tags}] -> best matches for ``query``."""
    q = _tokens(query)
    scored = []
    for it in items:
        hay = _tokens(f"{it.get('title', '')} {' '.join(it.get('tags') or [])}")
        body = _tokens(it.get("answer", ""))
        score = 3 * len(q & hay) + len(q & body)
        if score:
            scored.append((score, it))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = [it for _, it in scored[:limit]]
    # Always give the model a few objection handlers / product facts as baseline.
    if len(top) < limit:
        for it in items:
            if it not in top and it.get("kind") in ("objection", "product"):
                top.append(it)
            if len(top) >= limit:
                break
    return top


# ─────────────────────────────────────────────────────────────────────────────
# Real-time conversation reasoning
# ─────────────────────────────────────────────────────────────────────────────

def _format_history(transcript: List[dict], max_turns: int = 24) -> str:
    lines = []
    for turn in (transcript or [])[-max_turns:]:
        role = turn.get("role")
        if role == "system":
            continue
        who = {"ai": "YOU (AI rep)", "agent": "HUMAN AGENT", "client": "CLIENT"}.get(role, role)
        suffix = " [was interrupted by the client]" if turn.get("interrupted") else ""
        lines.append(f"{who}: {turn.get('text', '')}{suffix}")
    return "\n".join(lines) or "(no conversation yet)"


def analyze_and_respond(*, client_text: str, transcript: List[dict], pitch_text: str,
                        entity_context: str, knowledge: List[dict], state: dict,
                        interrupted: bool = False, agent_available: bool = False,
                        language: str = "English") -> dict:
    """Understand what the client said and produce the next spoken reply plus structured insights."""
    kb = "\n".join(
        f"- [{k.get('kind', 'faq').upper()}] {k.get('title')}: {k.get('answer')}" for k in knowledge
    ) or "(no knowledge base entries)"
    doubts = ", ".join(state.get("doubts", [])[-8:]) or "none yet"
    objections = ", ".join(state.get("objections", [])[-8:]) or "none yet"
    adaptation = state.get("adaptation") or "Follow the original pitch."

    system = f"""You are a skilled, friendly human-sounding sales rep for {COMPANY_NAME}, {COMPANY_PITCH}, on a LIVE PHONE CALL.
The call is in {language}: ALWAYS write "reply" in natural, native-sounding {language}, even if the client mixes languages
(switch only if the client clearly asks for another language). All other JSON fields stay in English.
Your replies are converted to speech, so:
- Keep each reply VERY short: 1-2 short sentences (max ~30 words). Natural spoken English, contractions, no lists/markdown/emojis.
- Keep "questions[].answer" to one short sentence as well (or null).
- Always end with a question or a clear next step unless the call is ending.
- Answer questions using ONLY the knowledge base and prospect info below. NEVER invent prices, guarantees, timelines,
  statistics or policies. If you don't know, say you'll have a specialist follow up, and set "unanswered_question".
- Handle objections with empathy: acknowledge, clarify, reframe with a benefit, then ask a question. Don't argue.
- Adapt the pitch to what the client cares about. If not interested after one respectful attempt, offer to send info by email and close politely.
- If the client asks for a human/manager, or the matter is sensitive (legal, contract, refund, complaint), set "escalate": true.
- If they are busy, offer a callback time and set intent "callback_request".
- If interrupted, briefly acknowledge ("Sure, go ahead" / "Of course") and address their point directly; don't repeat what you were saying.

ORIGINAL PITCH (already delivered or partially delivered at call start):
{pitch_text}

PROSPECT INFO:
{entity_context}

KNOWLEDGE BASE (FAQs, objection handlers, product/service info):
{kb}

CONVERSATION STATE:
- Stage: {state.get('stage', 'pitch')}
- Doubts raised so far: {doubts}
- Objections raised so far: {objections}
- Current strategy: {adaptation}
- A human agent is {'available' if agent_available else 'NOT available'} for live transfer.

Respond ONLY with JSON:
{{
  "intent": one of {INTENTS},
  "sentiment": "positive" | "neutral" | "negative",
  "interest_score": 0-100 integer (how likely they are to buy),
  "stage": "pitch" | "discovery" | "objection_handling" | "qa" | "closing" | "wrap_up",
  "reply": "what you say next",
  "doubts": ["short descriptions of any doubts/concerns in THIS message"],
  "objection": null or {{"type": "price|timing|trust|need|competitor|authority|other", "text": "short summary"}},
  "questions": [{{"question": "client question", "answered": true/false, "answer": "your answer or null"}}],
  "unanswered_question": null or "question you could not answer from the knowledge base",
  "escalate": true/false,
  "escalate_reason": null or "why",
  "end_call": true/false (true only when the conversation is clearly finished and your reply is a goodbye),
  "adaptation": "one sentence: how to adapt the pitch from now on based on what you learned",
  "knowledge_used": [ids or titles of knowledge entries you relied on]
}}"""

    user = f"""CONVERSATION SO FAR:
{_format_history(transcript)}

{'NOTE: The client INTERRUPTED you mid-sentence.' if interrupted else ''}
CLIENT JUST SAID: "{client_text}"
"""
    try:
        resp = _openai().chat.completions.create(
            model=CONVERSATION_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0.5,
            max_tokens=250,  # replies are 1-2 short sentences; keep the turn fast
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:
        print(f"[voice_agent] analyze_and_respond failed: {e}")
        data = {
            "intent": "unclear", "sentiment": "neutral", "reply":
            "Sorry, could you say that once more? I want to make sure I get it right.",
            "doubts": [], "questions": [], "escalate": False, "end_call": False,
        }
    data.setdefault("reply", "Could you tell me a little more about that?")
    data.setdefault("doubts", [])
    data.setdefault("questions", [])
    if data.get("intent") not in INTENTS:
        data["intent"] = "unclear"
    try:
        data["interest_score"] = max(0, min(100, int(data.get("interest_score") or 0)))
    except (TypeError, ValueError):
        data["interest_score"] = None
    return data


def summarize_call(transcript: List[dict], entity_name: str) -> dict:
    if not transcript:
        return {"summary": "No conversation took place.", "outcome": "no_conversation", "next_steps": ""}
    prompt = f"""Summarize this sales phone call with {entity_name or 'a prospect'} for the CRM.
Transcript:
{_format_history(transcript, max_turns=200)}

Return JSON: {{"summary": "3-5 sentence summary", "outcome": "interested|not_interested|callback|meeting_booked|needs_follow_up|no_conversation|voicemail",
"next_steps": "concrete next steps for the sales team"}}"""
    try:
        resp = _openai().chat.completions.create(
            model=CONVERSATION_MODEL, messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}, temperature=0.3, max_tokens=400,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return {"summary": data.get("summary", ""), "outcome": data.get("outcome", "needs_follow_up"),
                "next_steps": data.get("next_steps", "")}
    except Exception as e:
        print(f"[voice_agent] summarize_call failed: {e}")
        return {"summary": "", "outcome": "needs_follow_up", "next_steps": ""}


def translate_phrases(phrases: dict, language: str) -> dict:
    """Translate the fixed call phrases (silence prompts, transfer lines…) once per call."""
    if not language or language.lower() == "english":
        return dict(phrases)
    try:
        resp = _openai().chat.completions.create(
            model=CONVERSATION_MODEL,
            messages=[{"role": "user", "content":
                       f"Translate the values of this JSON into natural, polite spoken {language} for a sales phone call. "
                       f"Keep the keys unchanged. Return only JSON.\n{json.dumps(phrases, ensure_ascii=False)}"}],
            response_format={"type": "json_object"}, temperature=0.2, max_tokens=800,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return {k: (data.get(k) or v) for k, v in phrases.items()}
    except Exception as e:
        print(f"[voice_agent] translate_phrases failed: {e}")
        return dict(phrases)


def estimate_speech_seconds(text: str, speed: float = 1.0) -> float:
    words = len((text or "").split())
    return words / (2.5 * (speed or 1.0))


# ─────────────────────────────────────────────────────────────────────────────
# Twilio Voice REST helpers
# ─────────────────────────────────────────────────────────────────────────────

def twilio_config() -> dict:
    return {
        "sid": os.getenv("TWILIO_ACCOUNT_SID"),
        "token": os.getenv("TWILIO_AUTH_TOKEN"),
        "from": os.getenv("TWILIO_VOICE_NUMBER") or os.getenv("TWILIO_PHONE_NUMBER"),
        "public_base": (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/"),
    }


def twilio_ready() -> dict:
    cfg = twilio_config()
    missing = [name for name, key in (("TWILIO_ACCOUNT_SID", "sid"), ("TWILIO_AUTH_TOKEN", "token"),
                                      ("TWILIO_VOICE_NUMBER", "from"), ("PUBLIC_BASE_URL", "public_base"))
               if not cfg[key]]
    return {"ready": not missing, "missing": missing, "from_number": cfg["from"]}


def normalize_phone(number: str) -> str:
    """Return E.164 (+<country><number>). Numbers without a country code are only completed when
    VOICE_AGENT_DEFAULT_COUNTRY_CODE is set (e.g. 91); otherwise they're returned without '+'
    so callers can reject them instead of dialing a wrong country."""
    n = re.sub(r"[^\d+]", "", number or "")
    if n.startswith("00"):
        n = "+" + n[2:]
    if n and not n.startswith("+"):
        default_cc = os.getenv("VOICE_AGENT_DEFAULT_COUNTRY_CODE", "").strip().lstrip("+")
        if default_cc:
            n = f"+{default_cc}{n.lstrip('0')}"
    return n


def is_e164(number: str) -> bool:
    return bool(re.fullmatch(r"\+[1-9]\d{7,14}", number or ""))


def _twilio_post(path: str, data: dict) -> dict:
    cfg = twilio_config()
    url = f"https://api.twilio.com/2010-04-01/Accounts/{cfg['sid']}/{path}"
    resp = requests.post(url, data=data, auth=HTTPBasicAuth(cfg["sid"], cfg["token"]), timeout=20)
    try:
        body = resp.json()
    except ValueError:
        body = {"message": resp.text}
    if not resp.ok:
        raise RuntimeError(body.get("message") or f"Twilio error {resp.status_code}")
    return body


def twilio_create_call(to: str, answer_url: str, status_url: str, recording_url: Optional[str] = None) -> dict:
    cfg = twilio_config()
    data = {
        "To": to,
        "From": cfg["from"],
        "Url": answer_url,
        "Method": "POST",
        "StatusCallback": status_url,
        "StatusCallbackMethod": "POST",
        "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
        "Timeout": "30",
        "MachineDetection": "Enable" if os.getenv("VOICE_AGENT_AMD", "false").lower() == "true" else None,
    }
    if recording_url and os.getenv("VOICE_AGENT_RECORD", "true").lower() == "true":
        data["Record"] = "true"
        data["RecordingStatusCallback"] = recording_url
        data["RecordingStatusCallbackMethod"] = "POST"
    data = {k: v for k, v in data.items() if v is not None}
    basic = {"To": to, "From": cfg["from"], "Url": answer_url}  # Twilio's default Method for Url is POST
    if _TRIAL_LIMITED["value"]:
        return _twilio_post("Calls.json", basic)
    try:
        return _twilio_post("Calls.json", data)
    except RuntimeError as e:
        # Trial accounts only accept To/From/Url (no Method, StatusCallback, Record, Twiml…).
        # Retry with just those; call status is then polled instead of pushed (see twilio_fetch_call).
        if not _is_trial_param_error(e):
            raise
        print(f"[voice_agent] Twilio trial account: optional call parameters not allowed; using To/From/Url only")
        _TRIAL_LIMITED["value"] = True
        return _twilio_post("Calls.json", basic)


# Remembered after the first rejection so later calls skip the doomed full request.
_TRIAL_LIMITED = {"value": False}


def _is_trial_param_error(e: Exception) -> bool:
    msg = str(e).lower()
    return "trial" in msg and ("disallowed" in msg or "parameter" in msg)


def twilio_trial_limited() -> bool:
    return _TRIAL_LIMITED["value"]


def twilio_update_call(call_sid: str, *, url: Optional[str] = None, status: Optional[str] = None) -> dict:
    """Redirect a live call to a new TwiML URL (Url only — accepted on trial accounts too),
    or change its status (e.g. 'canceled' for a call that hasn't been answered yet)."""
    data = {}
    if url:
        data["Url"] = url  # default Method is POST
    if status:
        data["Status"] = status
    return _twilio_post(f"Calls/{call_sid}.json", data)


def twilio_fetch_call(call_sid: str) -> dict:
    """Read a call's current status/duration (used when status callbacks aren't available)."""
    cfg = twilio_config()
    url = f"https://api.twilio.com/2010-04-01/Accounts/{cfg['sid']}/Calls/{call_sid}.json"
    resp = requests.get(url, auth=HTTPBasicAuth(cfg["sid"], cfg["token"]), timeout=15)
    try:
        body = resp.json()
    except ValueError:
        body = {"message": resp.text}
    if not resp.ok:
        raise RuntimeError(body.get("message") or f"Twilio error {resp.status_code}")
    return body


def validate_twilio_signature(url: str, params: dict, signature: Optional[str]) -> bool:
    """Optional strict validation (enable with TWILIO_VALIDATE_WEBHOOKS=true)."""
    token = os.getenv("TWILIO_AUTH_TOKEN") or ""
    if not token or not signature:
        return False
    payload = url + "".join(f"{k}{params[k]}" for k in sorted(params))
    digest = hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


# ─────────────────────────────────────────────────────────────────────────────
# TwiML builders
# ─────────────────────────────────────────────────────────────────────────────

def _speak(audio_url: Optional[str], text: Optional[str], language: str) -> str:
    if audio_url:
        return f"<Play>{escape(audio_url)}</Play>"
    if text:
        return f"<Say language={quoteattr(language)}>{escape(text)}</Say>"
    return ""


def twiml_gather(action_url: str, *, audio_url: Optional[str] = None, text: Optional[str] = None,
                 language: str = "en-US", timeout: int = 6, pause: int = 0,
                 fallback_url: Optional[str] = None, action_on_empty: bool = True) -> str:
    """Speak (interruptible via bargeIn) and listen for the client's reply."""
    inner = _speak(audio_url, text, language) + (f'<Pause length="{pause}"/>' if pause else "")
    gather = (
        f'<Gather input="speech" action={quoteattr(action_url)} method="POST" language={quoteattr(language)} '
        f'speechTimeout="auto" timeout="{timeout}" bargeIn="false" speechModel="phone_call" enhanced="true" '
        f'actionOnEmptyResult="{"true" if action_on_empty else "false"}">{inner}</Gather>'
    )
    tail = f"<Redirect method=\"POST\">{escape(fallback_url)}</Redirect>" if fallback_url else ""
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{gather}{tail}</Response>'


def twiml_say_hangup(audio_url: Optional[str], text: Optional[str], language: str = "en-US") -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{_speak(audio_url, text, language)}<Hangup/></Response>'


def twiml_dial(number: str, *, caller_id: Optional[str], action_url: str, audio_url: Optional[str] = None,
               text: Optional[str] = None, language: str = "en-US") -> str:
    caller = f" callerId={quoteattr(caller_id)}" if caller_id else ""
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response>{_speak(audio_url, text, language)}'
            f'<Dial{caller} action={quoteattr(action_url)} method="POST" timeout="25">'
            f'<Number>{escape(number)}</Number></Dial></Response>')


def twiml_hangup() -> str:
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
