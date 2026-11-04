/**
 * ScreenBackground — the dark forest gradient with two faint organic glows (moss and clay).
 * Drawn once behind the whole app; screens are transparent so it shows through.
 * Static (no animation), so it costs nothing after the first draw.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect } from "react-native-svg";
import { colors } from "../theme";

const GLOW_OPACITY = 0.09;   // strong enough to feel, too faint to touch text contrast

export default function ScreenBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="agv-bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundTop} />
            <Stop offset="1" stopColor={colors.backgroundBottom} />
          </LinearGradient>
          <RadialGradient id="agv-glow-moss" cx="0.15" cy="0.12" r="0.6">
            <Stop offset="0" stopColor={colors.secondary} stopOpacity={GLOW_OPACITY} />
            <Stop offset="1" stopColor={colors.secondary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="agv-glow-clay" cx="0.9" cy="0.78" r="0.55">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={GLOW_OPACITY * 0.7} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#agv-bg)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#agv-glow-moss)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#agv-glow-clay)" />
      </Svg>
    </View>
  );
}
