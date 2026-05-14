import { TextStyle } from 'react-native';

// Inter typography, modelled on Wise's design system. Inter is the
// primary typeface across UI (Wise reserves a separate "Wise Sans" for
// promotional display moments — we don't have that font, so we use Inter
// at a heavier weight for our display headlines).
//
// IMPORTANT: in React Native with custom fonts you cannot rely on
// `fontWeight` to pick the right cut. iOS resolves the cut by exact
// PostScript family name. So we set `fontFamily: 'Inter-…'` for every
// style and DON'T set fontWeight (it's baked into the family name).
//
// Weights we ship (loaded in App.tsx via @expo-google-fonts/inter):
//   Inter-Regular   = 400
//   Inter-Medium    = 500
//   Inter-SemiBold  = 600
//   Inter-Bold      = 700

export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  // Display: very large net-worth headline. Inter Bold reads almost like
  // a custom display font at 56pt with tight tracking.
  display: {
    fontFamily: fonts.bold,
    fontSize: 56,
    letterSpacing: -1.6,
    ...tabular,
  } as TextStyle,

  // Headline: screen titles ("Review extracted holdings", "Accounts").
  headline: {
    fontFamily: fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.6,
    ...tabular,
  } as TextStyle,

  h1: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.2,
  } as TextStyle,

  h2: { fontFamily: fonts.semibold, fontSize: 18 } as TextStyle,
  h3: { fontFamily: fonts.semibold, fontSize: 16 } as TextStyle,

  body: { fontFamily: fonts.regular, fontSize: 16 } as TextStyle,
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16 } as TextStyle,
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16 } as TextStyle,
  caption: { fontFamily: fonts.medium, fontSize: 13 } as TextStyle,
  micro: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.4 } as TextStyle,

  pill: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.1 } as TextStyle,

  // Apply on numeric runs to opt into tabular figures + Inter Medium.
  numeric: { ...tabular, fontFamily: fonts.medium } as TextStyle,

  mono: { fontFamily: 'Menlo', fontSize: 13 } as TextStyle,
};
