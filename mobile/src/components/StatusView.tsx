/**
 * StatusView — the one full-screen loading / error / empty layout every screen uses.
 */
import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

type Props = {
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "neutral" | "error";
  title?: string;
  text?: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export default function StatusView({
  loading, icon, tone = "neutral", title, text, detail, actionLabel, onAction, secondaryLabel, onSecondary,
}: Props) {
  const error = tone === "error";
  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator size="large" color={colors.primary} />}
      {icon && <Ionicons name={icon} size={56} color={error ? colors.danger : colors.primaryMuted} />}
      {title && <Text style={[styles.title, error && styles.titleError]}>{title}</Text>}
      {text && <Text style={styles.text}>{text}</Text>}
      {detail && <Text style={styles.detail}>{detail}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {secondaryLabel && onSecondary && (
        <TouchableOpacity style={styles.secondary} onPress={onSecondary}>
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.background },
  title:         { fontSize: 17, fontWeight: "bold", color: colors.textSecondary, marginTop: 12, textAlign: "center" },
  titleError:    { color: colors.danger },
  text:          { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: "center", lineHeight: 20 },
  detail:        { fontSize: 12, color: colors.textFaint, marginTop: 6, textAlign: "center" },
  button:        { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.pill },
  buttonText:    { color: colors.onPrimary, fontWeight: "bold" },
  secondary:     { marginTop: 16 },
  secondaryText: { color: colors.danger, fontWeight: "bold" },
});
