/**
 * HistoryScreen — Shows past voice queries saved to AsyncStorage.
 * Each entry shows the transcript and AI reply; tapping one opens the full details.
 */
import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { loadHistory, deleteHistoryEntry, clearHistory } from "../services/historyStorage";
import { LANGUAGES } from "../context/LanguageContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useT, type StringKey, type Translate } from "../i18n";
import type { HistoryEntry } from "../types";
import StatusView from "../components/StatusView";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { colors, spacing, radius, cardShadow, type } from "../theme";

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

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <View style={styles.toolbar}>
          <Button label={t("history.clearAll")} variant="danger" icon="delete-sweep-outline" onPress={confirmClearAll} />
        </View>
      )}
      {actionError && !selected && <ActionError text={t(actionError)} />}
      <FlatList
        data={[...history].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => { setActionError(null); setSelected(item); }}
            accessibilityRole="button"
            accessibilityLabel={`${item.transcript || "—"}. ${t("history.view")}`}
          >
            <Meta entry={item} t={t} />
            <View style={styles.line}>
              <MaterialCommunityIcons name="account-voice" size={20} color={colors.primary} />
              <Text style={styles.question} numberOfLines={2}>{item.transcript || "—"}</Text>
            </View>
            <View style={styles.line}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={colors.secondary} />
              <Text style={styles.answer} numberOfLines={2}>{item.reply || "—"}</Text>
            </View>
            <View style={styles.viewRow}>
              <Text style={styles.viewText}>{t("history.view")}</Text>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
            </View>
          </TouchableOpacity>
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

      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Button label={t("history.close")} variant="text" icon="chevron-left" onPress={() => setSelected(null)} />
              <Button label={t("history.delete")} variant="danger" icon="delete-outline" onPress={() => confirmDelete(selected)} />
            </View>
            {actionError && <ActionError text={t(actionError)} />}
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Meta entry={selected} t={t} />
              <Card style={styles.detailCard}>
                <DetailTitle icon="account-voice" text={t("voice.yourQuestion")} />
                <Text style={styles.detailText} selectable>{selected.transcript || "—"}</Text>
              </Card>
              <Card style={[styles.detailCard, styles.replyCard]}>
                <DetailTitle icon="lightbulb-on-outline" text={t("history.answer")} />
                <Text style={styles.detailText} selectable>{selected.reply || "—"}</Text>
              </Card>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

// When it was asked, and in which language
function Meta({ entry, t }: { entry: HistoryEntry; t: Translate }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.timeRow}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.textMuted} />
        <Text style={styles.time}>{formatTimestamp(entry.timestamp, t)}</Text>
      </View>
      {entry.language !== "" && <Badge label={languageLabel(entry.language)} icon="translate" />}
    </View>
  );
}

function DetailTitle({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.detailTitleRow}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
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

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  toolbar:         { alignItems: "flex-end", paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  emptyList:       { flexGrow: 1 },
  list:            { padding: spacing.lg, paddingTop: spacing.sm },

  card:            { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...cardShadow },
  metaRow:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap",
                     gap: spacing.sm, marginBottom: spacing.md },
  timeRow:         { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  time:            { ...type.caption, color: colors.textMuted },
  line:            { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  question:        { ...type.bodyLarge, fontWeight: "700", color: colors.text, flex: 1 },
  answer:          { ...type.body, color: colors.textSecondary, flex: 1 },
  viewRow:         { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", minHeight: 32 },
  viewText:        { ...type.body, fontWeight: "700", color: colors.primary },

  actionError:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm,
                     padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  actionErrorText: { ...type.caption, color: colors.danger, flex: 1 },

  modal:           { flex: 1, backgroundColor: colors.background },
  modalHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xs,
                     paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.card },
  modalBody:       { padding: spacing.lg },
  detailCard:      { marginTop: spacing.md },
  replyCard:       { borderLeftWidth: 4, borderLeftColor: colors.primary },
  detailTitleRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  detailTitle:     { ...type.bodyLarge, fontWeight: "700", color: colors.primary, flex: 1 },
  detailText:      { ...type.body, color: colors.text },
});
