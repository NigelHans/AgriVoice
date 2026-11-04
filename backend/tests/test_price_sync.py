"""WFP → Supabase price sync."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from app.core.config import settings
from app.services import price_sync

HEADER = "date,admin1,admin2,market,market_id,latitude,longitude,category,commodity,commodity_id,unit,priceflag,pricetype,currency,price,usdprice"


def _csv(tmp_path, lines):
    path = tmp_path / "wfp.csv"
    path.write_text("\n".join([HEADER, *lines]) + "\n")
    return str(path)


SAMPLE = [
    # The first data row must NOT be skipped (old code used skiprows=[1])
    '2026-08-15,National Capital region,Metropolitan Manila,Manila,1,0,0,veg,Onions (red),1,KG,actual,Retail,PHP,120,2',
    '2026-08-15,Region I,Ilocos Norte,Laoag,2,0,0,veg,Onions (red),1,KG,actual,Retail,PHP,100,2',
    '2026-08-15,Region I,Pangasinan,Dagupan,3,0,0,veg,Onions (red),1,KG,actual,Retail,PHP,140,2',
    '2026-08-15,Region I,Pangasinan,Dagupan,3,0,0,veg,Tomatoes,1,KG,actual,Wholesale,PHP,50,1',   # wholesale: ignored
    '2026-08-15,Region III,Bulacan,Malolos,4,0,0,cereal,"Rice (regular, milled)",1,KG,actual,Retail,PHP,48,1',
    '2026-08-15,Region III,Bulacan,Malolos,4,0,0,veg,Onions (white),1,KG,actual,Retail,PHP,99,2',  # unmapped: ignored
    '2024-01-15,Region I,Ilocos Norte,Laoag,2,0,0,veg,Onions (red),1,KG,actual,Retail,PHP,60,1',   # older than history window
]


def test_build_price_rows_uses_documented_schema(tmp_path):
    rows = price_sync.build_price_rows(pd.read_csv(_csv(tmp_path, SAMPLE)))
    by_key = {(r["crop_name"], r["region"]): r for r in rows}

    assert set(by_key) == {("Onion", "National Capital region"), ("Onion", "Region I"), ("Rice", "Region III")}
    region_1 = by_key[("Onion", "Region I")]
    assert region_1["price_per_kg"] == 120.0          # median of 100 and 140
    assert region_1["province"] is None               # several provinces → not a single province
    assert region_1["price_date"] == "2026-08-15"
    assert set(region_1) == {"crop_name", "region", "province", "price_per_kg", "fair_price_per_kg",
                             "unit", "price_date", "source", "updated_at", "is_legacy"}
    assert "id" not in region_1                       # ids come from market_prices_id_seq


def test_rows_satisfy_live_table_constraints(tmp_path):
    # Live table: fair_price_per_kg NUMERIC NOT NULL; new rows must never be legacy
    synced_at = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)
    rows = price_sync.build_price_rows(pd.read_csv(_csv(tmp_path, SAMPLE)), synced_at=synced_at)
    for row in rows:
        assert row["fair_price_per_kg"] == row["price_per_kg"] is not None
        assert row["is_legacy"] is False
        assert row["updated_at"] == "2026-10-27T12:00:00+00:00"


def test_run_price_sync_upserts_with_conflict_target(tmp_path, monkeypatch, fake_supabase):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_KEY", "test-key")
    db = fake_supabase()

    count = price_sync.run_price_sync(_csv(tmp_path, SAMPLE))

    assert count == 3
    (op, args, kwargs), = db.market_prices.executed[0]
    assert op == "upsert"
    assert kwargs == {"on_conflict": "crop_name,region,price_date"}
    assert len(args[0]) == 3


def test_run_price_sync_skips_without_credentials(monkeypatch, fake_supabase):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    db = fake_supabase()
    assert price_sync.run_price_sync("unused.csv") == 0
    assert db.market_prices.executed == []


@pytest.mark.parametrize("error", [RuntimeError("no unique index"), None])
def test_run_price_sync_never_raises(tmp_path, monkeypatch, fake_supabase, error):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_KEY", "test-key")
    fake_supabase(error=error)
    source = _csv(tmp_path, SAMPLE) if error else str(tmp_path / "missing.csv")
    assert price_sync.run_price_sync(source) == 0
