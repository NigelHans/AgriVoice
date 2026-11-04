/**
 * SettingsScreen — Language and region selection and app preferences.
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, FlatList, TextInput, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import { useRegion, REGIONS, getRegionLabel } from "../context/RegionContext";
import { useT } from "../i18n";
import Card from "../components/Card";
import Button from "../components/Button";
import SectionHeader from "../components/SectionHeader";
import StatusView from "../components/StatusView";
import { colors, spacing, radius, type } from "../theme";

// Product names, not translated
const TECH = "Groq + Llama 3.3 70B + Whisper";

export default function SettingsScreen() {
  const t = useT();
  const { language, setLanguage } = useLanguage();
  const { region, setRegion } = useRegion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Matches the friendly label or the exact region value; the value is what gets saved
  const query = search.trim().toLowerCase();
  const matches = query
    ? REGIONS.filter((r) => r.label.toLowerCase().includes(query) || r.value.toLowerCase().includes(query))
    : REGIONS;

  const closePicker = () => {
    setPickerOpen(false);
    setSearch("");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title={t("settings.languageTitle")} hint={t("settings.languageHint")} />
      {/* Language names stay as written, so anyone can find their own language */}
      <Card style={styles.groupCard}>
        {LANGUAGES.map((lang, i) => {
          const selected = language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.option, i > 0 && styles.optionDivider]}
              onPress={() => setLanguage(lang.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <MaterialCommunityIcons
                name={selected ? "radiobox-marked" : "radiobox-blank"}
                size={24}
                color={selected ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{lang.label}</Text>
            </TouchableOpacity>
          );
        })}
      </Card>

      <SectionHeader title={t("settings.regionTitle")} hint={t("settings.regionHint")} />
      <Card style={styles.groupCard}>
        <TouchableOpacity
          style={styles.option}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t("settings.regionTitle")}: ${getRegionLabel(region)}. ${t("settings.regionChange")}`}
        >
          <MaterialCommunityIcons name="map-marker" size={24} color={colors.primary} />
          {/* Region labels are proper names, not translated */}
          <Text style={[styles.optionText, styles.optionTextSelected]}>{getRegionLabel(region)}</Text>
          <Text style={styles.changeText}>{t("settings.regionChange")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.primary} />
        </TouchableOpacity>
      </Card>

      <SectionHeader title={t("settings.weatherTitle")} />
      <Card style={styles.infoCard}>
        <MaterialCommunityIcons name="crosshairs-gps" size={24} color={colors.secondary} />
        <Text style={styles.infoText}>{t("settings.weatherHint")}</Text>
      </Card>

      <SectionHeader title={t("settings.aboutTitle")} />
      <Card style={styles.infoCard}>
        <MaterialCommunityIcons name="sprout" size={24} color={colors.secondary} />
        <View style={styles.aboutBody}>
          <Text style={styles.aboutName}>AgriVoice v1.0.0</Text>
          <Text style={styles.infoText}>{t("settings.aboutDescription")}</Text>
          <Text style={styles.aboutTech}>{t("settings.poweredBy", { tech: TECH })}</Text>
        </View>
      </Card>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={closePicker}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">{t("settings.regionSelectTitle")}</Text>
            <Button label={t("history.close")} variant="text" icon="close" onPress={closePicker} />
          </View>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("settings.regionSearchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              accessibilityLabel={t("settings.regionSearchPlaceholder")}
            />
          </View>
          <FlatList
            data={matches}
            keyExtractor={(r) => r.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={matches.length === 0 ? styles.emptyList : styles.regionList}
            renderItem={({ item }) => {
              const selected = region === item.value;
              return (
                <TouchableOpacity
                  style={[styles.regionRow, selected && styles.regionRowSelected]}
                  onPress={() => { setRegion(item.value); closePicker(); }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[styles.regionText, selected && styles.regionTextSelected]}>{item.label}</Text>
                  {selected && <MaterialCommunityIcons name="check" size={24} color={colors.onPrimary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<StatusView icon="search-outline" title={t("settings.regionNoMatch", { search: search.trim() })} />}
          />
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  content:            { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },
  groupCard:          { paddingVertical: 0 },
  option:             { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md },
  optionDivider:      { borderTopWidth: 1, borderTopColor: colors.divider },
  optionText:         { ...type.body, color: colors.text, flex: 1 },
  optionTextSelected: { fontWeight: "700", color: colors.primary },
  changeText:         { ...type.body, fontWeight: "700", color: colors.primary },
  infoCard:           { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  infoText:           { ...type.body, color: colors.textSecondary, flex: 1 },
  aboutBody:          { flex: 1, gap: spacing.xs },
  aboutName:          { ...type.bodyLarge, fontWeight: "700", color: colors.text },
  aboutTech:          { ...type.caption, color: colors.accent },

  modal:              { flex: 1, backgroundColor: colors.background },
  modalHeader:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: spacing.lg,
                        paddingRight: spacing.xs, paddingVertical: spacing.xs, backgroundColor: colors.card,
                        borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle:         { ...type.title, fontWeight: "700", color: colors.text, flex: 1 },
  searchBox:          { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.lg, paddingHorizontal: spacing.md,
                        minHeight: 52, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  searchInput:        { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  regionList:         { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  emptyList:          { flexGrow: 1 },
  regionRow:          { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg,
                        marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.card },
  regionRowSelected:  { backgroundColor: colors.primary },
  regionText:         { ...type.body, color: colors.text, flex: 1 },
  regionTextSelected: { fontWeight: "700", color: colors.onPrimary },
});
