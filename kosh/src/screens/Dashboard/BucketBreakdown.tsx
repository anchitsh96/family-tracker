import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bucket, BUCKET_LABELS } from '@/types/account';
import { Money } from '@/components/Money';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Slice {
  bucket: Bucket;
  value: number;
}

interface Props {
  slices: Slice[];
  total: number;
}

// Clean list-style allocation breakdown.
// Each row: color dot · bucket label · spacer · amount · % share
// A subtle stacked progress bar sits at the top so you still get a "shape"
// without the visual weight of a donut chart.
export function BucketBreakdown({ slices, total }: Props) {
  const sorted = [...slices].sort((a, b) => b.value - a.value).filter((s) => s.value > 0);
  if (sorted.length === 0 || total <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTxt}>Add holdings to see your allocation</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.bar}>
        {sorted.map((s, idx) => (
          <View
            key={s.bucket}
            style={{
              flexBasis: `${(s.value / total) * 100}%`,
              backgroundColor: colors.bucket[s.bucket],
              height: '100%',
              marginRight: idx === sorted.length - 1 ? 0 : 1,
            }}
          />
        ))}
      </View>
      <View style={styles.list}>
        {sorted.map((s) => (
          <View key={s.bucket} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: colors.bucket[s.bucket] }]} />
            <Text style={styles.label}>{BUCKET_LABELS[s.bucket]}</Text>
            <View style={{ flex: 1 }} />
            <Money value={s.value} compact style={styles.value} />
            <Text style={styles.pct}>{((s.value / total) * 100).toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { ...typography.body, color: colors.textPrimary },
  value: { ...typography.bodyStrong, color: colors.textPrimary },
  pct: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 56,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyTxt: { ...typography.body, color: colors.textMuted },
});
