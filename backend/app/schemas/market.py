"""Pydantic schemas for Market Price endpoints."""
from pydantic import BaseModel
from datetime import date


class CropPrice(BaseModel):
    id: int | None = None
    crop_name: str
    region: str
    price_per_kg: float
    unit: str = "kg"
    price_date: date
    source: str = ""


class MarketPriceList(BaseModel):
    prices: list[CropPrice]
    count: int


class PricePoint(BaseModel):
    price_date: date
    price_per_kg: float
    region: str


class CropPriceHistory(BaseModel):
    crop_name: str
    history: list[PricePoint]
