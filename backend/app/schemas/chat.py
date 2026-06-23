"""Pydantic schemas for the Chat endpoint."""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., description="The farmer's question or statement.")
    language: str = Field("fil", description="Language code: fil, ceb, ilo, en")
    location: str = Field("", description="Optional farm location for localized advice")
    history: list[dict] | None = Field(None, description="Previous conversation turns")


class ChatResponse(BaseModel):
    reply: str
