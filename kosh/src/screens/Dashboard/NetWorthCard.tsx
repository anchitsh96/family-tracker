import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/Card';
import { Money } from '@/components/Money';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  total: number;
  asOf: string | null;
  profileName: string;
  accentColor: string;
}

export function NetWorthCard({ total, asOf, profileName, accentColor }: Props) {
  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Text style={styles.label}>{profileName}'s net worth</Text>
      </View>
      <Money value={total} style={styles.amount} />
      <Text style={styles.asOf}>{asOf ? `as of ${asOf}` : 'no holdings yet'}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...typography.caption, color: colors.textSecondary },
  amount: { ...typography.display, color: colors.textPrimary },
  asOf: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
