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
import Surface from "../components/Surface";
import Button from "../components/Button";
import SectionHeader from "../components/SectionHeader";
import FadeInView from "../components/FadeInView";
import GradientFill from "../components/GradientFill";
import PressableScale from "../components/PressableScale";
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
        <MaterialCommunityIcons name="map-marker" size={20} color={colors.primary} />
        <Text style={styles.location}>
          {source?.kind === "region" ? getRegionLabel(source.region) : source?.place || t("weather.yourLocation")}
        </Text>
      </View>

      {source?.kind === "region" && (
        <Surface variant="glass" style={styles.notice}>
          <View style={styles.noticeRow}>
            <MaterialCommunityIcons name="crosshairs-off" size={20} color={colors.textSecondary} />
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
        </Surface>
      )}

      {refreshError && (
        <Surface style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color={colors.danger} />
          <Text style={styles.bannerText}>
            {t("weather.refreshFailed")} {t(refreshError.key, refreshError.values)}
          </Text>
        </Surface>
      )}

      {severeDays.length > 0 && (
        <FadeInView>
          <View style={styles.warning} accessibilityRole="alert">
            <View style={styles.warningIcon}>
              <MaterialCommunityIcons name="weather-lightning-rainy" size={26} color={colors.onPrimary} />
            </View>
            <View style={styles.warningBody}>
              <Text style={styles.warningTitle}>{t("weather.warningTitle")}</Text>
              <Text style={styles.warningText}>{t("weather.warningDays", { days: severeDays.join(", ") })}</Text>
            </View>
          </View>
        </FadeInView>
      )}

      {forecast.length === 0 && <StatusView icon="cloud-outline" title={t("weather.empty")} />}

      {today && (
        <FadeInView index={1}>
          <TodayHero day={today} severe={isSevere(today)} t={t} />
        </FadeInView>
      )}

      {nextDays.length > 0 && (
        <FadeInView index={2}>
          <SectionHeader title={t("weather.nextDays")} />
          <DayTimeline days={nextDays} isSevere={isSevere} t={t} />
        </FadeInView>
      )}
    </ScrollView>
  );
}

// Today, large, on a soft gradient (amber-tinted when it is a warning day)
function TodayHero({ day, severe, t }: { day: DailyForecast; severe: boolean; t: Translate }) {
  const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
  const { title, subtitle } = dayLabel(day.date, t);
  return (
    <View style={[styles.hero, severe && styles.heroSevere]}>
      <GradientFill from={severe ? colors.warningBg : colors.surfaceRaised} to={colors.card} />
      <View style={styles.titleRow}>
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle !== "" && <Text style={styles.heroSub}>{subtitle}</Text>}
      </View>
      <View style={styles.heroMain}>
        <View style={styles.heroInfo}>
          <Text style={styles.statLabel}>{t("weather.tempLabel")}</Text>
          <View style={styles.tempRow}>
            <Text style={styles.heroTemp}>{formatValue(day.temp_max, "°")}</Text>
            <Text style={styles.heroMin}>/ {formatValue(day.temp_min, "°C")}</Text>
          </View>
          <Text style={[styles.heroDesc, severe && styles.severeText]}>{weather ? t(weather.label) : "—"}</Text>
        </View>
        <MaterialCommunityIcons name={weather?.icon ?? "thermometer"} size={88} color={severe ? colors.warningText : colors.primary} />
      </View>
      <View style={styles.stats}>
        <Stat icon="water-percent" label={t("weather.rainLabel")} value={formatValue(day.rain_probability, "%")} highlight={severe} />
        <Stat icon="weather-windy" label={t("weather.windLabel")} value={formatValue(day.wind_speed, " km/h")} />
      </View>
    </View>
  );
}

// The following days as a horizontal row of day pills; the tapped day's details show underneath
function DayTimeline({ days, isSevere, t }: { days: DailyForecast[]; isSevere: (day: DailyForecast) => boolean; t: Translate }) {
  const [selectedDate, setSelectedDate] = useState(days[0]?.date);
  // A refreshed forecast may no longer contain the selected day; fall back to the first one
  const selected = days.find((d) => d.date === selectedDate) ?? days[0];
  return (
    <View style={styles.timeline}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {days.map((day) => {
          const severe = isSevere(day);
          const active = day.date === selected.date;
          const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
          const { title } = dayLabel(day.date, t);
          return (
            <PressableScale
              key={day.date}
              onPress={() => setSelectedDate(day.date)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${title}. ${weather ? t(weather.label) : ""}`}
              style={[styles.pill, active && styles.pillActive, severe && styles.pillSevere]}
            >
              <Text style={[styles.pillDay, active && styles.pillDayActive]} numberOfLines={2}>{title}</Text>
              <MaterialCommunityIcons
                name={weather?.icon ?? "thermometer"}
                size={30}
                color={severe ? colors.warningText : active ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.pillTemp}>{formatValue(day.temp_max, "°")}</Text>
              <View style={styles.pillRainRow}>
                <MaterialCommunityIcons name="water-percent" size={14} color={severe ? colors.warningText : colors.secondary} />
                <Text style={[styles.pillRain, severe && styles.severeText]}>{formatValue(day.rain_probability, "%")}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
      {selected && <DayDetail day={selected} severe={isSevere(selected)} t={t} />}
    </View>
  );
}

// Full values for the selected day, in the same order as the Today card
function DayDetail({ day, severe, t }: { day: DailyForecast; severe: boolean; t: Translate }) {
  const weather = day.weather_code !== null ? WEATHER_CODES[day.weather_code] : undefined;
  const { title, subtitle } = dayLabel(day.date, t);
  return (
    <Surface style={[styles.detail, severe && styles.severeEdge]}>
      <View style={styles.titleRow}>
        <Text style={styles.detailTitle}>{title}</Text>
        {subtitle !== "" && <Text style={styles.heroSub}>{subtitle}</Text>}
      </View>
      <View style={styles.detailMain}>
        <MaterialCommunityIcons name={weather?.icon ?? "thermometer"} size={40} color={severe ? colors.warningText : colors.primary} />
        <View style={styles.detailInfo}>
          <Text style={[styles.detailDesc, severe && styles.severeText]}>{weather ? t(weather.label) : "—"}</Text>
          <Text style={styles.statLabel}>{t("weather.tempLabel")}</Text>
          <Text style={styles.detailTemp}>{formatValue(day.temp_max, "°")} / {formatValue(day.temp_min, "°C")}</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat icon="water-percent" label={t("weather.rainLabel")} value={formatValue(day.rain_probability, "%")} highlight={severe} />
        <Stat icon="weather-windy" label={t("weather.windLabel")} value={formatValue(day.wind_speed, " km/h")} />
      </View>
    </Surface>
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
  container:     { flex: 1, backgroundColor: colors.background },
  content:       { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  locationRow:   { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  location:      { ...type.bodyLarge, fontWeight: "700", color: colors.text, flexShrink: 1 },

  notice:        { gap: spacing.md },
  noticeRow:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  noticeText:    { ...type.caption, color: colors.text, flex: 1 },
  noticeButton:  { alignSelf: "flex-start" },

  banner:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.dangerBg },
  bannerText:    { ...type.caption, color: colors.danger, flex: 1 },

  warning:       { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg,
                   backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning },
  warningIcon:   { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.warning },
  warningBody:   { flex: 1 },
  warningTitle:  { ...type.bodyLarge, fontWeight: "700", color: colors.warningText },
  warningText:   { ...type.caption, color: colors.text },

  hero:          { borderRadius: radius.xl, padding: spacing.xl, overflow: "hidden", gap: spacing.md,
                   borderWidth: 1, borderColor: colors.glassBorder },
  heroSevere:    { borderColor: colors.warning },
  // Day name and date side by side on one baseline (not nested, so neither clips the other)
  titleRow:      { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },
  heroTitle:     { ...type.title, fontWeight: "700", color: colors.text },
  heroSub:       { ...type.caption, color: colors.textSecondary },
  heroMain:      { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroInfo:      { flex: 1 },
  tempRow:       { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },
  heroTemp:      { ...type.display, fontWeight: "700", color: colors.text },
  heroMin:       { ...type.title, fontWeight: "600", color: colors.textSecondary },
  heroDesc:      { ...type.bodyLarge, color: colors.textSecondary },

  timeline:      { gap: spacing.md },
  pills:         { gap: spacing.sm, paddingVertical: spacing.xs },
  pill:          { width: 92, minHeight: 148, alignItems: "center", justifyContent: "space-between", gap: spacing.xs,
                   paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.lg,
                   backgroundColor: colors.card, borderWidth: 1, borderColor: colors.glassBorder },
  pillActive:    { backgroundColor: colors.surfaceRaised, borderColor: colors.primary },
  pillSevere:    { borderColor: colors.warning },
  pillDay:       { ...type.caption, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  pillDayActive: { color: colors.text },
  pillTemp:      { ...type.title, fontWeight: "700", color: colors.text },
  pillRainRow:   { flexDirection: "row", alignItems: "center", gap: 2 },
  pillRain:      { ...type.caption, fontWeight: "600", color: colors.textSecondary },

  detail:        { gap: spacing.md },
  detailTitle:   { ...type.bodyLarge, fontWeight: "700", color: colors.text },
  detailMain:    { flexDirection: "row", alignItems: "center", gap: spacing.md },
  detailInfo:    { flex: 1 },
  detailDesc:    { ...type.body, color: colors.text },
  detailTemp:    { ...type.bodyLarge, fontWeight: "700", color: colors.text },

  severeEdge:    { borderLeftWidth: 3, borderLeftColor: colors.warning },
  severeText:    { color: colors.warningText, fontWeight: "700" },

  stats:         { flexDirection: "row", gap: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  stat:          { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statLabel:     { ...type.caption, color: colors.textSecondary },
  statValue:     { ...type.body, fontWeight: "700", color: colors.text },
});
