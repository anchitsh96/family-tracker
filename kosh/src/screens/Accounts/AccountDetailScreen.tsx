import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { Money } from '@/components/Money';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { useActiveProfile } from '@/state/activeProfile';
import { BUCKET_LABELS } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  accountId: string;
  onBack: () => void;
}

export function AccountDetailScreen({ accountId, onBack }: Props) {
  const dataVersion = useActiveProfile((s) => s.dataVersion);
  const bump = useActiveProfile((s) => s.bump);
  const [, force] = useState(0);

  const account = useMemo(() => AccountRepository.get(accountId), [accountId, dataVersion]);
  const holdings = useMemo(() => HoldingRepository.listByAccount(accountId), [accountId, dataVersion]);

  if (!account) {
    return (
      <Screen>
        <Text style={styles.h1}>Account not found</Text>
        <Pressable onPress={onBack}><Text style={styles.link}>Go back</Text></Pressable>
      </Screen>
    );
  }

  const total = holdings.reduce((s: number, h) => s + h.valueInr, 0);

  const deleteAccount = () => {
    Alert.alert('Delete account?', 'This deletes the account and all its holdings. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          AccountRepository.delete(accountId);
          bump();
          onBack();
        },
      },
    ]);
  };

  const deleteHolding = (id: string) => {
    HoldingRepository.delete(id);
    bump();
    force((n) => n + 1);
  };

  return (
    <Screen scroll={false}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ Accounts</Text></Pressable>
      <Text style={styles.h1}>{account.nickname}</Text>
      <Text style={styles.sub}>{BUCKET_LABELS[account.bucket]} · {account.provider}</Text>
      <Money value={total} style={styles.total} />

      <FlatList
        style={{ marginTop: spacing.lg }}
        data={holdings}
        keyExtractor={(h) => h.id}
        ListEmptyComponent={<Text style={styles.empty}>No holdings under this account.</Text>}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.instrumentName}</Text>
              <Text style={styles.meta}>
                {item.quantity != null ? `${item.quantity} units · ` : ''}as of {item.asOfDate}
              </Text>
            </View>
            <Money value={item.valueInr} compact style={styles.val} />
            <Pressable onPress={() => deleteHolding(item.id)} hitSlop={12}>
              <Text style={styles.del}>×</Text>
            </Pressable>
          </View>
        )}
      />

      <Pressable style={styles.dangerBtn} onPress={deleteAccount}>
        <Text style={styles.dangerTxt}>Delete account</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accent, fontSize: 14, marginBottom: spacing.sm },
  h1: { ...typography.h1, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  total: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.md },
  empty: { color: colors.textMuted, padding: spacing.lg },
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
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  val: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  del: { color: colors.negative, fontSize: 22, paddingLeft: spacing.sm },
  link: { color: colors.accent, marginTop: spacing.md },
  dangerBtn: { padding: spacing.md, alignItems: 'center' },
  dangerTxt: { color: colors.negative, fontWeight: '600' },
});
