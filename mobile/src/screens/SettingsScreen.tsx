/**
 * SettingsScreen — Language and region selection and app preferences.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, FlatList, TextInput, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import { useRegion, REGIONS, getRegionLabel } from "../context/RegionContext";
import { useT } from "../i18n";
import Surface from "../components/Surface";
import BottomSheet from "../components/BottomSheet";
import FadeInView from "../components/FadeInView";
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
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? language;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FadeInView style={styles.bentoRow}>
        {/* Language names stay as written, so anyone can find their own language */}
        <ControlTile
          icon="translate"
          label={t("settings.languageTitle")}
          value={languageLabel}
          action={t("settings.regionChange")}
          onPress={() => setLanguageOpen(true)}
        />
        {/* Region labels are proper names, not translated */}
        <ControlTile
          icon="map-marker"
          label={t("settings.regionTitle")}
          value={getRegionLabel(region)}
          action={t("settings.regionChange")}
          onPress={() => setPickerOpen(true)}
        />
      </FadeInView>

      <FadeInView index={1}>
        <InfoTile icon="crosshairs-gps" title={t("settings.weatherTitle")} text={t("settings.weatherHint")} />
      </FadeInView>

      <FadeInView index={2}>
        <Surface variant="glass" style={styles.about}>
          <View style={styles.aboutHead}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="sprout" size={22} color={colors.primary} />
            </View>
            <View style={styles.aboutText}>
              <Text style={styles.overline}>{t("settings.aboutTitle")}</Text>
              <Text style={styles.aboutName}>AgriVoice v1.0.0</Text>
            </View>
          </View>
          <Text style={styles.infoText}>{t("settings.aboutDescription")}</Text>
          <Text style={styles.aboutTech}>{t("settings.poweredBy", { tech: TECH })}</Text>
        </Surface>
      </FadeInView>

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

// A bento control: what it is, its current value, and a tap to change it
function ControlTile({ icon, label, value, action, onPress }: {
  icon: IconName; label: string; value: string; action: string; onPress: () => void;
}) {
  return (
    <PressableScale
      style={styles.tileWrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${action}`}
    >
      <Surface variant="raised" style={styles.tile}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
        </View>
        <Text style={styles.overline}>{label}</Text>
        <Text style={styles.tileValue} numberOfLines={3}>{value}</Text>
        <View style={styles.tileAction}>
          <Text style={styles.tileActionText}>{action}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
        </View>
      </Surface>
    </PressableScale>
  );
}

function InfoTile({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <Surface style={styles.info}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.secondary} />
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.overline}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </Surface>
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
  content:            { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  bentoRow:           { flexDirection: "row", gap: spacing.md },
  tileWrap:           { flex: 1 },
  tile:               { flex: 1, gap: spacing.sm, minHeight: 176 },
  iconCircle:         { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                        backgroundColor: colors.background },
  overline:           { ...type.overline, color: colors.textSecondary },
  tileValue:          { ...type.bodyLarge, fontFamily: fonts.bold, color: colors.text, flexGrow: 1 },
  tileAction:         { flexDirection: "row", alignItems: "center", gap: 2 },
  tileActionText:     { ...type.body, fontFamily: fonts.bold, color: colors.primary },

  info:               { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  infoBody:           { flex: 1, gap: spacing.xs },
  infoText:           { ...type.body, color: colors.textSecondary },

  about:              { gap: spacing.sm },
  aboutHead:          { flexDirection: "row", alignItems: "center", gap: spacing.md },
  aboutText:          { flex: 1 },
  aboutName:          { ...type.bodyLarge, fontFamily: fonts.bold, color: colors.text },
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
