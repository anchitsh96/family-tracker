import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const bg =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.negative : 'transparent';
  const fg =
    variant === 'primary' ? '#0E0F11' : variant === 'danger' ? '#fff' : colors.textPrimary;
  const border = variant === 'ghost' ? colors.border : 'transparent';
  const opacity = disabled || loading ? 0.5 : 1;

  return (
    <Pressable
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'ghost' ? 1 : 0, opacity },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.txt, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  txt: { fontSize: 16, fontWeight: '600' },
});
