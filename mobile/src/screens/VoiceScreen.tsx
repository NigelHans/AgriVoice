/**
 * VoiceScreen — The main screen of AgriVoice.
 *
 * Flow:
 * 1. Farmer taps the big microphone button → recording starts
 * 2. Farmer taps again → recording stops → audio sent to backend
 * 3. Backend returns transcript + AI reply
 * 4. Reply is displayed (and optionally played via TTS)
 */
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { sendVoiceQuery } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import LanguagePicker from "../components/LanguagePicker";

// STEP 1: Define the TypeScript rule for the props coming from App.tsx
interface VoiceScreenProps {
  selectedRegion: string;
}

// STEP 2: Accept selectedRegion inside the component function arguments
export default function VoiceScreen({ selectedRegion }: VoiceScreenProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");

  // Changing this state to hold an object or any type instead of a pure string,
  // since the backend reply now includes structured data fields like weights, prices, and strategy text.
  const [reply, setReply] = useState<any>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const { language } = useLanguage();

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission Denied", "Microphone access is required.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    setIsLoading(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error("No audio URI");

      // STEP 3: Pass selectedRegion down into your API helper function call
      const result = await sendVoiceQuery(uri, language, selectedRegion);

      setTranscript(result.transcript);
      setReply(result.reply);
    } catch (err) {
      Alert.alert("Error", "Could not process your voice query. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hint}>
        {isRecording ? "Magsalita na... (Recording...)" : "I-tap ang mikropono para magtanong"}
      </Text>

      <LanguagePicker />

      <TouchableOpacity
        style={[styles.micButton, isRecording && styles.micButtonActive]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isLoading}
      >
        <Ionicons name={isRecording ? "stop" : "mic"} size={64} color="#fff" />
      </TouchableOpacity>

      {isLoading && <ActivityIndicator size="large" color="#1a7a1a" style={{ marginTop: 24 }} />}

      {transcript !== "" && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Inyong Tanong:</Text>
          <Text style={styles.cardText}>"{transcript}"</Text>
        </View>
      )}

      {/* STEP 4: Render the structured layout results nicely if a reply exists */}
      {reply && (
        <View style={[styles.card, styles.replyCard]}>
          <Text style={styles.cardLabel}>📊 Pagsusuri ng Halaga ({selectedRegion}):</Text>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Halaman / Crop:</Text>
            <Text style={styles.dataValue}>{reply.extracted_data?.crop}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Timbang / Weight:</Text>
            <Text style={styles.dataValue}>{reply.extracted_data?.weight} kg</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Alok ng Kumpra / Middleman Offer:</Text>
            <Text style={styles.dataValueOffer}>₱{reply.extracted_data?.offer_per_kg} / kg</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Patas na Presyo (UN-WFP):</Text>
            <Text style={styles.dataValueFair}>₱{reply.fair_price_per_kg} / kg</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Kabuuang Patas na Halaga:</Text>
            <Text style={styles.totalValue}>₱{reply.total_market_value?.toLocaleString()}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>💡 Diskarte sa Pakikipagtawaran:</Text>
          <Text style={styles.cardText}>{reply.strategy}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 24, backgroundColor: "#f5f9f5" },
  hint: { fontSize: 16, color: "#555", marginBottom: 16, textAlign: "center" },
  micButton: { width: 140, height: 140, borderRadius: 70, backgroundColor: "#1a7a1a", justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8 },
  micButtonActive: { backgroundColor: "#c0392b" },
  card: { width: "100%", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 20, elevation: 3 },
  replyCard: { borderLeftWidth: 4, borderLeftColor: "#1a7a1a" },
  cardLabel: { fontWeight: "bold", color: "#1a7a1a", marginBottom: 6 },
  cardText: { fontSize: 15, color: "#333", lineHeight: 22 },

  // New formatting style lines for the data card dashboard display table:
  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  dataLabel: { fontSize: 14, color: "#666" },
  dataValue: { fontSize: 14, fontWeight: "bold", color: "#333" },
  dataValueOffer: { fontSize: 14, fontWeight: "bold", color: "#c0392b" },
  dataValueFair: { fontSize: 14, fontWeight: "bold", color: "#1a7a1a" },
  totalValue: { fontSize: 15, fontWeight: "bold", color: "#1a7a1a" },
  divider: { height: 1, backgroundColor: "#eaeaea", marginVertical: 12 }
});