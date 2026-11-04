"""
Chat router — text-based fallback for the voice pipeline.
Farmers with poor connectivity can type instead of speak.
"""
from fastapi import APIRouter
from app.services.chat_service import get_ai_response
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter()


@router.post("/ask", response_model=ChatResponse)
async def text_query(payload: ChatRequest):
    """
    Text query endpoint.
    Accepts a question in any supported language and returns AI advice.
    """
    analysis = await get_ai_response(
        payload.message,
        language=payload.language,
        location=payload.location,
        history=payload.history,
    )
    return ChatResponse(reply=analysis.strategy, analysis=analysis)
