"""Pydantic schemas for Weather endpoint."""
from pydantic import BaseModel


class DailyForecast(BaseModel):
    date: str
    temp_max: float | None
    temp_min: float | None
    rain_probability: int | None  # 0–100 %
    wind_speed: float | None     # km/h
    weather_code: int | None     # WMO weather code


class WeatherForecast(BaseModel):
    latitude: float
    longitude: float
    daily: list[DailyForecast]
