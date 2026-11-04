"""/api/v1/weather/forecast with a mocked Open-Meteo transport."""
import httpx
import pytest

from app.services import weather_service

REAL_ASYNC_CLIENT = httpx.AsyncClient


@pytest.fixture
def open_meteo(monkeypatch):
    def install(handler):
        monkeypatch.setattr(
            weather_service.httpx, "AsyncClient",
            lambda **kwargs: REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler), **kwargs),
        )
    return install


def test_forecast_handles_null_values(client, open_meteo):
    daily = {
        "time": ["2026-10-27", "2026-10-28"],
        "temperature_2m_max": [31.2, 30.0],
        "temperature_2m_min": [24.1, 23.5],
        "precipitation_probability_max": [80, None],   # Open-Meteo can return null
        "windspeed_10m_max": [12.5, 10.0],
        "weathercode": [61, 3],
    }
    open_meteo(lambda request: httpx.Response(200, json={"daily": daily}))

    response = client.get("/api/v1/weather/forecast", params={"lat": 14.6, "lon": 121.0})

    assert response.status_code == 200
    assert [d["rain_probability"] for d in response.json()["daily"]] == [80, None]


def test_forecast_upstream_error_returns_502(client, open_meteo):
    open_meteo(lambda request: httpx.Response(503))
    response = client.get("/api/v1/weather/forecast", params={"lat": 14.6, "lon": 121.0})
    assert response.status_code == 502
    assert "Weather service" in response.json()["detail"]


def test_forecast_network_error_returns_502(client, open_meteo):
    def fail(request):
        raise httpx.ConnectError("offline", request=request)
    open_meteo(fail)
    assert client.get("/api/v1/weather/forecast", params={"lat": 14.6, "lon": 121.0}).status_code == 502
