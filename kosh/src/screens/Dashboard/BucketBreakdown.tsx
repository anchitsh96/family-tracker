import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bucket, BUCKET_LABELS, BUCKET_ICONS } from '@/types/account';
import { Money } from '@/components/Money';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

interface Slice {
  bucket: Bucket;
  value: number;
}

interface Props {
  slices: Slice[];
  total: number;
}

export function BucketBreakdown({ slices, total }: Props) {
  const sorted = [...slices].sort((a, b) => b.value - a.value).filter((s) => s.value > 0);
  if (sorted.length === 0 || total <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTxt}>Add holdings to see your bucket breakdown</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.bar}>
        {sorted.map((s) => (
          <View
            key={s.bucket}
            style={{
              flexBasis: `${(s.value / total) * 100}%`,
              backgroundColor: colors.bucket[s.bucket],
              height: '100%',
            }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {sorted.map((s) => (
          <View key={s.bucket} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: colors.bucket[s.bucket] }]} />
            <Text style={styles.icon}>{BUCKET_ICONS[s.bucket]}</Text>
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
    height: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  legend: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  icon: { fontSize: 16 },
  label: { color: colors.textPrimary, fontSize: 14 },
  value: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  pct: { color: colors.textSecondary, fontSize: 12, width: 56, textAlign: 'right' },
  empty: { padding: spacing.lg, alignItems: 'center' },
  emptyTxt: { color: colors.textMuted, fontSize: 14 },
});
