/**
 * SettingsScreen — Language selection and app preferences.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";

export default function SettingsScreen() {
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Wika / Language</Text>
      {LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          style={[styles.option, language === lang.code && styles.selected]}
          onPress={() => setLanguage(lang.code)}
        >
          <Text style={[styles.optionText, language === lang.code && styles.selectedText]}>
            {lang.flag} {lang.label}
          </Text>
          {language === lang.code && <Text style={styles.check}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.about}>
        <Text style={styles.aboutText}>AgriVoice v1.0.0</Text>
        <Text style={styles.aboutText}>AI-powered agricultural assistant for Filipino farmers.</Text>
        <Text style={styles.aboutText}>Powered by Groq + Llama 3.3 70B + Whisper</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f5f9f5", padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#888", marginTop: 24, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  option:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 16, marginBottom: 8, elevation: 1 },
  selected:     { backgroundColor: "#1a7a1a" },
  optionText:   { fontSize: 16, color: "#333" },
  selectedText: { color: "#fff", fontWeight: "bold" },
  check:        { color: "#fff", fontWeight: "bold", fontSize: 18 },
  about:        { backgroundColor: "#fff", borderRadius: 10, padding: 16, elevation: 1 },
  aboutText:    { color: "#555", marginBottom: 4 },
});
