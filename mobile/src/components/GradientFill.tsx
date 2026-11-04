/**
 * GradientFill — a two-color gradient that fills its parent (react-native-svg; no extra package).
 * Place it first inside a container with overflow "hidden" and a border radius.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

type Props = {
  from: string;
  to: string;
  /** "vertical" (top → bottom) or "diagonal" (top-left → bottom-right) */
  direction?: "vertical" | "diagonal";
};

let nextId = 0;

export default function GradientFill({ from, to, direction = "diagonal" }: Props) {
  // A unique id per instance, so several gradients on one screen don't share a definition
  const id = React.useMemo(() => `agv-gradient-${nextId++}`, []);
  const end = direction === "vertical" ? { x2: "0", y2: "1" } : { x2: "1", y2: "1" };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" {...end}>
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
