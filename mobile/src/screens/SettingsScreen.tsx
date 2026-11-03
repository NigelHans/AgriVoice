/**
 * SettingsScreen — Language and region selection and app preferences.
 */
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import { useRegion, REGIONS } from "../context/RegionContext";
import { useT } from "../i18n";

// Product names, not translated
const TECH = "Groq + Llama 3.3 70B + Whisper";

export default function SettingsScreen() {
  const t = useT();
  const { language, setLanguage } = useLanguage();
  const { region, setRegion } = useRegion();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t("settings.languageTitle")}</Text>
      <Text style={styles.sectionHint}>{t("settings.languageHint")}</Text>
      {/* Language names stay as written, so anyone can find their own language */}
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

      <Text style={styles.sectionTitle}>{t("settings.regionTitle")}</Text>
      <Text style={styles.sectionHint}>{t("settings.regionHint")}</Text>
      {/* Region labels are proper names, not translated */}
      {REGIONS.map((r) => (
        <TouchableOpacity
          key={r.value}
          style={[styles.option, region === r.value && styles.selected]}
          onPress={() => setRegion(r.value)}
        >
          <Text style={[styles.optionText, styles.regionOptionText, region === r.value && styles.selectedText]}>
            {r.label}
          </Text>
          {region === r.value && <Text style={styles.check}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>{t("settings.aboutTitle")}</Text>
      <View style={styles.about}>
        <Text style={styles.aboutText}>AgriVoice v1.0.0</Text>
        <Text style={styles.aboutText}>{t("settings.aboutDescription")}</Text>
        <Text style={styles.aboutText}>{t("settings.poweredBy", { tech: TECH })}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#f5f9f5" },
  content:      { padding: 20, paddingBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#888", marginTop: 24, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  sectionHint:  { fontSize: 13, color: "#888", marginTop: -4, marginBottom: 10, lineHeight: 18 },
  option:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 16, marginBottom: 8, elevation: 1 },
  selected:     { backgroundColor: "#1a7a1a" },
  optionText:   { fontSize: 16, color: "#333" },
  regionOptionText: { flex: 1, fontSize: 15 },
  selectedText: { color: "#fff", fontWeight: "bold" },
  check:        { color: "#fff", fontWeight: "bold", fontSize: 18 },
  about:        { backgroundColor: "#fff", borderRadius: 10, padding: 16, elevation: 1 },
  aboutText:    { color: "#555", marginBottom: 4 },
});
