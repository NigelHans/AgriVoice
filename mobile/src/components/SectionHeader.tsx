/**
 * SectionHeader — a group title with an optional one-line explanation underneath.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, type } from "../theme";

type Props = {
  title: string;
  hint?: string;
};

export default function SectionHeader({ title, hint }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { marginTop: spacing.xl, marginBottom: spacing.md },
  title: { ...type.bodyLarge, fontWeight: "700", color: colors.text },
  hint:  { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
});
