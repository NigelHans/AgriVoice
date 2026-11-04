from datetime import date
from typing import Literal

from pydantic import BaseModel

# matched_region    — verified price recorded for the farmer's own region
# other_region      — no verified price for the farmer's region; price is from `price_region`
# unverified_legacy — only a pre-migration row exists (report date unknown)
# unavailable       — no price found (or the database could not be reached)
# not_applicable    — general question, no price lookup needed
PriceStatus = Literal["matched_region", "other_region", "unverified_legacy", "unavailable", "not_applicable"]


class ExtractedData(BaseModel):
    crop: str | None = None
    weight: float | None = None
    offer_per_kg: float | None = None


class AssistantReply(BaseModel):
    mode: Literal["negotiation", "advice"]
    extracted_data: ExtractedData
    fair_price_per_kg: float | None = None
    total_market_value: float | None = None
    price_status: PriceStatus = "not_applicable"
    price_region: str | None = None
    price_date: date | None = None
    price_source: str | None = None
    strategy: str


class VoiceResponse(BaseModel):
    transcript: str
    reply: AssistantReply
