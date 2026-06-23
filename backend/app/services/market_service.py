"""
Market Price Service
Reads crop prices from Supabase and provides price history for trend charts.
"""
from datetime import date, timedelta
from app.core.supabase_client import get_supabase_client
from app.schemas.market import MarketPriceList, CropPriceHistory, CropPrice, PricePoint


async def get_prices(region: str = "", crop: str = "") -> MarketPriceList:
    """Fetch today's crop prices, optionally filtered by region and/or crop."""
    db = get_supabase_client()
    query = db.table("market_prices").select("*").eq("price_date", date.today().isoformat())

    if region:
        query = query.ilike("region", f"%{region}%")
    if crop:
        query = query.ilike("crop_name", f"%{crop}%")

    result = query.execute()
    prices = [CropPrice(**row) for row in result.data]
    return MarketPriceList(prices=prices, count=len(prices))


async def get_price_history(crop_name: str, days: int = 30) -> CropPriceHistory:
    """Fetch price history for a single crop over the past N days."""
    db = get_supabase_client()
    since = (date.today() - timedelta(days=days)).isoformat()

    result = (
        db.table("market_prices")
        .select("price_date, price_per_kg, region")
        .ilike("crop_name", f"%{crop_name}%")
        .gte("price_date", since)
        .order("price_date")
        .execute()
    )

    points = [PricePoint(**row) for row in result.data]
    return CropPriceHistory(crop_name=crop_name, history=points)
