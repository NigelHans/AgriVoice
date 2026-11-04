/**
 * Skeleton — a softly pulsing placeholder block shown while content loads.
 * Still (no pulse) when the phone asks for reduced motion.
 */
import React, { useEffect, useRef } from "react";
import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";
import { useReduceMotion } from "./motion";

type Props = { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> };

export default function Skeleton({ width = "100%", height = 16, style }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, opacity }, style]}
    />
  );
}
