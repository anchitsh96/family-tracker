import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Money, MoneyUsd } from '@/components/Money';
import { useFx } from '@/state/fx';
import { useActiveProfile } from '@/state/activeProfile';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { Account, Bucket, BUCKET_LABELS } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  onAdd: () => void;
  onPickAccount: (id: string) => void;
}

interface Row {
  account: Account;
  // INR total for the row, live-converted from USD when the account is
  // USD-native (the parser leaves valueInr=0 for USD holdings so that
  // moving FX is reflected here).
  total: number;
  // USD subtotal — populated only for USD accounts. Used to show "$X"
  // under the rupee figure on the row.
  totalUsd?: number;
  count: number;
}

// Robinhood-style flat list. Each row is one account. The bucket is shown
// as a small colored chip above the account name (think genre pill on a list
// row). No duplicate value totals — the only number on a row is the
// account's own value, right-aligned.
export function AccountsListScreen({ onAdd, onPickAccount }: Props) {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const dataVersion = useActiveProfile((s) => s.dataVersion);
  // Live FX rate. Subscribed so the list re-sorts and re-formats when the
  // rate refreshes (e.g. first dashboard mount populates the cache).
  const usdInr = useFx((s) => s.usdInr);

  const rows = useMemo<Row[]>(() => {
    if (!activeId) return [];
    const accounts = AccountRepository.listByProfile(activeId);
    const holdings = HoldingRepository.listByProfile(activeId);
    const byAccount = new Map<
      string,
      { total: number; totalUsd: number; count: number }
    >();
    for (const h of holdings) {
      const cur = byAccount.get(h.accountId) ?? {
        total: 0,
        totalUsd: 0,
        count: 0,
      };
      // USD holdings keep their native value as source of truth; INR
      // contribution is the live conversion (valueInr is 0 for them on
      // purpose — see IndmoneyHoldingsXlsParser).
      const inr =
        h.nativeCurrency === 'USD' && h.valueNative !== undefined
          ? h.valueNative * usdInr
          : h.valueInr;
      cur.total += inr;
      if (h.nativeCurrency === 'USD' && h.valueNative !== undefined) {
        cur.totalUsd += h.valueNative;
      }
      cur.count += 1;
      byAccount.set(h.accountId, cur);
    }
    return accounts
      .map((a) => {
        const stats = byAccount.get(a.id) ?? {
          total: 0,
          totalUsd: 0,
          count: 0,
        };
        const isUsd = a.currency === 'USD';
        return {
          account: a,
          total: stats.total,
          totalUsd: isUsd ? stats.totalUsd : undefined,
          count: stats.count,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [activeId, dataVersion, usdInr]);

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={styles.h1}>Accounts</Text>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addTxt}>+ Add</Text>
        </Pressable>
      </View>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyH}>No holdings yet</Text>
          <Text style={styles.emptyP}>
            Tap "+ Add" to enter your first one, or use the Documents tab to upload a Zerodha or
            Groww file.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.account.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) => (
            <AccountRow row={item} onPress={() => onPickAccount(item.account.id)} />
          )}
        />
      )}
    </Screen>
  );
}

function AccountRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const bucketColor = colors.bucket[row.account.bucket as Bucket];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.bucketChip, { backgroundColor: `${bucketColor}22` }]}>
          <View style={[styles.bucketDot, { backgroundColor: bucketColor }]} />
          <Text style={[styles.bucketLabel, { color: bucketColor }]}>
            {BUCKET_LABELS[row.account.bucket as Bucket]}
          </Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {row.account.nickname}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {row.count} holding{row.count === 1 ? '' : 's'} · {row.account.provider}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={styles.valueCol}>
          <Money value={row.total} compact style={styles.value} />
          {row.totalUsd !== undefined && row.totalUsd > 0 && (
            <MoneyUsd value={row.totalUsd} style={styles.valueSecondary} />
          )}
        </View>
        <Text style={styles.chev}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  h1: { ...typography.headline, color: colors.textPrimary, flex: 1 },
  addBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  addTxt: { color: colors.accentInk, fontWeight: '600', fontSize: 14, letterSpacing: 0.1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyH: { ...typography.h1, color: colors.textPrimary },
  emptyP: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLeft: { flex: 1, gap: 4 },
  bucketChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  bucketDot: { width: 6, height: 6, borderRadius: 3 },
  bucketLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  meta: { color: colors.textMuted, fontSize: 13 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueCol: { alignItems: 'flex-end' },
  value: { color: colors.textPrimary, fontSize: 17, fontWeight: '600' },
  valueSecondary: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  chev: { color: colors.textMuted, fontSize: 22 },
});
