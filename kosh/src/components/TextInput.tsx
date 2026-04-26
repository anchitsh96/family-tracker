import React, { forwardRef } from 'react';
import { TextInput as RNTextInput, TextInputProps, View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextInput = forwardRef<RNTextInput, Props>(({ label, error, hint, style, ...rest }, ref) => {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <RNTextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.err}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.xs, fontWeight: '500' },
  input: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  inputError: { borderColor: colors.negative },
  err: { color: colors.negative, fontSize: 12, marginTop: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
});
