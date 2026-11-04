/**
 * MarketScreen — Displays current crop market prices and price trends.
 * Data fetched from the FastAPI /market/prices endpoint (backed by Supabase).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, SectionList, TextInput, StyleSheet, RefreshControl } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchMarketPrices } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import type { CropPrice } from "../types";
import StatusView from "../components/StatusView";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Badge from "../components/Badge";
import Button from "../components/Button";
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

  // Verified prices first; pre-migration (legacy) rows separately, so old data never looks current.
  // Empty sections are left out, so the empty-state message shows when nothing matches.
  const sections = [
    { key: "verified", title: t("market.sectionVerified"), hint: undefined, data: visible.filter((p) => !p.is_legacy) },
    { key: "older", title: t("market.sectionOlder"), hint: t("market.sectionOlderHint"), data: visible.filter((p) => p.is_legacy) },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("market.searchPlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={t("market.searchPlaceholder")}
        />
      </View>

      <View style={styles.scopeRow}>
        <Chip label={t("market.scopeMine")} icon="map-marker-outline" selected={scope === "mine"} onPress={() => setScope("mine")} />
        <Chip label={t("market.scopeAll")} icon="earth" selected={scope === "all"} onPress={() => setScope("all")} />
      </View>
      {scope === "mine" && (
        <View style={styles.captionRow}>
          <MaterialCommunityIcons name="map-marker" size={16} color={colors.accent} />
          <Text style={styles.scopeCaption}>{t("market.showingRegion", { region: getRegionLabel(region) })}</Text>
        </View>
      )}

      {error && (
        <View style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color={colors.danger} />
          <Text style={styles.bannerText}>{t("market.refreshFailed")}</Text>
          <Button label={t("common.retryShort")} variant="text" onPress={refresh} disabled={refreshing} />
        </View>
      )}

      <SectionList
        sections={sections}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        // crop_name + region is unique in the response; id can be null
        keyExtractor={(item) => `${item.crop_name}|${item.region}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} hint={section.hint} />}
        renderItem={({ item }) => <PriceCard item={item} t={t} />}
        ListEmptyComponent={emptyMessage()}
      />
    </View>
  );
}

// Crop name and price per kilogram first; then region, verification, date and source
function PriceCard({ item, t }: { item: CropPrice; t: Translate }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cropIcon}>
          <MaterialCommunityIcons name={cropIcon(item.crop_name)} size={26} color={colors.primary} />
        </View>
        <View style={styles.cropInfo}>
          <Text style={styles.cropName}>{item.crop_name}</Text>
          <Text style={styles.region}>{getRegionLabel(item.region)}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={[styles.price, item.is_legacy && styles.priceLegacy]}>₱{item.price_per_kg.toFixed(2)}</Text>
          <Text style={styles.unit}>/ {item.unit?.trim() || "kg"}</Text>
        </View>
      </View>
      <PriceDetails item={item} t={t} />
    </Card>
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
        <View style={styles.detailRow}>
          <Badge label={t("market.verifiedBadge")} tone="success" icon="check-decagram-outline" />
          {date && <Text style={styles.detailText}>{t("market.priceDate", { date })}</Text>}
        </View>
      )}
      {source ? <Text style={styles.detailText}>{t("market.source", { source })}</Text> : null}
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
  container:    { flex: 1, backgroundColor: colors.background },
  searchBox:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg,
                  paddingHorizontal: spacing.md, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.card,
                  borderWidth: 1, borderColor: colors.border },
  searchInput:  { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  scopeRow:     { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  captionRow:   { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  scopeCaption: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  banner:       { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md,
                  paddingLeft: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  bannerText:   { flex: 1, ...type.caption, color: colors.danger },
  listContent:  { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card:         { marginBottom: spacing.md },
  cardTop:      { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cropIcon:     { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.successBg },
  cropInfo:     { flex: 1 },
  cropName:     { ...type.title, fontWeight: "700", color: colors.text },
  region:       { ...type.caption, color: colors.textSecondary },
  priceBox:     { alignItems: "flex-end" },
  price:        { ...type.headline, fontWeight: "700", color: colors.primary },
  priceLegacy:  { color: colors.textSecondary },
  unit:         { ...type.caption, color: colors.textSecondary },
  details:      { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.xs },
  detailRow:    { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  detailText:   { ...type.caption, color: colors.accent },
});
