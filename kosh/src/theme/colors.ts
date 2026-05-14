// Kosh light-mode palette modelled on Wise's design system.
//
// Source: https://wise.design/foundations/colour
// We use Wise's light-mode token set verbatim where the meaning maps:
//   forest green #163300       → primary CTA / brand
//   bright lime  #9FE870       → accent for emphasis (sparing use)
//   near-black   #0E0F0C       → primary text
//   warm grays   #454745/6A6C6A → secondary / tertiary text
//   pure white   #FFFFFF       → screen background
//   green-tinted off-white      → surfaces (cards, pills)
//
// What we deliberately keep distinct from Wise: profile colors (we have
// two profiles — Anchit + Dad — and need them to be visually different).

export const colors = {
  // Surfaces
  bg: '#FFFFFF',
  // Wise's "Background Neutral" is forest-green at 8% — flattens to a
  // warm off-white with a faint green undertone. Used for promo cards,
  // pill backgrounds, list-row insets.
  surface: '#F2F4EE',
  surfaceAlt: '#E8EBE2',
  // Wise borders are near-black at 12% opacity — much more confident
  // than my previous hairline.
  border: '#DEDEDE',
  hairline: '#EEEEEE',

  // Text
  textPrimary: '#0E0F0C',
  textSecondary: '#454745',
  textMuted: '#6A6C6A',
  textInverse: '#FFFFFF',

  // Brand & semantic
  // Primary CTA color — Wise's forest green. Replaces the previous pastel
  // mint accent. Confident, restrained, reads as "go" without shouting.
  accent: '#163300',
  accentInk: '#FFFFFF',
  accentDeep: '#0A1F00', // pressed state
  // Reserved for small high-emphasis moments (a positive delta, an
  // active period chip, a success badge). Don't fill big surfaces with it.
  accentBright: '#9FE870',

  // Money sentiment
  positive: '#2F5711', // forest green family
  negative: '#A8200D', // brick red
  warning: '#EDC843', // warm yellow

  // Profile accents — both grounded greens-and-purples that still work
  // on white. Stay distinct so the active profile is unambiguous.
  profileAnchit: '#163300',
  profileDad: '#6A2D8E',

  // Per-bucket allocation colors. Tuned for legibility on white and
  // distinct from each other when adjacent in the breakdown bar.
  bucket: {
    equity_india: '#2F5711',
    equity_pms: '#3A7E4F',
    equity_us: '#3573B4',
    mutual_funds: '#6A2D8E',
    bonds: '#B7841F',
    nps: '#A24D7A',
    ppf: '#C4633E',
    epf: '#9F8014',
    fd: '#6B7475',
    rd: '#8E96A1',
    startup_equity: '#A8200D',
    real_estate: '#1F8392',
    insurance: '#7C3AED',
    other: '#6A6C6A',
  },
} as const;
