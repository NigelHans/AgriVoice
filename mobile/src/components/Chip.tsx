/**
 * Chip — a selectable option (language, region scope, filters). 48dp tall; the selected chip is
 * filled green, the others outlined.
 */
import React from "react";
import { Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  const color = selected ? colors.onPrimary : colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.selected, style]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={18} color={color} style={styles.icon} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip:     { minHeight: touch.min, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg,
              borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card },
  selected: { backgroundColor: colors.primary },
  icon:     { marginRight: spacing.xs },
  label:    { ...type.body, fontWeight: "600" },
});
