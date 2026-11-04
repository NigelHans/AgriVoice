/**
 * Button — every tappable action: at least 48dp tall, with an optional icon and loading state.
 *   primary   filled clay with dark text (main action)
 *   secondary raised surface with a clay outline
 *   text      clay text only (low-emphasis action)
 *   danger    ember text only (delete / clear)
 */
import React from "react";
import { Text, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import PressableScale from "./PressableScale";
import { colors, radius, spacing, touch, type, fonts, themed } from "../theme";

type Variant = "primary" | "secondary" | "text" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// A function, so the colors follow the current theme
const foreground = (): Record<Variant, string> => ({
  primary: colors.onPrimary,
  secondary: colors.primary,
  text: colors.primary,
  danger: colors.danger,
});

export default function Button({
  label, onPress, variant = "primary", icon, disabled, loading, accessibilityLabel, style,
}: Props) {
  const inactive = disabled || loading;
  const color = foreground()[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[styles.base, styles[variant], inactive && styles.inactive, style]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        icon && <MaterialCommunityIcons name={icon} size={20} color={color} style={styles.icon} />
      )}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  base:      { minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "center",
               paddingHorizontal: spacing.xl, borderRadius: radius.pill },
  primary:   { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.primary },
  text:      { paddingHorizontal: spacing.md },
  danger:    { paddingHorizontal: spacing.md },
  inactive:  { opacity: 0.45 },
  icon:      { marginRight: spacing.sm },
  label:     { ...type.body, fontFamily: fonts.bold },
}));
