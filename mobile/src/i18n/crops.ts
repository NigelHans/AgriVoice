/**
 * Filipino names for the crops the backend stores in English (backend/app/services/price_sync.py
 * CROP_MAPPING). Shown next to the English name and matched by the Market search.
 * shortcut: Tagalog names only; add Cebuano/Ilocano names after a native-speaker review.
 */
export const LOCAL_CROP_NAMES: Record<string, string> = {
  "Rice": "Bigas",
  "Well-milled Rice": "Bigas (well-milled)",
  "Potato": "Patatas",
  "Mung Bean": "Munggo",
  "Peanut": "Mani",
  "Lakatan Banana": "Saging na lakatan",
  "Latundan Banana": "Saging na latundan",
  "Saba Banana": "Saging na saba",
  "Bitter Gourd": "Ampalaya",
  "Bottle Gourd": "Upo",
  "Cabbage": "Repolyo",
  "Chinese Cabbage": "Pechay Baguio",
  "Calamansi": "Kalamansi",
  "Carrot": "Karot",
  "Chayote": "Sayote",
  "Coconut": "Niyog",
  "Eggplant": "Talong",
  "Garlic": "Bawang",
  "Ginger": "Luya",
  "Carabao Mango": "Manggang kalabaw",
  "Onion": "Sibuyas",
  "Squash": "Kalabasa",
  "Tomato": "Kamatis",
  "Green Bean": "Baguio beans",
  "String Bean": "Sitaw",
};

/** "Talong (Eggplant)" in Filipino-family languages, "Eggplant" in English or when no local name is known. */
export function cropLabel(crop: string, language: string): string {
  const local = LOCAL_CROP_NAMES[crop];
  return local && language !== "en" ? `${local} (${crop})` : crop;
}

/** Search text for a crop: its English and Filipino names. */
export function cropSearchText(crop: string): string {
  return `${crop} ${LOCAL_CROP_NAMES[crop] ?? ""}`.toLowerCase();
}
