"""Pydantic schemas for the Chat endpoint."""
from pydantic import BaseModel, Field

from app.schemas.voice import AssistantReply


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="The farmer's question or statement.")
    language: str = Field("fil", description="Language code: fil, ceb, ilo, en")
    location: str = Field("", description="Optional farm location for localized advice")
    history: list[dict] | None = Field(None, description="Previous conversation turns")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="The assistant's answer as plain text")
    analysis: AssistantReply = Field(..., description="Structured details (negotiation figures, price status)")
