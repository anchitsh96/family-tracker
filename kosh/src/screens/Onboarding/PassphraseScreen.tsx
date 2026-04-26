import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { evaluateStrength, isPassphraseAcceptable } from '@/crypto/passphrase';

interface Props {
  onContinue: (passphrase: string) => void;
}

export function PassphraseScreen({ onContinue }: Props) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const strength = evaluateStrength(pass);
  const segments = [0, 1, 2, 3].map((i) => i < strength.score);

  const submit = () => {
    const ok = isPassphraseAcceptable(pass);
    if (!ok.ok) {
      setError(ok.reason);
      return;
    }
    setError(null);
    onContinue(pass);
  };

  return (
    <Screen>
      <View>
        <Text style={styles.h1}>Choose a passphrase</Text>
        <Text style={styles.sub}>
          This unlocks your encrypted database. We never store it. If you forget it, you'll need
          your backup file or recovery phrase.
        </Text>

        <View style={{ marginTop: spacing.xl }}>
          <TextInput
            label="Passphrase"
            value={pass}
            onChangeText={(t) => {
              setPass(t);
              setError(null);
            }}
            secureTextEntry={false}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="At least 12 characters"
            error={error ?? undefined}
          />

          <View style={styles.strengthRow}>
            {segments.map((on, i) => (
              <View
                key={i}
                style={[
                  styles.strengthSeg,
                  { backgroundColor: on ? barColor(strength.score) : colors.border },
                ]}
              />
            ))}
            <Text style={[styles.strengthLabel, { color: barColor(strength.score) }]}>
              {strength.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <PrimaryButton title="Continue" onPress={submit} disabled={pass.length < 12} />
      </View>
    </Screen>
  );
}

function barColor(score: number) {
  if (score <= 1) return colors.negative;
  if (score === 2) return colors.warning;
  return colors.positive;
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.xl },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, marginLeft: spacing.sm, minWidth: 60, textAlign: 'right' },
});
