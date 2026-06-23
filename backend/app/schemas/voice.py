from pydantic import BaseModel

class ExtractedData(BaseModel):
    crop: str
    weight: float
    offer_per_kg: float

class MarketNegotiationData(BaseModel):
    extracted_data: ExtractedData
    fair_price_per_kg: float
    total_market_value: float
    strategy: str

class VoiceResponse(BaseModel):
    transcript: str
    reply: MarketNegotiationData