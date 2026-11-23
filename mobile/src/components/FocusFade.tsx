/**
 * FocusFade — a soft fade each time a tab screen gets focus. Wrap a screen with withFocusFade().
 * Navigation itself is unchanged. Still when the phone asks for reduced motion.
 */
import React, { useCallback, useRef } from "react";
import { Animated } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useReduceMotion } from "./motion";

function FocusFade({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useFocusEffect(useCallback(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    // Start from partly visible, not blank, so switching tabs never flashes an empty screen
    opacity.setValue(0.4);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, opacity]));

  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

export function withFocusFade<P extends object>(Screen: React.ComponentType<P>) {
  const Wrapped = (props: P) => (
    <FocusFade>
      <Screen {...props} />
    </FocusFade>
  );
  Wrapped.displayName = `withFocusFade(${Screen.displayName ?? Screen.name})`;
  return Wrapped;
}
