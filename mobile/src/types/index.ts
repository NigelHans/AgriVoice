/**
 * Shared TypeScript type definitions for AgriVoice mobile app.
 */

/** One row of GET /market/prices (see backend app/schemas/market.py). */
export interface CropPrice {
  id: number | null;
  crop_name: string;
  region: string;
  province: string | null;
  municipality: string | null;
  price_per_kg: number;
  unit: string | null;
  /** "YYYY-MM-DD". For legacy rows this is only a sync date, not a report date. */
  price_date: string;
  source: string | null;
  /** Pre-migration row: price unverified, price_date unknown */
  is_legacy: boolean;
}

// Every value except date can be null (see backend app/schemas/weather.py)
export interface DailyForecast {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  rain_probability: number | null;
  wind_speed: number | null;
  weather_code: number | null;
}

export interface WeatherForecast {
  latitude: number;
  longitude: number;
  daily: DailyForecast[];
}

/** Where the fair price came from (see backend app/schemas/voice.py). */
export type PriceStatus =
  | "matched_region"
  | "other_region"
  | "unverified_legacy"
  | "unavailable"
  | "not_applicable";

export interface AssistantReply {
  mode: "negotiation" | "advice";
  extracted_data: {
    crop: string | null;
    weight: number | null;
    offer_per_kg: number | null;
  };
  fair_price_per_kg: number | null;
  total_market_value: number | null;
  price_status: PriceStatus;
  price_region: string | null;
  price_date: string | null;
  price_source: string | null;
  /** Language the reply is written in (the one the farmer spoke); may differ from the app setting */
  language?: "fil" | "ceb" | "ilo" | "en" | null;
  strategy: string;
}

export interface VoiceResponse {
  transcript: string;
  /** null when needs_confirmation: the app asks "Did you mean…?" first */
  reply: AssistantReply | null;
  needs_confirmation?: boolean;
}

/** POST /chat/ask — `reply` is the plain-text answer, `analysis` the full structured reply. */
export interface ChatResponse {
  reply: string;
  analysis: AssistantReply;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  transcript: string;
  reply: string;
  language: string;
}
