"""
Voice router — receives audio from the mobile app,
sends it to Groq Whisper for transcription,
then passes the text to the chat service for an AI response.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.transcription_service import transcribe_audio
from app.services.chat_service import get_ai_response
from app.schemas.voice import VoiceResponse

router = APIRouter()


@router.post("/transcribe", response_model=VoiceResponse)
async def voice_query(
    audio: UploadFile = File(..., description="Audio file recorded on the device"),
    language: str = Form("fil", description="Language code: fil, ceb, ilo, en"),
    location: str = Form("National Capital Region", description="Farmer's municipality/province or region"),
):
    """
    Full voice pipeline:
    1. Transcribe audio with Groq Whisper
    2. Pass transcript to Llama 3.3 70B for agricultural advice
    3. Return both transcript and AI response
    """
    audio_bytes = await audio.read()
    print(f"🎤 Audio filename: {audio.filename}")
    print(f"🎤 Audio content type: {audio.content_type}")
    print(f"🎤 Audio size: {len(audio_bytes)} bytes")
    print(f"🎤 Audio header bytes: {audio_bytes[:16].hex()}")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file received.")

    # 1. Transcribe audio array into text using your existing service architecture
    transcript = await transcribe_audio(audio_bytes, audio.filename or "audio.m4a", language)
    
    # 2. Get structured negotiation data block back from your chat engine service
    ai_reply = await get_ai_response(transcript, language=language, location=location)

    # 3. Compile everything neatly into your strict output schema
    return VoiceResponse(transcript=transcript, reply=ai_reply)