import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Money } from '@/components/Money';
import { useActiveProfile } from '@/state/activeProfile';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { Account, Bucket, BUCKET_ICONS, BUCKET_LABELS } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  onAdd: () => void;
  onPickAccount: (id: string) => void;
}

interface BucketGroup {
  bucket: Bucket;
  total: number;
  accounts: { account: Account; total: number; count: number }[];
}

export function AccountsListScreen({ onAdd, onPickAccount }: Props) {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const dataVersion = useActiveProfile((s) => s.dataVersion);

  const groups = useMemo<BucketGroup[]>(() => {
    if (!activeId) return [];
    const accounts = AccountRepository.listByProfile(activeId);
    const holdings = HoldingRepository.listByProfile(activeId);
    const byAccount = new Map<string, { total: number; count: number }>();
    for (const h of holdings) {
      const cur = byAccount.get(h.accountId) ?? { total: 0, count: 0 };
      cur.total += h.valueInr;
      cur.count += 1;
      byAccount.set(h.accountId, cur);
    }
    const byBucket = new Map<Bucket, BucketGroup>();
    for (const a of accounts) {
      const stats = byAccount.get(a.id) ?? { total: 0, count: 0 };
      const g = byBucket.get(a.bucket) ?? { bucket: a.bucket, total: 0, accounts: [] };
      g.total += stats.total;
      g.accounts.push({ account: a, total: stats.total, count: stats.count });
      byBucket.set(a.bucket, g);
    }
    return Array.from(byBucket.values()).sort((a, b) => b.total - a.total);
  }, [activeId, dataVersion]);

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={styles.h1}>Accounts</Text>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addTxt}>+ Add</Text>
        </Pressable>
      </View>
      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyH}>No holdings yet</Text>
          <Text style={styles.emptyP}>Tap "+ Add" to enter your first one, or use the Documents tab to upload a Zerodha or Groww file.</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.bucket}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) => (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupIcon}>{BUCKET_ICONS[item.bucket]}</Text>
                <Text style={styles.groupTitle}>{BUCKET_LABELS[item.bucket]}</Text>
                <View style={{ flex: 1 }} />
                <Money value={item.total} compact style={styles.groupTotal} />
              </View>
              {item.accounts.map(({ account, total, count }) => (
                <Pressable
                  key={account.id}
                  style={styles.row}
                  onPress={() => onPickAccount(account.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{account.nickname}</Text>
                    <Text style={styles.rowMeta}>{count} holding{count === 1 ? '' : 's'} · {account.provider}</Text>
                  </View>
                  <Money value={total} compact style={styles.rowVal} />
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  h1: { ...typography.h1, color: colors.textPrimary, flex: 1 },
  addBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  addTxt: { color: '#0E0F11', fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyH: { ...typography.h2, color: colors.textPrimary },
  emptyP: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  group: { marginBottom: spacing.lg },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  groupIcon: { fontSize: 18 },
  groupTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  groupTotal: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  rowName: { color: colors.textPrimary, fontSize: 16, fontWeight: '500' },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowVal: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  chev: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.xs },
});
