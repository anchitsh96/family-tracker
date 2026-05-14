// Install Inter as the default font family for every <Text> rendered in
// the app, mapping `fontWeight` to the right Inter cut.
//
// Why this exists: React Native's Text on iOS picks a font cut by the
// PostScript name passed to `fontFamily`, NOT by `fontWeight`. So a style
// like `{ fontWeight: '600' }` with no fontFamily renders the system
// font (SF Pro) at SemiBold — not Inter. Going through every screen and
// adding `fontFamily: 'Inter-SemiBold'` next to each fontWeight would be
// dozens of edits.
//
// Instead we hook RN Text's render method once. For any Text without an
// explicit fontFamily, we read fontWeight off the merged style, look up
// the matching Inter cut, and inject it. Components that DO set
// fontFamily explicitly are left alone.
//
// Side effects: must be imported BEFORE any other module that renders
// Text. App.tsx imports it at the top.

import { StyleSheet, Text, TextStyle } from 'react-native';

const FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': 'Inter-Regular',
  '200': 'Inter-Regular',
  '300': 'Inter-Regular',
  '400': 'Inter-Regular',
  normal: 'Inter-Regular',
  '500': 'Inter-Medium',
  '600': 'Inter-SemiBold',
  '700': 'Inter-Bold',
  '800': 'Inter-Bold',
  '900': 'Inter-Bold',
  bold: 'Inter-Bold',
};

const TextAny = Text as any;
const origRender = TextAny.render;

if (origRender && !TextAny.__interInstalled) {
  TextAny.render = function patchedTextRender(this: unknown, ...args: unknown[]) {
    const element = origRender.apply(this, args);
    if (!element || !element.props) return element;

    const flat: TextStyle = (StyleSheet.flatten(element.props.style) as TextStyle) ?? {};
    if (flat.fontFamily) return element;

    const weight = (flat.fontWeight ?? '400') as string;
    const family = FAMILY_BY_WEIGHT[weight] ?? 'Inter-Regular';

    return {
      ...element,
      props: {
        ...element.props,
        style: [{ fontFamily: family }, element.props.style],
      },
    };
  };
  TextAny.__interInstalled = true;
}
