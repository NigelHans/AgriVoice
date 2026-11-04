/**
 * StatusView — the one full-screen loading / error / empty layout every screen uses.
 */
import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Button from "./Button";
import Skeleton from "./Skeleton";
import { colors, radius, spacing, type } from "../theme";

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
  // Loading without a message: placeholder cards in the shape of the content that is coming
  if (loading && !text && !title) {
    return (
      <View style={styles.skeletons} accessibilityState={{ busy: true }}>
        <Skeleton height={52} style={styles.skeletonBar} />
        <Skeleton height={140} style={styles.skeletonCard} />
        <Skeleton height={120} style={styles.skeletonCard} />
        <Skeleton height={120} style={styles.skeletonCard} />
      </View>
    );
  }
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {loading && <ActivityIndicator size="large" color={colors.primary} />}
      {icon && (
        <View style={[styles.iconCircle, error && styles.iconCircleError]}>
          <Ionicons name={icon} size={40} color={error ? colors.danger : colors.secondary} />
        </View>
      )}
      {title && <Text style={[styles.title, error && styles.titleError]}>{title}</Text>}
      {text && <Text style={styles.text}>{text}</Text>}
      {detail && <Text style={styles.detail}>{detail}</Text>}
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} style={styles.action} />}
      {secondaryLabel && onSecondary && (
        <Button label={secondaryLabel} onPress={onSecondary} variant="danger" style={styles.secondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  iconCircle:      { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center",
                     backgroundColor: colors.surfaceRaised },
  iconCircleError: { backgroundColor: colors.dangerBg },
  title:           { ...type.title, fontWeight: "700", color: colors.text, marginTop: spacing.lg, textAlign: "center" },
  titleError:      { color: colors.danger },
  text:            { ...type.body, color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
  detail:          { ...type.caption, color: colors.textMuted, marginTop: spacing.sm, textAlign: "center" },
  action:          { marginTop: spacing.xl },
  secondary:       { marginTop: spacing.sm },
  skeletons:       { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  skeletonBar:     { borderRadius: radius.xl },
  skeletonCard:    { borderRadius: radius.lg },
});
