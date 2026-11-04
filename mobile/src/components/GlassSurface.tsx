/**
 * GlassSurface — frosted glass for floating UI (dock, sheets, overlays).
 * iOS: real background blur (expo-blur) under a forest tint. Android, or with glass.blur off:
 * a strong translucent tint instead (expo-blur's Android blur is experimental in SDK 51).
 * Both get a fine border and a top sheen, and no elevation (it draws artifacts on see-through views).
 */
import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import Sheen from "./Sheen";
import { colors, glass, radius as radii } from "../theme";

type Props = { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number };

const REAL_BLUR = glass.blur && Platform.OS === "ios";

export default function GlassSurface({ children, style, radius = radii.xl }: Props) {
  return (
    <View style={[styles.base, { borderRadius: radius }, style]}>
      {REAL_BLUR ? (
        <>
          <BlurView intensity={glass.intensity} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.overBlur]} />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.frosted]} />
      )}
      <Sheen radius={radius} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base:     { overflow: "hidden", borderWidth: 1, borderColor: colors.glassBorder },
  overBlur: { backgroundColor: colors.glassOverBlur },
  frosted:  { backgroundColor: colors.glassStrong },
});
