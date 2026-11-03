/**
 * HistoryScreen — Shows past voice queries saved to AsyncStorage.
 * Each entry shows the transcript and AI reply; tapping one opens the full details.
 */
import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { loadHistory, deleteHistoryEntry, clearHistory } from "../services/historyStorage";
import { LANGUAGES } from "../context/LanguageContext";
import { useT, type StringKey, type Translate } from "../i18n";
import type { HistoryEntry } from "../types";

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

  if (status === "loading") return <ActivityIndicator size="large" color="#1a7a1a" style={{ flex: 1, marginTop: 40 }} />;

  if (status === "unreadable") {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={56} color="#c0392b" />
        <Text style={styles.errorTitle}>{t("history.unreadableTitle")}</Text>
        <Text style={styles.emptyText}>{t("history.unreadableText")}</Text>
        {actionError && <Text style={styles.actionError}>{t(actionError)}</Text>}
        <TouchableOpacity style={styles.primaryBtn} onPress={load}>
          <Text style={styles.primaryText}>{t("common.retry")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearAllLink} onPress={confirmClearAll}>
          <Text style={styles.clearText}>{t("history.clearAndRestart")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={confirmClearAll}>
          <Text style={styles.clearText}>{t("history.clearAll")}</Text>
        </TouchableOpacity>
      )}
      {actionError && !selected && <Text style={styles.actionError}>{t(actionError)}</Text>}
      <FlatList
        data={[...history].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => { setActionError(null); setSelected(item); }}>
            <View style={styles.metaRow}>
              <Text style={styles.time}>{formatTimestamp(item.timestamp, t)}</Text>
              {item.language !== "" && <Text style={styles.lang}>{languageLabel(item.language)}</Text>}
            </View>
            <Text style={styles.q} numberOfLines={2}>🎤 {item.transcript || "—"}</Text>
            <Text style={styles.a} numberOfLines={3}>🤖 {item.reply || "—"}</Text>
            <Text style={styles.viewHint}>{t("history.view")}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="chatbubbles-outline" size={56} color="#b5cbb5" />
            <Text style={styles.emptyTitle}>{t("history.emptyTitle")}</Text>
            <Text style={styles.emptyText}>{t("history.emptyText")}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate("Voice" as never)}>
              <Text style={styles.primaryText}>{t("history.askNow")}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.closeText}>{t("history.close")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(selected)}>
                <Text style={styles.clearText}>{t("history.delete")}</Text>
              </TouchableOpacity>
            </View>
            {actionError && <Text style={styles.actionError}>{t(actionError)}</Text>}
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.metaRow}>
                <Text style={styles.time}>{formatTimestamp(selected.timestamp, t)}</Text>
                {selected.language !== "" && <Text style={styles.lang}>{languageLabel(selected.language)}</Text>}
              </View>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>{t("voice.yourQuestion")}</Text>
                <Text style={styles.detailText}>{selected.transcript || "—"}</Text>
              </View>
              <View style={[styles.detailCard, styles.replyCard]}>
                <Text style={styles.detailLabel}>{t("history.answer")}</Text>
                <Text style={styles.detailText}>{selected.reply || "—"}</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
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

function languageLabel(code: string): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? `${lang.flag} ${lang.code.toUpperCase()}` : code.toUpperCase();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f9f5", padding: 12 },
  center:    { justifyContent: "center", alignItems: "center", padding: 24 },
  clearBtn:  { alignSelf: "flex-end", marginBottom: 8 },
  clearText: { color: "#c0392b", fontWeight: "bold" },
  card:      { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, elevation: 2 },
  metaRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  time:      { fontSize: 11, color: "#aaa" },
  lang:      { fontSize: 11, color: "#1a7a1a", fontWeight: "600" },
  q:         { fontWeight: "bold", color: "#333", marginBottom: 4 },
  a:         { color: "#555", lineHeight: 20 },
  viewHint:  { alignSelf: "flex-end", marginTop: 6, fontSize: 12, color: "#1a7a1a", fontWeight: "600" },
  emptyBox:  { alignItems: "center", marginTop: 60, paddingHorizontal: 24 },
  emptyTitle:{ fontSize: 16, fontWeight: "bold", color: "#555", marginTop: 12, textAlign: "center" },
  emptyText: { fontSize: 14, color: "#888", marginTop: 6, marginBottom: 16, textAlign: "center", lineHeight: 20 },
  errorTitle:{ fontSize: 16, fontWeight: "bold", color: "#c0392b", marginTop: 12, textAlign: "center" },
  actionError: { color: "#c0392b", fontSize: 13, textAlign: "center", marginBottom: 8, paddingHorizontal: 12 },
  primaryBtn:  { backgroundColor: "#1a7a1a", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  primaryText: { color: "#fff", fontWeight: "bold" },
  clearAllLink:{ marginTop: 16 },
  modal:       { flex: 1, backgroundColor: "#f5f9f5" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eaeaea", backgroundColor: "#fff" },
  closeText:   { color: "#1a7a1a", fontWeight: "bold", fontSize: 15 },
  modalBody:   { padding: 16 },
  detailCard:  { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 12, elevation: 2 },
  replyCard:   { borderLeftWidth: 4, borderLeftColor: "#1a7a1a" },
  detailLabel: { fontWeight: "bold", color: "#1a7a1a", marginBottom: 6 },
  detailText:  { fontSize: 15, color: "#333", lineHeight: 22 },
});
