"""
Transcription Service
Sends audio bytes to Groq Whisper-Large-v3 and returns the transcript.
"""
import io
from app.core.groq_client import get_groq_client
from app.core.config import settings

# Maps our language codes to Whisper's expected language codes
LANGUAGE_MAP = {
    "fil": "tl",   # Filipino / Tagalog
    "ceb": "ceb",  # Cebuano
    "ilo": None,   # Ilocano — not a Whisper native; fall back to auto-detect
    "en": "en",
}


async def transcribe_audio(audio_bytes: bytes, filename: str, language: str = "fil") -> str:
    """
    Transcribe an audio file using Groq Whisper.

    Args:
        audio_bytes: Raw audio data from the mobile app.
        filename:    Original filename (used to infer MIME type).
        language:    Language code ("fil", "ceb", "ilo", "en").

    Returns:
        Transcribed text string.
    """
    client = get_groq_client()
    whisper_lang = LANGUAGE_MAP.get(language)  # None → Whisper auto-detects

    audio_file = (filename, io.BytesIO(audio_bytes), _get_mime(filename))

    transcription = await client.audio.transcriptions.create(
        model=settings.GROQ_STT_MODEL,
        file=audio_file,
        language=whisper_lang,
        response_format="text",
    )
    return transcription.strip()


def _get_mime(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "m4a": "audio/mp4",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "webm": "audio/webm",
    }.get(ext, "audio/mpeg")
