import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

interface Props {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  // `inset`: subtle off-white card for promos. `flat`: no background, just
  // a hairline divider underneath.
  variant?: 'inset' | 'flat';
}

export function Card({ children, style, onPress, variant = 'inset' }: Props) {
  const cardStyle = variant === 'flat' ? styles.flat : styles.inset;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, style, pressed ? { opacity: 0.85 } : null]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  inset: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  flat: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
