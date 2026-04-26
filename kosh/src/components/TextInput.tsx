import React, { forwardRef, useState } from 'react';
import { TextInput as RNTextInput, TextInputProps, View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

// Underline-only input. Quiet by default; the underline tints to the accent
// when focused, and to the error color when invalid.
export const TextInput = forwardRef<RNTextInput, Props>(
  ({ label, error, hint, style, onFocus, onBlur, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const onFocusInner = (e: any) => {
      setFocused(true);
      onFocus?.(e);
    };
    const onBlurInner = (e: any) => {
      setFocused(false);
      onBlur?.(e);
    };
    const underlineColor = error
      ? colors.negative
      : focused
        ? colors.accent
        : colors.border;
    return (
      <View style={styles.wrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={[styles.underline, { borderBottomColor: underlineColor }]}>
          <RNTextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            style={[styles.input, style]}
            onFocus={onFocusInner}
            onBlur={onBlurInner}
            {...rest}
          />
        </View>
        {error ? (
          <Text style={styles.err}>{error}</Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
    );
  }
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  underline: {
    borderBottomWidth: 1.5,
    paddingHorizontal: 0,
  },
  input: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 12,
    paddingHorizontal: 0,
    minHeight: 48,
  },
  err: { ...typography.caption, color: colors.negative, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
