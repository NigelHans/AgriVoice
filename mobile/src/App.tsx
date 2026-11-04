/**
 * AgriVoice — Root App Component
 * Bottom Tab Navigator + Region Selector State
 */

import React from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageProvider } from "./context/LanguageContext";
import { RegionProvider } from "./context/RegionContext";
import { useT } from "./i18n";
import GlassTabBar from "./components/GlassTabBar";

// Screens
import VoiceScreen from "./screens/VoiceScreen";
import MarketScreen from "./screens/MarketScreen";
import WeatherScreen from "./screens/WeatherScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { withFocusFade } from "./components/FocusFade";
import { colors, type } from "./theme";

const Tab = createBottomTabNavigator();

// Each tab screen fades in softly when focused (created once, outside render)
const VoiceTab = withFocusFade(VoiceScreen);
const MarketTab = withFocusFade(MarketScreen);
const WeatherTab = withFocusFade(WeatherScreen);
const HistoryTab = withFocusFade(HistoryScreen);
const SettingsTab = withFocusFade(SettingsScreen);

const ICON_MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Voice: "microphone",
  Market: "storefront-outline",
  Weather: "weather-partly-cloudy",
  History: "history",
  Settings: "cog-outline",
};

// Dark navigation theme: screen backgrounds and borders behind every tab follow the V2 palette
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.divider,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
      <RegionProvider>
      <NavigationContainer theme={NAV_THEME}>
        <StatusBar style="light" />
        <AppTabs />
      </NavigationContainer>
      </RegionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

// Inside LanguageProvider, so tab labels and headers follow the selected language.
// Route names stay English: other screens navigate by them.
function AppTabs() {
  const t = useT();
  return (
        <Tab.Navigator
          tabBar={(props) => <GlassTabBar {...props} />}
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: { ...type.title, fontWeight: "700" },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textSecondary,
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons
                name={ICON_MAP[route.name]}
                size={focused ? 28 : 26}
                color={color}
              />
            ),
          })}
        >
          <Tab.Screen
            name="Voice"
            component={VoiceTab}
            options={{ title: "🌾 AgriVoice", tabBarLabel: t("tab.voice") }}
          />

          <Tab.Screen name="Market" component={MarketTab} options={{ title: t("header.market"), tabBarLabel: t("tab.market") }} />
          <Tab.Screen name="Weather" component={WeatherTab} options={{ title: t("header.weather"), tabBarLabel: t("tab.weather") }} />
          <Tab.Screen name="History" component={HistoryTab} options={{ title: t("header.history"), tabBarLabel: t("tab.history") }} />

          <Tab.Screen name="Settings" component={SettingsTab} options={{ title: t("header.settings"), tabBarLabel: t("tab.settings") }} />
        </Tab.Navigator>
  );
}