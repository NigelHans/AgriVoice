/**
 * WeatherScreen — Shows a 7-day weather forecast for the farmer's location.
 * Uses expo-location to get GPS coordinates, then calls the FastAPI weather endpoint.
 */
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Alert } from "react-native";
import * as Location from "expo-location";
import { fetchWeather } from "../services/api";
import type { DailyForecast } from "../types";

const WMO_ICONS: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 61: "🌧️", 71: "❄️", 80: "🌧️", 95: "⛈️",
};

export default function WeatherScreen() {
  const [forecast, setForecast] = useState<DailyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location needed for local weather.");
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync(loc.coords);
      setLocation(`${geo[0]?.city ?? ""}, ${geo[0]?.region ?? ""}`);
      const data = await fetchWeather(loc.coords.latitude, loc.coords.longitude);
      setForecast(data.daily);
      setLoading(false);
    })();
  }, []);

  if (loading) return <ActivityIndicator size="large" color="#1a7a1a" style={{ flex: 1, marginTop: 40 }} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.location}>📍 {location || "Your Location"}</Text>
      {forecast.map((day) => (
        <View key={day.date} style={styles.card}>
          <Text style={styles.icon}>{WMO_ICONS[day.weather_code] ?? "🌡️"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{new Date(day.date).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}</Text>
            <Text style={styles.temp}>{day.temp_max}° / {day.temp_min}°C</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.rain}>🌧️ {day.rain_probability}%</Text>
            <Text style={styles.wind}>💨 {day.wind_speed} km/h</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f7ff", padding: 12 },
  location:  { fontSize: 16, fontWeight: "bold", color: "#1a4a7a", marginBottom: 12 },
  card:      { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  icon:      { fontSize: 32, marginRight: 12 },
  date:      { fontWeight: "bold", color: "#333" },
  temp:      { color: "#555", marginTop: 2 },
  right:     { alignItems: "flex-end" },
  rain:      { color: "#1a4a7a", fontWeight: "bold" },
  wind:      { color: "#888", fontSize: 12 },
});
