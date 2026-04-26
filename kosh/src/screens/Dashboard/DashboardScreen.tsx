import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { NetWorthCard } from './NetWorthCard';
import { BucketBreakdown } from './BucketBreakdown';
import { useActiveProfile } from '@/state/activeProfile';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { Bucket } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export function DashboardScreen() {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const dataVersion = useActiveProfile((s) => s.dataVersion);
  const [data, setData] = useState<{
    profileName: string;
    accentColor: string;
    total: number;
    slices: { bucket: Bucket; value: number }[];
    asOf: string | null;
  } | null>(null);

  useEffect(() => {
    if (!activeId) return;
    const profile = ProfileRepository.get(activeId);
    if (!profile) return;
    const accounts = AccountRepository.listByProfile(activeId);
    const accountIdToBucket = new Map(accounts.map((a) => [a.id, a.bucket]));
    const holdings = HoldingRepository.listByProfile(activeId);
    const byBucket = new Map<Bucket, number>();
    let total = 0;
    let latestDate: string | null = null;
    for (const h of holdings) {
      const bucket = accountIdToBucket.get(h.accountId);
      if (!bucket) continue;
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + h.valueInr);
      total += h.valueInr;
      if (!latestDate || h.asOfDate > latestDate) latestDate = h.asOfDate;
    }
    setData({
      profileName: profile.displayName,
      accentColor: profile.accentColor,
      total,
      slices: Array.from(byBucket.entries()).map(([bucket, value]) => ({ bucket, value })),
      asOf: latestDate,
    });
  }, [activeId, dataVersion]);

  if (!data) return <Screen />;

  return (
    <Screen>
      <NetWorthCard
        total={data.total}
        asOf={data.asOf}
        profileName={data.profileName}
        accentColor={data.accentColor}
      />
      <Text style={styles.sectionLabel}>Allocation</Text>
      <BucketBreakdown slices={data.slices} total={data.total} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
});
