/**
 * API Service — centralised HTTP calls to the FastAPI backend.
 * All endpoints are routed through this file.
 */
import axios from "axios";
import type { ChatResponse, CropPrice, VoiceResponse, WeatherForecast } from "../types";
import * as mocks from "./mocks";

// In production, replace with your deployed backend URL.
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

// EXPO_PUBLIC_USE_MOCKS=true returns sample data from ./mocks instead of calling the backend.
// shortcut: for UI work only; leave it unset (off) for real testing and release builds.
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === "true";

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------
export async function sendVoiceQuery(
  audioUri: string,
  language: string,
  location: string = ""
): Promise<VoiceResponse> {
  if (USE_MOCKS) return mocks.sendVoiceQuery(language, location);
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
  if (USE_MOCKS) return mocks.sendTextQuery(message, language, location);
  const response = await api.post("/api/v1/chat/ask", { message, language, location, history });
  return response.data;
}

/** Translates an answer already on screen into the newly selected language. */
export async function translateText(text: string, language: string): Promise<string> {
  if (USE_MOCKS) return mocks.translateText(text, language);
  const response = await api.post("/api/v1/chat/translate", { text, language });
  return response.data.text;
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
  if (USE_MOCKS) return mocks.fetchMarketPrices();
  const response = await api.get("/api/v1/market/prices", { params: { region, crop } });
  return response.data.prices;
}

export async function fetchPriceHistory(cropName: string, days = 30) {
  if (USE_MOCKS) return mocks.fetchPriceHistory(cropName, days);
  // Crop names can contain spaces, commas and brackets, e.g. "Rice (regular, milled)"
  const response = await api.get(`/api/v1/market/history/${encodeURIComponent(cropName)}`, { params: { days } });
  return response.data;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  if (USE_MOCKS) return mocks.fetchWeather(lat, lon);
  const response = await api.get("/api/v1/weather/forecast", { params: { lat, lon } });
  return response.data;
}