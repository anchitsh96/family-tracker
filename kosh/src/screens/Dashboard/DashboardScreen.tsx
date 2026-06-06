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
import { useFx } from '@/state/fx';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export function DashboardScreen() {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const dataVersion = useActiveProfile((s) => s.dataVersion);
  // Subscribe to the live FX rate so the dashboard recomputes whenever
  // the rate updates (cache miss, manual refresh). Treat the rate as a
  // proper input — recompute everything when it changes.
  const usdInr = useFx((s) => s.usdInr);
  const [period, setPeriod] = useState<Period>('ALL');
  const [data, setData] = useState<{
    profileName: string;
    accentColor: string;
    total: number;
    // Each slice carries an optional USD subtotal so the allocation row
    // can show "₹X ($Y)" for buckets that hold native-USD positions.
    slices: { bucket: Bucket; value: number; valueUsd?: number }[];
    asOf: string | null;
    history: NetWorthPoint[];
  } | null>(null);

  // Kick off a stale-cache refresh once per dashboard mount. Cheap (no-op
  // if cache is fresh), and the result triggers a rerender via usdInr.
  useEffect(() => {
    useFx.getState().refreshIfStale();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const profile = ProfileRepository.get(activeId);
    if (!profile) return;
    const accounts = AccountRepository.listByProfile(activeId);
    const accountIdToBucket = new Map(accounts.map((a) => [a.id, a.bucket]));
    const holdings = HoldingRepository.listByProfile(activeId);
    const byBucket = new Map<Bucket, number>();
    const usdByBucket = new Map<Bucket, number>();
    let total = 0;
    let latestDate: string | null = null;
    for (const h of holdings) {
      const bucket = accountIdToBucket.get(h.accountId);
      if (!bucket) continue;
      // For USD-native holdings, convert to INR at the LIVE rate so the
      // dashboard total reflects current FX, not parse-time FX.
      // (The repo seeds valueInr = 0 for USD holdings precisely so we
      // don't accidentally show a stale rupee number.)
      const inr =
        h.nativeCurrency === 'USD' && h.valueNative !== undefined
          ? h.valueNative * usdInr
          : h.valueInr;
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + inr);
      if (h.nativeCurrency === 'USD' && h.valueNative !== undefined) {
        usdByBucket.set(
          bucket,
          (usdByBucket.get(bucket) ?? 0) + h.valueNative
        );
      }
      total += inr;
      if (!latestDate || h.asOfDate > latestDate) latestDate = h.asOfDate;
    }

    // The net-worth-over-time chart is reconstructed from each holding's
    // value history (see HoldingRepository.netWorthHistory) — every time a
    // holding is added or re-valued, a new point appears. Passing the
    // live FX lets the repo re-convert USD points so the whole chart
    // moves with the rate.
    const history = HoldingRepository.netWorthHistory(activeId, usdInr);

    setData({
      profileName: profile.displayName,
      accentColor: profile.accentColor,
      total,
      slices: Array.from(byBucket.entries()).map(([bucket, value]) => ({
        bucket,
        value,
        valueUsd: usdByBucket.get(bucket),
      })),
      asOf: latestDate,
      history,
    });
  }, [activeId, dataVersion, usdInr]);

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
