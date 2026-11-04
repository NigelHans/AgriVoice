/**
 * AgriVoice V2.1 "Organic Liquid Glass" design tokens — dark first.
 *
 * Contrast rules (WCAG, measured): every text color passes 4.5:1 on `background` and `card`.
 * Earth Brown (`earth`, `decor`) and Moss (`surfaceRaised`) fail as text: use them only for
 * surfaces, lines, textures and illustrations. Words on Warm Clay use `onPrimary` (dark).
 * Token names from V1 are kept, so every screen keeps working while it is redesigned.
 */
export const colors = {
  // Brand accents: clay leads, brown supports, greens stay calm (no neon)
  primary: "#C2A47C",        // Warm Clay: active states, primary buttons, key numbers
  secondary: "#8DB58A",      // Sage: secondary actions, neutral icons
  accent: "#C2A47C",         // small accent text (dates, sources); brown is too dark for text here
  earth: "#806044",          // Earth Brown: lines, timeline rails, textures — not for text
  decor: "#806044",          // illustrations only — not for text
  sand: "#30483A",           // neutral panels (was Soft Sand in V1)
  onPrimary: "#111B17",      // text and icons on clay / sage / ember fills

  // Surfaces: layered greens, never pure black
  background: "#111B17",     // Midnight Forest
  card: "#1D3027",           // Deep Olive
  surfaceRaised: "#30483A",  // Moss: raised, pressed or selected surfaces
  glass: "rgba(29, 48, 39, 0.55)",        // soft glass: tiles and bars over the static background
  glassStrong: "rgba(29, 48, 39, 0.88)",  // dock and sheets without blur (Android); labels stay ≥ 4.5:1 over any content
  glassOverBlur: "rgba(29, 48, 39, 0.62)",// tint laid over real blur (iOS)
  glassBorder: "rgba(216, 208, 189, 0.14)",
  highlight: "rgba(216, 208, 189, 0.08)", // 1px top edge that gives cards depth
  sheen: "rgba(255, 255, 255, 0.25)",     // glossy top edge on solid clay / ember controls
  scrim: "rgba(0, 0, 0, 0.55)",           // dims the screen behind sheets and overlays
  white: "#FFFFFF",                       // only for the sheen gradient (used at low opacity)

  // Background depth and button gradient
  backgroundTop: "#1A2A22",               // top of the screen gradient
  backgroundBottom: "#0E1713",            // bottom of the screen gradient
  clayDeep: "#A98B64",                    // lower end of the clay button gradient (dark text 5.5:1)

  // Text
  text: "#D8D0BD",           // Natural Linen
  textSecondary: "#A7B0A1",
  textMuted: "#A7B0A1",
  textFaint: "#A7B0A1",

  // Lines
  border: "#74826F",         // input and control outlines (≥ 3:1 on card and background)
  divider: "rgba(216, 208, 189, 0.12)",

  // Status
  success: "#8DB58A",
  successBg: "#243B2C",
  danger: "#E58A6E",         // Ember: recording, errors, delete
  dangerBg: "#3D2620",
  warning: "#E3A84B",        // Amber: warnings (readable as text on dark)
  warningText: "#E3A84B",
  warningBg: "#3A2F1A",
  notice: "#D8D0BD",
  noticeBg: "#30483A",

  shadow: "#000000",
};

/** Refined scale: large numbers for prices and temperatures, a letter-spaced overline for labels. */
export const type = {
  overline:  { fontSize: 12, lineHeight: 16, letterSpacing: 1.2, fontWeight: "700" as const, textTransform: "uppercase" as const },
  caption:   { fontSize: 14, lineHeight: 20 },
  body:      { fontSize: 16, lineHeight: 24 },
  bodyLarge: { fontSize: 18, lineHeight: 26 },
  title:     { fontSize: 20, lineHeight: 28 },
  headline:  { fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  display:   { fontSize: 40, lineHeight: 50, letterSpacing: -0.4 },
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

/** Depth on dark comes from a light top edge plus a soft shadow (Android shadows are faint on dark). */
export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

/** Short, consistent motion. Everything non-essential turns off with the phone's reduce-motion setting. */
export const motion = {
  press: 120,        // press-in / press-out
  enter: 220,        // card entrance
  stagger: 40,       // delay between successive cards
  pressScale: 0.97, pressSpeed: 40, pressBounce: 6,
};

/**
 * Glass settings. Real blur is used only on iOS (expo-blur); Android uses the frosted look
 * (strong tint, sheen, fine border), because expo-blur's Android blur is experimental in SDK 51.
 * Set blur to false to turn real blur off everywhere.
 */
export const glass = {
  blur: true,
  intensity: 50,
  sheenOpacity: 0.1,   // strength of the light sheen across the top of glass and cards
};
