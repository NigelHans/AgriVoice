/**
 * GlassTabBar — the floating, translucent bottom navigation with a sliding highlight.
 * Same routes, labels, icons and press behavior as the standard tab bar; only the look differs.
 * It sits in the normal layout (not over the content), so nothing is hidden behind it,
 * and it steps aside while the keyboard is open.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, Text, View, StyleSheet, type LayoutChangeEvent } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import PressableScale from "./PressableScale";
import { useReduceMotion } from "./motion";
import { colors, radius, spacing, type, fonts } from "../theme";

export default function GlassTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reduceMotion = useReduceMotion();
  const [barWidth, setBarWidth] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const index = useRef(new Animated.Value(state.index)).current;
  const itemWidth = state.routes.length > 0 ? barWidth / state.routes.length : 0;

  // Slide the highlight to the active tab
  useEffect(() => {
    if (reduceMotion) {
      index.setValue(state.index);
      return;
    }
    Animated.spring(index, { toValue: state.index, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [state.index, reduceMotion, index]);

  // Hide while typing, so the keyboard never covers or pushes the bar
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardOpen) return null;

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View
        style={styles.bar}
        accessibilityRole="tablist"
        onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width - BAR_PADDING * 2)}
      >
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.highlight,
              { width: itemWidth, transform: [{ translateX: Animated.multiply(index, itemWidth) }] },
            ]}
          />
        )}
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : options.title ?? route.name;
          const color = focused ? colors.primary : colors.textSecondary;

          // Standard React Navigation tab behavior
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: "tabLongPress", target: route.key });

          return (
            <PressableScale
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              style={styles.item}
            >
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const BAR_PADDING = spacing.xs;

const styles = StyleSheet.create({
  outer:     { backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  bar:       { flexDirection: "row", padding: BAR_PADDING, borderRadius: radius.xl, backgroundColor: colors.glass,
               borderWidth: 1, borderColor: colors.glassBorder },
  highlight: { position: "absolute", top: BAR_PADDING, bottom: BAR_PADDING, left: BAR_PADDING, borderRadius: radius.lg,
               backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.highlight },
  item:      { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2 },
  label:     { ...type.caption, fontSize: 12, lineHeight: 16, fontFamily: fonts.bold },
});
