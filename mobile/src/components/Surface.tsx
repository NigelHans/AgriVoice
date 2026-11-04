/**
 * Surface — the layered card every screen is built from.
 *   base    near-solid Deep Olive (for text, prices, answers) with a soft shadow
 *   raised  Moss, for selected or highlighted cards
 *   glass   soft translucent glass for tiles and bars over the static background (no elevation:
 *           it draws artifacts on see-through views on Android)
 * All variants share a fine top highlight and a light sheen, so solid and glass feel like one family.
 */
import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import Sheen from "./Sheen";
import { colors, radius, spacing, cardShadow } from "../theme";

type Props = ViewProps & { variant?: "base" | "raised" | "glass" };

export default function Surface({ variant = "base", style, children, ...props }: Props) {
  // The sheen follows the card's own corner radius when a screen overrides it
  const cornerRadius = (StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? radius.lg;
  return (
    <View style={[styles.surface, styles[variant], style]} {...props}>
      <Sheen radius={cornerRadius} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { borderRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.highlight },
  base:    { backgroundColor: colors.card, ...cardShadow },
  raised:  { backgroundColor: colors.surfaceRaised, ...cardShadow },
  glass:   { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
});
