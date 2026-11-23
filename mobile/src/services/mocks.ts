/**
 * Sample responses for EXPO_PUBLIC_USE_MOCKS=true, so the app can be developed without the
 * backend, Supabase or a Groq key. Shapes match the real API (see ../types).
 * Never enable mocks in a release build.
 */
import type { AssistantReply, ChatResponse, CropPrice, VoiceResponse, WeatherForecast } from "../types";

const DELAY_MS = 700;   // long enough to see loading states
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

function negotiation(location: string, language: string): AssistantReply {
  return {
    mode: "negotiation",
    extracted_data: { crop: "Onion", weight: 100, offer_per_kg: 60 },
    fair_price_per_kg: 130,
    total_market_value: 13000,
    price_status: location ? "matched_region" : "other_region",
    price_region: location || "National Capital region",
    price_date: "2026-09-15",
    price_source: "UN-WFP (retail)",
    strategy: language === "en"
      ? "The ₱60/kg offer is far below the ₱130/kg retail price. Farmgate prices are lower, but ask for at least ₱90–100/kg.\n• \"Sa palengke po, ₱130 ang sibuyas. Kaya ko po ng ₱95.\"\n• \"May ibang buyer pong nagtanong; ₱95 po ang huling presyo ko.\""
      : "Mababa ang alok na ₱60/kg kumpara sa ₱130/kg na presyo sa palengke. Mas mababa ang farmgate, pero humingi ng ₱90–100/kg.\n• \"Sa palengke po, ₱130 ang sibuyas. Kaya ko po ng ₱95.\"\n• \"May ibang buyer pong nagtanong; ₱95 po ang huling presyo ko.\"",
  };
}

function advice(language: string): AssistantReply {
  return {
    mode: "advice",
    extracted_data: { crop: "Rice", weight: null, offer_per_kg: null },
    fair_price_per_kg: null,
    total_market_value: null,
    price_status: "not_applicable",
    price_region: null,
    price_date: null,
    price_source: null,
    strategy: language === "en"
      ? "Plant rice at the start of the rainy season (June–July). Use certified seed, keep 2–5 cm of water after transplanting, and watch for stem borers in the first month."
      : "Magtanim ng palay sa simula ng tag-ulan (Hunyo–Hulyo). Gumamit ng certified seeds, panatilihin ang 2–5 cm na tubig pagkatapos maglipat-tanim, at bantayan ang stem borer sa unang buwan.",
  };
}

// Voice alternates between the two reply types so both card layouts can be seen
let voiceCalls = 0;
export async function sendVoiceQuery(language: string, location: string): Promise<VoiceResponse> {
  await wait();
  voiceCalls += 1;
  return voiceCalls % 2 === 1
    ? { transcript: "Magkano po ang sibuyas? 100 kilo, 60 piso ang alok ng buyer.", reply: negotiation(location, language) }
    : { transcript: "Kailan po magandang magtanim ng palay?", reply: advice(language) };
}

// A typed question with a number in it is treated as a price negotiation
export async function sendTextQuery(message: string, language: string, location: string): Promise<ChatResponse> {
  await wait();
  const analysis = /\d/.test(message) ? negotiation(location, language) : advice(language);
  return { reply: analysis.strategy, analysis };
}

export async function translateText(text: string, language: string): Promise<string> {
  await wait();
  return `[${language}] ${text.replace(/^\[\w+\] /, "")}`;
}

const price = (crop_name: string, region: string, price_per_kg: number, price_date: string, is_legacy = false): CropPrice => ({
  id: null,
  crop_name,
  region,
  province: null,
  municipality: null,
  price_per_kg,
  unit: "kg",
  price_date,
  source: is_legacy ? "legacy sync (report date unknown)" : "UN-WFP (retail)",
  is_legacy,
});

const PRICES: CropPrice[] = [
  price("Onion", "National Capital region", 130, "2026-09-15"),
  price("Tomato", "National Capital region", 80, "2026-09-15"),
  price("Rice", "National Capital region", 52, "2026-09-15"),
  price("Onion", "Region III", 118, "2026-09-15"),
  price("Rice", "Region III", 48, "2026-09-15"),
  price("Onion", "Region IV-A", 125, "2026-08-15"),
  price("Tomato", "Region IV-A", 72, "2026-08-15"),
  price("Onion", "Region VII", 140, "2026-09-15"),
  price("Tomato", "Region VII", 75, "2026-06-23", true),   // shows the "Old price" badge
  price("Rice", "Region XI", 50, "2026-09-15"),
];

export async function fetchMarketPrices(): Promise<CropPrice[]> {
  await wait();
  return PRICES;
}

export async function fetchPriceHistory(cropName: string, days: number) {
  await wait();
  const base = PRICES.find((p) => p.crop_name === cropName)?.price_per_kg ?? 100;
  const today = new Date();
  const history = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (29 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { price_date: iso, price_per_kg: Math.round(base * (0.9 + 0.2 * Math.sin(i / 4))), region: "National Capital region" };
  });
  return { crop_name: cropName, history };
}

// Seven days from today; day 4 is heavy rain and day 5 a thunderstorm, to show the warning style
export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  await wait();
  const codes = [1, 3, 61, 65, 95, 2, 0];
  const rain = [10, 30, 60, 85, 90, 20, 5];
  const today = new Date();
  const daily = codes.map((weather_code, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      temp_max: 32 - (i % 3),
      temp_min: 24 + (i % 2),
      rain_probability: rain[i],
      wind_speed: 8 + i * 2.5,
      weather_code,
    };
  });
  return { latitude: lat, longitude: lon, daily };
}
