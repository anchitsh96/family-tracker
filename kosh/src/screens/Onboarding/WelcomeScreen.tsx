import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: Props) {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brand}>Kosh</Text>
          <Text style={styles.subtitle}>Your family's portfolio. On your phone. Encrypted. Yours.</Text>
        </View>

        <View style={styles.bullets}>
          <Bullet text="Two profiles in one app — yours and Dad's." />
          <Bullet text="Encrypted local storage. No cloud, no telemetry, no APIs." />
          <Bullet text="Upload Zerodha and Groww exports, or enter holdings manually." />
        </View>

        <PrimaryButton title="Set up Kosh" onPress={onContinue} />
      </View>
    </Screen>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.dot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', minHeight: 600 },
  hero: { marginTop: spacing.xxxl },
  brand: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  bullets: { marginVertical: spacing.xxl, gap: spacing.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
  },
  bulletText: { ...typography.body, color: colors.textPrimary, flex: 1 },
});
