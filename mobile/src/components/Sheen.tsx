/**
 * Sheen — a faint light gradient across the top of a surface, like light on glass.
 * Clips itself to the given corner radius, so the card itself needs no overflow:hidden
 * (which would hide its iOS shadow).
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { colors, glass } from "../theme";

let nextId = 0;

export default function Sheen({ radius }: { radius: number }) {
  const id = React.useMemo(() => `agv-sheen-${nextId++}`, []);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.white} stopOpacity={glass.sheenOpacity} />
            <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, height: "45%", overflow: "hidden" },
});
