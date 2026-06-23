/**
 * MarketScreen — Displays current crop market prices and price trends.
 * Data fetched from the FastAPI /market/prices endpoint (backed by Supabase).
 */
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TextInput, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { fetchMarketPrices } from "../services/api";
import type { CropPrice } from "../types";

export default function MarketScreen() {
  const [prices, setPrices] = useState<CropPrice[]>([]);
  const [filtered, setFiltered] = useState<CropPrice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await fetchMarketPrices();
      setPrices(data);
      setFiltered(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (text: string) => {
    setSearch(text);
    setFiltered(prices.filter((p) => p.crop_name.toLowerCase().includes(text.toLowerCase())));
  };

  if (loading) return <ActivityIndicator size="large" color="#1a7a1a" style={{ flex: 1, marginTop: 40 }} />;

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="Hanapin ang pananim..." value={search} onChangeText={handleSearch} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => `${item.id}-${item.region}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cropName}>{item.crop_name}</Text>
              <Text style={styles.region}>{item.region}</Text>
            </View>
            <Text style={styles.price}>₱{item.price_per_kg.toFixed(2)}/kg</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Walang presyo na makita.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f9f5" },
  search:    { margin: 12, padding: 10, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd" },
  row:       { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 10, elevation: 2 },
  cropName:  { fontWeight: "bold", fontSize: 15, color: "#1a7a1a" },
  region:    { fontSize: 12, color: "#888", marginTop: 2 },
  price:     { fontWeight: "bold", fontSize: 17, color: "#333" },
  empty:     { textAlign: "center", marginTop: 40, color: "#aaa" },
});
