/**
 * FieldIllustration — a subtle field-and-hills drawing used as a quiet background accent.
 * Decorative only: hidden from screen readers and not tappable.
 */
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { colors } from "../theme";

export default function FieldIllustration({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice">
        <Circle cx={300} cy={30} r={14} fill={colors.warning} opacity={0.22} />
        <Path d="M0 78 C 60 50, 120 50, 180 68 S 300 94, 360 60 L 360 120 L 0 120 Z" fill={colors.sand} />
        <Path d="M0 94 C 80 74, 160 80, 220 92 S 320 110, 360 88 L 360 120 L 0 120 Z" fill={colors.secondary} opacity={0.16} />
        <Path d="M0 108 C 90 98, 200 100, 360 105 L 360 120 L 0 120 Z" fill={colors.primary} opacity={0.1} />
        <Path d="M40 120 L 90 101 M120 120 L 150 102 M200 120 L 214 103 M280 120 L 268 104"
              stroke={colors.decor} strokeWidth={2} opacity={0.45} />
      </Svg>
    </View>
  );
}
