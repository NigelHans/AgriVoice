/**
 * LanguagePicker — A compact inline language selector shown on the VoiceScreen.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";

export default function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  return (
    <View style={styles.row}>
      {LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          style={[styles.chip, language === lang.code && styles.active]}
          onPress={() => setLanguage(lang.code)}
        >
          <Text style={[styles.chipText, language === lang.code && styles.activeText]}>
            {lang.flag} {lang.code.toUpperCase()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginBottom: 16, gap: 8 },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: "#1a7a1a" },
  active:    { backgroundColor: "#1a7a1a" },
  chipText:  { color: "#1a7a1a", fontWeight: "600" },
  activeText:{ color: "#fff" },
});
