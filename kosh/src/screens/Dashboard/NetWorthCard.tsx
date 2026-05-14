import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Money } from '@/components/Money';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  total: number;
  asOf: string | null;
  profileName: string;
  accentColor: string;
  delta?: { value: number; percent: number; period: string };
}

// Robinhood-style net worth headline: profile name as small kicker, then the
// big tabular-figure amount, then a coloured delta line.
export function NetWorthCard({ total, asOf, profileName, delta }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>{profileName}</Text>
      <Money value={total} style={styles.amount} />
      {delta ? (
        <View style={styles.deltaRow}>
          <Text
            style={[
              styles.delta,
              { color: delta.value >= 0 ? colors.positive : colors.negative },
            ]}
          >
            {delta.value >= 0 ? '▲' : '▼'} {`₹${Math.abs(delta.value).toLocaleString('en-IN')}`}
            {' '}
            ({delta.percent.toFixed(2)}%)
          </Text>
          <Text style={styles.deltaPeriod}>  {delta.period}</Text>
        </View>
      ) : (
        <Text style={styles.asOf}>{asOf ? `as of ${asOf}` : 'no holdings yet'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  kicker: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  amount: {
    ...typography.display,
    color: colors.textPrimary,
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  delta: { ...typography.caption, fontWeight: '600' },
  deltaPeriod: { ...typography.caption, color: colors.textMuted },
  asOf: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
