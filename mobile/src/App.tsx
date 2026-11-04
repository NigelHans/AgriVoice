/**
 * AgriVoice — Root App Component
 * Bottom Tab Navigator + Region Selector State
 */

import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
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
import { colors, type, fonts } from "./theme";

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

// Light navigation theme: screen backgrounds and borders behind every tab follow the Day palette
const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.divider,
  },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require("../assets/fonts/AtkinsonHyperlegible-Regular.ttf"),
    [fonts.bold]: require("../assets/fonts/AtkinsonHyperlegible-Bold.ttf"),
    [fonts.display]: require("../assets/fonts/BarlowCondensed-ExtraBold.ttf"),
    [fonts.displaySemi]: require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
  });
  // shortcut: renders nothing for the moment the fonts load, add expo-splash-screen if a blank frame shows.
  // If loading fails the app still opens, in the phone's own font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <LanguageProvider>
      <RegionProvider>
      <NavigationContainer theme={NAV_THEME}>
        <StatusBar style="dark" />
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
            headerTitleStyle: { fontFamily: fonts.display, fontSize: 26 },
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