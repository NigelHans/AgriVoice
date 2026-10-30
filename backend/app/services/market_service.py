
"""
Market Price Service
Reads crop prices from Supabase and provides price history for trend charts.
"""
from datetime import date, timedelta
from app.core.supabase_client import get_supabase_client
from app.schemas.market import MarketPriceList, CropPriceHistory, CropPrice, PricePoint


async def get_prices(region: str = "", crop: str = "") -> MarketPriceList:
    """Fetch the latest crop prices, optionally filtered by region and/or crop."""
    db = get_supabase_client()
    query = db.table("market_prices").select("*")

    if region:
        query = query.ilike("region", f"%{region}%")
    if crop:
        query = query.ilike("crop_name", f"%{crop}%")

    result = query.execute()
    prices = []

    for row in result.data:
        price = row.get("fair_price_per_kg")
        updated = row.get("updated_at")

        if price is None:
            continue

        # Map the actual database columns to the existing API schema.
        price_date = str(updated or date.today().isoformat())[:10]

        prices.append(
            CropPrice(
                id=row.get("id"),
                crop_name=row["crop_name"],
                region=row["region"],
                price_per_kg=float(price),
                unit="kg",
                price_date=price_date,
                source="WFP",
            )
        )

    return MarketPriceList(prices=prices, count=len(prices))


async def get_price_history(crop_name: str, days: int = 30) -> CropPriceHistory:
    """
    Fetch available stored prices for a crop.

    The current database sync keeps the latest price per crop and region,
    so this returns available latest records, not a complete daily history.
    """
    db = get_supabase_client()

    result = (
        db.table("market_prices")
        .select("crop_name, region, fair_price_per_kg, updated_at")
        .ilike("crop_name", f"%{crop_name}%")
        .execute()
    )

    points = []

    for row in result.data:
        price = row.get("fair_price_per_kg")
        updated = row.get("updated_at")

        if price is None:
            continue

        points.append(
            PricePoint(
                price_date=str(updated or date.today().isoformat())[:10],
                price_per_kg=float(price),
                region=row["region"],
            )
        )

    since = date.today() - timedelta(days=days)
    points = [point for point in points if point.price_date >= since]

    return CropPriceHistory(crop_name=crop_name, history=points)
