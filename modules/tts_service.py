"""
Text-to-speech service.

Primary provider is OpenAI TTS. ``gpt-4o-mini-tts`` supports free-form
``instructions`` which we use to control accent, speaking style and pace.
If that model fails we retry with ``tts-1`` (no accent control), and finally
fall back to gTTS (accent approximated via Google's regional domains).
"""
import os
import uuid
from typing import Optional

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
                      model: Optional[str] = None) -> str:
    from modules.llm_engine import get_openai_client

    client = get_openai_client()
    model = model or os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
    try:
        kwargs = {"model": model, "voice": voice, "input": text, "response_format": "mp3"}
        if "gpt-4o" in model:
            kwargs["instructions"] = build_instructions(accent, style, speed, language)
        else:
            kwargs["speed"] = max(0.25, min(4.0, speed))
        response = client.audio.speech.create(**kwargs)
    except Exception as e:
        if model == "tts-1":
            raise
        print(f"[tts] {model} failed ({e}); retrying with tts-1")
        response = client.audio.speech.create(model="tts-1", voice=voice, input=text,
                                              speed=max(0.25, min(4.0, speed)), response_format="mp3")
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
               fallback_gtts: bool = True) -> str:
    """Convert ``text`` to an mp3 under static/audio and return its public URL path (``/static/audio/x.mp3``).
    ``model`` overrides TTS_MODEL (e.g. the faster ``tts-1`` for live call replies).
    ``fallback_gtts=False`` keeps the call on the selected voice: instead of silently switching to
    gTTS (which has no voice control) when OpenAI TTS fails, the error is raised to the caller."""
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
            _openai_to_speech(text, filepath, voice, accent, style, speed, language, model)
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
