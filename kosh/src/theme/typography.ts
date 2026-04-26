import { TextStyle } from 'react-native';

export const typography = {
  display: { fontSize: 36, fontWeight: '700', letterSpacing: -0.5 } as TextStyle,
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 } as TextStyle,
  h2: { fontSize: 22, fontWeight: '600' } as TextStyle,
  h3: { fontSize: 18, fontWeight: '600' } as TextStyle,
  body: { fontSize: 16, fontWeight: '400' } as TextStyle,
  bodyStrong: { fontSize: 16, fontWeight: '600' } as TextStyle,
  caption: { fontSize: 13, fontWeight: '400' } as TextStyle,
  mono: { fontSize: 14, fontFamily: 'Menlo' } as TextStyle,
};
