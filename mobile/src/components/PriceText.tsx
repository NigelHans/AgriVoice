/**
 * PriceText — a price in market-sign lettering: ₱, the amount, then an optional unit.
 * The display fonts have no ₱, so the sign is its own Text in the phone's bold font, sized to sit
 * on the same baseline instead of falling back mid-word. Read aloud as one phrase.
 */
import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, spacing, type } from "../theme";

type Props = {
  value: number | null;
  unit?: string;
  size?: "display" | "headline";
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export default function PriceText({ value, unit, size = "display", color = colors.price, style }: Props) {
  const face = type[size];
  if (value === null) return <Text style={[face, { color }]}>—</Text>;
  const amount = value.toLocaleString();
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={`₱${amount}${unit ? ` / ${unit}` : ""}`}>
      <Text style={[styles.peso, { fontSize: Math.round(face.fontSize * 0.6), lineHeight: face.lineHeight, color }]}>₱</Text>
      <Text style={[face, { color }]}>{amount}</Text>
      {unit && <Text style={styles.unit}>/{unit}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  peso: { fontWeight: "700", marginRight: 2 },   // system font, so fontWeight works here
  unit: { ...type.caption, color: colors.textSecondary, marginLeft: spacing.xs },
});
