/**
 * Card — the standard white, rounded, lightly raised surface.
 */
import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import { colors, radius, spacing, cardShadow } from "../theme";

export default function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, ...cardShadow },
});
