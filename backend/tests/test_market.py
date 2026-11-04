"""/api/v1/market — documented schema (price_per_kg, price_date)."""


def _row(crop, region, price, price_date, **extra):
    return {"id": hash((crop, region, price_date)) % 10_000, "crop_name": crop, "region": region,
            "price_per_kg": price, "price_date": price_date, "unit": "kg", "source": "UN-WFP (retail)", **extra}


def test_prices_returns_latest_per_crop_and_region(client, fake_supabase):
    rows = [  # newest first, as ordered by the query
        _row("Onion", "Region I", 130, "2026-08-15"),
        _row("Onion", "Region I", 110, "2026-07-15"),
        _row("Tomato", "Region I", 80, "2026-08-15", province=None, municipality=None),
    ]
    db = fake_supabase(respond=lambda filters: rows)

    body = client.get("/api/v1/market/prices").json()

    assert body["count"] == 2
    assert {(p["crop_name"], p["price_per_kg"]) for p in body["prices"]} == {("Onion", 130.0), ("Tomato", 80.0)}
    filters = db.market_prices.executed[0]
    assert "eq" not in [op for op, _, _ in filters]            # no longer restricted to today's date
    orders = [(args, kwargs) for op, args, kwargs in filters if op == "order"]
    assert orders == [(("is_legacy",), {}), (("price_date",), {"desc": True})]   # verified first, newest first


def test_prices_prefer_verified_over_newer_legacy_row(client, fake_supabase):
    # DB order (is_legacy ASC, price_date DESC): verified Aug row comes before the legacy June-23 row
    rows = [
        _row("Onion", "Region I", 130, "2026-08-15"),
        _row("Onion", "Region I", 75, "2026-06-23", is_legacy=True, source="legacy sync (report date unknown)"),
        _row("Tomato", "Region II", 60, "2026-06-23", is_legacy=True),
    ]
    fake_supabase(respond=lambda filters: rows)

    prices = {(p["crop_name"], p["region"]): p for p in client.get("/api/v1/market/prices").json()["prices"]}

    assert prices[("Onion", "Region I")]["price_per_kg"] == 130.0
    assert prices[("Onion", "Region I")]["is_legacy"] is False
    assert prices[("Tomato", "Region II")]["is_legacy"] is True      # legacy shown only when nothing verified exists


def test_prices_tolerates_null_source_and_extra_columns(client, fake_supabase):
    fake_supabase(respond=lambda filters: [_row("Rice", "Region III", 52, "2026-08-15", source=None, created_at="x")])
    response = client.get("/api/v1/market/prices")
    assert response.status_code == 200
    assert response.json()["prices"][0]["source"] is None


def test_prices_filter_strips_wildcards(client, fake_supabase):
    db = fake_supabase(respond=lambda filters: [])
    client.get("/api/v1/market/prices", params={"crop": "on%i*on_"})
    assert ("ilike", ("crop_name", "%onion%"), {}) in db.market_prices.executed[0]


def test_prices_database_failure_returns_502(client, fake_supabase):
    fake_supabase(error=RuntimeError("timeout"))
    response = client.get("/api/v1/market/prices")
    assert response.status_code == 502
    assert "Price database" in response.json()["detail"]


def test_prices_without_supabase_config_returns_502(client, monkeypatch):
    import app.core.supabase_client as supabase_client
    from app.core.config import settings

    monkeypatch.setattr(supabase_client, "_client", None)
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    response = client.get("/api/v1/market/prices")
    assert response.status_code == 502


def test_history_uses_documented_columns(client, fake_supabase):
    db = fake_supabase(respond=lambda filters: [{"price_date": "2026-08-15", "price_per_kg": 120, "region": "Region I"}])
    body = client.get("/api/v1/market/history/Onion", params={"days": 90}).json()
    assert body["history"][0]["price_per_kg"] == 120.0
    assert ("select", ("price_date, price_per_kg, region",), {}) in db.market_prices.executed[0]
    assert ("eq", ("is_legacy", False), {}) in db.market_prices.executed[0]   # sync dates are not report dates


def test_history_rejects_out_of_range_days(client):
    assert client.get("/api/v1/market/history/Onion", params={"days": 0}).status_code == 422
