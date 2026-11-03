/**
 * WeatherScreen — Shows a 7-day weather forecast for the farmer's location.
 * Uses expo-location to get GPS coordinates, then calls the FastAPI weather endpoint.
 * When GPS is unavailable, it falls back to the centre of the region chosen in Settings.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import * as Location from "expo-location";
import { fetchWeather } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type StringKey, type Translate, type UiMessage } from "../i18n";
import type { DailyForecast } from "../types";

const GPS_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 5_000;
// A position from the last hour is close enough for a daily forecast
const LAST_KNOWN_MAX_AGE_MS = 60 * 60 * 1000;

// Open-Meteo WMO weather codes (the backend passes them through unchanged)
const WEATHER_CODES: Record<number, { icon: string; label: StringKey }> = {
  0:  { icon: "☀️", label: "weather.code.0" },
  1:  { icon: "🌤️", label: "weather.code.1" },
  2:  { icon: "⛅", label: "weather.code.2" },
  3:  { icon: "☁️", label: "weather.code.3" },
  45: { icon: "🌫️", label: "weather.code.45" },
  48: { icon: "🌫️", label: "weather.code.48" },
  51: { icon: "🌦️", label: "weather.code.51" },
  53: { icon: "🌦️", label: "weather.code.53" },
  55: { icon: "🌧️", label: "weather.code.55" },
  56: { icon: "🌧️", label: "weather.code.56" },
  57: { icon: "🌧️", label: "weather.code.57" },
  61: { icon: "🌦️", label: "weather.code.61" },
  63: { icon: "🌧️", label: "weather.code.63" },
  65: { icon: "🌧️", label: "weather.code.65" },
  66: { icon: "🌧️", label: "weather.code.66" },
  67: { icon: "🌧️", label: "weather.code.67" },
  71: { icon: "🌨️", label: "weather.code.71" },
  73: { icon: "🌨️", label: "weather.code.73" },
  75: { icon: "❄️", label: "weather.code.75" },
  77: { icon: "🌨️", label: "weather.code.77" },
  80: { icon: "🌦️", label: "weather.code.80" },
  81: { icon: "🌧️", label: "weather.code.81" },
  82: { icon: "⛈️", label: "weather.code.82" },
  85: { icon: "🌨️", label: "weather.code.85" },
  86: { icon: "❄️", label: "weather.code.86" },
  95: { icon: "⛈️", label: "weather.code.95" },
  96: { icon: "⛈️", label: "weather.code.96" },
  99: { icon: "⛈️", label: "weather.code.99" },
};
const SEVERE_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);
const HIGH_RAIN_CHANCE = 70;

// Approximate coordinates of each region's centre, keyed by the exact WFP region value.
// Only latitude/longitude are sent to the backend; the region value itself is not.
const REGION_CENTERS: Record<string, { city: string; latitude: number; longitude: number }> = {
  "National Capital region":              { city: "Manila",              latitude: 14.5995, longitude: 120.9842 },
  "Cordillera Administrative region":     { city: "Baguio",              latitude: 16.4023, longitude: 120.5960 },
  "Region I":                             { city: "San Fernando, La Union", latitude: 16.6159, longitude: 120.3166 },
  "Region II":                            { city: "Tuguegarao",          latitude: 17.6132, longitude: 121.7270 },
  "Region III":                           { city: "San Fernando, Pampanga", latitude: 15.0286, longitude: 120.6898 },
  "Region IV-A":                          { city: "Calamba",             latitude: 14.2117, longitude: 121.1653 },
  "Region IV-B":                          { city: "Calapan",             latitude: 13.4115, longitude: 121.1803 },
  "Region V":                             { city: "Legazpi",             latitude: 13.1391, longitude: 123.7438 },
  "Region VI":                            { city: "Iloilo City",         latitude: 10.7202, longitude: 122.5621 },
  "Region VII":                           { city: "Cebu City",           latitude: 10.3157, longitude: 123.8854 },
  "Region VIII":                          { city: "Tacloban",            latitude: 11.2444, longitude: 125.0039 },
  "Region IX":                            { city: "Pagadian",            latitude: 7.8257,  longitude: 123.4370 },
  "Region X":                             { city: "Cagayan de Oro",      latitude: 8.4542,  longitude: 124.6319 },
  "Region XI":                            { city: "Davao City",          latitude: 7.1907,  longitude: 125.4553 },
  "Region XII":                           { city: "Koronadal",           latitude: 6.5008,  longitude: 124.8469 },
  "Region XIII":                          { city: "Butuan",              latitude: 8.9475,  longitude: 125.5406 },
  "Autonomous region in Muslim Mindanao": { city: "Cotabato City",       latitude: 7.2236,  longitude: 124.2464 },
};

// Why GPS could not be used; translated when shown
const GPS_REASONS = {
  denied:      "weather.gpsDenied",
  blocked:     "weather.gpsBlocked",
  servicesOff: "weather.gpsServicesOff",
  timeout:     "weather.gpsTimeout",
  failed:      "weather.gpsFailed",
} satisfies Record<string, StringKey>;

// A GPS failure carries the key of its farmer-friendly reason. Checked by property,
// not instanceof, so it doesn't depend on how Error subclasses are transpiled.
type GpsError = Error & { reasonKey: StringKey };
function gpsError(reasonKey: StringKey): GpsError {
  return Object.assign(new Error(reasonKey), { reasonKey });
}
function gpsReasonOf(err: unknown): StringKey {
  return typeof err === "object" && err !== null && "reasonKey" in err
    ? (err as GpsError).reasonKey
    : GPS_REASONS.failed;
}

type Coords = { latitude: number; longitude: number };
// Messages are stored as keys, so they follow a language change
type WeatherError = { title: StringKey; message: UiMessage };
type Source =
  | { kind: "gps"; place: string }
  | { kind: "region"; region: string; reason: StringKey };
type Phase = "locating" | "fetching" | "ready" | "error";

export default function WeatherScreen() {
  const t = useT();
  const [forecast, setForecast] = useState<DailyForecast[]>([]);
  const [phase, setPhase] = useState<Phase>("locating");
  // Where the forecast on screen is for; set together with the forecast
  const [source, setSource] = useState<Source | null>(null);
  // Full-screen error: nothing to show
  const [error, setError] = useState<WeatherError | null>(null);
  // Banner over an older forecast that is still shown
  const [refreshError, setRefreshError] = useState<UiMessage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { region } = useRegion();
  // Only the latest request may update the screen
  const requestId = useRef(0);

  // One loader for the first load, Retry, "Use GPS", pull-to-refresh and region changes.
  // `background` keeps the current forecast visible while loading.
  const load = async (background = false) => {
    const id = ++requestId.current;
    const isLatest = () => id === requestId.current;
    setRefreshError(null);
    if (background) {
      setRefreshing(true);
    } else {
      setError(null);
      setPhase("locating");
    }

    let coords: Coords;
    let next: Source;
    try {
      coords = await getGpsCoords();
      next = { kind: "gps", place: "" };
    } catch (err) {
      const reason = gpsReasonOf(err);
      const center = REGION_CENTERS[region];
      if (!center) {
        if (!isLatest()) return;
        setError({ title: "weather.locationFailedTitle", message: { key: reason } });
        setPhase("error");
        setRefreshing(false);
        return;
      }
      coords = { latitude: center.latitude, longitude: center.longitude };
      next = { kind: "region", region, reason };
    }
    if (!isLatest()) return;
    if (!background) setPhase("fetching");

    try {
      const [data, place] = await Promise.all([
        fetchWeather(coords.latitude, coords.longitude),
        next.kind === "gps" ? lookupPlace(coords) : Promise.resolve(""),
      ]);
      if (!isLatest()) return;
      setForecast(data.daily);
      setSource(next.kind === "gps" ? { kind: "gps", place } : next);
      setPhase("ready");
    } catch (err) {
      console.warn("Could not load weather forecast", err);
      if (!isLatest()) return;
      if (background && phase === "ready") {
        setRefreshError(apiErrorMessage(err));
      } else {
        setError({ title: "weather.forecastFailedTitle", message: apiErrorMessage(err) });
        setPhase("error");
      }
    } finally {
      if (isLatest()) setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  // A forecast based on the region follows a region change made in Settings
  const isFirstRegion = useRef(true);
  useEffect(() => {
    if (isFirstRegion.current) {
      isFirstRegion.current = false;
      return;
    }
    if (source?.kind === "region") load(true);
  }, [region]);

  if (phase === "locating" || phase === "fetching") {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#1a7a1a" />
        <Text style={styles.loadingText}>
          {phase === "locating" ? t("weather.locating") : t("weather.fetching")}
        </Text>
      </View>
    );
  }

  if (phase === "error" && error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorTitle}>{t(error.title)}</Text>
        <Text style={styles.errorText}>{t(error.message.key, error.message.values)}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {source?.kind === "region" ? (
        <>
          <Text style={styles.location}>📍 {getRegionLabel(source.region)}</Text>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {t(source.reason)}{"\n"}
              {t("weather.fallbackNotice", { city: REGION_CENTERS[source.region]?.city ?? "—" })}
            </Text>
            <TouchableOpacity style={styles.noticeBtn} onPress={() => load(true)} disabled={refreshing}>
              <Text style={styles.noticeBtnText}>{t("weather.useGps")}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.location}>📍 {source?.place || t("weather.yourLocation")}</Text>
      )}

      {refreshError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {t("weather.refreshFailed")} {t(refreshError.key, refreshError.values)}
          </Text>
        </View>
      )}

      {forecast.length === 0 && <Text style={styles.empty}>{t("weather.empty")}</Text>}
      {forecast.map((day) => {
        const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
        const severe = (day.weather_code !== null && SEVERE_CODES.has(day.weather_code))
          || (day.rain_probability !== null && day.rain_probability >= HIGH_RAIN_CHANCE);
        const { title, subtitle } = dayLabel(day.date, t);
        return (
          <View key={day.date} style={[styles.card, severe && styles.cardSevere]}>
            <View style={styles.cardTop}>
              <Text style={styles.icon}>{weather?.icon ?? "🌡️"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.date}>
                  {title}
                  {subtitle !== "" && <Text style={styles.dateSub}>  {subtitle}</Text>}
                </Text>
                <Text style={[styles.description, severe && styles.descriptionSevere]}>{weather ? t(weather.label) : "—"}</Text>
              </View>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("weather.tempLabel")}</Text>
                <Text style={styles.temp}>{formatValue(day.temp_max, "°")} / {formatValue(day.temp_min, "°C")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("weather.rainLabel")}</Text>
                <Text style={[styles.rain, severe && styles.descriptionSevere]}>🌧️ {formatValue(day.rain_probability, "%")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("weather.windLabel")}</Text>
                <Text style={styles.wind}>💨 {formatValue(day.wind_speed, " km/h")}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// Coordinates from GPS, or a GpsError whose reasonKey tells the farmer why not
async function getGpsCoords(): Promise<Coords> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch (err) {
    console.warn("Could not request location permission", err);
    throw gpsError(GPS_REASONS.failed);
  }
  if (!permission.granted) {
    throw gpsError(permission.canAskAgain ? GPS_REASONS.denied : GPS_REASONS.blocked);
  }
  // If the check itself fails, try GPS anyway
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    throw gpsError(GPS_REASONS.servicesOff);
  }

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (last) return last.coords;
  } catch (err) {
    console.warn("No last known position", err);
  }

  try {
    const current = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      GPS_TIMEOUT_MS,
      () => gpsError(GPS_REASONS.timeout),
    );
    return current.coords;
  } catch (err) {
    if (gpsReasonOf(err) === GPS_REASONS.timeout) throw err;
    console.warn("Could not get GPS position", err);
    throw gpsError(GPS_REASONS.failed);
  }
}

// The place name is optional; a failure or slow lookup never blocks the forecast
async function lookupPlace(coords: Coords): Promise<string> {
  try {
    const geo = await withTimeout(Location.reverseGeocodeAsync(coords), GEOCODE_TIMEOUT_MS, () => new Error("Geocoding timed out"));
    return [geo[0]?.city, geo[0]?.region].filter(Boolean).join(", ");
  } catch (err) {
    console.warn("Could not look up place name", err);
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Backend dates are "YYYY-MM-DD"; parsed as a local date, never as UTC midnight
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(date.getTime()) ? null : date;
}

// Dates keep the en-PH format; only the Today/Tomorrow words are translated
function dayLabel(value: string, t: Translate): { title: string; subtitle: string } {
  const date = parseLocalDate(value);
  if (!date) return { title: value || "—", subtitle: "" };
  const formatted = date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const daysAhead = Math.round((date.getTime() - startOfToday) / 86_400_000);
  if (daysAhead === 0) return { title: t("weather.today"), subtitle: formatted };
  if (daysAhead === 1) return { title: t("weather.tomorrow"), subtitle: formatted };
  return { title: formatted, subtitle: "" };
}

function formatValue(value: number | null, unit: string): string {
  return value === null ? "—" : `${Math.round(value)}${unit}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f7ff" },
  content:   { padding: 12 },
  center:    { justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { marginTop: 12, color: "#555", textAlign: "center" },
  location:  { fontSize: 16, fontWeight: "bold", color: "#1a4a7a", marginBottom: 12 },
  notice:    { backgroundColor: "#fff8e1", borderRadius: 10, padding: 12, marginBottom: 12 },
  noticeText:{ fontSize: 13, color: "#6d5200", lineHeight: 19 },
  noticeBtn: { alignSelf: "flex-start", marginTop: 8, backgroundColor: "#1a7a1a", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  noticeBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  banner:    { backgroundColor: "#fdecea", borderRadius: 8, padding: 10, marginBottom: 12 },
  bannerText:{ fontSize: 12, color: "#c0392b" },
  card:      { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  cardSevere:{ borderLeftWidth: 4, borderLeftColor: "#e67e22" },
  cardTop:   { flexDirection: "row", alignItems: "center" },
  icon:      { fontSize: 32, marginRight: 12 },
  date:      { fontWeight: "bold", color: "#333" },
  dateSub:   { fontWeight: "normal", color: "#888", fontSize: 12 },
  description: { color: "#555", marginTop: 2 },
  descriptionSevere: { color: "#c0562b", fontWeight: "bold" },
  stats:     { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#eef2f7" },
  stat:      { flex: 1 },
  statLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  temp:      { color: "#333", fontWeight: "bold" },
  rain:      { color: "#1a4a7a", fontWeight: "bold" },
  wind:      { color: "#555", fontWeight: "bold" },
  empty:     { textAlign: "center", marginTop: 40, color: "#aaa" },
  errorTitle:{ fontSize: 17, fontWeight: "bold", color: "#c0392b", marginBottom: 6, textAlign: "center" },
  errorText: { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 16 },
  retryBtn:  { backgroundColor: "#1a7a1a", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "bold" },
});
