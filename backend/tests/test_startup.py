"""Startup checks: the app imports, boots, and never blocks on the price sync."""
import app.main as main
from app.core.config import settings


def test_health_endpoints(client):
    assert client.get("/").json()["status"] == "ok"
    assert client.get("/health").json() == {"status": "healthy"}


def test_startup_runs_price_sync_in_background(monkeypatch):
    from fastapi.testclient import TestClient

    calls = []
    monkeypatch.setattr(settings, "PRICE_SYNC_ON_STARTUP", True)
    monkeypatch.setattr(main, "run_price_sync", lambda: calls.append("sync") or 0)

    with TestClient(main.app) as test_client:
        assert test_client.get("/health").status_code == 200
    assert calls == ["sync"]


def test_startup_skips_price_sync_when_disabled(monkeypatch, client):
    calls = []
    monkeypatch.setattr(main, "run_price_sync", lambda: calls.append("sync"))
    assert client.get("/health").status_code == 200
    assert calls == []
