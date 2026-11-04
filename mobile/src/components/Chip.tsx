/**
 * Chip — a selectable option (language, region scope, filters). 48dp tall; the selected chip is
 * solid clay with a light sheen, the others are soft glass with a fine border.
 */
import React from "react";
import { Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import PressableScale from "./PressableScale";
import Sheen from "./Sheen";
import { colors, radius, spacing, touch, type } from "../theme";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Chip({ label, selected = false, onPress, icon, accessibilityLabel, style }: Props) {
  const color = selected ? colors.onPrimary : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.selected, style]}
    >
      {selected && <Sheen radius={radius.pill} />}
      {icon && <MaterialCommunityIcons name={icon} size={18} color={color} style={styles.icon} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip:     { minHeight: touch.min, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg,
              borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary, overflow: "hidden" },
  icon:     { marginRight: spacing.xs },
  label:    { ...type.body, fontWeight: "600" },
});
