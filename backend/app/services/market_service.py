"""
Market Price Service
Reads crop prices from Supabase and provides price history for trend charts.
"""
import logging
from datetime import date, timedelta

from app.core.errors import ExternalServiceError
from app.core.supabase_client import get_supabase_client
from app.schemas.market import MarketPriceList, CropPriceHistory, CropPrice, PricePoint

logger = logging.getLogger(__name__)

MAX_ROWS = 2000


def clean_filter_value(value: str) -> str:
    """Strip LIKE / PostgREST wildcard characters so user text is matched literally."""
    return "".join(ch for ch in value if ch not in "%_*\\").strip()


def _execute(query):
    try:
        return query.execute()
    except Exception as exc:
        logger.exception("Supabase query failed")
        raise ExternalServiceError("Price database", str(exc)) from exc


async def get_prices(region: str = "", crop: str = "") -> MarketPriceList:
    """
    Latest known price for every crop/region, optionally filtered by region and/or crop.
    Verified rows always win over legacy rows (is_legacy), whose price_date is only a sync date.
    """
    db = get_supabase_client()
    query = db.table("market_prices").select("*")

    region, crop = clean_filter_value(region), clean_filter_value(crop)
    if region:
        query = query.ilike("region", f"%{region}%")
    if crop:
        query = query.ilike("crop_name", f"%{crop}%")

    result = _execute(query.order("is_legacy").order("price_date", desc=True).limit(MAX_ROWS))

    # Rows arrive verified-first, newest first, so the first row per crop/region is the one to show
    latest: dict[tuple[str, str], CropPrice] = {}
    for row in result.data:
        key = (row["crop_name"], row["region"])
        if key not in latest:
            latest[key] = CropPrice(**row)

    prices = sorted(latest.values(), key=lambda p: (p.crop_name, p.region))
    return MarketPriceList(prices=prices, count=len(prices))


async def get_price_history(crop_name: str, days: int = 30) -> CropPriceHistory:
    """Fetch price history for a single crop over the past N days (verified report dates only)."""
    db = get_supabase_client()
    since = (date.today() - timedelta(days=days)).isoformat()

    result = _execute(
        db.table("market_prices")
        .select("price_date, price_per_kg, region")
        .ilike("crop_name", f"%{clean_filter_value(crop_name)}%")
        .eq("is_legacy", False)
        .gte("price_date", since)
        .order("price_date")
    )

    points = [PricePoint(**row) for row in result.data]
    return CropPriceHistory(crop_name=crop_name, history=points)
