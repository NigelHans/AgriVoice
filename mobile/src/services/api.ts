/**
 * API Service — centralised HTTP calls to the FastAPI backend.
 * All endpoints are routed through this file.
 */
import axios from "axios";
import type { ChatResponse, CropPrice, VoiceResponse, WeatherForecast } from "../types";

// In production, replace with your deployed backend URL.
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------
export async function sendVoiceQuery(
  audioUri: string,
  language: string,
  location: string = ""
): Promise<VoiceResponse> {
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: "audio/mp4",
  } as any);
  formData.append("language", language);
  formData.append("location", location);

  const response = await api.post("/api/v1/voice/transcribe", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// Chat (text fallback)
// ---------------------------------------------------------------------------
export async function sendTextQuery(
  message: string,
  language: string,
  location: string = "",
  history: any[] = []
): Promise<ChatResponse> {
  const response = await api.post("/api/v1/chat/ask", { message, language, location, history });
  return response.data;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export type ApiErrorKind = "offline" | "timeout" | "unclear" | "serviceDown" | "server" | "unknown";

/**
 * What kind of failure a request had, for translated UI messages (see i18n API_ERROR_KEYS).
 * Backend `detail` text is English and is not shown; log the error itself separately.
 */
export function classifyApiError(err: unknown): { kind: ApiErrorKind; status?: number } {
  if (!axios.isAxiosError(err)) return { kind: "unknown" };
  if (!err.response) {
    return { kind: err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" ? "timeout" : "offline" };
  }
  const { status } = err.response;
  if (status === 400 || status === 422) return { kind: "unclear", status };
  if (status === 502) return { kind: "serviceDown", status };
  return { kind: "server", status };
}

// ---------------------------------------------------------------------------
// Market Prices
// ---------------------------------------------------------------------------
export async function fetchMarketPrices(region = "", crop = ""): Promise<CropPrice[]> {
  const response = await api.get("/api/v1/market/prices", { params: { region, crop } });
  return response.data.prices;
}

export async function fetchPriceHistory(cropName: string, days = 30) {
  // Crop names can contain spaces, commas and brackets, e.g. "Rice (regular, milled)"
  const response = await api.get(`/api/v1/market/history/${encodeURIComponent(cropName)}`, { params: { days } });
  return response.data;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  const response = await api.get("/api/v1/weather/forecast", { params: { lat, lon } });
  return response.data;
}