import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Money } from '@/components/Money';
import { ExtractedAccountBundle, ParserSuccess } from '@/types/parser';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useActiveProfile } from '@/state/activeProfile';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { BUCKET_LABELS, BUCKET_ICONS } from '@/types/account';

interface Props {
  result: ParserSuccess;
  filename: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function ConfirmExtractedHoldings({ result, filename, onSaved, onCancel }: Props) {
  const profileId = useActiveProfile((s) => s.activeProfileId)!;
  const bump = useActiveProfile((s) => s.bump);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const totalCount = result.bundles.reduce((s, b) => s + b.holdings.length, 0);
  const totalValue = result.bundles.reduce(
    (s, b) => s + b.holdings.reduce((s2, h) => s2 + h.valueInr, 0),
    0
  );
  const includedCount = totalCount - excluded.size;

  const toggle = (key: string) => {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExcluded(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      for (const bundle of result.bundles) {
        const account = AccountRepository.findOrCreate({
          profileId,
          bucket: bundle.account.bucket,
          provider: bundle.account.provider,
          nickname: bundle.account.nickname,
          currency: bundle.account.currency,
        });
        const newHoldings = bundle.holdings
          .filter((_, idx) => !excluded.has(`${bundle.account.nickname}#${idx}`))
          .map((h) => ({
            accountId: account.id,
            instrumentName: h.instrumentName,
            isin: h.isin,
            quantity: h.quantity,
            unitPrice: h.unitPrice,
            valueInr: h.valueInr,
            asOfDate: h.asOfDate,
            parserName: result.parser.name,
            parserVersion: result.parser.version,
          }));
        HoldingRepository.replaceForAccount(account.id, newHoldings);
      }
      bump();
      onSaved();
    } catch (e: any) {
      setBusy(false);
      console.warn('Save failed:', e?.message);
    }
  };

  // The footer is a sibling of the scroll view in a flex column so it
  // can't overlap or get clipped. We just need to make sure the footer's
  // outer container clears the home indicator inset.
  const footerOuterPadding = Math.max(insets.bottom, spacing.md);

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.body}>
        <Pressable onPress={onCancel} style={styles.backRow}>
          <Text style={styles.back}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.h1}>Review extracted holdings</Text>
        <Text style={styles.sub}>
          From {filename} · {result.parser.name} · {totalCount} rows ·{' '}
          <Money value={totalValue} compact />
        </Text>
        {result.warnings.length > 0 ? (
          <View style={styles.warnBox}>
            {result.warnings.map((w, i) => (
              <Text key={i} style={styles.warnTxt}>
                {w.message}
              </Text>
            ))}
          </View>
        ) : null}

        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          showsVerticalScrollIndicator
        >
          {result.bundles.map((bundle) => (
            <BundleSection
              key={`${bundle.account.bucket}-${bundle.account.nickname}`}
              bundle={bundle}
              excluded={excluded}
              onToggle={toggle}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[styles.footer, { paddingBottom: footerOuterPadding }]}>
        <PrimaryButton
          title={
            includedCount === totalCount
              ? `Save ${totalCount} holdings`
              : `Save ${includedCount} of ${totalCount}`
          }
          onPress={save}
          loading={busy}
          disabled={includedCount === 0}
        />
      </View>
    </Screen>
  );
}

function BundleSection({
  bundle,
  excluded,
  onToggle,
}: {
  bundle: ExtractedAccountBundle;
  excluded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const total = bundle.holdings.reduce((s, h) => s + h.valueInr, 0);
  return (
    <View style={styles.bundle}>
      <View style={styles.bundleHeader}>
        <Text style={styles.bundleIcon}>{BUCKET_ICONS[bundle.account.bucket]}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.bundleTitle}>{bundle.account.nickname}</Text>
          <Text style={styles.bundleMeta}>
            {BUCKET_LABELS[bundle.account.bucket]} · {bundle.holdings.length} holdings
          </Text>
        </View>
        <Money value={total} compact style={styles.bundleTotal} />
      </View>
      {bundle.holdings.map((h, idx) => {
        const key = `${bundle.account.nickname}#${idx}`;
        const isExcluded = excluded.has(key);
        return (
          <Pressable
            key={key}
            onPress={() => onToggle(key)}
            style={[styles.row, isExcluded && styles.rowMuted]}
          >
            <View style={[styles.tick, isExcluded ? styles.tickOff : styles.tickOn]}>
              <Text style={styles.tickGlyph}>{isExcluded ? '' : '✓'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {h.instrumentName}
              </Text>
              <Text style={styles.meta}>
                {h.quantity != null ? `${h.quantity}` : ''}
                {h.unitPrice != null ? ` @ ${h.unitPrice.toFixed(2)}` : ''}
              </Text>
            </View>
            <Money value={h.valueInr} compact style={styles.val} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { flex: 1, marginTop: spacing.md },
  backRow: { paddingVertical: 4, marginBottom: spacing.sm },
  back: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  h1: { ...typography.headline, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  warnBox: {
    backgroundColor: '#FFF6E5',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  warnTxt: { color: colors.warning, fontSize: 12, fontWeight: '500' },
  bundle: { marginBottom: spacing.lg },
  bundleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bundleIcon: { fontSize: 20 },
  bundleTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  bundleMeta: { color: colors.textSecondary, fontSize: 12 },
  bundleTotal: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  rowMuted: { opacity: 0.45 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.accent },
  tickOff: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  tickGlyph: { color: colors.accentInk, fontWeight: '700', fontSize: 14 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: '500' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  val: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
