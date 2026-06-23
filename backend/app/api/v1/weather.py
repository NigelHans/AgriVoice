"""
Weather router — fetches weather forecast for a given location.
Uses Open-Meteo (free, no API key required) or PAGASA data.
"""
from fastapi import APIRouter, Query
from app.services.weather_service import get_weather_forecast
from app.schemas.weather import WeatherForecast

router = APIRouter()


@router.get("/forecast", response_model=WeatherForecast)
async def weather(
    lat: float = Query(..., description="Latitude of the farm location"),
    lon: float = Query(..., description="Longitude of the farm location"),
):
    """
    Return a 7-day weather forecast for the given coordinates.
    Includes rainfall probability — critical for planting decisions.
    """
    return await get_weather_forecast(lat=lat, lon=lon)
