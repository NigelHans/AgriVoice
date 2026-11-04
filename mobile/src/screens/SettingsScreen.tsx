/**
 * SettingsScreen — plain grouped rows: language and region (each opens a sheet), Day or Night display,
 * how weather finds your location, and about.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, FlatList, TextInput, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import { useRegion, REGIONS, getRegionLabel } from "../context/RegionContext";
import { useThemeMode } from "../context/ThemeContext";
import { useT } from "../i18n";
import BottomSheet from "../components/BottomSheet";
import PressableScale from "../components/PressableScale";
import StatusView from "../components/StatusView";
import { colors, spacing, radius, type, fonts, themed } from "../theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

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

  const [languageOpen, setLanguageOpen] = useState(false);
  const { mode, setMode } = useThemeMode();
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? language;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        {/* Language names stay as written, so anyone can find their own language */}
        <SettingRow
          icon="translate"
          label={t("settings.languageTitle")}
          value={languageLabel}
          action={t("settings.regionChange")}
          onPress={() => setLanguageOpen(true)}
        />
        <View style={styles.divider} />
        {/* Region labels are proper names, not translated */}
        <SettingRow
          icon="map-marker"
          label={t("settings.regionTitle")}
          value={getRegionLabel(region)}
          action={t("settings.regionChange")}
          onPress={() => setPickerOpen(true)}
        />
      </View>

      <View style={styles.section} accessibilityRole="radiogroup">
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("settings.displayTitle")}</Text>
        <OptionRow label={t("settings.themeDay")} selected={mode === "day"} onPress={() => setMode("day")} />
        <OptionRow label={t("settings.themeNight")} selected={mode === "night"} onPress={() => setMode("night")} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("settings.weatherTitle")}</Text>
        <Text style={styles.infoText}>{t("settings.weatherHint")}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("settings.aboutTitle")}</Text>
        <Text style={styles.aboutName}>AgriVoice v1.0.0</Text>
        <Text style={styles.infoText}>{t("settings.aboutDescription")}</Text>
        <Text style={styles.aboutTech}>{t("settings.poweredBy", { tech: TECH })}</Text>
      </View>

      <BottomSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} closeLabel={t("history.close")}>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle} accessibilityRole="header">{t("settings.languageTitle")}</Text>
          <Text style={styles.sheetHint}>{t("settings.languageHint")}</Text>
          {LANGUAGES.map((lang) => {
            const selected = language === lang.code;
            return (
              <OptionRow
                key={lang.code}
                label={lang.label}
                selected={selected}
                onPress={() => { setLanguage(lang.code); setLanguageOpen(false); }}
              />
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet visible={pickerOpen} onClose={closePicker} closeLabel={t("history.close")}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} accessibilityRole="header">{t("settings.regionSelectTitle")}</Text>
          <Text style={styles.sheetHint}>{t("settings.regionHint")}</Text>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={22} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("settings.regionSearchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              accessibilityLabel={t("settings.regionSearchPlaceholder")}
            />
          </View>
        </View>
        <FlatList
          data={matches}
          keyExtractor={(r) => r.value}
          keyboardShouldPersistTaps="handled"
          style={styles.regionList}
          contentContainerStyle={matches.length === 0 ? styles.emptyList : styles.regionListContent}
          renderItem={({ item }) => (
            <OptionRow
              label={item.label}
              selected={region === item.value}
              onPress={() => { setRegion(item.value); closePicker(); }}
            />
          )}
          ListEmptyComponent={<StatusView icon="search-outline" title={t("settings.regionNoMatch", { search: search.trim() })} />}
        />
      </BottomSheet>
    </ScrollView>
  );
}

// One setting: icon, what it is, its current value, and a tap to change it
function SettingRow({ icon, label, value, action, onPress }: {
  icon: IconName; label: string; value: string; action: string; onPress: () => void;
}) {
  return (
    <PressableScale
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${action}`}
    >
      <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Text style={styles.rowAction}>{action}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.primary} />
    </PressableScale>
  );
}

// One choice in a sheet: clay outline and a check when selected (never color alone)
function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
      <MaterialCommunityIcons
        name={selected ? "check-circle" : "circle-outline"}
        size={24}
        color={selected ? colors.primary : colors.textMuted}
      />
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  content:            { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },

  group:              { borderRadius: radius.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.glassBorder },
  row:                { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 72,
                        paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowText:            { flex: 1 },
  rowLabel:           { ...type.caption, color: colors.textSecondary },
  rowValue:           { ...type.body, fontFamily: fonts.bold, color: colors.text },
  rowAction:          { ...type.body, fontFamily: fonts.bold, color: colors.primary },
  divider:            { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: spacing.lg + 24 + spacing.md },

  section:            { gap: spacing.sm },
  sectionTitle:       { ...type.overline, color: colors.textSecondary },
  infoText:           { ...type.body, color: colors.textSecondary },
  aboutName:          { ...type.body, fontFamily: fonts.bold, color: colors.text },
  aboutTech:          { ...type.caption, color: colors.accent },

  sheetBody:          { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  sheetHeader:        { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sheetTitle:         { ...type.title, fontFamily: fonts.bold, color: colors.text },
  sheetHint:          { ...type.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  searchBox:          { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 52,
                        borderRadius: radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
                        marginBottom: spacing.sm },
  searchInput:        { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.sm },
  regionList:         { flexShrink: 1 },
  regionListContent:  { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  emptyList:          { flexGrow: 1, minHeight: 240 },

  option:             { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg,
                        borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.glassBorder },
  optionSelected:     { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  optionText:         { ...type.body, color: colors.text, flex: 1 },
  optionTextSelected: { fontFamily: fonts.bold },
}));
