"""
Text-to-speech service.

Primary provider is OpenAI TTS. ``gpt-4o-mini-tts`` supports free-form
``instructions`` which we use to control accent, speaking style and pace.
If that model fails we retry with ``tts-1`` (no accent control), and finally
fall back to gTTS (accent approximated via Google's regional domains).
"""
import hashlib
import os
import threading
import uuid
from typing import Optional, Tuple

# 5 OpenAI voices that are available on every OpenAI TTS model (so the
# tts-1 fallback keeps the same voice).
VOICES = [
    {"id": "alloy", "label": "Alloy", "gender": "neutral", "description": "Balanced and versatile"},
    {"id": "echo", "label": "Echo", "gender": "male", "description": "Clear, calm and articulate"},
    {"id": "fable", "label": "Fable", "gender": "neutral", "description": "Expressive, warm storyteller"},
    {"id": "onyx", "label": "Onyx", "gender": "male", "description": "Deep, authoritative and trustworthy"},
    {"id": "nova", "label": "Nova", "gender": "female", "description": "Warm, upbeat and engaging"},
]

# language code -> {label, gtts (gTTS language), accents: {accent id: (label, instruction, gTTS tld, Twilio locale)}}
# The Twilio locale drives both speech recognition (<Gather language>) and the <Say> fallback.
LANGUAGES = {
    "en": {"label": "English", "gtts": "en", "accents": {
        "american": ("American", "a General American English accent", "com", "en-US"),
        "british": ("British", "a natural British (Received Pronunciation) English accent", "co.uk", "en-GB"),
        "australian": ("Australian", "a natural Australian English accent", "com.au", "en-AU"),
        "indian": ("Indian", "a natural, clear Indian English accent", "co.in", "en-IN"),
        "canadian": ("Canadian", "a natural Canadian English accent", "ca", "en-CA"),
        "irish": ("Irish", "a soft, natural Irish English accent", "ie", "en-IE"),
        "south_african": ("South African", "a natural South African English accent", "co.za", "en-ZA"),
    }},
    "es": {"label": "Spanish", "gtts": "es", "accents": {
        "mexican": ("Mexican", "a natural Mexican Spanish accent", "com.mx", "es-MX"),
        "spain": ("Spain (Castilian)", "a natural Castilian Spanish accent from Spain", "es", "es-ES"),
        "us_latino": ("US Latino", "a neutral US Latino Spanish accent", "us", "es-US"),
        "argentine": ("Argentine", "a natural Argentine (Rioplatense) Spanish accent", "com.mx", "es-AR"),
        "colombian": ("Colombian", "a clear, neutral Colombian Spanish accent", "com.mx", "es-CO"),
    }},
    "fr": {"label": "French", "gtts": "fr", "accents": {
        "france": ("France", "a natural Parisian French accent", "fr", "fr-FR"),
        "canadian": ("Canadian (Québécois)", "a natural Québécois French accent", "ca", "fr-CA"),
    }},
    "de": {"label": "German", "gtts": "de", "accents": {
        "germany": ("Germany", "a natural standard German (Hochdeutsch) accent", "de", "de-DE"),
    }},
    "pt": {"label": "Portuguese", "gtts": "pt", "accents": {
        "brazil": ("Brazilian", "a natural Brazilian Portuguese accent", "com.br", "pt-BR"),
        "portugal": ("European", "a natural European Portuguese accent from Portugal", "pt", "pt-PT"),
    }},
    "it": {"label": "Italian", "gtts": "it", "accents": {
        "italy": ("Italy", "a natural standard Italian accent", "it", "it-IT"),
    }},
    "nl": {"label": "Dutch", "gtts": "nl", "accents": {
        "netherlands": ("Netherlands", "a natural Dutch accent from the Netherlands", "nl", "nl-NL"),
    }},
    "hi": {"label": "Hindi", "gtts": "hi", "accents": {
        "india": ("India", "a natural, clear Hindi accent", "co.in", "hi-IN"),
    }},
    "ar": {"label": "Arabic", "gtts": "ar", "accents": {
        "gulf": ("Gulf", "a natural Gulf Arabic accent", "com", "ar-AE"),
        "egyptian": ("Egyptian", "a natural Egyptian Arabic accent", "com", "ar-EG"),
    }},
    "ja": {"label": "Japanese", "gtts": "ja", "accents": {
        "japan": ("Japan", "a natural standard Tokyo Japanese accent", "co.jp", "ja-JP"),
    }},
}

# Backward compatibility: English accents by id.
ACCENTS = {k: (f"{v[0]} English", *v[1:]) for k, v in LANGUAGES["en"]["accents"].items()}


def resolve_voice_locale(language: Optional[str], accent: Optional[str]):
    """Return (language code, accent id, accent tuple) with sensible fallbacks."""
    lang = language if language in LANGUAGES else "en"
    accents = LANGUAGES[lang]["accents"]
    acc = accent if accent in accents else next(iter(accents))
    return lang, acc, accents[acc]


def language_label(language: Optional[str]) -> str:
    return LANGUAGES.get(language or "en", LANGUAGES["en"])["label"]

STYLES = {
    "friendly": "Sound warm, friendly and approachable, smiling while you talk.",
    "professional": "Sound polished, professional and confident, like an experienced account executive.",
    "energetic": "Sound energetic and enthusiastic, but not pushy.",
    "calm": "Sound calm, relaxed and reassuring.",
    "empathetic": "Sound empathetic, patient and genuinely interested in the listener.",
}

DEFAULT_VOICE = os.getenv("TTS_VOICE", "nova")
# "shimmer" stays accepted so pitches saved before it was removed from the list still synthesize.
VOICE_IDS = {v["id"] for v in VOICES} | {"shimmer"}

AUDIO_DIR = os.path.join("static", "audio")

# ── Live-call audio ───────────────────────────────────────────────────────────
# Every Twilio webhook must answer well under 5s on trial accounts (Twilio drops slower calls
# there), so a single TTS request gets a hard timeout and is never retried synchronously. On paid
# ("Full") accounts a webhook can safely run ~10s, so the reply TTS budget is doubled.
# Call audio (opening pitch and live replies) is cached by content + voice settings so identical
# lines are reused instantly, and every fallback line is pre-generated per voice (see
# ``prewarm_cached``) instead of silently switching to Twilio's <Say> default voice mid-call.
CALL_TTS_MODEL = os.getenv("VOICE_AGENT_REPLY_TTS_MODEL", "tts-1")
CALL_TTS_TIMEOUT = float(os.getenv("VOICE_AGENT_TTS_TIMEOUT_SECONDS", "3"))
CALL_TTS_TIMEOUT_PAID = float(os.getenv("VOICE_AGENT_TTS_TIMEOUT_SECONDS_PAID", "6"))

# Fixed lines spoken while the model is thinking, when TTS fails, on silence and on error
# recovery. They are rendered per voice and cached so a failing TTS provider can never change
# the voice the prospect hears. Keep in sync with the call-time PHRASES pool.
FILLER_PHRASES = {
    "retry": "Sorry, could you say that again?",
    "apology": "Sorry, I lost you for a moment. Could you say that again?",
    "one_moment": "One moment please.",
    "hold_check": "That's a great question.",
    "hold_1": "Let me look into that for you.",
    "hold_2": "I'm checking that now.",
    "hold_3": "Let me pull up the details.",
    "hold_4": "Bear with me for just a second.",
    "hold_5": "I appreciate your patience, let me confirm that.",
    "hold_6": "Good question, let me find out.",
    "hold_7": "Thanks for waiting, I'm on it.",
    "hold_8": "Let me double-check that for you.",
    "still_there": "Are you still there?",
    "silence_2": "I can wait a moment if you need a second.",
    "silence_3": "No pressure at all — whenever you're ready.",
    "silence_4": "If now isn't a good time, just let me know.",
    "goodbye_silence": "I'll let you go for now. Thanks so much for your time, and have a great day!",
    "goodbye_error": "Sorry, we ran into a problem. I'll have a colleague call you back shortly. Thanks, and goodbye!",
}

_CLIP_CACHE: dict = {}
_CLIP_LOCKS: dict = {}
_CLIP_LOCK = threading.Lock()


def _clip_filename(text: str, voice: str, accent: Optional[str], style: Optional[str],
                   speed: float, language: Optional[str], prefix: str) -> str:
    raw = "\x1f".join([text or "", voice or "", accent or "", style or "",
                       f"{float(speed or 1.0):.2f}", language or "en"])
    return f"{prefix}_{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:20]}.mp3"


def cached_audio(text: str, *, voice: str = DEFAULT_VOICE, accent: Optional[str] = None,
                 style: Optional[str] = None, speed: float = 1.0, language: Optional[str] = "en",
                 prefix: str = "filler") -> Optional[str]:
    """Return the cached public URL for ``text`` in this voice, or None.

    This never synthesizes; callers use it on latency-critical webhook paths. The deterministic
    filename means the cache survives process restarts."""
    if not text or not text.strip():
        return None
    name = _clip_filename(text, voice, accent, style, speed, language, prefix)
    path = os.path.join(AUDIO_DIR, name)
    with _CLIP_LOCK:
        url = _CLIP_CACHE.get(name)
    if url and os.path.isfile(path):
        return url
    if os.path.isfile(path):
        url = "/" + path.replace("\\", "/")
        with _CLIP_LOCK:
            _CLIP_CACHE[name] = url
        return url
    return None


def synthesize_cached(text: str, *, voice: str = DEFAULT_VOICE, accent: Optional[str] = None,
                      style: Optional[str] = None, speed: float = 1.0, language: Optional[str] = "en",
                      prefix: str = "call", timeout: Optional[float] = None) -> Tuple[str, bool]:
    """Shared entry point for all call audio (pitch + replies + fillers).

    Returns ``(url, from_cache)``. A cached clip is reused when present; otherwise the line is
    rendered once with a hard timeout, with no retry and no gTTS fallback (which would change the
    voice), then cached to a deterministic file."""
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")
    cached = cached_audio(text, voice=voice, accent=accent, style=style, speed=speed,
                          language=language, prefix=prefix)
    if cached:
        return cached, True
    name = _clip_filename(text, voice, accent, style, speed, language, prefix)
    path = os.path.join(AUDIO_DIR, name)
    with _CLIP_LOCK:
        lock = _CLIP_LOCKS.setdefault(name, threading.Lock())
    with lock:
        cached = cached_audio(text, voice=voice, accent=accent, style=style, speed=speed,
                              language=language, prefix=prefix)
        if cached:
            return cached, True
        generated = synthesize(text, voice, accent, style, speed, prefix=f"tmp_{prefix}",
                               language=language, model=CALL_TTS_MODEL, fallback_gtts=False,
                               timeout=timeout if timeout is not None else CALL_TTS_TIMEOUT,
                               retry=False)
        src = generated.lstrip("/").replace("/", os.sep)
        try:
            os.replace(src, path)
            url = "/" + path.replace("\\", "/")
        except OSError:
            url = generated
        with _CLIP_LOCK:
            _CLIP_CACHE[name] = url
        return url, False


def prewarm_cached(texts, *, voice: str = DEFAULT_VOICE, accent: Optional[str] = None,
                   style: Optional[str] = None, speed: float = 1.0, language: Optional[str] = "en",
                   prefix: str = "filler", timeout: Optional[float] = None) -> dict:
    """Pre-generate fixed filler lines for a voice so call turns never wait on live TTS.

    Called at startup and when a call is created; failures are logged and retried on next use."""
    out = {}
    for text in texts:
        if not text:
            continue
        try:
            out[text] = synthesize_cached(text, voice=voice, accent=accent, style=style, speed=speed,
                                          language=language, prefix=prefix, timeout=timeout)[0]
        except Exception as e:
            print(f"[tts] prewarm failed for {text!r} in voice {voice}: {e}")
            out[text] = None
    return out


def tts_options() -> dict:
    return {
        "voices": VOICES,
        "languages": [
            {"id": code, "label": spec["label"],
             "accents": [{"id": k, "label": v[0], "locale": v[3]} for k, v in spec["accents"].items()]}
            for code, spec in LANGUAGES.items()
        ],
        "accents": [{"id": k, "label": v[0]} for k, v in ACCENTS.items()],
        "styles": [{"id": k, "label": k.replace("_", " ").title()} for k in STYLES],
        "default_voice": DEFAULT_VOICE if DEFAULT_VOICE in VOICE_IDS else "nova",
    }


def twilio_language(language: Optional[str] = "en", accent: Optional[str] = None) -> str:
    """Twilio locale (e.g. es-MX) for speech recognition and <Say>."""
    return resolve_voice_locale(language, accent)[2][3]


def build_instructions(accent: Optional[str], style: Optional[str], speed: float = 1.0,
                       language: Optional[str] = "en") -> str:
    lang, _, acc = resolve_voice_locale(language, accent)
    accent_txt = acc[1]
    style_txt = STYLES.get(style or "friendly", STYLES["friendly"])
    if speed >= 1.15:
        pace = "Speak at a brisk, fast pace."
    elif speed <= 0.85:
        pace = "Speak slowly and deliberately."
    else:
        pace = "Speak at a natural conversational pace."
    return (f"You are a sales representative on a phone call. Speak {language_label(lang)} with {accent_txt}. "
            f"{style_txt} {pace} Pause naturally at punctuation.")


def _save_response(response, filepath: str) -> None:
    if hasattr(response, "stream_to_file"):
        response.stream_to_file(filepath)
    else:
        with open(filepath, "wb") as f:
            f.write(response.content)


def _openai_to_speech(text: str, filepath: str, voice: str, accent: Optional[str],
                      style: Optional[str], speed: float, language: Optional[str] = "en",
                      model: Optional[str] = None, timeout: Optional[float] = None,
                      retry: bool = True) -> str:
    from modules.llm_engine import get_openai_client

    client = get_openai_client()
    model = model or os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
    try:
        kwargs = {"model": model, "voice": voice, "input": text, "response_format": "mp3"}
        if "gpt-4o" in model:
            kwargs["instructions"] = build_instructions(accent, style, speed, language)
        else:
            kwargs["speed"] = max(0.25, min(4.0, speed))
        if timeout is not None:
            kwargs["timeout"] = timeout
        response = client.audio.speech.create(**kwargs)
    except Exception as e:
        # Call audio must never retry synchronously (that is how a webhook overshoots Twilio's
        # limit); ``retry=False`` keeps the hard timeout meaningful.
        if model == "tts-1" or not retry:
            raise
        print(f"[tts] {model} failed ({e}); retrying with tts-1")
        retry_kwargs = {"model": "tts-1", "voice": voice, "input": text,
                        "speed": max(0.25, min(4.0, speed)), "response_format": "mp3"}
        if timeout is not None:
            retry_kwargs["timeout"] = timeout
        response = client.audio.speech.create(**retry_kwargs)
    _save_response(response, filepath)
    return filepath


def _gtts_to_speech(text: str, filepath: str, accent: Optional[str] = None, speed: float = 1.0,
                    language: Optional[str] = "en") -> str:
    from gtts import gTTS

    lang, _, acc = resolve_voice_locale(language, accent)
    gTTS(text=text, lang=LANGUAGES[lang]["gtts"], tld=acc[2], slow=speed < 0.8).save(filepath)
    return filepath


def synthesize(text: str, voice: Optional[str] = None, accent: Optional[str] = None,
               style: Optional[str] = None, speed: float = 1.0, prefix: str = "pitch",
               language: Optional[str] = "en", model: Optional[str] = None,
               fallback_gtts: bool = True, timeout: Optional[float] = None,
               retry: bool = True) -> str:
    """Convert ``text`` to an mp3 under static/audio and return its public URL path (``/static/audio/x.mp3``).
    ``model`` overrides TTS_MODEL (e.g. the faster ``tts-1`` for live call replies).
    ``fallback_gtts=False`` keeps the call on the selected voice: instead of silently switching to
    gTTS (which has no voice control) when OpenAI TTS fails, the error is raised to the caller.
    ``timeout`` puts a hard per-request ceiling on the provider call and ``retry=False`` disables
    the synchronous tts-1 retry, which is what keeps Twilio webhooks fast."""
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")
    os.makedirs(AUDIO_DIR, exist_ok=True)
    voice = voice if voice in VOICE_IDS else (DEFAULT_VOICE if DEFAULT_VOICE in VOICE_IDS else "nova")
    speed = float(speed or 1.0)
    # The voice is part of the filename so files generated for different voices can never collide.
    filepath = os.path.join(AUDIO_DIR, f"{prefix}_{voice}_{uuid.uuid4().hex}.mp3")

    provider = os.getenv("TTS_PROVIDER", "openai").strip().lower()
    if provider == "openai":
        try:
            _openai_to_speech(text, filepath, voice, accent, style, speed, language, model,
                              timeout=timeout, retry=retry)
        except Exception as e:
            if not fallback_gtts:
                raise
            print(f"[tts] OpenAI TTS failed, falling back to gTTS: {e}")
            _gtts_to_speech(text, filepath, accent, speed, language)
    else:
        _gtts_to_speech(text, filepath, accent, speed, language)
    return "/" + filepath.replace("\\", "/")


def delete_audio(url_path: Optional[str]) -> None:
    """Remove an audio file previously produced by ``synthesize``."""
    if not url_path:
        return
    rel = url_path.lstrip("/").replace("/", os.sep)
    if not rel.startswith(AUDIO_DIR):
        return
    try:
        os.remove(rel)
    except OSError:
        pass


def text_to_speech(text: str) -> str:
    """Backward-compatible helper: returns the relative file path (static/audio/x.mp3)."""
    return synthesize(text).lstrip("/")
