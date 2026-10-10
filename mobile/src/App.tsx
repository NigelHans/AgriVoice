/**
 * AgriVoice — Root App Component
 * Bottom Tab Navigator + Region Selector State
 */

import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
  const [selectedRegion, setSelectedRegion] = useState<string>(
    "National Capital Region"
  );

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />

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
            options={{ title: "🌾 AgriVoice", tabBarLabel: "Voice" }}
          >
            {() => (
              <VoiceScreen selectedRegion={selectedRegion} />
            )}
          </Tab.Screen>

          <Tab.Screen name="Market" component={MarketScreen} options={{ title: "Market Prices" }} />
          <Tab.Screen name="Weather" component={WeatherScreen} options={{ title: "Weather" }} />
          <Tab.Screen name="History" component={HistoryScreen} options={{ title: "My Queries" }} />

          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}