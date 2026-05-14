import React, { useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { NetWorthCard } from './NetWorthCard';
import {
  NetWorthChart,
  NetWorthPoint,
  Period,
  filterByPeriod,
  computeDelta,
} from './NetWorthChart';
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
  const [period, setPeriod] = useState<Period>('ALL');
  const [data, setData] = useState<{
    profileName: string;
    accentColor: string;
    total: number;
    slices: { bucket: Bucket; value: number }[];
    asOf: string | null;
    history: NetWorthPoint[];
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

    // The net-worth-over-time chart is reconstructed from each holding's
    // value history (see HoldingRepository.netWorthHistory) — every time a
    // holding is added or re-valued, a new point appears. No separate
    // snapshot bookkeeping needed.
    const history = HoldingRepository.netWorthHistory(activeId);

    setData({
      profileName: profile.displayName,
      accentColor: profile.accentColor,
      total,
      slices: Array.from(byBucket.entries()).map(([bucket, value]) => ({
        bucket,
        value,
      })),
      asOf: latestDate,
      history,
    });
  }, [activeId, dataVersion]);

  // Delta for the currently-selected period, derived from the history
  // filtered to that window.
  const delta = useMemo(() => {
    if (!data) return null;
    const windowed = filterByPeriod(data.history, period);
    const d = computeDelta(windowed, period);
    return d ? { value: d.value, percent: d.percent, period: d.label } : null;
  }, [data, period]);

  if (!data) return <Screen />;

  return (
    <Screen>
      <NetWorthCard
        total={data.total}
        asOf={data.asOf}
        profileName={data.profileName}
        accentColor={data.accentColor}
        delta={delta ?? undefined}
      />
      <NetWorthChart
        points={data.history}
        period={period}
        onPeriodChange={setPeriod}
      />
      <Text style={styles.sectionLabel}>Allocation</Text>
      <BucketBreakdown slices={data.slices} total={data.total} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
});
