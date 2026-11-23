/**
 * LanguagePicker — language selector shown on the VoiceScreen, with full language names.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import Chip from "./Chip";
import { spacing, themed } from "../theme";

export default function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  return (
    <View style={styles.row}>
      {LANGUAGES.map((lang) => (
        <Chip
          key={lang.code}
          label={lang.label}
          selected={language === lang.code}
          onPress={() => setLanguage(lang.code)}
        />
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
}));
