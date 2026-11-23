"""
Price Sync Service
Pulls UN-WFP food prices for the Philippines (HDX dataset) and upserts them
into the Supabase `market_prices` table using the documented schema
(`price_per_kg`, `price_date`). See database/migrations/001 for the live table.

WFP publishes monthly retail prices per market. For every crop/region/month
we store the median retail price across that region's markets.
"""
import logging
from datetime import datetime, timedelta, timezone

import pandas as pd

from app.core.config import settings
from app.core.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

WFP_CSV_URL = "https://data.humdata.org/dataset/wfp-food-prices-for-philippines/resource/9a842d72-0d7d-4922-ad0e-eb8106c1ab0e/download/wfp_food_prices_phl.csv"

# WFP commodity name → crop name stored in Supabase (and asked of the LLM)
CROP_MAPPING = {
    "Onions (red)": "Onion",
    "Tomatoes": "Tomato",
    "Rice (regular, milled)": "Rice",
}

PRICE_TYPE = "Retail"
PRICE_SOURCE = "UN-WFP (retail)"
HISTORY_DAYS = 365

# Must match the unique index on market_prices (see database/schema.sql)
CONFLICT_COLUMNS = "crop_name,region,price_date"

# The live table still has the legacy NOT NULL column fair_price_per_kg; the
# sync writes the same value to both until a later migration retires it.
LEGACY_PRICE_COLUMN = "fair_price_per_kg"

CSV_COLUMNS = ["date", "admin1", "admin2", "commodity", "unit", "pricetype", "currency", "price"]


def build_price_rows(
    df: pd.DataFrame, history_days: int = HISTORY_DAYS, synced_at: datetime | None = None
) -> list[dict]:
    """Turn raw WFP rows into one market_prices row per crop/region/month."""
    df = df[
        df["commodity"].isin(CROP_MAPPING.keys())
        & (df["unit"] == "KG")
        & (df["currency"] == "PHP")
        & (df["pricetype"] == PRICE_TYPE)
    ].copy()
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df.dropna(subset=["price", "date", "admin1"])
    if df.empty:
        return []

    cutoff = df["date"].max() - timedelta(days=history_days)
    df = df[df["date"] >= cutoff]
    df["crop_name"] = df["commodity"].map(CROP_MAPPING)
    synced_at = (synced_at or datetime.now(timezone.utc)).isoformat()

    rows = []
    for (crop, region, price_date), group in df.groupby(["crop_name", "admin1", "date"]):
        provinces = group["admin2"].dropna().unique()
        price = round(float(group["price"].median()), 2)
        rows.append({
            "crop_name": crop,
            "region": region,
            "province": provinces[0] if len(provinces) == 1 else None,
            "price_per_kg": price,
            LEGACY_PRICE_COLUMN: price,
            "unit": "kg",
            "price_date": price_date.isoformat(),
            "source": PRICE_SOURCE,
            "updated_at": synced_at,   # when this row was synced (not the report date)
            "is_legacy": False,
        })
    return rows


def run_price_sync(csv_source: str = WFP_CSV_URL) -> int:
    """Fetch WFP prices and upsert them. Returns the number of rows written (0 on failure)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        logger.warning("Price sync skipped: SUPABASE_URL / SUPABASE_KEY are not configured.")
        return 0

    try:
        logger.info("Fetching WFP market price dataset...")
        df = pd.read_csv(csv_source, usecols=CSV_COLUMNS)
        rows = build_price_rows(df)
        if not rows:
            logger.warning("Price sync: no usable rows found in the WFP dataset.")
            return 0

        get_supabase_client().table("market_prices").upsert(
            rows, on_conflict=CONFLICT_COLUMNS
        ).execute()
        logger.info("Price sync complete: %d rows upserted (latest %s).", len(rows), max(r["price_date"] for r in rows))
        return len(rows)
    except Exception:
        # Most likely causes: network failure, migration 001 not applied (missing
        # columns / unique index on crop_name, region, price_date), or RLS blocking writes.
        logger.exception("Price sync failed; existing market_prices rows were left unchanged.")
        return 0
