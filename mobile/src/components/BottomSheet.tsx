/**
 * BottomSheet — a panel that slides up from the bottom over a dimmed backdrop.
 * Closes with the Android back button, a tap on the backdrop, or by dragging the handle down.
 * Only the handle starts a drag, so scrolling inside the sheet works normally.
 * Appears without sliding when the phone asks for reduced motion.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "./motion";
import { colors, radius, spacing } from "../theme";

/** closeLabel: translated text a screen reader announces for the backdrop (e.g. "Close") */
type Props = { visible: boolean; onClose: () => void; closeLabel: string; children: React.ReactNode };

const CLOSE_DRAG = 120;   // drag distance (dp) that closes the sheet

export default function BottomSheet({ visible, onClose, closeLabel, children }: Props) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const offscreen = Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(offscreen)).current;
  // Stay mounted while the closing slide plays
  const [mounted, setMounted] = useState(visible);
  // The pan handlers are created once; read the latest onClose through a ref
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion) {
        translateY.setValue(0);
      } else {
        translateY.setValue(offscreen);
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
      }
    } else if (mounted) {
      if (reduceMotion) {
        setMounted(false);
      } else {
        Animated.timing(translateY, { toValue: offscreen, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
      }
    }
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DRAG || g.vy > 1) onCloseRef.current();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: translateY.interpolate({ inputRange: [0, offscreen], outputRange: [1, 0] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={closeLabel} accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg), transform: [{ translateY }] }]}
        accessibilityViewIsModal
      >
        <View style={styles.handleArea} {...pan.panHandlers}>
          <View style={styles.handle} />
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet:      { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%", backgroundColor: colors.card,
                borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.glassBorder },
  handleArea: { alignItems: "center", paddingVertical: spacing.md },
  handle:     { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.surfaceRaised },
});
