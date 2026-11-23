/**
 * AgriVoice V3 "Daylight price board" design tokens — light, for reading in the sun.
 * One bold element per screen: the number a farmer acts on, set in condensed sign lettering.
 *
 * Contrast (WCAG, measured): every text color passes 4.5:1 on background, card, surfaceRaised,
 * sand and the three status backgrounds. Earth Brown is for edges and rules only.
 * Words on filled leaf / ember / amber controls use `onPrimary` (white).
 * Night mode swaps every token for `nightColors` (see applyThemeMode).
 */
const dayColors = {
  // Accents
  primary: "#2F6B3A",        // Leaf: main actions, active states, icons
  secondary: "#386449",      // darker sage: secondary icons, processing state
  accent: "#7A5530",         // small accent text (dates, sources)
  price: "#7A5530",          // Price brown: prices and key numbers
  earth: "#806044",          // Earth Brown: board edges, rules, timeline rails — not for text
  decor: "#806044",          // illustrations only — not for text
  sand: "#DCE3D5",           // neutral panels and badges
  onPrimary: "#FFFFFF",      // text and icons on leaf / ember / amber fills

  // Surfaces
  background: "#E8EDE3",     // Field: pale leaf-grey, softer than white in the sun
  card: "#F7F9F4",           // Paper: boards, cards, inputs
  surfaceRaised: "#DCE5D6",  // selected or pressed surfaces
  glass: "rgba(247, 249, 244, 0.94)",     // floating bars (tab bar)
  glassBorder: "rgba(23, 39, 29, 0.12)",
  highlight: "rgba(255, 255, 255, 0.7)",  // 1px top edge on cards
  sheen: "rgba(255, 255, 255, 0.3)",      // glossy top edge on the mic button
  scrim: "rgba(23, 39, 29, 0.45)",        // dims the screen behind sheets

  // Text
  text: "#17271D",           // Ink
  textSecondary: "#4A5A4E",
  textMuted: "#4A5A4E",
  textFaint: "#4A5A4E",

  // Lines
  border: "#6E7D71",         // input and control outlines (≥ 3:1 on every surface)
  divider: "rgba(23, 39, 29, 0.12)",

  // Status
  success: "#2F6B3A",
  successBg: "#D9EAD5",
  danger: "#A23B24",         // Ember: recording, errors, delete, low offers
  dangerBg: "#F7E0D8",
  warning: "#845500",        // Amber
  warningText: "#845500",
  warningBg: "#F5E7C8",
  notice: "#17271D",
  noticeBg: "#DCE3D5",

  shadow: "#17271D",
};

/** Night: the V2 forest palette. Same contrast rule; words on clay use dark `onPrimary`. */
const nightColors: Palette = {
  primary: "#C2A47C",        // Warm Clay
  secondary: "#8DB58A",      // Sage
  accent: "#C2A47C",
  price: "#C2A47C",
  earth: "#806044",
  decor: "#806044",
  sand: "#263C30",
  onPrimary: "#111B17",

  background: "#142219",     // Forest
  card: "#1D3027",           // Deep Olive
  surfaceRaised: "#263C30",  // lighter than V2's Moss, so clay and ember text pass 4.5:1 on it
  glass: "rgba(29, 48, 39, 0.94)",
  glassBorder: "rgba(216, 208, 189, 0.12)",
  highlight: "rgba(216, 208, 189, 0.08)",
  sheen: "rgba(255, 255, 255, 0.25)",
  scrim: "rgba(0, 0, 0, 0.55)",

  text: "#D8D0BD",           // Natural Linen
  textSecondary: "#A7B0A1",
  textMuted: "#A7B0A1",
  textFaint: "#A7B0A1",

  border: "#74826F",
  divider: "rgba(216, 208, 189, 0.12)",

  success: "#8DB58A",
  successBg: "#243B2C",
  danger: "#E58A6E",         // Ember
  dangerBg: "#3D2620",
  warning: "#E3A84B",        // Amber
  warningText: "#E3A84B",
  warningBg: "#3A2F1A",
  notice: "#D8D0BD",
  noticeBg: "#263C30",

  shadow: "#000000",
};

export type Palette = typeof dayColors;
export type ThemeMode = "day" | "night";
let currentMode: ThemeMode = "day";

/** The live tokens. Read them at render time or inside themed(); never copy a value into a module-level constant. */
export const colors: Palette = { ...dayColors };

/** Switches every token in place. ThemeContext calls this, then remounts the screens so they redraw. */
export function applyThemeMode(mode: ThemeMode): void {
  currentMode = mode;
  Object.assign(colors, mode === "night" ? nightColors : dayColors);
}

/**
 * Styles that follow the theme: built on first use in each mode, then reused.
 * Usage: const styles = themed(() => StyleSheet.create({ ... }));
 */
export function themed<T extends object>(build: () => T): T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  return new Proxy({} as T, {
    get: (_, key) => (cache[currentMode] ??= build())[key as keyof T],
  });
}

/**
 * Font files in assets/fonts (SIL Open Font License), loaded in App.tsx.
 * Custom fonts ignore fontWeight on Android, so bold text uses the bold family instead.
 * Neither family has the peso sign: big prices draw ₱ separately (components/PriceText).
 */
export const fonts = {
  regular: "AtkinsonHyperlegible-Regular",  // body: designed for low-vision readers
  bold: "AtkinsonHyperlegible-Bold",
  display: "BarlowCondensed-ExtraBold",     // prices, temperatures, titles: market-sign lettering
  displaySemi: "BarlowCondensed-SemiBold",
};

/**
 * Scale 14 / 18 / 22 / 30 / 56. Line heights stay ≥ 1.25× the size (both fonts need ~1.24),
 * so Android never clips tall numbers. Labels are sentence case, never all caps.
 */
export const type = {
  overline:  { fontSize: 14, lineHeight: 20, fontFamily: fonts.bold },   // small label beside or under a value
  caption:   { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  body:      { fontSize: 18, lineHeight: 26, fontFamily: fonts.regular },
  bodyLarge: { fontSize: 18, lineHeight: 28, fontFamily: fonts.regular },
  title:     { fontSize: 22, lineHeight: 28, fontFamily: fonts.regular },
  headline:  { fontSize: 30, lineHeight: 38, fontFamily: fonts.display },
  display:   { fontSize: 56, lineHeight: 70, fontFamily: fonts.display, fontVariant: ["tabular-nums" as const] },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

/** Minimum size of anything tappable (Android guideline: 48dp). */
export const touch = {
  min: 48,
};

/** In daylight, edges do most of the work; the shadow only lifts cards slightly off the page. */
export const cardShadow = () => ({
  shadowColor: colors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
});

/** Short, consistent motion. Everything non-essential turns off with the phone's reduce-motion setting. */
export const motion = {
  press: 120,        // press-in / press-out
  enter: 220,        // card entrance
  stagger: 40,       // delay between successive cards
  pressScale: 0.97,
};
