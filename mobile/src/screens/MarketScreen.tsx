/**
 * MarketScreen — Displays current crop market prices and price trends.
 * Data fetched from the FastAPI /market/prices endpoint (backed by Supabase).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TextInput, ActivityIndicator, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { fetchMarketPrices } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import type { CropPrice } from "../types";

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

  if (loading) return <ActivityIndicator size="large" color="#1a7a1a" style={{ flex: 1, marginTop: 40 }} />;

  // Nothing loaded yet and the request failed: full-screen error with retry
  if (error && prices.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorTitle}>{t("market.loadFailedTitle")}</Text>
        <Text style={styles.errorText}>{t("market.loadFailedText")}</Text>
        <Text style={styles.errorDetail}>{t(error.key, error.values)}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const emptyMessage = () => {
    if (prices.length === 0) return <Text style={styles.empty}>{t("market.emptyDatabase")}</Text>;
    if (scope === "mine" && inScope.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>{t("market.noneInRegion")}</Text>
          <TouchableOpacity style={[styles.retryBtn, styles.showAllBtn]} onPress={() => setScope("all")}>
            <Text style={styles.retryText}>{t("market.showAllRegions")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <Text style={styles.empty}>{t("market.noMatch", { search: search.trim() })}</Text>;
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder={t("market.searchPlaceholder")} value={search} onChangeText={setSearch} />

      <View style={styles.scopeRow}>
        {(["mine", "all"] as const).map((s) => (
          <TouchableOpacity key={s} style={[styles.chip, scope === s && styles.chipActive]} onPress={() => setScope(s)}>
            <Text style={[styles.chipText, scope === s && styles.chipTextActive]}>
              {s === "mine" ? t("market.scopeMine") : t("market.scopeAll")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {scope === "mine" && <Text style={styles.scopeCaption}>{t("market.showingRegion", { region: getRegionLabel(region) })}</Text>}

      {error && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t("market.refreshFailed")}</Text>
          <TouchableOpacity onPress={refresh} disabled={refreshing}>
            <Text style={styles.bannerRetry}>{t("common.retryShort")}</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={visible}
        contentContainerStyle={styles.listContent}
        // crop_name + region is unique in the response; id can be null
        keyExtractor={(item) => `${item.crop_name}|${item.region}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cropName}>{item.crop_name}</Text>
                <Text style={styles.region}>{getRegionLabel(item.region)}</Text>
              </View>
              <Text style={styles.price}>₱{item.price_per_kg.toFixed(2)}/{item.unit?.trim() || "kg"}</Text>
            </View>
            <PriceDetails item={item} t={t} />
          </View>
        )}
        ListEmptyComponent={emptyMessage()}
      />
    </View>
  );
}

// Date or legacy badge, then source. Nothing is shown for values the API did not return.
function PriceDetails({ item, t }: { item: CropPrice; t: Translate }) {
  // A legacy row's price_date is only the date it was synced, so it is never shown
  const date = item.is_legacy ? null : formatPriceMonth(item.price_date);
  const source = item.source?.trim();
  if (!item.is_legacy && !date && !source) return null;
  return (
    <View style={styles.details}>
      {item.is_legacy ? (
        <Text style={styles.legacyBadge}>{t("market.legacyBadge")}</Text>
      ) : (
        date && <Text style={styles.detailText}>{t("market.priceDate", { date })}</Text>
      )}
      {source ? <Text style={styles.detailText}>{t("market.source", { source })}</Text> : null}
    </View>
  );
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
  container: { flex: 1, backgroundColor: "#f5f9f5" },
  center:    { justifyContent: "center", alignItems: "center", padding: 24 },
  search:    { margin: 12, marginBottom: 8, padding: 10, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd" },
  scopeRow:  { flexDirection: "row", marginHorizontal: 12, gap: 8 },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: "#1a7a1a" },
  chipActive:{ backgroundColor: "#1a7a1a" },
  chipText:  { color: "#1a7a1a", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  scopeCaption: { marginHorizontal: 12, marginTop: 6, fontSize: 12, color: "#888" },
  row:       { backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 10, elevation: 2 },
  rowTop:    { flexDirection: "row", alignItems: "center" },
  cropName:  { fontWeight: "bold", fontSize: 15, color: "#1a7a1a" },
  region:    { fontSize: 12, color: "#888", marginTop: 2 },
  price:     { fontWeight: "bold", fontSize: 17, color: "#333" },
  details:   { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  detailText:{ fontSize: 12, color: "#888" },
  legacyBadge: { alignSelf: "flex-start", fontSize: 12, fontWeight: "bold", color: "#a0522d", backgroundColor: "#fff3e0", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 2, overflow: "hidden" },
  empty:     { textAlign: "center", marginTop: 40, color: "#aaa" },
  emptyBox:  { alignItems: "center" },
  errorTitle:  { fontSize: 17, fontWeight: "bold", color: "#c0392b", marginBottom: 6, textAlign: "center" },
  errorText:   { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 6 },
  errorDetail: { fontSize: 12, color: "#aaa", textAlign: "center", marginBottom: 16 },
  retryBtn:    { backgroundColor: "#1a7a1a", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  showAllBtn:  { marginTop: 12 },
  listContent: { paddingTop: 8, paddingBottom: 16 },
  retryText:   { color: "#fff", fontWeight: "bold" },
  banner:      { flexDirection: "row", alignItems: "center", backgroundColor: "#fdecea", marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8 },
  bannerText:  { flex: 1, fontSize: 12, color: "#c0392b" },
  bannerRetry: { color: "#1a7a1a", fontWeight: "bold", marginLeft: 8 },
});
