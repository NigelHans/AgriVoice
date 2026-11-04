/**
 * Waveform — decorative sound bars under the microphone. Animated while listening, flat otherwise.
 * It does not read the microphone; one animation loop drives every bar with a phase offset.
 * Still when the phone asks for reduced motion.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { useReduceMotion } from "./motion";

// Relative bar heights, so the shape looks like speech rather than a flat sine wave
const AMPLITUDES = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.55, 0.8, 0.45, 0.95, 0.6, 0.4, 0.85, 0.65, 0.5, 0.9, 0.7, 0.4, 0.6, 0.8];
const BAR_HEIGHT = 40;

export default function Waveform({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const animated = active && !reduceMotion;

  useEffect(() => {
    if (!animated) {
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [animated, phase]);

  const scales = useMemo(
    () => AMPLITUDES.map((amp, i) =>
      Animated.modulo(Animated.add(phase, i / AMPLITUDES.length), 1)
        .interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, amp, 0.25] })),
    [phase]
  );

  return (
    <View style={styles.row} accessible={false} importantForAccessibility="no-hide-descendants">
      {AMPLITUDES.map((amp, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: active ? colors.danger : colors.surfaceRaised,
              transform: [{ scaleY: animated ? scales[i] : active ? amp * 0.7 : 0.15 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: BAR_HEIGHT, gap: 4 },
  bar: { width: 4, height: BAR_HEIGHT, borderRadius: 2 },
});
