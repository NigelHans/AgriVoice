/**
 * WeatherScreen — Shows a 7-day weather forecast for the farmer's location.
 * Uses expo-location to get GPS coordinates, then calls the FastAPI weather endpoint.
 * When GPS is unavailable, it falls back to the centre of the region chosen in Settings.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { fetchWeather } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type StringKey, type Translate, type UiMessage } from "../i18n";
import type { DailyForecast } from "../types";
import StatusView from "../components/StatusView";
import Card from "../components/Card";
import Button from "../components/Button";
import SectionHeader from "../components/SectionHeader";
import { colors, spacing, radius, type } from "../theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const GPS_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 5_000;
// A position from the last hour is close enough for a daily forecast
const LAST_KNOWN_MAX_AGE_MS = 60 * 60 * 1000;

// Open-Meteo WMO weather codes (the backend passes them through unchanged)
const WEATHER_CODES: Record<number, { icon: IconName; label: StringKey }> = {
  0:  { icon: "weather-sunny", label: "weather.code.0" },
  1:  { icon: "weather-partly-cloudy", label: "weather.code.1" },
  2:  { icon: "weather-partly-cloudy", label: "weather.code.2" },
  3:  { icon: "weather-cloudy", label: "weather.code.3" },
  45: { icon: "weather-fog", label: "weather.code.45" },
  48: { icon: "weather-fog", label: "weather.code.48" },
  51: { icon: "weather-partly-rainy", label: "weather.code.51" },
  53: { icon: "weather-partly-rainy", label: "weather.code.53" },
  55: { icon: "weather-rainy", label: "weather.code.55" },
  56: { icon: "weather-snowy-rainy", label: "weather.code.56" },
  57: { icon: "weather-snowy-rainy", label: "weather.code.57" },
  61: { icon: "weather-partly-rainy", label: "weather.code.61" },
  63: { icon: "weather-rainy", label: "weather.code.63" },
  65: { icon: "weather-pouring", label: "weather.code.65" },
  66: { icon: "weather-snowy-rainy", label: "weather.code.66" },
  67: { icon: "weather-snowy-rainy", label: "weather.code.67" },
  71: { icon: "weather-snowy", label: "weather.code.71" },
  73: { icon: "weather-snowy", label: "weather.code.73" },
  75: { icon: "weather-snowy-heavy", label: "weather.code.75" },
  77: { icon: "weather-snowy", label: "weather.code.77" },
  80: { icon: "weather-partly-rainy", label: "weather.code.80" },
  81: { icon: "weather-rainy", label: "weather.code.81" },
  82: { icon: "weather-pouring", label: "weather.code.82" },
  85: { icon: "weather-snowy", label: "weather.code.85" },
  86: { icon: "weather-snowy-heavy", label: "weather.code.86" },
  95: { icon: "weather-lightning", label: "weather.code.95" },
  96: { icon: "weather-hail", label: "weather.code.96" },
  99: { icon: "weather-hail", label: "weather.code.99" },
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
      <StatusView loading text={phase === "locating" ? t("weather.locating") : t("weather.fetching")} />
    );
  }

  if (phase === "error" && error) {
    return (
      <StatusView
        tone="error"
        icon="alert-circle-outline"
        title={t(error.title)}
        text={t(error.message.key, error.message.values)}
        actionLabel={t("common.retry")}
        onAction={() => load()}
      />
    );
  }

  // Days with heavy rain, a storm or a high rain chance — taken only from the forecast data
  const isSevere = (day: DailyForecast) =>
    (day.weather_code !== null && SEVERE_CODES.has(day.weather_code))
    || (day.rain_probability !== null && day.rain_probability >= HIGH_RAIN_CHANCE);
  const [today, ...nextDays] = forecast;
  const severeDays = forecast.filter(isSevere).map((day) => dayLabel(day.date, t).title);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <View style={styles.locationRow}>
        <MaterialCommunityIcons name="map-marker" size={20} color={colors.accent} />
        <Text style={styles.location}>
          {source?.kind === "region" ? getRegionLabel(source.region) : source?.place || t("weather.yourLocation")}
        </Text>
      </View>

      {source?.kind === "region" && (
        <View style={styles.notice}>
          <View style={styles.noticeRow}>
            <MaterialCommunityIcons name="crosshairs-off" size={20} color={colors.notice} />
            <Text style={styles.noticeText}>
              {t(source.reason)}{"\n"}
              {t("weather.fallbackNotice", { city: REGION_CENTERS[source.region]?.city ?? "—" })}
            </Text>
          </View>
          <Button
            label={t("weather.useGps")}
            variant="secondary"
            icon="crosshairs-gps"
            onPress={() => load(true)}
            disabled={refreshing}
            style={styles.noticeButton}
          />
        </View>
      )}

      {refreshError && (
        <View style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color={colors.danger} />
          <Text style={styles.bannerText}>
            {t("weather.refreshFailed")} {t(refreshError.key, refreshError.values)}
          </Text>
        </View>
      )}

      {severeDays.length > 0 && (
        <View style={styles.warning} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert" size={26} color={colors.warningText} />
          <View style={styles.warningBody}>
            <Text style={styles.warningTitle}>{t("weather.warningTitle")}</Text>
            <Text style={styles.warningText}>{t("weather.warningDays", { days: severeDays.join(", ") })}</Text>
          </View>
        </View>
      )}

      {forecast.length === 0 && <StatusView icon="cloud-outline" title={t("weather.empty")} />}

      {today && <TodayCard day={today} severe={isSevere(today)} t={t} />}
      {nextDays.length > 0 && <SectionHeader title={t("weather.nextDays")} />}
      {nextDays.map((day) => <DayCard key={day.date} day={day} severe={isSevere(day)} t={t} />)}
    </ScrollView>
  );
}

// The first forecast day, large: icon, temperature, description, rain chance and wind
function TodayCard({ day, severe, t }: { day: DailyForecast; severe: boolean; t: Translate }) {
  const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
  const { title, subtitle } = dayLabel(day.date, t);
  return (
    <Card style={[styles.todayCard, severe && styles.severeEdge]}>
      <View style={styles.titleRow}>
        <Text style={styles.todayTitle}>{title}</Text>
        {subtitle !== "" && <Text style={styles.todaySub}>{subtitle}</Text>}
      </View>
      <View style={styles.todayMain}>
        <MaterialCommunityIcons name={weather?.icon ?? "thermometer"} size={72} color={severe ? colors.warningText : colors.primary} />
        <View style={styles.todayInfo}>
          <Text style={styles.statLabel}>{t("weather.tempLabel")}</Text>
          <Text style={styles.todayTemp}>{formatValue(day.temp_max, "°")} / {formatValue(day.temp_min, "°C")}</Text>
          <Text style={[styles.todayDesc, severe && styles.severeText]}>{weather ? t(weather.label) : "—"}</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat icon="water-percent" label={t("weather.rainLabel")} value={formatValue(day.rain_probability, "%")} highlight={severe} />
        <Stat icon="weather-windy" label={t("weather.windLabel")} value={formatValue(day.wind_speed, " km/h")} />
      </View>
    </Card>
  );
}

// One of the following days, compact, with the same values in the same order
function DayCard({ day, severe, t }: { day: DailyForecast; severe: boolean; t: Translate }) {
  const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
  const { title, subtitle } = dayLabel(day.date, t);
  return (
    <Card style={[styles.dayCard, severe && styles.severeEdge]}>
      <View style={styles.dayTop}>
        <MaterialCommunityIcons name={weather?.icon ?? "thermometer"} size={36} color={severe ? colors.warningText : colors.primary} />
        <View style={styles.dayInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.dayTitle}>{title}</Text>
            {subtitle !== "" && <Text style={styles.daySub}>{subtitle}</Text>}
          </View>
          <Text style={[styles.dayDesc, severe && styles.severeText]}>{weather ? t(weather.label) : "—"}</Text>
        </View>
        <Text style={styles.dayTemp}>{formatValue(day.temp_max, "°")} / {formatValue(day.temp_min, "°C")}</Text>
      </View>
      <View style={styles.stats}>
        <Stat icon="water-percent" label={t("weather.rainLabel")} value={formatValue(day.rain_probability, "%")} highlight={severe} />
        <Stat icon="weather-windy" label={t("weather.windLabel")} value={formatValue(day.wind_speed, " km/h")} />
      </View>
    </Card>
  );
}

function Stat({ icon, label, value, highlight = false }: { icon: IconName; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={22} color={highlight ? colors.warningText : colors.secondary} />
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, highlight && styles.severeText]}>{value}</Text>
      </View>
    </View>
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
  container:    { flex: 1, backgroundColor: colors.background },
  content:      { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl },
  locationRow:  { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.md },
  location:     { ...type.bodyLarge, fontWeight: "700", color: colors.text, flexShrink: 1 },

  notice:       { backgroundColor: colors.noticeBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  noticeRow:    { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  noticeText:   { ...type.caption, color: colors.notice, flex: 1 },
  noticeButton: { alignSelf: "flex-start", marginTop: spacing.md },

  banner:       { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.dangerBg,
                  borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerText:   { ...type.caption, color: colors.danger, flex: 1 },

  warning:      { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.warningBg,
                  borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: colors.warning, padding: spacing.md, marginBottom: spacing.md },
  warningBody:  { flex: 1 },
  warningTitle: { ...type.body, fontWeight: "700", color: colors.warningText },
  warningText:  { ...type.caption, color: colors.warningText },

  todayCard:    { marginBottom: spacing.sm },
  // Day name and date side by side on one baseline (not nested, so neither clips the other)
  titleRow:     { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },
  todayTitle:   { ...type.title, fontWeight: "700", color: colors.text },
  todaySub:     { ...type.caption, fontWeight: "400", color: colors.textSecondary },
  todayMain:    { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.md },
  todayInfo:    { flex: 1 },
  todayTemp:    { ...type.display, fontWeight: "700", color: colors.text },
  todayDesc:    { ...type.bodyLarge, color: colors.textSecondary },

  dayCard:      { marginBottom: spacing.md },
  dayTop:       { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dayInfo:      { flex: 1 },
  dayTitle:     { ...type.body, fontWeight: "700", color: colors.text },
  daySub:       { ...type.caption, fontWeight: "400", color: colors.textSecondary },
  dayDesc:      { ...type.caption, color: colors.textSecondary },
  dayTemp:      { ...type.bodyLarge, fontWeight: "700", color: colors.text },

  severeEdge:   { borderLeftWidth: 4, borderLeftColor: colors.warning },
  severeText:   { color: colors.warningText, fontWeight: "700" },

  stats:        { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md, paddingTop: spacing.md,
                  borderTopWidth: 1, borderTopColor: colors.divider },
  stat:         { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statLabel:    { ...type.caption, color: colors.textMuted },
  statValue:    { ...type.body, fontWeight: "700", color: colors.text },
});
