/**
 * API Service — centralised HTTP calls to the FastAPI backend.
 * All endpoints are routed through this file.
 */
import axios from "axios";
import type { CropPrice, DailyForecast, WeatherForecast } from "../types";

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
): Promise<{ transcript: string; reply: any }> { // ◄ STEP 1: Changed "reply: string" to "reply: any" to support structured JSON objects
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: "audio/mp4",
  } as any);
  formData.append("language", language);
  formData.append("location", location);

  console.log("📤 Sending voice file to:", BASE_URL);
  console.log("📤 Audio URI:", audioUri);
  console.log("📤 Language:", language);
  console.log("📤 Location:", location);

  const response = await api.post("/api/v1/voice/transcribe", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  console.log("📥 Voice response:", response.data);

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
): Promise<string> {
  const response = await api.post("/api/v1/chat/ask", { message, language, location, history });
  return response.data.reply;
}

// ---------------------------------------------------------------------------
// Market Prices
// ---------------------------------------------------------------------------
export async function fetchMarketPrices(region = "", crop = ""): Promise<CropPrice[]> {
  const response = await api.get("/api/v1/market/prices", { params: { region, crop } });
  return response.data.prices;
}

export async function fetchPriceHistory(cropName: string, days = 30) {
  const response = await api.get(`/api/v1/market/history/${cropName}`, { params: { days } });
  return response.data;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  const response = await api.get("/api/v1/weather/forecast", { params: { lat, lon } });
  return response.data;
}