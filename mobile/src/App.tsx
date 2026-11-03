/**
 * AgriVoice — Root App Component
 * Bottom Tab Navigator + Region Selector State
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageProvider } from "./context/LanguageContext";
import { RegionProvider } from "./context/RegionContext";
import { useT } from "./i18n";

// Screens
import VoiceScreen from "./screens/VoiceScreen";
import MarketScreen from "./screens/MarketScreen";
import WeatherScreen from "./screens/WeatherScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  Voice: "mic",
  Market: "bar-chart",
  Weather: "partly-sunny",
  History: "chatbubbles",
  Settings: "settings",
};

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
      <RegionProvider>
      <NavigationContainer>
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
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: "#1a7a1a" },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "bold" },
            tabBarActiveTintColor: "#1a7a1a",
            tabBarInactiveTintColor: "gray",
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={ICON_MAP[route.name]}
                size={size}
                color={color}
              />
            ),
          })}
        >
          <Tab.Screen
            name="Voice"
            component={VoiceScreen}
            options={{ title: "🌾 AgriVoice", tabBarLabel: t("tab.voice") }}
          />

          <Tab.Screen name="Market" component={MarketScreen} options={{ title: t("header.market"), tabBarLabel: t("tab.market") }} />
          <Tab.Screen name="Weather" component={WeatherScreen} options={{ title: t("header.weather"), tabBarLabel: t("tab.weather") }} />
          <Tab.Screen name="History" component={HistoryScreen} options={{ title: t("header.history"), tabBarLabel: t("tab.history") }} />

          <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t("header.settings"), tabBarLabel: t("tab.settings") }} />
        </Tab.Navigator>
  );
}