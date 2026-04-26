// Kosh light-mode palette. Pastel-mint accents over a warm off-white base.
// Inspired by the Robinhood feel (large clean numerals, generous whitespace,
// pill chips) but with a calmer green so the app feels its own.

export const colors = {
  // Surfaces
  bg: '#FFFFFF',
  surface: '#F7F8F7', // warm off-white inset (used for promotional cards / pills)
  surfaceAlt: '#EEF1EF',
  border: '#E5E8E6', // hairline divider
  hairline: '#F0F2F0',

  // Text
  textPrimary: '#0E1413', // near-black with a faint warm green undertone
  textSecondary: '#5F6664',
  textMuted: '#9CA29F',
  textInverse: '#FFFFFF',

  // Brand & semantic
  accent: '#5BAB87', // pastel mint (used for primary CTAs, active pills)
  accentSoft: '#C8E8D7', // lightened tint for backgrounds / focus halos
  accentDeep: '#3F8C6A', // pressed/active state for the accent
  accentInk: '#FFFFFF', // text on accent
  positive: '#3FA176',
  negative: '#D67373', // pastel coral
  warning: '#D4A24C',

  // Profile accents — distinct, both pastel
  profileAnchit: '#5BAB87',
  profileDad: '#9F7BC9',

  // Per-bucket colors used by the breakdown chart/list. Tuned for legibility
  // against the white background — slightly desaturated, all pastel-ish.
  bucket: {
    equity_india: '#5BAB87',
    equity_pms: '#3F9A92',
    equity_us: '#6FA6D9',
    mutual_funds: '#9F7BC9',
    bonds: '#D4A24C',
    nps: '#D584B0',
    ppf: '#E69875',
    epf: '#D4B954',
    fd: '#8FA0AC',
    rd: '#B0BEC9',
    startup_equity: '#D67373',
    real_estate: '#5DC0CB',
    insurance: '#C580D6',
    other: '#A0A6A4',
  },
} as const;
