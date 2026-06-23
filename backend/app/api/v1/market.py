"""
Market prices router — reads from Supabase and syncs with public DA/BAI price tables.
"""
from fastapi import APIRouter, Query
from app.services.market_service import get_prices, get_price_history
from app.schemas.market import MarketPriceList, CropPriceHistory

router = APIRouter()


@router.get("/prices", response_model=MarketPriceList)
async def current_prices(
    region: str = Query("", description="Filter by region, e.g. 'Region X'"),
    crop: str = Query("", description="Filter by crop name, e.g. 'palay'"),
):
    """Return today's crop market prices from Supabase."""
    return await get_prices(region=region, crop=crop)


@router.get("/history/{crop_name}", response_model=CropPriceHistory)
async def price_history(
    crop_name: str,
    days: int = Query(30, description="Number of past days to retrieve"),
):
    """Return historical prices for a specific crop (for trend charts)."""
    return await get_price_history(crop_name=crop_name, days=days)
