/**
 * Shared TypeScript type definitions for AgriVoice mobile app.
 */

export interface CropPrice {
  id: number;
  crop_name: string;
  region: string;
  province?: string;
  municipality?: string;
  price_per_kg: number;
  unit: string;
  price_date: string;
  source: string;
}

export interface DailyForecast {
  date: string;
  temp_max: number;
  temp_min: number;
  rain_probability: number;
  wind_speed: number;
  weather_code: number;
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  daily: DailyForecast[];
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  transcript: string;
  reply: string;
  language: string;
}
