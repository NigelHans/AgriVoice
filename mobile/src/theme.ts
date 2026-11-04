/**
 * AgriVoice design tokens: one palette, type scale, spacing and touch size for every screen.
 *
 * Contrast rules (WCAG, measured): every text color below passes 4.5:1 on `card` and
 * `background`. `warning` (Harvest Amber) and `decor` (Light Soil) fail as text: use them only
 * as fills, borders, icons or illustrations, with `text`/`warningText` for any words on them.
 */
export const colors = {
  // Brand: green dominant, brown as a quiet accent
  primary: "#245C3A",        // Forest Green: header, primary buttons, active states
  secondary: "#477A50",      // Agricultural Green: secondary actions, neutral icons
  accent: "#8B6242",         // Earth Brown: small accent text (dates, sources), never large areas
  decor: "#B99A78",          // Light Soil: illustrations and decoration only — not for text
  sand: "#E9DDCC",           // Soft Sand: subtle panels and dividers
  onPrimary: "#FFFFFF",      // text and icons on primary / secondary

  // Surfaces
  background: "#F7F7F0",     // Warm Ivory: screen background
  card: "#FFFFFF",

  // Text (Charcoal and two lighter steps, all ≥ 5:1 on white and ivory)
  text: "#343C35",
  textSecondary: "#535B54",
  textMuted: "#636B64",
  textFaint: "#636B64",      // kept for existing screens; same as textMuted so small text stays readable

  // Lines
  border: "#8F877B",         // input and control outlines (≥ 3:1 against white)
  divider: "#E9DDCC",        // decorative separators

  // Status
  success: "#245C3A",
  successBg: "#E3EFE5",
  danger: "#B3261E",         // errors, delete, recording
  dangerBg: "#FBE9E7",
  warning: "#E7A33E",        // Harvest Amber: fills, edges and icons only
  warningText: "#7A4E0A",    // text that means "warning" or "old"
  warningBg: "#FBEFD8",
  notice: "#5E4630",         // text on noticeBg (e.g. weather fallback notice)
  noticeBg: "#E9DDCC",

  shadow: "#000000",
};

/** Font sizes with comfortable line heights. Nothing smaller than `caption`. */
export const type = {
  caption:   { fontSize: 14, lineHeight: 20 },
  body:      { fontSize: 16, lineHeight: 24 },
  bodyLarge: { fontSize: 18, lineHeight: 26 },
  title:     { fontSize: 20, lineHeight: 28 },
  headline:  { fontSize: 24, lineHeight: 32 },
  display:   { fontSize: 32, lineHeight: 40 },
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
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

/** Minimum size of anything tappable (Android guideline: 48dp). */
export const touch = {
  min: 48,
};

/** The one card shadow, so every raised surface looks the same on iOS and Android. */
export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
