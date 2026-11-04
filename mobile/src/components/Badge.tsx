/**
 * Badge — a small status label (e.g. "Current", "Old price · Unverified", "Warning").
 * Always text plus color, never color alone.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing, type, fonts } from "../theme";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warningText },
  danger:  { bg: colors.dangerBg, fg: colors.danger },
  neutral: { bg: colors.sand, fg: colors.text },
};

type Props = {
  label: string;
  tone?: Tone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
};

export default function Badge({ label, tone = "neutral", icon }: Props) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <MaterialCommunityIcons name={icon} size={16} color={fg} style={styles.icon} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
           paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  icon:  { marginRight: spacing.xs },
  label: { ...type.caption, fontFamily: fonts.bold },
});
