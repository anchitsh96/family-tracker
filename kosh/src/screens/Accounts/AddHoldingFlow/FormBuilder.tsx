import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export type FieldKind = 'text' | 'number' | 'date' | 'enum' | 'currency';

export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for kind=enum
  hint?: string;
  defaultValue?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  fields: FormField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
}

export function FormBuilder({ title, subtitle, fields, submitLabel = 'Save', onSubmit }: Props) {
  const initial: Record<string, string> = Object.fromEntries(
    fields.map((f) => [f.key, f.defaultValue ?? ''])
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key]?.trim() ?? '';
      if (f.required && !v) {
        errs[f.key] = 'Required';
        continue;
      }
      if (v && (f.kind === 'number' || f.kind === 'currency')) {
        if (isNaN(Number(v))) errs[f.key] = 'Must be a number';
      }
      if (v && f.kind === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) errs[f.key] = 'YYYY-MM-DD';
      }
      if (v && f.kind === 'enum' && f.options && !f.options.includes(v)) {
        errs[f.key] = `Must be one of: ${f.options.join(', ')}`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    setSubmitErr(null);
    try {
      await onSubmit(values);
    } catch (e: any) {
      setSubmitErr(e?.message ?? 'Save failed');
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.h1}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      <View style={{ marginTop: spacing.lg }}>
        {fields.map((f) => (
          <FormFieldInput
            key={f.key}
            field={f}
            value={values[f.key] ?? ''}
            onChange={(v) => {
              setValues({ ...values, [f.key]: v });
              if (errors[f.key]) setErrors({ ...errors, [f.key]: '' });
            }}
            error={errors[f.key]}
          />
        ))}
      </View>
      {submitErr ? <Text style={styles.err}>{submitErr}</Text> : null}
      <PrimaryButton title={submitLabel} onPress={submit} loading={busy} />
    </View>
  );
}

function FormFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  if (field.kind === 'enum' && field.options) {
    return (
      <View style={styles.enumWrap}>
        <Text style={styles.enumLabel}>{field.label}</Text>
        <View style={styles.chipRow}>
          {field.options.map((o) => (
            <Chip key={o} text={o} active={value === o} onPress={() => onChange(o)} />
          ))}
        </View>
        {error ? <Text style={styles.errSmall}>{error}</Text> : null}
      </View>
    );
  }
  const keyboardType =
    field.kind === 'number' || field.kind === 'currency' ? 'decimal-pad' : 'default';
  return (
    <TextInput
      label={field.label}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder ?? ''}
      keyboardType={keyboardType}
      autoCapitalize={field.kind === 'date' ? 'none' : 'sentences'}
      error={error}
      hint={field.hint ?? undefined}
    />
  );
}

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <View
      onTouchEnd={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
      ]}
    >
      <Text style={{ color: active ? '#0E0F11' : colors.textPrimary, fontWeight: '600' }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  err: { color: colors.negative, marginBottom: spacing.md },
  errSmall: { color: colors.negative, fontSize: 12, marginTop: 4 },
  enumWrap: { marginBottom: spacing.md },
  enumLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
