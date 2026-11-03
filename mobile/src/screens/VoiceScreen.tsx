/**
 * VoiceScreen — The main screen of AgriVoice.
 *
 * Flow:
 * 1. Farmer taps the big microphone button → recording starts
 * 2. Farmer taps again → recording stops → audio sent to backend
 * 3. Backend returns transcript + AI reply
 * 4. Reply is displayed (and optionally played via TTS)
 *
 * Without the microphone, the farmer can type the question instead. A recognised
 * transcript can be corrected and asked again; both go through /chat/ask.
 */
import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { sendVoiceQuery, sendTextQuery } from "../services/api";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import { useLanguage } from "../context/LanguageContext";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import LanguagePicker from "../components/LanguagePicker";
import { appendHistory } from "../services/historyStorage";
import type { AssistantReply } from "../types";

// Errors are stored as keys and translated when shown, so they follow a language change.
// `typeInstead` adds the "type your question below" hint.
type VoiceError = UiMessage & { typeInstead?: boolean };
const MIC_ERRORS: Record<"denied" | "blocked" | "start" | "stop", VoiceError> = {
  denied:  { key: "voice.micDenied", typeInstead: true },
  blocked: { key: "voice.micBlocked", typeInstead: true },
  start:   { key: "voice.micStart", typeInstead: true },
  stop:    { key: "voice.micStop" },
};

export default function VoiceScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");

  // Structured backend reply: negotiation figures (may be null) + strategy/advice text
  const [reply, setReply] = useState<AssistantReply | null>(null);

  // Farmer-friendly message shown inline; technical details go to console.warn
  const [error, setError] = useState<VoiceError | null>(null);
  const t = useT();
  const [typedText, setTypedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  // Synchronous guard: state updates are async, so a fast double tap could slip past isLoading
  const busyRef = useRef(false);
  const { language } = useLanguage();
  // Exact WFP spelling goes to the backend; the label is display-only
  const { region } = useRegion();
  const regionLabel = getRegionLabel(region);

  // Leaving the tab (or unmounting) mid-recording discards the recording and releases the mic
  useFocusEffect(useCallback(() => () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    recording?.stopAndUnloadAsync().catch((err) => console.warn("Could not release recorder", err));
  }, []));

  const startRecording = async () => {
    if (busyRef.current || recordingRef.current) return;
    setError(null);
    let recording: Audio.Recording | null = null;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError(permission.canAskAgain ? MIC_ERRORS.denied : MIC_ERRORS.blocked);
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.warn("Could not start recording", err);
      recording?.stopAndUnloadAsync().catch(() => {});
      setError(MIC_ERRORS.start);
    }
  };

  const stopRecording = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    // Cleared first, so a failed stop can never leave a stale recorder behind
    recordingRef.current = null;
    setIsRecording(false);

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (err) {
      console.warn("Could not stop recording", err);
    }
    if (!uri) {
      setError(MIC_ERRORS.stop);
      return;
    }

    const audioUri = uri;
    await submit(async () => {
      const result = await sendVoiceQuery(audioUri, language, region);
      return { question: result.transcript, reply: result.reply };
    });
  };

  // Runs one request at a time. On failure the previous question and reply stay on screen.
  const submit = async (
    request: () => Promise<{ question: string; reply: AssistantReply }>
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await request();
      setTranscript(result.question);
      setReply(result.reply);
      setIsEditing(false);
      // A storage failure is logged, never shown as a failed query
      await appendHistory({ transcript: result.question, reply: result.reply.strategy, language })
        .catch((err) => console.warn("Could not save query to history", err));
      return true;
    } catch (err) {
      console.warn("Query failed", err);
      setError(apiErrorMessage(err));
      return false;
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  };

  const askText = (message: string) =>
    submit(async () => {
      const result = await sendTextQuery(message, language, region);
      return { question: message, reply: result.analysis };
    });

  const sendTyped = async () => {
    const message = typedText.trim();
    if (!message) return;
    if (await askText(message)) setTypedText("");
  };

  const askEdited = async () => {
    const message = editedText.trim();
    if (!message) return;
    await askText(message);
  };

  const startEditing = () => {
    setEditedText(transcript);
    setIsEditing(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hint}>
        {isRecording ? t("voice.hintRecording") : t("voice.hintIdle")}
      </Text>

      <LanguagePicker />

      <Text style={styles.regionText}>{t("voice.regionLine", { region: regionLabel })}</Text>

      <TouchableOpacity
        style={[styles.micButton, isRecording && styles.micButtonActive]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isLoading}
      >
        <Ionicons name={isRecording ? "stop" : "mic"} size={64} color="#fff" />
      </TouchableOpacity>

      {isLoading && (
        <>
          <ActivityIndicator size="large" color="#1a7a1a" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>{t("voice.loading")}</Text>
        </>
      )}

      {error && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorText}>
            {t(error.key, error.values)}
            {error.typeInstead ? `\n${t("voice.typeInstead")}` : ""}
          </Text>
        </View>
      )}

      <View style={styles.typeRow}>
        <TextInput
          style={styles.input}
          placeholder={t("voice.typePlaceholder")}
          value={typedText}
          onChangeText={setTypedText}
          multiline
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (isLoading || isRecording || !typedText.trim()) && styles.buttonDisabled]}
          onPress={sendTyped}
          disabled={isLoading || isRecording || !typedText.trim()}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {transcript !== "" && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("voice.yourQuestion")}</Text>
          {isEditing ? (
            <>
              <TextInput
                style={[styles.input, styles.editInput]}
                value={editedText}
                onChangeText={setEditedText}
                multiline
                autoFocus
                editable={!isLoading}
              />
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => setIsEditing(false)} disabled={isLoading}>
                  <Text style={styles.linkMuted}>{t("voice.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.askButton, (isLoading || !editedText.trim()) && styles.buttonDisabled]}
                  onPress={askEdited}
                  disabled={isLoading || !editedText.trim()}
                >
                  <Text style={styles.askButtonText}>{t("voice.askAgain")}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.cardText}>"{transcript}"</Text>
              <TouchableOpacity style={styles.editLink} onPress={startEditing} disabled={isLoading}>
                <Text style={styles.link}>{t("voice.edit")}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* STEP 4: Render the structured layout results nicely if a reply exists */}
      {reply && (
        <View style={[styles.card, styles.replyCard]}>
          {reply.mode === "negotiation" && (
            <>
              <Text style={styles.cardLabel}>{t("voice.analysisTitle", { region: regionLabel })}</Text>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>{t("voice.crop")}</Text>
                <Text style={styles.dataValue}>{reply.extracted_data.crop ?? "—"}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>{t("voice.weight")}</Text>
                <Text style={styles.dataValue}>{formatNumber(reply.extracted_data.weight, " kg")}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>{t("voice.offer")}</Text>
                <Text style={styles.dataValueOffer}>{formatPeso(reply.extracted_data.offer_per_kg, " / kg")}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>{priceLabel(reply, t)}</Text>
                <Text style={styles.dataValueFair}>{formatPeso(reply.fair_price_per_kg, " / kg")}</Text>
              </View>

              {reply.total_market_value !== null && (
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>{t("voice.totalValue")}</Text>
                  <Text style={styles.totalValue}>₱{reply.total_market_value.toLocaleString()}</Text>
                </View>
              )}

              <View style={styles.divider} />
            </>
          )}

          <Text style={styles.cardLabel}>
            {reply.mode === "negotiation" ? t("voice.strategyTitle") : t("voice.adviceTitle")}
          </Text>
          <Text style={styles.cardText}>{reply.strategy}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toLocaleString()}${suffix}`;
}

function formatPeso(value: number | null, suffix = ""): string {
  return value === null ? "—" : `₱${value.toLocaleString()}${suffix}`;
}

// Only call a price "UN-WFP" when the backend actually found one
function priceLabel(reply: AssistantReply, t: Translate): string {
  switch (reply.price_status) {
    case "matched_region":
      return t("voice.priceMatched");
    case "other_region":
      // The region name comes from the backend and is not translated
      return t("voice.priceOtherRegion", { region: reply.price_region ?? "—" });
    case "unverified_legacy":
      return t("voice.priceLegacy");
    default:
      return t("voice.priceNone");
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 24, backgroundColor: "#f5f9f5" },
  hint: { fontSize: 16, color: "#555", marginBottom: 16, textAlign: "center" },
  regionText: { fontSize: 13, color: "#888", marginBottom: 20, textAlign: "center" },
  loadingText: { fontSize: 14, color: "#555", marginTop: 8, textAlign: "center" },
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
  divider: { height: 1, backgroundColor: "#eaeaea", marginVertical: 12 },

  // Inline errors, text fallback and transcript editing
  errorCard: { borderLeftWidth: 4, borderLeftColor: "#c0392b" },
  errorText: { fontSize: 14, color: "#c0392b", lineHeight: 20 },
  typeRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", marginTop: 20, gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", fontSize: 15, color: "#333" },
  editInput: { flex: 0, marginTop: 4 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a7a1a", justifyContent: "center", alignItems: "center" },
  buttonDisabled: { opacity: 0.4 },
  editLink: { alignSelf: "flex-end", marginTop: 8 },
  link: { color: "#1a7a1a", fontWeight: "600" },
  linkMuted: { color: "#888", fontWeight: "600" },
  editActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  askButton: { backgroundColor: "#1a7a1a", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  askButtonText: { color: "#fff", fontWeight: "bold" },
});