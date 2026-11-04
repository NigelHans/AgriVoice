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
  ScrollView,
  Animated,
  Easing,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Audio } from "expo-av";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { sendVoiceQuery, sendTextQuery } from "../services/api";
import { useT, apiErrorMessage, type Translate, type UiMessage } from "../i18n";
import { useLanguage } from "../context/LanguageContext";
import { useRegion, getRegionLabel } from "../context/RegionContext";
import LanguagePicker from "../components/LanguagePicker";
import Button from "../components/Button";
import FadeInView from "../components/FadeInView";
import PressableScale from "../components/PressableScale";
import PriceText from "../components/PriceText";
import FieldIllustration from "../components/FieldIllustration";
import { useReduceMotion } from "../components/motion";
import { appendHistory } from "../services/historyStorage";
import type { AssistantReply } from "../types";
import { colors, spacing, radius, type, fonts } from "../theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const MIC = 112;          // microphone disc (fixed at the bottom, within thumb reach)
const RING = MIC + 18;    // clay / ember ring around it
const ARC = RING + 18;    // processing arc

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
  const sendDisabled = isLoading || isRecording || !typedText.trim();
  const micTone = isRecording ? colors.danger : isLoading ? colors.secondary : colors.primary;
  const reduceMotion = useReduceMotion();
  const headerHeight = useHeaderHeight();

  // Ember pulse while listening; a slowly turning arc while processing. Both stop when idle.
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isRecording || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, reduceMotion, pulse]);
  useEffect(() => {
    if (!isLoading || reduceMotion) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [isLoading, reduceMotion, spin]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.contextBar}>
          <LanguagePicker />
          <View style={styles.regionRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.primary} />
            <Text style={styles.regionText}>{t("voice.regionLine", { region: regionLabel })}</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorPanel}>
            <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.danger} />
            <Text style={styles.errorText}>
              {t(error.key, error.values)}
              {error.typeInstead ? `\n${t("voice.typeInstead")}` : ""}
            </Text>
          </View>
        )}

        {/* Nothing asked yet: a quiet field picture, and the mic below invites the first question */}
        {transcript === "" && !reply && <FieldIllustration style={styles.field} />}

        {transcript !== "" && (
          <FadeInView style={styles.block}>
            <Text style={styles.label}>{asLabel(t("voice.yourQuestion"))}</Text>
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
              <View style={styles.questionRow}>
                <Text style={styles.questionText} selectable>"{transcript}"</Text>
                <Button label={t("voice.edit")} variant="text" icon="pencil-outline" onPress={startEditing} disabled={isLoading} />
              </View>
            )}
          </FadeInView>
        )}

        {reply && reply.mode === "negotiation" && (
          <FadeInView index={1} style={styles.block}>
            <BlockTitle icon="scale-balance" text={t("voice.analysisTitle", { region: regionLabel })} />
            <View style={styles.board}>
              <View style={styles.boardHead}>
                <Text style={styles.boardCrop} accessibilityLabel={`${asLabel(t("voice.crop"))}: ${reply.extracted_data.crop ?? "—"}`}>
                  {reply.extracted_data.crop ?? "—"}
                </Text>
                <Text style={styles.boardWeight} accessibilityLabel={`${asLabel(t("voice.weight"))}: ${formatNumber(reply.extracted_data.weight, " kg")}`}>
                  {formatNumber(reply.extracted_data.weight, " kg")}
                </Text>
              </View>
              <Text style={styles.boardLabel}>{asLabel(priceLabel(reply, t))}</Text>
              <PriceText value={reply.fair_price_per_kg} unit="kg" />
              <View style={styles.boardRule} />
              <View style={styles.boardRow}>
                <Text style={styles.boardRowLabel}>{asLabel(t("voice.offer"))}</Text>
                <PriceText value={reply.extracted_data.offer_per_kg} unit="kg" size="headline" color={colors.danger} />
              </View>
              {reply.total_market_value !== null && (
                <View style={styles.boardRow}>
                  <Text style={styles.boardRowLabel}>{asLabel(t("voice.totalValue"))}</Text>
                  <PriceText value={reply.total_market_value} size="headline" color={colors.text} />
                </View>
              )}
            </View>
          </FadeInView>
        )}

        {reply && (
          <FadeInView index={2} style={styles.block}>
            <BlockTitle
              icon="lightbulb-on-outline"
              text={reply.mode === "negotiation" ? t("voice.strategyTitle") : t("voice.adviceTitle")}
            />
            <AnswerText text={reply.strategy} />
          </FadeInView>
        )}
      </ScrollView>

      <View style={styles.dock}>
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {isLoading ? t("voice.loading") : isRecording ? t("voice.hintRecording") : t("voice.hintIdle")}
        </Text>

        <View style={styles.micWrap}>
          {isRecording && !reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
                },
              ]}
            />
          )}
          {isLoading && (
            <Animated.View
              pointerEvents="none"
              style={[styles.arc, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}
            >
              <Svg width={ARC} height={ARC}>
                <Circle cx={ARC / 2} cy={ARC / 2} r={ARC / 2 - 3} stroke={colors.secondary} strokeWidth={3}
                        strokeDasharray="80 600" strokeLinecap="round" fill="none" />
              </Svg>
            </Animated.View>
          )}
          <View style={[styles.ring, { borderColor: micTone }]}>
            <PressableScale
              style={[styles.mic, { backgroundColor: micTone }]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? t("voice.micStopLabel") : t("voice.micStartLabel")}
              accessibilityState={{ disabled: isLoading, busy: isLoading }}
            >
              <MaterialCommunityIcons
                name={isRecording ? "stop" : isLoading ? "dots-horizontal" : "microphone"}
                size={52}
                color={colors.onPrimary}
              />
            </PressableScale>
          </View>
        </View>

        <View style={styles.typeBar}>
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
          <PressableScale
            style={[styles.sendButton, sendDisabled && styles.disabled]}
            onPress={sendTyped}
            disabled={sendDisabled}
            accessibilityRole="button"
            accessibilityLabel={t("voice.sendLabel")}
            accessibilityState={{ disabled: sendDisabled }}
          >
            <MaterialCommunityIcons name="send" size={22} color={colors.onPrimary} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// Dictionary labels end with ":" for the old layout; beside a value the colon is dropped
function asLabel(text: string): string {
  return text.replace(/:\s*$/, "");
}

function BlockTitle({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.blockTitleRow}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      <Text style={styles.blockTitle} accessibilityRole="header">{text}</Text>
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
  screen:        { flex: 1, backgroundColor: colors.background },
  scroll:        { flex: 1 },
  container:     { flexGrow: 1, padding: spacing.lg, gap: spacing.xl },

  contextBar:    { gap: spacing.sm },
  regionRow:     { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  regionText:    { ...type.caption, color: colors.textSecondary, flexShrink: 1 },

  field:         { marginTop: "auto", height: 140, opacity: 0.6 },

  errorPanel:    { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md,
                   borderRadius: radius.sm, backgroundColor: colors.dangerBg },
  errorText:     { ...type.body, color: colors.danger, flex: 1 },

  block:         { gap: spacing.sm },
  label:         { ...type.overline, color: colors.textSecondary },
  questionRow:   { gap: spacing.xs },
  questionText:  { ...type.bodyLarge, color: colors.text },
  editInput:     { flex: 0 },
  editActions:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },

  blockTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  blockTitle:    { ...type.body, fontFamily: fonts.bold, color: colors.text, flex: 1 },

  // The price board: one placard per answer, edged in earth like a cardboard sign
  board:         { padding: spacing.lg, borderRadius: radius.sm, backgroundColor: colors.card,
                   borderWidth: 2, borderColor: colors.earth, gap: spacing.xs },
  boardHead:     { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md,
                   marginBottom: spacing.sm },
  boardCrop:     { ...type.headline, color: colors.text, flexShrink: 1 },
  boardWeight:   { ...type.body, color: colors.textSecondary },
  boardLabel:    { ...type.overline, color: colors.textSecondary },
  boardRule:     { height: 1, backgroundColor: colors.earth, marginVertical: spacing.md },
  boardRow:      { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  boardRowLabel: { ...type.body, color: colors.textSecondary, flexShrink: 1 },

  answerText:    { ...type.bodyLarge, color: colors.text, flex: 1 },
  bulletRow:     { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  bulletDot:     { ...type.bodyLarge, fontFamily: fonts.bold, color: colors.primary },
  paragraphGap:  { height: spacing.md },

  // Fixed controls under the scrolling answer
  dock:          { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
                   paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  hint:          { ...type.body, fontFamily: fonts.bold, color: colors.text, textAlign: "center" },
  micWrap:       { width: ARC, height: ARC, alignItems: "center", justifyContent: "center" },
  pulse:         { position: "absolute", width: RING, height: RING, borderRadius: RING / 2, backgroundColor: colors.danger },
  arc:           { position: "absolute", width: ARC, height: ARC },
  ring:          { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  mic:           { width: MIC, height: MIC, borderRadius: MIC / 2, alignItems: "center", justifyContent: "center",
                   borderTopWidth: 1, borderTopColor: colors.sheen },

  typeBar:       { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, alignSelf: "stretch" },
  input:         { flex: 1, minHeight: 52, maxHeight: 120, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                   borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                   ...type.body, color: colors.text },
  sendButton:    { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  disabled:      { opacity: 0.45 },
});
