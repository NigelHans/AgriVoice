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

PAGE_SIZE = 1000          # Supabase (PostgREST) returns at most 1000 rows per request
PRICE_WINDOW_DAYS = 180   # the price list only needs recent months; older rows are history


def clean_filter_value(value: str) -> str:
    """Strip LIKE / PostgREST wildcard characters so user text is matched literally."""
    return "".join(ch for ch in value if ch not in "%_*\\").strip()


def _execute(query):
    try:
        return query.execute()
    except Exception as exc:
        logger.exception("Supabase query failed")
        raise ExternalServiceError("Price database", str(exc)) from exc


def _fetch_all(build_query) -> list[dict]:
    """All rows of a query, one page at a time. build_query() makes a fresh query for each page."""
    rows: list[dict] = []
    start = 0
    while True:
        page = _execute(build_query().range(start, start + PAGE_SIZE - 1)).data
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


async def get_prices(region: str = "", crop: str = "") -> MarketPriceList:
    """
    Latest known price for every crop/region, optionally filtered by region and/or crop.
    Verified rows always win over legacy rows (is_legacy), whose price_date is only a sync date.
    """
    db = get_supabase_client()
    region, crop = clean_filter_value(region), clean_filter_value(crop)
    since = (date.today() - timedelta(days=PRICE_WINDOW_DAYS)).isoformat()

    def build_query():
        query = db.table("market_prices").select("*").gte("price_date", since)
        if region:
            query = query.ilike("region", f"%{region}%")
        if crop:
            query = query.ilike("crop_name", f"%{crop}%")
        # id breaks ties so pages never overlap or skip rows
        return query.order("is_legacy").order("price_date", desc=True).order("id")

    # Rows arrive verified-first, newest first, so the first row per crop/region is the one to show
    latest: dict[tuple[str, str], CropPrice] = {}
    for row in _fetch_all(build_query):
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
        # Exact (case-insensitive) name: "Cabbage" must not pull in "Chinese Cabbage"
        .ilike("crop_name", clean_filter_value(crop_name))
        .eq("is_legacy", False)
        .gte("price_date", since)
        .order("price_date")
    )

    points = [PricePoint(**row) for row in result.data]
    return CropPriceHistory(crop_name=crop_name, history=points)
