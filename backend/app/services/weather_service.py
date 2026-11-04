"""
Weather Service
Fetches 7-day forecast from Open-Meteo (free, no API key required).
Provides rainfall probability — critical for planting decisions in the Philippines.
"""
import httpx
from app.core.errors import ExternalServiceError
from app.schemas.weather import WeatherForecast, DailyForecast

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def get_weather_forecast(lat: float, lon: float) -> WeatherForecast:
    """
    Fetch 7-day weather forecast from Open-Meteo.

    Returns temperature, rainfall probability, and wind speed — the three
    key variables Filipino farmers care about for planting decisions.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "windspeed_10m_max",
            "weathercode",
        ],
        "timezone": "Asia/Manila",
        "forecast_days": 7,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            daily = response.json()["daily"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise ExternalServiceError("Weather service", str(exc)) from exc

    forecasts = [
        DailyForecast(
            date=daily["time"][i],
            temp_max=daily["temperature_2m_max"][i],
            temp_min=daily["temperature_2m_min"][i],
            rain_probability=daily["precipitation_probability_max"][i],
            wind_speed=daily["windspeed_10m_max"][i],
            weather_code=daily["weathercode"][i],
        )
        for i in range(len(daily["time"]))
    ]

    return WeatherForecast(latitude=lat, longitude=lon, daily=forecasts)
