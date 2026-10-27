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
import time
from datetime import datetime, timezone, timedelta
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
# Latency-critical spoken reply: a tiny JSON object so the model returns in well under a second
# and the line stays 1-2 short sentences. A higher-cap retry only fires if the tiny cap truncates.
REPLY_MAX_TOKENS = int(os.getenv("VOICE_AGENT_REPLY_MAX_TOKENS", "60"))
REPLY_MAX_TOKENS_RETRY = int(os.getenv("VOICE_AGENT_REPLY_MAX_TOKENS_RETRY", "160"))

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
- 6-8 words, about 2-3 seconds when spoken.
- Greet the person, introduce yourself as calling from {COMPANY_NAME}, and say why you're calling in one sentence.
- Reference something specific about their business, then give one or two concrete benefits.
- End with ONE short open question that invites them to respond (e.g. about their current marketing).
- Natural spoken English: short sentences, contractions, no lists, no markdown, no placeholders like [Name], no stage directions.
- Write the pitch in {language} (natural, native-sounding {language}; keep the company name as is).
- Output ONLY the words to be spoken."""
    if extra_context:
        prompt += f"\n\nAdditional instructions from the sales rep (follow closely):\n{extra_context}"
    resp = _openai().chat.completions.create(
        model=PITCH_MODEL, messages=[{"role": "user", "content": prompt}], max_tokens=60, temperature=0.7,
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


def _chat_json(messages: List[dict], max_tokens: int) -> dict:
    """One non-streaming JSON chat completion. Kept tiny so the call turn stays fast."""
    resp = _openai().chat.completions.create(
        model=CONVERSATION_MODEL, messages=messages,
        response_format={"type": "json_object"}, temperature=0.5, max_tokens=max_tokens,
    )
    return json.loads(resp.choices[0].message.content or "{}")


def generate_reply_only(*, client_text: str, transcript: List[dict], pitch_text: str,
                        entity_context: str, knowledge: List[dict], state: dict,
                        interrupted: bool = False, agent_available: bool = False,
                        language: str = "English") -> dict:
    """Latency-critical half of the turn: ONLY the next spoken line plus the two flags the call
    flow needs (escalate / end_call). The rich analysis (sentiment, doubts, questions…) runs
    afterwards in the background via :func:`analyze_and_respond`, so it never delays the reply.

    The output is a ~4-key JSON object capped at ~60 tokens so generation is fast and the line
    stays short. If the cap truncates the JSON we retry once with a slightly larger budget.
    """
    kb = "\n".join(
        f"- [{k.get('kind', 'faq').upper()}] {k.get('title')}: {k.get('answer')}" for k in knowledge
    ) or "(no knowledge base entries)"
    already_said = [t.get("text") for t in (transcript or []) if t.get("role") in ("ai", "agent")][-5:]
    _state = state or {}
    doubts = ", ".join(_state.get("doubts", [])[-4:]) or "none yet"
    objections = ", ".join(_state.get("objections", [])[-4:]) or "none yet"
    adaptation = _state.get("adaptation") or "Follow the original pitch."
    system = f"""You are a warm, human-sounding sales rep for {COMPANY_NAME}, {COMPANY_PITCH}, on a LIVE phone call in {language}.
Reply with ONLY this JSON (keep it tiny): {{"reply":"...","intent":"{'|'.join(INTENTS)}","escalate":false,"end_call":false}}

Rules for "reply" — it is spoken aloud to the client:
- 1-2 short sentences, at most about 20 words. Natural spoken {language}, contractions, no lists/markdown/emojis.
- Acknowledge what the client just said in a few words, then ask exactly ONE short question or give a clear next step.
- NEVER repeat a line already said on this call and never re-ask for information the client already gave.
- Answer ONLY from the knowledge base and prospect info below. NEVER invent prices, guarantees or timelines.
  If you cannot answer, say a specialist will follow up.
- If the client wants a human or a sales agent, set "escalate": true and reply with a short
  acknowledgement that it is noted and a sales representative will follow up (e.g. "Thank you, I've
  noted it - a sales rep will reach out shortly."). NEVER say you are transferring, connecting, or
  putting them through to anyone.
- If the matter is sensitive (legal, contract, refund, complaint), also set "escalate": true.
- Set "end_call": true only when the conversation is clearly finished and the reply is a goodbye.

CALL STATE:
- Stage: {_state.get('stage', 'pitch')}
- Doubts so far: {doubts}
- Objections so far: {objections}
- Strategy: {adaptation}

ORIGINAL PITCH:
{pitch_text}

PROSPECT INFO:
{entity_context}

KNOWLEDGE BASE:
{kb}

Already said on this call (do NOT repeat):
{chr(10).join('- ' + (s or '') for s in already_said) or '- (nothing yet)'}"""
    user = f"""CONVERSATION SO FAR:
{_format_history(transcript)}

{'NOTE: the client INTERRUPTED you mid-sentence.' if interrupted else ''}
CLIENT JUST SAID: "{client_text}"
Return the JSON now."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        data = _chat_json(messages, REPLY_MAX_TOKENS)
    except Exception as e:
        # By far the most likely cause is the 60-token cap truncating the JSON — retry once
        # with a little more room rather than dropping the turn.
        print(f"[voice_agent] generate_reply_only tiny-cap parse failed ({e}); retrying with more tokens")
        try:
            data = _chat_json(messages, REPLY_MAX_TOKENS_RETRY)
        except Exception as e2:
            print(f"[voice_agent] generate_reply_only failed: {e2}")
            data = {}
    reply = (data.get("reply") or "").strip()
    if not reply:
        reply = "Sorry, could you say that once more? I want to make sure I get it right."
    return {
        "reply": reply,
        "intent": data.get("intent") if data.get("intent") in INTENTS else "unclear",
        "escalate": bool(data.get("escalate")),
        "end_call": bool(data.get("end_call")),
    }


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
- Start by acknowledging what the client just said in a few words, and use their name when you know it
  (from PROSPECT INFO). Sound warm and natural, like a helpful human the client likes talking to.
- Ask exactly ONE question per turn (unless the call is ending), never two or more.
- NEVER repeat a sentence or question you have already said earlier in this call, and never ask for
  information the client already gave you (their name, time, platform, company size, etc.) — remember
  what they told you and build on it. If you are unsure you have it, just move on without re-asking.
- Sound genuinely engaged, not robotic: react to the client's exact words with a short, specific
  acknowledgment before you continue, and vary your wording on every turn. Never reuse an opener,
  phrase or sentence you have already used on this call, and never fall back on generic hold lines
  like "give me a second" or "let me think about it" — the system already plays those while you think.
- Answer questions using ONLY the knowledge base and prospect info below. NEVER invent prices, guarantees, timelines,
  statistics or policies. If you don't know, say you'll have a specialist follow up, and set "unanswered_question".
- Handle objections with empathy: acknowledge, clarify, reframe with a benefit, then ask a question. Don't argue.
- Adapt the pitch to what the client cares about. If not interested after one respectful attempt, offer to send info by email and close politely.
- If the client asks for a human/manager or a sales agent, set "escalate": true and reply with a short
  acknowledgement that it is noted and a sales representative will follow up (e.g. "Thank you, I've
  noted it - a sales rep will reach out shortly."). NEVER say you are transferring, connecting, or
  putting them through to anyone. If the matter is sensitive (legal, contract, refund, complaint),
  also set "escalate": true.
- If they ask to schedule a meeting with your sales team: confirm the time ONCE ("So that's <when>, right?"),
  thank them, say a sales executive will follow up to confirm, and end politely with "end_call": true.
  Do NOT offer to "connect" them live or transfer them to anyone on the call.
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


_IST = timezone(timedelta(hours=5, minutes=30))  # Asia/Kolkata, fixed offset (no tzdata needed)


def _call_date_ist(call_started_at: Optional[datetime] = None):
    """(date_str, weekday) for the call start in Asia/Kolkata, e.g. ("10 Oct 2026", "Saturday")."""
    dt = call_started_at or utcnow()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(_IST)
    return local.strftime("%d %b %Y"), local.strftime("%A")


def _normalize_important_notes(outcome: str, raw: Optional[str]) -> str:
    """Enforce the exact important-notes wording rules from the summary step."""
    notes = (raw or "").strip()
    if outcome == "not_interested":
        return "Not interested."
    if outcome != "meeting_booked":
        return ""
    if not notes:
        return "Meeting requested, no time given."
    if not notes.lower().startswith("meeting requested"):
        notes = "Meeting requested: " + notes
    if not notes.endswith("."):
        notes += "."
    return notes


def summarize_call(transcript: List[dict], entity_name: str,
                   call_started_at: Optional[datetime] = None) -> dict:
    if not transcript:
        return {"summary": "No conversation took place.", "outcome": "no_conversation",
                "next_steps": "", "important_notes": ""}
    date_str, weekday = _call_date_ist(call_started_at)
    prompt = f"""Summarize this sales phone call with {entity_name or 'a prospect'} for the CRM.
The call started on {date_str} ({weekday}) in Asia/Kolkata (IST). Use that as "today" when resolving any
relative dates the prospect said ("tomorrow", "Monday", "next week").
Transcript:
{_format_history(transcript, max_turns=200)}

Return JSON:
{{"summary": "3-5 sentence summary",
"outcome": "interested|not_interested|callback|meeting_booked|needs_follow_up|no_conversation|voicemail",
"next_steps": "concrete next steps for the sales team",
"important_notes": "see the exact rules below"}}

important_notes rules (follow EXACTLY, output only the note text):
- If the prospect clearly is NOT interested: important_notes MUST be exactly "Not interested."
- Else if the prospect asked for or agreed to a meeting:
  * Use ONLY the time and the person actually stated in the transcript. NEVER invent a time or a person.
  * Resolve relative wording against the call start date above, in Asia/Kolkata.
  * Write the absolute time as "DD Mon YYYY, H:MM AM/PM" (e.g. "11 Oct 2026, 9:00 AM") and, in
    parentheses, the prospect's own words when they used a relative phrase, e.g.
    "Meeting requested for 11 Oct 2026, 9:00 AM (tomorrow at 9 a.m.)".
  * If the prospect named who they will meet, add " with <person>" before the final period, e.g.
    "Meeting requested for 11 Oct 2026, 9:00 AM (tomorrow at 9 a.m.) with Priya."
  * If they gave no time at all: important_notes MUST be exactly "Meeting requested, no time given."
- Otherwise: important_notes MUST be "" (empty string)."""
    try:
        resp = _openai().chat.completions.create(
            model=CONVERSATION_MODEL, messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}, temperature=0.3, max_tokens=500,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        outcome = data.get("outcome", "needs_follow_up")
        return {"summary": data.get("summary", ""), "outcome": outcome,
                "next_steps": data.get("next_steps", ""),
                "important_notes": _normalize_important_notes(outcome, data.get("important_notes", ""))}
    except Exception as e:
        print(f"[voice_agent] summarize_call failed: {e}")
        return {"summary": "", "outcome": "needs_follow_up", "next_steps": "", "important_notes": ""}


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
            response_format={"type": "json_object"}, temperature=0.2, max_tokens=1200,
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
        # Public base for every URL Twilio fetches (answer/gather/status/recording hooks and
        # audio files). VOICE_AGENT_BASE_URL lets local development point Twilio at an ngrok
        # tunnel while PUBLIC_BASE_URL stays on production for email tracking pixels.
        "public_base": (os.getenv("VOICE_AGENT_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").rstrip("/"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Account type detection (paid "Full" vs "Trial") — driven ONLY by the value of
# the Twilio Account resource's "type" field, fetched once and cached. Errors are
# never used to guess the account type; a failed probe simply keeps the last known
# value (or None, meaning "behave trial-safe until we know better").
# ─────────────────────────────────────────────────────────────────────────────

_ACCOUNT_TYPE_CACHE: dict = {"sid": None, "value": None, "at": 0.0}
# Healthy results are trusted for an hour; failures are retried much sooner so a
# transient probe error cannot lock a paid account into trial behavior for long.
ACCOUNT_TYPE_TTL = float(os.getenv("VOICE_AGENT_ACCOUNT_TYPE_TTL_SECONDS", "3600"))
ACCOUNT_TYPE_FAIL_TTL = float(os.getenv("VOICE_AGENT_ACCOUNT_TYPE_RETRY_SECONDS", "60"))


def twilio_account_type(force: bool = False) -> Optional[str]:
    """Twilio's own account ``type`` field ("Trial" or "Full"), cached once per SID.

    Reads the Account resource (``GET /2010-04-01/Accounts/{sid}.json``) and returns its
    ``type`` value verbatim. Returns None when the SID is missing or the probe failed so
    callers can degrade to behavior that works on either kind of account.
    """
    cfg = twilio_config()
    sid = cfg.get("sid") or ""
    now = time.time()
    cached = _ACCOUNT_TYPE_CACHE
    ttl = ACCOUNT_TYPE_FAIL_TTL if cached.get("value") is None else ACCOUNT_TYPE_TTL
    if not force and cached.get("sid") == sid and cached.get("at") and now - cached["at"] < ttl:
        return cached.get("value")
    value: Optional[str] = None
    if sid:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json"
            resp = requests.get(url, auth=HTTPBasicAuth(cfg["sid"], cfg["token"]), timeout=15)
            if resp.ok:
                body = resp.json()
                value = body.get("type") or None
            else:
                print(f"[voice_agent] account type probe got HTTP {resp.status_code}: "
                      f"{(resp.text or '')[:160]}", flush=True)
        except Exception as e:
            print(f"[voice_agent] account type probe failed: {e}", flush=True)
    _ACCOUNT_TYPE_CACHE.update(sid=sid, value=value, at=now)
    return value


def is_paid_account() -> bool:
    """True when Twilio reports this account's ``type`` as "Full" (paid). Any unknown state
    (probe failed / not yet probed / Trial) returns False so callers stay trial-safe."""
    return twilio_account_type() == "Full"


# Result of the last webhook-base probe, so starting a call only hits the network once.
_VOICE_BASE_PROBE = {"base": None, "problem": "", "at": 0.0}
VOICE_BASE_PROBE_TTL = 60       # seconds a healthy result is trusted
VOICE_BASE_PROBE_FAIL_TTL = 15  # failures are re-checked much sooner so warnings heal themselves
_PROBE_TIMEOUT = 4.0            # per attempt: this is only a ping, Twilio itself waits far longer


def _probe_webhook_base(base: str):
    """One reachability check of ``{base}/voice-agent/options``.

    That endpoint answers 401 (auth required) when the host runs this app's voice-agent routes
    and 404 when it runs something else — exactly the "TwiML server not reached / calls drop
    after answer" failure. Returns ``(problem, retryable)``: deterministic misconfiguration
    (404 / HTML page) is not worth retrying, network errors and 5xx are (tunnels restart,
    servers hiccup), so one flaky timeout never blocks a call that would work.
    """
    try:
        resp = requests.get(f"{base}/voice-agent/options", timeout=_PROBE_TIMEOUT,
                            headers={"Accept": "application/json"})
    except requests.RequestException as e:
        reason = " ".join(f"{e.__class__.__name__}: {e}".split())[:180]
        return (f"Couldn't reach the TwiML webhook server at {base} ({reason}). Twilio must be able to fetch URLs "
                f"there or every call drops right after the prospect answers, so dialing is paused. In local "
                f"development this usually means the ngrok tunnel is down or was restarted — start it again and, if "
                f"its URL changed, update VOICE_AGENT_BASE_URL in the backend .env. This check re-runs "
                f"automatically."), True
    if resp.status_code == 404:
        return (f"{base} does not serve this app's voice-agent routes (HTTP 404), so Twilio cannot fetch its TwiML "
                f"there and calls would drop right after the prospect answers. Point VOICE_AGENT_BASE_URL (falls "
                f"back to PUBLIC_BASE_URL) in the backend .env at the server that is actually running this app — "
                f"your ngrok tunnel while developing locally — and restart the backend."), False
    if resp.status_code >= 500:
        return (f"{base}/voice-agent/options returned HTTP {resp.status_code}; Twilio would not receive valid TwiML "
                f"from that server, so calls would drop. That server is erroring — fix it or point "
                f"VOICE_AGENT_BASE_URL at a healthy instance and restart the backend."), True
    # A dead/restarted ngrok free tunnel answers 200 with a plain-text placeholder
    # ("ERR_NGROK_6024" / "You are about to visit …") — not the app. Twilio would
    # get that page instead of TwiML, so treat it as a broken base.
    snippet = (resp.text or "")[:400].lower()
    if "err_ngrok" in snippet or ("you are about to visit" in snippet and "ngrok" in snippet):
        return (f"{base} is answering with an ngrok placeholder page instead of this app — the tunnel "
                f"is down or was restarted. Start it again and, if its URL changed, update "
                f"VOICE_AGENT_BASE_URL in the backend .env, then restart the backend."), True
    if "text/html" in (resp.headers.get("content-type") or ""):
        return (f"{base} answered with an HTML page instead of this app's API (e.g. ngrok's free-tier browser "
                f"warning). Twilio cannot read TwiML through it — make sure VOICE_AGENT_BASE_URL / PUBLIC_BASE_URL "
                f"points at the backend itself."), False
    return None, False


def voice_base_problem(base: Optional[str] = None, force: bool = False) -> Optional[str]:
    """Pre-flight check of the public base URL Twilio will fetch its TwiML from.

    Twilio POSTs ``{base}/voice-agent/twilio/answer/<id>`` the moment the prospect picks up, so
    a broken base URL is the difference between a live conversation and a call that drops a few
    seconds after it is answered. Returns a human-readable problem description, or None when the
    base is healthy. Results are cached briefly (failures for only a few seconds) so a transient
    tunnel hiccup cannot leave a stale warning on screen.
    """
    base = (base if base is not None else twilio_config()["public_base"]).rstrip("/")
    now = time.time()
    ttl = VOICE_BASE_PROBE_FAIL_TTL if _VOICE_BASE_PROBE["problem"] else VOICE_BASE_PROBE_TTL
    if not force and _VOICE_BASE_PROBE["base"] == base and now - _VOICE_BASE_PROBE["at"] < ttl:
        return _VOICE_BASE_PROBE["problem"] or None

    problem = ""
    if not base:
        problem = ("VOICE_AGENT_BASE_URL / PUBLIC_BASE_URL is empty — Twilio has no server to fetch its TwiML "
                   "from. Set it in the backend .env to this app's public HTTPS URL (an ngrok tunnel while "
                   "developing locally) and restart the backend.")
    else:
        for attempt in range(2):
            problem, retryable = _probe_webhook_base(base)
            if not problem or not retryable or attempt:
                break
            time.sleep(0.3)

    _VOICE_BASE_PROBE.update({"base": base, "problem": problem, "at": now})
    if problem:
        print(f"[voice_agent] webhook base check failed for {base}: {problem}", flush=True)
    return problem or None


def twilio_ready() -> dict:
    cfg = twilio_config()
    missing = [name for name, key in (("TWILIO_ACCOUNT_SID", "sid"), ("TWILIO_AUTH_TOKEN", "token"),
                                      ("TWILIO_VOICE_NUMBER", "from"), ("PUBLIC_BASE_URL", "public_base"))
               if not cfg[key]]
    return {"ready": not missing, "missing": missing, "from_number": cfg["from"],
            "webhook_base": cfg["public_base"]}


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
    paid = is_paid_account()
    data = {
        "To": to,
        "From": cfg["from"],
        "Url": answer_url,
        "Method": "POST",
        "StatusCallback": status_url,
        "StatusCallbackMethod": "POST",
        "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
        "Timeout": "30",
        "TimeLimit": "600",  # safety cap on call length, gratuitous on trial but harmless
        "MachineDetection": "Enable" if os.getenv("VOICE_AGENT_AMD", "false").lower() == "true" else None,
    }
    if recording_url and os.getenv("VOICE_AGENT_RECORD", "true").lower() == "true":
        data["Record"] = "true"
        data["RecordingStatusCallback"] = recording_url
        data["RecordingStatusCallbackMethod"] = "POST"
    data = {k: v for k, v in data.items() if v is not None}
    basic = {"To": to, "From": cfg["from"], "Url": answer_url}  # Twilio's default Method for Url is POST
    # Paid ("Full") accounts get the normal parameters (status callbacks, timeout, time limit).
    # Trial accounts only accept To/From/Url — skip the doomed full request up front.
    if _TRIAL_LIMITED["value"] or not paid:
        return _twilio_post("Calls.json", basic)
    try:
        return _twilio_post("Calls.json", data)
    except RuntimeError as e:
        # Safety net only — the account-type probe above is the real detector. If the probe
        # couldn't run and the call was rejected as trial, strip down to To/From/Url (the call
        # status is then polled instead of pushed, see twilio_fetch_call).
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


def twiml_say(text: str, language: str = "en-US") -> str:
    """A bare <Say> element spoken in Twilio's own voice: instant filler audio with no
    server round-trip, so the prospect hears us instead of dead air while the reply is generated."""
    return _speak(None, text, language)


def twiml_play(audio_url: str) -> str:
    """A bare <Play> of pre-generated audio in the call's selected voice."""
    return f"<Play>{escape(audio_url)}</Play>"


def twiml_gather(action_url: str, *, audio_url: Optional[str] = None, text: Optional[str] = None,
                 language: str = "en-US", timeout: int = 5, pause: int = 0,
                 fallback_url: Optional[str] = None, action_on_empty: bool = True) -> str:
    """Speak (interruptible via bargeIn) and listen for the client's reply.

    ``speechTimeout="auto"`` lets Twilio end the gather the moment the caller's natural pause is
    detected — the lowest-latency setting that does not chop people off mid-sentence. ``timeout``
    (seconds Twilio waits for speech to *begin*) is kept short (5s) so a quiet line is detected
    quickly without ending the turn before someone can answer."""
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
