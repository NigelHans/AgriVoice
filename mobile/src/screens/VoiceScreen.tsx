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
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";
import { Audio } from "expo-av";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { sendVoiceQuery, sendTextQuery } from "../services/api";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import { useLanguage } from "../context/LanguageContext";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import LanguagePicker from "../components/LanguagePicker";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { appendHistory } from "../services/historyStorage";
import type { AssistantReply } from "../types";
import { colors, spacing, radius, cardShadow, type } from "../theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Ready → Listening → Processing → Answer; the badge shown above the microphone
const PHASES = {
  ready:      { key: "voice.stateReady",      tone: "neutral", icon: "microphone-outline" },
  listening:  { key: "voice.stateListening",  tone: "danger",  icon: "record-circle-outline" },
  processing: { key: "voice.stateProcessing", tone: "warning", icon: "timer-sand" },
  answer:     { key: "voice.stateAnswer",     tone: "success", icon: "check-circle-outline" },
} as const;

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

  // Derived from the existing state; no new logic
  const phase = isRecording ? "listening" : isLoading ? "processing" : reply ? "answer" : "ready";
  const sendDisabled = isLoading || isRecording || !typedText.trim();

  // Gentle pulsing ring around the microphone while listening
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <LanguagePicker />

      <View style={styles.regionRow}>
        <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.accent} />
        <Text style={styles.regionText}>{t("voice.regionLine", { region: regionLabel })}</Text>
      </View>

      <View style={styles.micArea}>
        <Badge label={t(PHASES[phase].key)} tone={PHASES[phase].tone} icon={PHASES[phase].icon} />
        <View style={styles.micWrap}>
          {isRecording && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
                },
              ]}
            />
          )}
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micButtonActive, isLoading && styles.micButtonBusy]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? t("voice.micStopLabel") : t("voice.micStartLabel")}
            accessibilityState={{ disabled: isLoading, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.onPrimary} />
            ) : (
              <MaterialCommunityIcons name={isRecording ? "stop" : "microphone"} size={72} color={colors.onPrimary} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {isLoading ? t("voice.loading") : isRecording ? t("voice.hintRecording") : t("voice.hintIdle")}
        </Text>
      </View>

      {error && (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.danger} />
            <Text style={styles.errorText}>
              {t(error.key, error.values)}
              {error.typeInstead ? `\n${t("voice.typeInstead")}` : ""}
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.typeRow}>
        <TextInput
          style={styles.input}
          placeholder={t("voice.typePlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={typedText}
          onChangeText={setTypedText}
          multiline
          editable={!isLoading}
          accessibilityLabel={t("voice.typePlaceholder")}
        />
        <TouchableOpacity
          style={[styles.sendButton, sendDisabled && styles.buttonDisabled]}
          onPress={sendTyped}
          disabled={sendDisabled}
          accessibilityRole="button"
          accessibilityLabel={t("voice.sendLabel")}
          accessibilityState={{ disabled: sendDisabled }}
        >
          <MaterialCommunityIcons name="send" size={24} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>

      {transcript !== "" && (
        <Card style={styles.card}>
          <CardTitle icon="account-voice" text={t("voice.yourQuestion")} />
          {isEditing ? (
            <>
              <TextInput
                style={[styles.input, styles.editInput]}
                value={editedText}
                onChangeText={setEditedText}
                multiline
                autoFocus
                editable={!isLoading}
                accessibilityLabel={t("voice.yourQuestion")}
              />
              <View style={styles.editActions}>
                <Button label={t("voice.cancel")} variant="text" onPress={() => setIsEditing(false)} disabled={isLoading} />
                <Button label={t("voice.askAgain")} icon="send" onPress={askEdited} disabled={isLoading || !editedText.trim()} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.questionText} selectable>"{transcript}"</Text>
              <Button
                label={t("voice.edit")}
                variant="text"
                icon="pencil-outline"
                onPress={startEditing}
                disabled={isLoading}
                style={styles.editButton}
              />
            </>
          )}
        </Card>
      )}

      {reply && reply.mode === "negotiation" && (
        <Card style={styles.card}>
          <CardTitle icon="scale-balance" text={t("voice.analysisTitle", { region: regionLabel })} />
          <DataRow label={t("voice.crop")} value={reply.extracted_data.crop ?? "—"} />
          <DataRow label={t("voice.weight")} value={formatNumber(reply.extracted_data.weight, " kg")} />
          <DataRow label={t("voice.offer")} value={formatPeso(reply.extracted_data.offer_per_kg, " / kg")} color={colors.danger} />
          <DataRow label={priceLabel(reply, t)} value={formatPeso(reply.fair_price_per_kg, " / kg")} color={colors.primary} />
          {reply.total_market_value !== null && (
            <DataRow
              label={t("voice.totalValue")}
              value={`₱${reply.total_market_value.toLocaleString()}`}
              color={colors.primary}
              strong
            />
          )}
        </Card>
      )}

      {reply && (
        <Card style={[styles.card, styles.answerCard]}>
          <CardTitle
            icon="lightbulb-on-outline"
            text={reply.mode === "negotiation" ? t("voice.strategyTitle") : t("voice.adviceTitle")}
          />
          <AnswerText text={reply.strategy} />
        </Card>
      )}
    </ScrollView>
  );
}

function CardTitle({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.cardTitleRow}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      <Text style={styles.cardTitle} accessibilityRole="header">{text}</Text>
    </View>
  );
}

function DataRow({ label, value, color = colors.text, strong = false }: {
  label: string; value: string; color?: string; strong?: boolean;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, { color }, strong && styles.dataValueStrong]}>{value}</Text>
    </View>
  );
}

// Shows the AI's answer exactly as returned. Only lines it starts with "•" are laid out as a
// list (the bullet becomes a dot beside the text); no words are added, removed or reworded.
function AnswerText({ text }: { text: string }) {
  return (
    <View>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*•\s?/.exec(line);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.answerText} selectable>{line.slice(bullet[0].length)}</Text>
            </View>
          );
        }
        return line.trim() === ""
          ? <View key={i} style={styles.paragraphGap} />
          : <Text key={i} style={styles.answerText} selectable>{line}</Text>;
      })}
    </View>
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
  screen:          { flex: 1, backgroundColor: colors.background },
  container:       { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },

  regionRow:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.md },
  regionText:      { ...type.caption, color: colors.textSecondary, flexShrink: 1 },

  micArea:         { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.md, gap: spacing.md },
  micWrap:         { width: 208, height: 208, alignItems: "center", justifyContent: "center" },
  pulse:           { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: colors.danger },
  micButton:       { width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primary,
                     alignItems: "center", justifyContent: "center", ...cardShadow, elevation: 6 },
  micButtonActive: { backgroundColor: colors.danger },
  micButtonBusy:   { backgroundColor: colors.secondary },
  hint:            { ...type.bodyLarge, fontWeight: "600", color: colors.text, textAlign: "center" },

  errorCard:       { marginTop: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.danger },
  errorRow:        { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  errorText:       { ...type.body, color: colors.danger, flex: 1 },

  typeRow:         { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  input:           { flex: 1, minHeight: 52, maxHeight: 140, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                     borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                     ...type.body, color: colors.text },
  editInput:       { flex: 0, marginTop: spacing.xs },
  sendButton:      { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonDisabled:  { opacity: 0.45 },

  card:            { marginTop: spacing.lg },
  answerCard:      { borderLeftWidth: 4, borderLeftColor: colors.primary },
  cardTitleRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  cardTitle:       { ...type.bodyLarge, fontWeight: "700", color: colors.primary, flex: 1 },
  questionText:    { ...type.bodyLarge, color: colors.text },
  editButton:      { alignSelf: "flex-end", marginTop: spacing.sm },
  editActions:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },

  dataRow:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md,
                     paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dataLabel:       { ...type.body, color: colors.textSecondary, flex: 1 },
  dataValue:       { ...type.bodyLarge, fontWeight: "700", textAlign: "right" },
  dataValueStrong: { ...type.title },

  answerText:      { ...type.body, color: colors.text, flex: 1 },
  bulletRow:       { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  bulletDot:       { ...type.body, fontWeight: "700", color: colors.primary },
  paragraphGap:    { height: spacing.sm },
});
