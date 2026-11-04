/**
 * BentoTile — one tile of a bento grid: a small overline label and a large value.
 * Put tiles side by side in a row (each takes an equal share) or alone for a wide tile.
 */
import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Surface from "./Surface";
import { colors, spacing, type } from "../theme";

type Props = {
  label: string;
  value: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  valueColor?: string;
  size?: "small" | "normal" | "large";
  variant?: "base" | "raised" | "glass";
  style?: StyleProp<ViewStyle>;
};

export default function BentoTile({ label, value, icon, valueColor = colors.text, size = "normal", variant = "base", style }: Props) {
  // Labels shared with forms end in ":"; tiles show them as headings without it
  const heading = label.replace(/:\s*$/, "");
  return (
    <Surface variant={variant} style={[styles.tile, style]} accessible accessibilityLabel={`${heading}: ${value}`}>
      <View style={styles.head}>
        {icon && <MaterialCommunityIcons name={icon} size={18} color={colors.textSecondary} />}
        <Text style={styles.label} numberOfLines={2}>{heading}</Text>
      </View>
      <Text style={[styles.value, styles[size], { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  tile:   { flex: 1, minHeight: 96, justifyContent: "space-between", gap: spacing.sm },
  head:   { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  label:  { ...type.overline, color: colors.textSecondary, flexShrink: 1 },
  value:  { fontWeight: "700" },
  small:  { ...type.bodyLarge },
  normal: { ...type.title, fontSize: 22 },
  large:  { ...type.headline },
});
