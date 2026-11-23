"""
Transcription Service
Sends audio bytes to Groq Whisper-Large-v3 and returns the transcript.
"""
import io
import re

import groq

from app.core.groq_client import get_groq_client
from app.core.config import settings
from app.core.errors import ExternalServiceError

# Maps our language codes to Whisper's expected language codes
LANGUAGE_MAP = {
    "fil": "tl",   # Filipino / Tagalog
    "ceb": None,   # Cebuano — not in Whisper's language list; fall back to auto-detect
    "ilo": None,   # Ilocano — not a Whisper native; fall back to auto-detect
    "en": "en",
}

# Whisper copies the spelling and vocabulary of its prompt, so a sample sentence of farm words in the
# selected language helps it spell crop names and dialect words. shortcut: wording not yet checked by
# native Cebuano/Ilocano speakers; have one review it.
VOCABULARY_PROMPT = {
    "fil": "Magkano ang presyo ng palay, bigas, sibuyas, kamatis, mais at bawang ngayon? Ang alok ng biyahero ay 60 piso kada kilo.",
    "ceb": "Pila ang presyo sa humay, bugas, sibuyas, kamatis, mais ug ahos karon? Ang tanyag sa komprador kay 60 pesos kada kilo.",
    "ilo": "Mano ti presio ti pagay, bagas, lasona, kamatis, mais ken bawang ita? Ti tawad ti komprador ket 60 pesos ti kada kilo.",
    "en": "How much is palay, rice, onion, tomato, corn and garlic today? The buyer offered 60 pesos per kilo.",
}


# Whisper (trained partly on video subtitles) invents these for silence or noise. Only an exact whole
# transcript is dropped, so a real question containing "thank you" still goes through.
# shortcut: add phrases here as they show up in real recordings.
HALLUCINATIONS = {
    "you", "bye", "thank you", "thanks", "thank you very much", "thank you so much",
    "thank you for watching", "thanks for watching", "thank you so much for watching",
    "please subscribe", "subscribe", "like and subscribe", "subtitles by the amara org community",
    "salamat", "salamat po", "salamat sa panonood", "maraming salamat sa panonood",
}


def _is_hallucination(text: str) -> bool:
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split()) in HALLUCINATIONS


# Whisper's own defaults for "this segment is unreliable". shortcut: not tuned on real farmer
# recordings; if confirmations show up too often (likely for Cebuano/Ilocano), lower UNCLEAR_LOGPROB.
UNCLEAR_LOGPROB = -1.0
UNCLEAR_NO_SPEECH = 0.6


def _is_unclear(segments) -> bool:
    """True when Whisper's own confidence says the transcript may be wrong."""
    def field(segment, name):
        return segment.get(name) if isinstance(segment, dict) else getattr(segment, name, None)

    logprobs = [field(s, "avg_logprob") for s in segments or []]
    no_speech = [field(s, "no_speech_prob") for s in segments or []]
    logprobs = [p for p in logprobs if isinstance(p, (int, float))]
    no_speech = [p for p in no_speech if isinstance(p, (int, float))]
    if logprobs and sum(logprobs) / len(logprobs) < UNCLEAR_LOGPROB:
        return True
    return bool(no_speech) and max(no_speech) > UNCLEAR_NO_SPEECH


async def transcribe_audio(audio_bytes: bytes, filename: str, language: str = "fil") -> tuple[str, bool]:
    """
    Transcribe an audio file using Groq Whisper.

    Args:
        audio_bytes: Raw audio data from the mobile app.
        filename:    Original filename (used to infer MIME type).
        language:    Language code ("fil", "ceb", "ilo", "en").

    Returns:
        (transcript, unclear): unclear is True when Whisper is not confident in the transcript.
    """
    client = get_groq_client()
    whisper_lang = LANGUAGE_MAP.get(language)  # None → Whisper auto-detects

    audio_file = (filename, io.BytesIO(audio_bytes), _get_mime(filename))

    params = {"language": whisper_lang} if whisper_lang else {}
    try:
        transcription = await client.audio.transcriptions.create(
            model=settings.GROQ_STT_MODEL,
            file=audio_file,
            response_format="verbose_json",   # includes per-segment confidence
            prompt=VOCABULARY_PROMPT.get(language, VOCABULARY_PROMPT["fil"]),
            **params,
        )
    except groq.GroqError as exc:
        raise ExternalServiceError("Speech recognition", str(exc)) from exc

    if isinstance(transcription, str):   # no confidence data: treat as clear
        text, segments = transcription.strip(), None
    else:
        text, segments = (getattr(transcription, "text", "") or "").strip(), getattr(transcription, "segments", None)
    # Silence or noise comes back as just "." (confidently, because of the prompt) or as a stock
    # phrase like "Thank you for watching": treat both as nothing heard
    if not any(ch.isalnum() for ch in text) or _is_hallucination(text):
        return "", False
    return text, _is_unclear(segments)


def _get_mime(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "m4a": "audio/mp4",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "webm": "audio/webm",
    }.get(ext, "audio/mpeg")
