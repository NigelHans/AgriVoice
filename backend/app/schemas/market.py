"""Pydantic schemas for Market Price endpoints."""
from pydantic import BaseModel
from datetime import date


class CropPrice(BaseModel):
    id: int | None = None
    crop_name: str
    region: str
    province: str | None = None
    municipality: str | None = None
    price_per_kg: float
    unit: str | None = "kg"
    price_date: date
    source: str | None = None
    is_legacy: bool = False   # true: pre-migration row, price_date is a sync date


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
