import { TextStyle } from 'react-native';

// Type scale tuned for the Robinhood-style "big numeric headline" pattern.
//
// Notes:
//  • `tabular-nums` keeps digits monospaced so values don't shimmy when the
//    underlying number changes (₹66,67,242.61 vs ₹68,11,000.00).
//  • Weights lean lighter than typical fintech apps — the visual hierarchy
//    comes from size + tight tracking, not boldness.
//  • iOS auto-picks SF Pro for system fonts; we let it. Adding a custom
//    font would force a native rebuild. SF Pro already has tabular figures.

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  // The big net-worth number on the dashboard.
  display: {
    fontSize: 56,
    fontWeight: '500',
    letterSpacing: -1.4,
    ...tabular,
  } as TextStyle,

  // Smaller display, used for screen titles like "Add holding".
  headline: {
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -0.6,
    ...tabular,
  } as TextStyle,

  h1: { fontSize: 24, fontWeight: '600', letterSpacing: -0.2 } as TextStyle,
  h2: { fontSize: 18, fontWeight: '600' } as TextStyle,
  h3: { fontSize: 16, fontWeight: '600' } as TextStyle,

  body: { fontSize: 16, fontWeight: '400' } as TextStyle,
  bodyStrong: { fontSize: 16, fontWeight: '600' } as TextStyle,
  caption: { fontSize: 13, fontWeight: '500' } as TextStyle,
  micro: { fontSize: 11, fontWeight: '500', letterSpacing: 0.4 } as TextStyle,

  // Pill text (period selector, profile chip, badges).
  pill: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 } as TextStyle,

  // Apply on numeric runs to opt in to tabular figures + slight tightening.
  numeric: { ...tabular, fontWeight: '500' } as TextStyle,

  mono: { fontSize: 13, fontFamily: 'Menlo' } as TextStyle,
};
