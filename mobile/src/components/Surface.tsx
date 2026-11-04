/**
 * Surface — the layered card every screen is built from.
 *   base    Deep Olive card with a light top edge and soft shadow
 *   raised  Moss, for selected or highlighted cards
 *   glass   translucent Deep Olive with a fine border, for floating UI and overlays
 */
import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import { colors, radius, spacing, cardShadow } from "../theme";

type Props = ViewProps & { variant?: "base" | "raised" | "glass" };

export default function Surface({ variant = "base", style, ...props }: Props) {
  return <View style={[styles.surface, styles[variant], style]} {...props} />;
}

const styles = StyleSheet.create({
  surface: { borderRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.highlight },
  base:    { backgroundColor: colors.card, ...cardShadow },
  raised:  { backgroundColor: colors.surfaceRaised, ...cardShadow },
  glass:   { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
});
