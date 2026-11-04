/**
 * PressableScale — tactile press feedback: shrinks slightly while pressed, springs back on release.
 * Spring physics, so release has a slight natural bounce. Still when the phone asks for reduced motion.
 */
import React, { useRef } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "../theme";
import { useReduceMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> };

export default function PressableScale({ style, onPressIn, onPressOut, disabled, ...props }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  const animate = (toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue, speed: motion.pressSpeed, bounciness: motion.pressBounce, useNativeDriver: true }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(e) => { animate(motion.pressScale); onPressIn?.(e); }}
      onPressOut={(e) => { animate(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}
