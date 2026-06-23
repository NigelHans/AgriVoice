/**
 * HistoryScreen — Shows past voice queries saved to AsyncStorage.
 * Each entry shows the transcript and AI reply for reference.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const HISTORY_KEY = "agrivoice_history";

export type HistoryEntry = {
  id: string;
  timestamp: string;
  transcript: string;
  reply: string;
  language: string;
};

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const load = async () => {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (raw) setHistory(JSON.parse(raw));
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const clearHistory = () => {
    Alert.alert("Clear History", "Burahin ang lahat ng naka-save na tanong?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => { await AsyncStorage.removeItem(HISTORY_KEY); setHistory([]); } },
    ]);
  };

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={clearHistory}>
          <Text style={styles.clearText}>🗑️ Burahin Lahat</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={[...history].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.time}>{new Date(item.timestamp).toLocaleString("en-PH")}</Text>
            <Text style={styles.q}>🎤 {item.transcript}</Text>
            <Text style={styles.a}>🤖 {item.reply}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Wala pang naka-save na tanong.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f9f5", padding: 12 },
  clearBtn:  { alignSelf: "flex-end", marginBottom: 8 },
  clearText: { color: "#c0392b", fontWeight: "bold" },
  card:      { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10, elevation: 2 },
  time:      { fontSize: 11, color: "#aaa", marginBottom: 6 },
  q:         { fontWeight: "bold", color: "#333", marginBottom: 4 },
  a:         { color: "#555", lineHeight: 20 },
  empty:     { textAlign: "center", marginTop: 60, color: "#aaa", fontSize: 15 },
});
