/**
 * MarketScreen — the latest crop prices as a market price board.
 * Search and region scope on top, one row per crop and region, and a detail sheet with the
 * price trend and a shortcut to ask the assistant about it.
 * Data comes from the FastAPI /market/prices and /market/history endpoints (backed by Supabase).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, SectionList, ScrollView, TextInput, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { fetchMarketPrices, fetchPriceHistory } from "../services/api";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import type { CropPrice } from "../types";
import StatusView from "../components/StatusView";
import Chip from "../components/Chip";
import Badge from "../components/Badge";
import Button from "../components/Button";
import BottomSheet from "../components/BottomSheet";
import PressableScale from "../components/PressableScale";
import PriceText, { formatAmount } from "../components/PriceText";
import { colors, spacing, radius, type, fonts, themed } from "../theme";

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
  const navigation = useNavigation();
  // Unverified rows stay folded away until asked for, so old data never reads as current
  const [showOlder, setShowOlder] = useState(false);
  // The price whose detail sheet is open
  const [selected, setSelected] = useState<CropPrice | null>(null);

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
  // With no verified price at all, the older ones are shown right away instead of an empty board
  const olderOpen = showOlder || verified.length === 0;
  const sections = [
    ...(verified.length > 0 ? [{ key: "verified", data: verified }] : []),
    ...(older.length > 0 ? [{ key: "older", data: olderOpen ? older : [] }] : []),
  ];

  const askAbout = (item: CropPrice) => {
    setSelected(null);
    const question = t("market.askQuestion", { crop: item.crop_name, region: getRegionLabel(item.region) });
    // `at` makes asking about the same price twice still fill the Voice screen
    navigation.navigate({ name: "Voice", params: { question, at: Date.now() } } as never);
  };

  const header = (
    <View style={styles.header}>
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

      {/* The region the list is for; tapping opens Settings, where the region is chosen */}
      {scope === "mine" && (
        <PressableScale
          style={styles.regionLine}
          onPress={() => navigation.navigate("Settings" as never)}
          accessibilityRole="button"
          accessibilityLabel={`${getRegionLabel(region)}. ${t("settings.regionChange")}`}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color={colors.primary} />
          <Text style={styles.regionName} numberOfLines={2}>{getRegionLabel(region)}</Text>
          <Text style={styles.changeText}>{t("settings.regionChange")}</Text>
        </PressableScale>
      )}

      {error && (
        <View style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={20} color={colors.danger} />
          <Text style={styles.bannerText}>{t("market.refreshFailed")}</Text>
          <Button label={t("common.retryShort")} variant="text" onPress={refresh} disabled={refreshing} />
        </View>
      )}
    </View>
  );

  return (
    <>
      <SectionList
        style={styles.container}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item) => `${item.crop_name}|${item.region}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={emptyMessage()}
        renderSectionHeader={({ section }) =>
          section.key === "verified" ? (
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t("market.sectionVerified")} ({verified.length})
            </Text>
          ) : (
            <View style={styles.olderHeader}>
              {verified.length > 0 && (
                <Button
                  label={`${t("market.sectionOlder")} (${older.length})`}
                  variant="text"
                  icon={olderOpen ? "chevron-up" : "chevron-down"}
                  onPress={() => setShowOlder((open) => !open)}
                  style={styles.olderToggle}
                />
              )}
              {olderOpen && <Text style={styles.olderHint}>{t("market.sectionOlderHint")}</Text>}
            </View>
          )
        }
        ItemSeparatorComponent={RowDivider}
        renderItem={({ item }) => (
          <PriceRow item={item} showRegion={scope === "all"} onPress={() => setSelected(item)} t={t} />
        )}
      />
      <PriceSheet item={selected} onClose={() => setSelected(null)} onAsk={askAbout} t={t} />
    </>
  );
}

function RowDivider() {
  return <View style={styles.divider} />;
}

function unitOf(item: CropPrice): string {
  return item.unit?.trim() || "kg";
}

// One board row: crop on the left, price on the right; region (when showing all) and month underneath
function PriceRow({ item, showRegion, onPress, t }: { item: CropPrice; showRegion: boolean; onPress: () => void; t: Translate }) {
  // A legacy row's price_date is only the date it was synced, so it is never shown
  const when = item.is_legacy ? t("market.legacyBadge") : formatPriceMonth(item.price_date);
  const meta = [showRegion ? getRegionLabel(item.region) : null, when].filter(Boolean).join(", ");
  return (
    <PressableScale
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.crop_name}, ₱${formatAmount(item.price_per_kg)} / ${unitOf(item)}. ${meta}`}
    >
      <MaterialCommunityIcons name={cropIcon(item.crop_name)} size={26} color={item.is_legacy ? colors.textSecondary : colors.primary} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowCrop} numberOfLines={2}>{item.crop_name}</Text>
        {meta ? <Text style={styles.rowMeta} numberOfLines={2}>{meta}</Text> : null}
      </View>
      <PriceText value={item.price_per_kg} unit={unitOf(item)} size="headline"
                 color={item.is_legacy ? colors.textSecondary : colors.price} style={styles.rowPrice} />
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
    </PressableScale>
  );
}

// Price details in a sheet: the board, its trend (verified prices only) and "Ask about this price"
function PriceSheet({ item, onClose, onAsk, t }: {
  item: CropPrice | null;
  onClose: () => void;
  onAsk: (item: CropPrice) => void;
  t: Translate;
}) {
  // Keeps showing the last price while the sheet slides away
  const last = useRef<CropPrice | null>(null);
  if (item) last.current = item;
  const shown = item ?? last.current;
  return (
    <BottomSheet visible={item !== null} onClose={onClose} closeLabel={t("history.close")}>
      {shown && (
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <View>
            <Text style={styles.sheetCrop} accessibilityRole="header">{shown.crop_name}</Text>
            <Text style={styles.sheetRegion}>{getRegionLabel(shown.region)}</Text>
          </View>
          <View style={styles.board}>
            <PriceText value={shown.price_per_kg} unit={unitOf(shown)}
                       color={shown.is_legacy ? colors.textSecondary : colors.price} />
            <PriceDetails item={shown} t={t} />
          </View>
          {!shown.is_legacy && <Trend item={shown} t={t} />}
          <Button label={t("market.askAbout")} icon="chat-question-outline" onPress={() => onAsk(shown)} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

type Point = { date: string; price: number };
type HistoryResponse = { history?: { price_date: string; price_per_kg: number; region: string }[] };

// The last 12 months for this crop in this region, as a sparkline with the latest change in words
function Trend({ item, t }: { item: CropPrice; t: Translate }) {
  const [points, setPoints] = useState<Point[] | "loading" | "error">("loading");
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let current = true;
    setPoints("loading");
    fetchPriceHistory(item.crop_name, 365)
      .then((data: HistoryResponse) => {
        if (!current) return;
        // shortcut: the endpoint matches crop names loosely and returns every region; points carry no crop
        // name, so only the region can be checked. Add crop_name to PricePoint if similar names ever mix.
        setPoints((data.history ?? [])
          .filter((p) => p.region === item.region)
          .map((p) => ({ date: p.price_date, price: p.price_per_kg }))
          .sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((err) => {
        console.warn("Could not load price history", err);
        if (current) setPoints("error");
      });
    return () => { current = false; };
  }, [item.crop_name, item.region]);

  let content: React.ReactNode;
  if (points === "loading") content = <ActivityIndicator color={colors.primary} style={styles.trendLoading} />;
  else if (points === "error") content = <Text style={styles.trendNote}>{t("market.trendFailed")}</Text>;
  else if (points.length < 2) content = <Text style={styles.trendNote}>{t("market.trendNone")}</Text>;
  else {
    const first = points[0];
    const prev = points[points.length - 2];
    const lastPoint = points[points.length - 1];
    const change = lastPoint.price - prev.price;
    const since = formatPriceMonth(prev.date) ?? prev.date;
    const amount = formatAmount(Math.abs(change));
    const changeText = change > 0 ? t("market.trendUp", { amount, date: since })
      : change < 0 ? t("market.trendDown", { amount, date: since })
      : t("market.trendSame", { date: since });
    const start = formatPriceMonth(first.date) ?? first.date;
    const end = formatPriceMonth(lastPoint.date) ?? lastPoint.date;
    content = (
      <>
        <View style={styles.changeRow}>
          <MaterialCommunityIcons name={change > 0 ? "arrow-up" : change < 0 ? "arrow-down" : "minus"} size={22} color={colors.text} />
          <Text style={styles.changeLine}>{changeText}</Text>
        </View>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityLabel={t("market.trendLabel", { from: formatAmount(first.price), start, to: formatAmount(lastPoint.price), end })}
        >
          {width > 0 && <Sparkline points={points} width={width} />}
        </View>
        <View style={styles.trendAxis}>
          <Text style={styles.trendNote}>{start}</Text>
          <Text style={styles.trendNote}>{end}</Text>
        </View>
      </>
    );
  }
  return (
    <View style={styles.trend}>
      <Text style={styles.trendTitle}>{t("market.trendTitle")}</Text>
      {content}
    </View>
  );
}

const SPARK_HEIGHT = 64;

function Sparkline({ points, width }: { points: Point[]; width: number }) {
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;   // a flat line sits in the middle instead of dividing by zero
  const pad = 4;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (p.price - min) / span) * (SPARK_HEIGHT - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Svg width={width} height={SPARK_HEIGHT}>
      <Polyline points={coords} fill="none" stroke={colors.price} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
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

const styles = themed(() => StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  content:       { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },

  header:        { gap: spacing.md, marginBottom: spacing.lg },
  searchBox:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 52,
                   borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  searchInput:   { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  scopeRow:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  regionLine:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  regionName:    { ...type.body, fontFamily: fonts.bold, color: colors.text, flex: 1 },
  changeText:    { ...type.body, fontFamily: fonts.bold, color: colors.primary },
  banner:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.md,
                   borderRadius: radius.sm, backgroundColor: colors.dangerBg },
  bannerText:    { flex: 1, ...type.caption, color: colors.danger },

  sectionTitle:  { ...type.overline, color: colors.textSecondary, marginBottom: spacing.xs },
  olderHeader:   { marginTop: spacing.xl, gap: spacing.xs },
  olderToggle:   { alignSelf: "flex-start", paddingHorizontal: 0 },
  olderHint:     { ...type.caption, color: colors.textSecondary, marginBottom: spacing.xs },

  row:           { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 72, paddingVertical: spacing.md },
  rowInfo:       { flex: 1 },
  rowCrop:       { ...type.body, fontFamily: fonts.bold, color: colors.text },
  rowMeta:       { ...type.caption, color: colors.textSecondary },
  rowPrice:      { flexShrink: 0, justifyContent: "flex-end" },
  divider:       { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 26 + spacing.md },

  sheetBody:     { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  sheetCrop:     { ...type.headline, color: colors.text },
  sheetRegion:   { ...type.body, color: colors.textSecondary },
  // The price board: edged in earth like a cardboard sign
  board:         { padding: spacing.lg, borderRadius: radius.sm, backgroundColor: colors.card,
                   borderWidth: 2, borderColor: colors.earth, gap: spacing.sm },
  details:       { gap: spacing.xs, alignItems: "flex-start" },
  detailText:    { ...type.caption, color: colors.accent },

  trend:         { gap: spacing.sm },
  trendTitle:    { ...type.body, fontFamily: fonts.bold, color: colors.text },
  trendLoading:  { alignSelf: "flex-start" },
  trendNote:     { ...type.caption, color: colors.textSecondary },
  changeRow:     { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  changeLine:    { ...type.body, color: colors.text, flex: 1 },
  trendAxis:     { flexDirection: "row", justifyContent: "space-between" },
}));
