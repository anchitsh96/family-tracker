import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { usePrivacy } from '@/state/privacy';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

// Top-bar control to flip every monetary figure between readable and a
// Braille-cell pattern. Sits at the switcher's level, on the right.
//   • visible state → neutral pill, eye glyph
//   • hidden state  → accent-filled pill, Braille glyph (thematic: the
//     toggle literally shows Braille when amounts are in Braille)
export function PrivacyToggle() {
  const hidden = usePrivacy((s) => s.hidden);
  const toggle = usePrivacy((s) => s.toggle);
  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: hidden }}
      accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
      style={({ pressed }) => [
        styles.pill,
        hidden && styles.pillActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.icon, hidden && styles.iconActive]}>
        {hidden ? '⠿' : '👁'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  icon: { fontSize: 15, color: colors.textSecondary },
  iconActive: { fontSize: 18, fontWeight: '700', color: colors.accentInk },
});
