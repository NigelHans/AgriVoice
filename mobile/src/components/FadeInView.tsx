/**
 * FadeInView — a card entrance: fades in and rises 8px. Pass `index` to stagger a list.
 * Renders still when the phone asks for reduced motion.
 */
import React, { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "../theme";
import { useReduceMotion } from "./motion";

type Props = { children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle> };

export default function FadeInView({ children, index = 0, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.enter,
      delay: Math.min(index, 8) * motion.stagger,   // cap so long lists don't wait
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, index, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
