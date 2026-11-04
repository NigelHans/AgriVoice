/**
 * HistoryScreen — Shows past voice queries saved to AsyncStorage.
 * Each entry shows the transcript and AI reply; tapping one opens the full details.
 */
import React, { useState, useCallback, useRef } from "react";
import { View, Text, SectionList, StyleSheet, Alert, ScrollView } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { loadHistory, deleteHistoryEntry, clearHistory } from "../services/historyStorage";
import { LANGUAGES } from "../context/LanguageContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT, type StringKey, type Translate } from "../i18n";
import type { HistoryEntry } from "../types";
import StatusView from "../components/StatusView";
import Surface from "../components/Surface";
import Button from "../components/Button";
import Badge from "../components/Badge";
import BottomSheet from "../components/BottomSheet";
import FadeInView from "../components/FadeInView";
import PressableScale from "../components/PressableScale";
import { colors, spacing, radius, type, fonts, themed } from "../theme";

type Status = "loading" | "ready" | "unreadable";

export default function HistoryScreen() {
  const t = useT();
  const navigation = useNavigation();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  // Farmer-friendly message for a failed delete or clear, stored as a key so it follows a
  // language change; details go to console.warn
  const [actionError, setActionError] = useState<StringKey | null>(null);

  // Always read from storage, so the list matches what is actually saved
  const load = async () => {
    try {
      setHistory(await loadHistory());
      setStatus("ready");
    } catch (err) {
      console.warn("Could not read saved history", err);
      setStatus("unreadable");
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const confirmDelete = (entry: HistoryEntry) => {
    Alert.alert(t("history.deleteConfirmTitle"), t("history.deleteConfirmText"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("history.deleteButton"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteHistoryEntry(entry.id);
            setSelected(null);
            setActionError(null);
          } catch (err) {
            console.warn("Could not delete history entry", err);
            setActionError("history.deleteFailed");
          }
          await load();
        },
      },
    ]);
  };

  const confirmClearAll = () => {
    const message = status === "unreadable"
      ? t("history.clearUnreadableConfirmText")
      : t("history.clearConfirmText");
    Alert.alert(t("history.clearConfirmTitle"), message, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("history.clearButton"),
        style: "destructive",
        onPress: async () => {
          try {
            await clearHistory();
            setActionError(null);
          } catch (err) {
            console.warn("Could not clear history", err);
            setActionError("history.clearFailed");
          }
          await load();
        },
      },
    ]);
  };

  if (status === "loading") return <StatusView loading />;

  if (status === "unreadable") {
    return (
      <StatusView
        tone="error"
        icon="alert-circle-outline"
        title={t("history.unreadableTitle")}
        text={t("history.unreadableText")}
        detail={actionError ? t(actionError) : undefined}
        actionLabel={t("common.retry")}
        onAction={load}
        secondaryLabel={t("history.clearAndRestart")}
        onSecondary={confirmClearAll}
      />
    );
  }

  const sections = groupByDay([...history].reverse(), t);

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <View style={styles.toolbar}>
          <Button label={t("history.clearAll")} variant="danger" icon="delete-sweep-outline" onPress={confirmClearAll} />
        </View>
      )}
      {actionError && !selected && <ActionError text={t(actionError)} />}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
        renderSectionHeader={({ section }) => <Text style={styles.groupTitle} accessibilityRole="header">{section.title}</Text>}
        renderItem={({ item, index, section }) => (
          <View style={styles.timelineRow}>
            <View style={styles.rail}>
              <View style={[styles.railLine, index === section.data.length - 1 && styles.railLineEnd]} />
              <View style={styles.railDot} />
            </View>
            <FadeInView index={index < 6 ? index : 0} style={styles.cardWrap}>
              <PressableScale
                onPress={() => { setActionError(null); setSelected(item); }}
                accessibilityRole="button"
                accessibilityLabel={`${item.transcript || "—"}. ${t("history.view")}`}
              >
                <Surface style={styles.card}>
                  <Meta entry={item} t={t} />
                  <Text style={styles.question} numberOfLines={2}>{item.transcript || "—"}</Text>
                  <View style={styles.answerRow}>
                    <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.secondary} />
                    <Text style={styles.answer} numberOfLines={2}>{item.reply || "—"}</Text>
                  </View>
                  <View style={styles.viewRow}>
                    <Text style={styles.viewText}>{t("history.view")}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
                  </View>
                </Surface>
              </PressableScale>
            </FadeInView>
          </View>
        )}
        ListEmptyComponent={
          <StatusView
            icon="chatbubbles-outline"
            title={t("history.emptyTitle")}
            text={t("history.emptyText")}
            actionLabel={t("history.askNow")}
            onAction={() => navigation.navigate("Voice" as never)}
          />
        }
      />

      <DetailSheet
        entry={selected}
        onClose={() => setSelected(null)}
        onDelete={confirmDelete}
        actionError={actionError ? t(actionError) : null}
        t={t}
      />
    </View>
  );
}

// Today / Yesterday / Earlier, keeping the newest-first order inside each group
function groupByDay(entries: HistoryEntry[], t: Translate) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const groups = [
    { key: "today", title: t("history.groupToday"), data: [] as HistoryEntry[] },
    { key: "yesterday", title: t("history.groupYesterday"), data: [] as HistoryEntry[] },
    { key: "earlier", title: t("history.groupEarlier"), data: [] as HistoryEntry[] },
  ];
  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    // Unknown dates go to "Earlier"; dates after today (clock changes) count as today
    const daysAgo = isNaN(date.getTime()) ? Infinity : Math.round((today - startOfDay(date)) / 86_400_000);
    groups[daysAgo <= 0 ? 0 : daysAgo === 1 ? 1 : 2].data.push(entry);
  }
  return groups.filter((g) => g.data.length > 0);
}

// The full question and answer in a bottom sheet. Keeps showing the last entry while the sheet slides away.
function DetailSheet({ entry, onClose, onDelete, actionError, t }: {
  entry: HistoryEntry | null;
  onClose: () => void;
  onDelete: (entry: HistoryEntry) => void;
  actionError: string | null;
  t: Translate;
}) {
  const last = useRef<HistoryEntry | null>(null);
  if (entry) last.current = entry;
  const shown = entry ?? last.current;
  return (
    <BottomSheet visible={entry !== null} onClose={onClose} closeLabel={t("history.close")}>
      {shown && (
        <>
          <View style={styles.sheetHeader}>
            <Button label={t("history.close")} variant="text" icon="chevron-down" onPress={onClose} />
            <Button label={t("history.delete")} variant="danger" icon="delete-outline" onPress={() => onDelete(shown)} />
          </View>
          {actionError && <ActionError text={actionError} />}
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Meta entry={shown} t={t} />
            <Surface variant="raised" style={styles.detailCard}>
              <DetailTitle icon="account-voice" text={t("voice.yourQuestion")} />
              <Text style={styles.detailText} selectable>{shown.transcript || "—"}</Text>
            </Surface>
            <Surface variant="raised" style={[styles.detailCard, styles.replyCard]}>
              <DetailTitle icon="lightbulb-on-outline" text={t("history.answer")} />
              <Text style={styles.detailText} selectable>{shown.reply || "—"}</Text>
            </Surface>
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

// When it was asked, and in which language
function Meta({ entry, t }: { entry: HistoryEntry; t: Translate }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.timeRow}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.time}>{formatTimestamp(entry.timestamp, t)}</Text>
      </View>
      {entry.language !== "" && <Badge label={languageLabel(entry.language)} icon="translate" />}
    </View>
  );
}

function DetailTitle({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.detailTitleRow}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      <Text style={styles.detailTitle} accessibilityRole="header">{text}</Text>
    </View>
  );
}

function ActionError({ text }: { text: string }) {
  return (
    <View style={styles.actionError} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
      <Text style={styles.actionErrorText}>{text}</Text>
    </View>
  );
}

// "Today, 3:42 PM", "Yesterday, 9:10 AM" or "Nov 2, 2026, 3:42 PM" (dates keep the en-PH format)
function formatTimestamp(iso: string, t: Translate): string {
  const date = new Date(iso);
  if (!iso || isNaN(date.getTime())) return t("history.unknownTime");
  const time = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (daysAgo === 0) return t("history.today", { time });
  if (daysAgo === 1) return t("history.yesterday", { time });
  return `${date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

// Full language name; an unknown saved code is shown as it was stored
function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

const styles = themed(() => StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  toolbar:         { alignItems: "flex-end", paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  emptyList:       { flexGrow: 1 },
  list:            { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  groupTitle:      { ...type.overline, color: colors.primary, marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: 28 },

  // Timeline: a thin earth-brown rail with a clay dot beside each card
  timelineRow:     { flexDirection: "row" },
  rail:            { width: 28, alignItems: "center" },
  railLine:        { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.earth, opacity: 0.6 },
  railLineEnd:     { bottom: "60%" },
  railDot:         { marginTop: spacing.xl, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary,
                     borderWidth: 2, borderColor: colors.background },
  cardWrap:        { flex: 1, paddingBottom: spacing.md },
  card:            { gap: spacing.sm },
  metaRow:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  timeRow:         { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  time:            { ...type.caption, color: colors.textSecondary },
  question:        { ...type.bodyLarge, fontFamily: fonts.bold, color: colors.text },
  answerRow:       { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  answer:          { ...type.body, color: colors.textSecondary, flex: 1 },
  viewRow:         { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", minHeight: 32 },
  viewText:        { ...type.body, fontFamily: fonts.bold, color: colors.primary },

  actionError:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm,
                     padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  actionErrorText: { ...type.caption, color: colors.danger, flex: 1 },

  sheetHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xs },
  sheetBody:       { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  detailCard:      { gap: spacing.sm },
  replyCard:       { borderLeftWidth: 3, borderLeftColor: colors.primary },
  detailTitleRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detailTitle:     { ...type.bodyLarge, fontFamily: fonts.bold, color: colors.text, flex: 1 },
  detailText:      { ...type.body, color: colors.text },
}));
