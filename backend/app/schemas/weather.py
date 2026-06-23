"""Pydantic schemas for Weather endpoint."""
from pydantic import BaseModel


class DailyForecast(BaseModel):
    date: str
    temp_max: float
    temp_min: float
    rain_probability: int   # 0–100 %
    wind_speed: float       # km/h
    weather_code: int       # WMO weather code


class WeatherForecast(BaseModel):
    latitude: float
    longitude: float
    daily: list[DailyForecast]
