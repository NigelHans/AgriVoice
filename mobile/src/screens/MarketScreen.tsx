/**
 * MarketScreen — Displays current crop market prices and price trends.
 * Data fetched from the FastAPI /market/prices endpoint (backed by Supabase).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { fetchMarketPrices } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import type { CropPrice } from "../types";
import StatusView from "../components/StatusView";
import Surface from "../components/Surface";
import Chip from "../components/Chip";
import Badge from "../components/Badge";
import Button from "../components/Button";
import BentoTile from "../components/BentoTile";
import FadeInView from "../components/FadeInView";
import GradientFill from "../components/GradientFill";
import PressableScale from "../components/PressableScale";
import SectionHeader from "../components/SectionHeader";
import { colors, spacing, radius, type } from "../theme";

type Scope = "mine" | "all";

export default function MarketScreen() {
  const t = useT();
  const { region } = useRegion();
  const [prices, setPrices] = useState<CropPrice[]>([]);
  const [search, setSearch] = useState("");
  // "mine" filters on the exact saved region value; labels are display-only
  const [scope, setScope] = useState<Scope>("mine");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Stored as a key so it follows a language change; technical details go to console.warn
  const [error, setError] = useState<UiMessage | null>(null);
  // Only the latest request may update the screen
  const requestId = useRef(0);

  const load = async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchMarketPrices();
      if (id !== requestId.current) return;
      setPrices(data);
      setError(null);
    } catch (err) {
      // Keep any prices already shown; the error is displayed instead of "no prices"
      console.warn("Could not load market prices", err);
      if (id !== requestId.current) return;
      setError(apiErrorMessage(err));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => { load(); }, []);

  // Full-screen retry: nothing is shown yet
  const retry = () => {
    setLoading(true);
    load();
  };

  // Pull-to-refresh and the banner's Retry keep the current prices visible
  const refresh = () => {
    setRefreshing(true);
    load();
  };

  // Derived on every render, so refreshes, searches and region changes always agree
  const inScope = useMemo(
    () => (scope === "mine" ? prices.filter((p) => p.region === region) : prices),
    [prices, scope, region]
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? inScope.filter((p) => p.crop_name.toLowerCase().includes(query)) : inScope;
  }, [inScope, search]);

  if (loading) return <StatusView loading />;

  // Nothing loaded yet and the request failed: full-screen error with retry
  if (error && prices.length === 0) {
    return (
      <StatusView
        tone="error"
        icon="cloud-offline-outline"
        title={t("market.loadFailedTitle")}
        text={t("market.loadFailedText")}
        detail={t(error.key, error.values)}
        actionLabel={t("common.retry")}
        onAction={retry}
      />
    );
  }

  const emptyMessage = () => {
    if (prices.length === 0) return <StatusView icon="leaf-outline" title={t("market.emptyDatabase")} />;
    if (scope === "mine" && inScope.length === 0) {
      return (
        <StatusView
          icon="location-outline"
          title={t("market.noneInRegion")}
          actionLabel={t("market.showAllRegions")}
          onAction={() => setScope("all")}
        />
      );
    }
    return <StatusView icon="search-outline" title={t("market.noMatch", { search: search.trim() })} />;
  };

  // Verified prices first; pre-migration (legacy) rows separately, so old data never looks current
  const verified = visible.filter((p) => !p.is_legacy);
  const older = visible.filter((p) => p.is_legacy);
  const [featured, ...restVerified] = verified;

  // Summary tiles use only the loaded prices for the chosen scope (search narrows the list, not the summary)
  const cropCount = new Set(inScope.map((p) => p.crop_name)).size;
  const latestVerified = inScope.filter((p) => !p.is_legacy).map((p) => p.price_date).sort().pop();
  const latestLabel = (latestVerified && formatPriceMonth(latestVerified)) || "—";

  // shortcut: a plain ScrollView renders every tile; fine for the latest price per crop and region
  // (tens of rows). Switch back to a virtualized list if the endpoint ever returns full history.
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <Surface variant="glass" style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("market.searchPlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={t("market.searchPlaceholder")}
        />
      </Surface>

      <View style={styles.scopeRow}>
        <Chip label={t("market.scopeMine")} icon="map-marker-outline" selected={scope === "mine"} onPress={() => setScope("mine")} />
        <Chip label={t("market.scopeAll")} icon="earth" selected={scope === "all"} onPress={() => setScope("all")} />
      </View>

      {error && (
        <Surface style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color={colors.danger} />
          <Text style={styles.bannerText}>{t("market.refreshFailed")}</Text>
          <Button label={t("common.retryShort")} variant="text" onPress={refresh} disabled={refreshing} />
        </Surface>
      )}

      {prices.length > 0 && (
        <FadeInView style={styles.bento}>
          <RegionTile label={t("market.summaryRegion")} value={scope === "mine" ? getRegionLabel(region) : t("market.scopeAll")} t={t} />
          <View style={styles.bentoRow}>
            <BentoTile label={t("market.summaryCrops")} value={String(cropCount)} icon="sprout" />
            <BentoTile label={t("market.summaryLatest")} value={latestLabel} icon="calendar-month-outline" valueColor={colors.primary} />
          </View>
        </FadeInView>
      )}

      {visible.length === 0 ? (
        emptyMessage()
      ) : (
        <>
          {featured && (
            <>
              <SectionHeader title={`${t("market.sectionVerified")} · ${verified.length}`} />
              <FadeInView index={1}>
                <FeaturedPrice item={featured} t={t} />
              </FadeInView>
              <View style={styles.grid}>
                {restVerified.map((item, i) => (
                  <FadeInView key={`${item.crop_name}|${item.region}`} index={i + 2} style={styles.gridCell}>
                    <PriceTile item={item} t={t} />
                  </FadeInView>
                ))}
              </View>
            </>
          )}
          {older.length > 0 && (
            <>
              <SectionHeader title={`${t("market.sectionOlder")} · ${older.length}`} hint={t("market.sectionOlderHint")} />
              {older.map((item, i) => (
                <FadeInView key={`${item.crop_name}|${item.region}`} index={i} style={styles.olderCell}>
                  <PriceTile item={item} t={t} />
                </FadeInView>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// The region the summary is for; tapping opens Settings, where the region is chosen
function RegionTile({ label, value, t }: { label: string; value: string; t: Translate }) {
  const navigation = useNavigation();
  return (
    <PressableScale
      onPress={() => navigation.navigate("Settings" as never)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${t("settings.regionChange")}`}
    >
      <Surface variant="raised" style={styles.regionTile}>
        <MaterialCommunityIcons name="map-marker" size={24} color={colors.primary} />
        <View style={styles.regionInfo}>
          <Text style={styles.overline}>{label}</Text>
          <Text style={styles.regionValue} numberOfLines={2}>{value}</Text>
        </View>
        <Text style={styles.changeText}>{t("settings.regionChange")}</Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
      </Surface>
    </PressableScale>
  );
}

// The first verified price, large, on a soft gradient
function FeaturedPrice({ item, t }: { item: CropPrice; t: Translate }) {
  return (
    <View style={styles.featured}>
      <GradientFill from={colors.surfaceRaised} to={colors.card} />
      <View style={styles.featuredTop}>
        <View style={styles.cropIconLarge}>
          <MaterialCommunityIcons name={cropIcon(item.crop_name)} size={30} color={colors.primary} />
        </View>
        <View style={styles.featuredInfo}>
          <Text style={styles.featuredCrop}>{item.crop_name}</Text>
          <Text style={styles.region}>{getRegionLabel(item.region)}</Text>
        </View>
      </View>
      <View style={styles.priceRow} accessible accessibilityLabel={`₱${item.price_per_kg.toFixed(2)} / ${item.unit?.trim() || "kg"}`}>
        <Text style={styles.featuredPrice}>₱{item.price_per_kg.toFixed(2)}</Text>
        <Text style={styles.featuredUnit}>/ {item.unit?.trim() || "kg"}</Text>
      </View>
      <PriceDetails item={item} t={t} />
    </View>
  );
}

// A compact price tile: crop and price per kilogram first; region, verification, date and source below
function PriceTile({ item, t }: { item: CropPrice; t: Translate }) {
  return (
    <Surface variant={item.is_legacy ? "glass" : "base"} style={styles.tile}>
      <View style={styles.tileTop}>
        <MaterialCommunityIcons name={cropIcon(item.crop_name)} size={22} color={item.is_legacy ? colors.textSecondary : colors.primary} />
        <Text style={styles.tileCrop} numberOfLines={1}>{item.crop_name}</Text>
      </View>
      <View style={styles.priceRow} accessible accessibilityLabel={`₱${item.price_per_kg.toFixed(2)} / ${item.unit?.trim() || "kg"}`}>
        <Text style={[styles.tilePrice, item.is_legacy && styles.priceLegacy]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          ₱{item.price_per_kg.toFixed(2)}
        </Text>
        <Text style={styles.tileUnit}>/ {item.unit?.trim() || "kg"}</Text>
      </View>
      <Text style={styles.region} numberOfLines={2}>{getRegionLabel(item.region)}</Text>
      <PriceDetails item={item} t={t} />
    </Surface>
  );
}

// Verified badge with date, or the legacy badge (never a legacy date); then source.
// Nothing is shown for values the API did not return.
function PriceDetails({ item, t }: { item: CropPrice; t: Translate }) {
  // A legacy row's price_date is only the date it was synced, so it is never shown
  const date = item.is_legacy ? null : formatPriceMonth(item.price_date);
  const source = item.source?.trim();
  return (
    <View style={styles.details}>
      {item.is_legacy ? (
        <Badge label={t("market.legacyBadge")} tone="warning" icon="alert-outline" />
      ) : (
        <Badge label={t("market.verifiedBadge")} tone="success" icon="check-decagram-outline" />
      )}
      {date && <Text style={styles.detailText}>{t("market.priceDate", { date })}</Text>}
      {source ? <Text style={styles.detailText} numberOfLines={2}>{t("market.source", { source })}</Text> : null}
    </View>
  );
}

// shortcut: only crops with their own icon are mapped; add more when new crops are synced
function cropIcon(cropName: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (/rice|palay|bigas/i.test(cropName)) return "rice";
  if (/corn|mais/i.test(cropName)) return "corn";
  return "sprout";
}

// WFP prices are monthly; "2026-08-15" → "Aug 2026" (en-PH format, like the rest of the app)
function formatPriceMonth(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  content:       { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  searchBox:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 0, paddingHorizontal: spacing.md,
                   minHeight: 52, borderRadius: radius.xl },
  searchInput:   { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  scopeRow:      { flexDirection: "row", gap: spacing.sm },
  banner:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.dangerBg },
  bannerText:    { flex: 1, ...type.caption, color: colors.danger },

  bento:         { gap: spacing.md },
  bentoRow:      { flexDirection: "row", gap: spacing.md },
  regionTile:    { flexDirection: "row", alignItems: "center", gap: spacing.md },
  regionInfo:    { flex: 1 },
  overline:      { ...type.overline, color: colors.textSecondary },
  regionValue:   { ...type.bodyLarge, fontWeight: "700", color: colors.text },
  changeText:    { ...type.body, fontWeight: "700", color: colors.primary },

  featured:      { borderRadius: radius.xl, padding: spacing.xl, overflow: "hidden", gap: spacing.md,
                   borderWidth: 1, borderColor: colors.glassBorder },
  featuredTop:   { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cropIconLarge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  featuredInfo:  { flex: 1 },
  featuredCrop:  { ...type.headline, fontWeight: "700", color: colors.text },
  featuredPrice: { ...type.display, fontWeight: "700", color: colors.primary },
  featuredUnit:  { ...type.body, fontWeight: "600", color: colors.textSecondary },
  // Price and unit sit side by side on one baseline; the unit wraps below instead of clipping
  priceRow:      { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },

  grid:          { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCell:      { width: "47.5%", flexGrow: 1 },
  olderCell:     { width: "100%" },
  tile:          { flex: 1, gap: spacing.sm },
  tileTop:       { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tileCrop:      { ...type.bodyLarge, fontWeight: "700", color: colors.text, flex: 1 },
  tilePrice:     { ...type.headline, fontSize: 26, fontWeight: "700", color: colors.primary, flexShrink: 1 },
  tileUnit:      { ...type.caption, fontWeight: "600", color: colors.textSecondary },
  priceLegacy:   { color: colors.textSecondary },
  region:        { ...type.caption, color: colors.textSecondary },
  details:       { gap: spacing.xs, marginTop: spacing.xs },
  detailText:    { ...type.caption, color: colors.accent },
});
