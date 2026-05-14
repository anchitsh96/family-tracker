import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Screen } from '@/components/Screen';
import { Money } from '@/components/Money';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { AccountRepository } from '@/storage/repositories/AccountRepository';
import {
  HoldingRepository,
  HoldingValuePoint,
} from '@/storage/repositories/HoldingRepository';
import { useActiveProfile } from '@/state/activeProfile';
import { BUCKET_LABELS } from '@/types/account';
import { Holding } from '@/types/holding';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  accountId: string;
  onBack: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AccountDetailScreen({ accountId, onBack }: Props) {
  const dataVersion = useActiveProfile((s) => s.dataVersion);
  const bump = useActiveProfile((s) => s.bump);
  const [, force] = useState(0);
  const [updating, setUpdating] = useState<Holding | null>(null);

  const account = useMemo(() => AccountRepository.get(accountId), [accountId, dataVersion]);
  const holdings = useMemo(
    () => HoldingRepository.listByAccount(accountId),
    [accountId, dataVersion]
  );

  if (!account) {
    return (
      <Screen>
        <Text style={styles.h1}>Account not found</Text>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </Screen>
    );
  }

  const total = holdings.reduce((s: number, h) => s + h.valueInr, 0);

  const deleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This deletes the account and all its holdings. Cannot be undone.',
      [
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
      ]
    );
  };

  const deleteHolding = (id: string, name: string) => {
    Alert.alert('Delete holding?', `Remove "${name}" and its value history? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          HoldingRepository.delete(id);
          bump();
          force((n) => n + 1);
        },
      },
    ]);
  };

  const onValueUpdated = () => {
    setUpdating(null);
    bump();
    force((n) => n + 1);
  };

  return (
    <Screen scroll={false} padded={false}>
      {/* Fixed header — account name, type, and total never scroll. */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ Accounts</Text>
        </Pressable>
        <Text style={styles.h1}>{account.nickname}</Text>
        <Text style={styles.sub}>
          {BUCKET_LABELS[account.bucket]} · {account.provider}
        </Text>
        <Money value={total} style={styles.total} />
      </View>

      {/* The holdings list scrolls in the space below the header. */}
      <FlatList
        style={styles.list}
        data={holdings}
        keyExtractor={(h) => h.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No holdings under this account.</Text>
        }
        ListHeaderComponent={
          holdings.length > 0 ? (
            <Text style={styles.swipeHint}>Swipe a row left for actions</Text>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SwipeableHoldingRow
            holding={item}
            onUpdate={() => setUpdating(item)}
            onDelete={() => deleteHolding(item.id, item.instrumentName)}
          />
        )}
      />

      {/* Pinned footer — outlined destructive button: clearly a button,
          clearly dangerous, and out of the natural tap flow. */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
          onPress={deleteAccount}
        >
          <Text style={styles.deleteBtnTxt}>Delete account</Text>
        </Pressable>
      </View>

      {updating ? (
        <UpdateValueModal holding={updating} onClose={() => setUpdating(null)} onDone={onValueUpdated} />
      ) : null}
    </Screen>
  );
}

// A holding row with iMessage-style swipe actions (swipe left to reveal
// Update + Delete) plus an inline value-history timeline beneath it —
// every past valuation shows as a muted date + value sub-row.
function SwipeableHoldingRow({
  holding,
  onUpdate,
  onDelete,
}: {
  holding: Holding;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  // Re-read history whenever this holding changes (updatedAt bumps on
  // every value update). The most recent entry IS the current value
  // shown in the main row, so the timeline below shows the prior ones.
  const history = useMemo(
    () => HoldingRepository.valueHistory(holding.id),
    [holding.id, holding.updatedAt]
  );
  const prior = history.slice(0, -1).reverse();

  const renderRightActions = (
    _progress: unknown,
    _translation: unknown,
    methods: SwipeableMethods
  ) => (
    <View style={styles.swipeActions}>
      <Pressable
        style={[styles.swipeAction, { backgroundColor: colors.accent }]}
        onPress={() => {
          methods.close();
          onUpdate();
        }}
      >
        <Text style={styles.swipeActionTxt}>Update</Text>
      </Pressable>
      <Pressable
        style={[styles.swipeAction, { backgroundColor: colors.negative }]}
        onPress={() => {
          methods.close();
          onDelete();
        }}
      >
        <Text style={styles.swipeActionTxt}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <View>
      <ReanimatedSwipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
        friction={2}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>
              {holding.instrumentName}
            </Text>
            <Text style={styles.meta}>
              {holding.quantity != null ? `${holding.quantity} units · ` : ''}as of{' '}
              {holding.asOfDate}
            </Text>
          </View>
          <Money value={holding.valueInr} compact style={styles.val} />
        </View>
      </ReanimatedSwipeable>

      {prior.length > 0 ? (
        <View style={styles.historyList}>
          {prior.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={styles.historyRail} />
              <Text style={styles.historyDate}>{h.asOfDate}</Text>
              <View style={{ flex: 1 }} />
              <Money value={h.valueInr} compact style={styles.historyVal} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Modal to re-value a holding. Appends a value-history row at the chosen
// date and updates the holding's current value.
//
// Layout: a near-full-height sheet. The form scrolls; the Save button is
// pinned in a footer that a KeyboardAvoidingView lifts to sit directly
// above the (overlaying) numeric keyboard. The numeric keypad has no
// return key, so the header carries a "Done" that dismisses keyboard +
// sheet, and tapping anywhere in the scroll area dismisses the keyboard.
function UpdateValueModal({
  holding,
  onClose,
  onDone,
}: {
  holding: Holding;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(String(holding.valueInr));
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);

  const history: HoldingValuePoint[] = useMemo(
    () => HoldingRepository.valueHistory(holding.id),
    [holding.id]
  );

  const save = () => {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (!isFinite(parsed) || parsed < 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Date must be YYYY-MM-DD');
      return;
    }
    Keyboard.dismiss();
    HoldingRepository.updateValue(holding.id, parsed, date.trim());
    onDone();
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Tappable gap above the sheet — dismisses the whole modal. */}
        <Pressable style={{ height: insets.top + 36 }} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Update value</Text>
              <Text style={styles.sheetName} numberOfLines={1}>
                {holding.instrumentName}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              hitSlop={10}
            >
              <Text style={styles.sheetDone}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              label="New value (₹)"
              value={value}
              onChangeText={(t) => {
                setValue(t);
                setError(null);
              }}
              keyboardType="numeric"
              placeholder="0"
            />
            <TextInput
              label="As of date"
              value={date}
              onChangeText={(t) => {
                setDate(t);
                setError(null);
              }}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              hint="The date this value is accurate for"
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}

            {history.length > 0 ? (
              <View style={styles.histBox}>
                <Text style={styles.histTitle}>History</Text>
                {history
                  .slice()
                  .reverse()
                  .map((h) => (
                    <View key={h.id} style={styles.histRow}>
                      <Text style={styles.histDate}>{h.asOfDate}</Text>
                      <Money value={h.valueInr} compact style={styles.histVal} />
                    </View>
                  ))}
              </View>
            ) : null}
          </ScrollView>

          {/* Pinned footer — KeyboardAvoidingView lifts this above the keyboard. */}
          <View
            style={[
              styles.sheetFooter,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
            ]}
          >
            <PrimaryButton title="Save update" onPress={save} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fixed header above the scrolling list.
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  back: { color: colors.accent, fontSize: 14, marginBottom: spacing.sm },
  h1: { ...typography.h1, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  total: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.md },

  // Scrolling holdings list — fills the space between header and footer.
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },

  empty: { color: colors.textMuted, paddingVertical: spacing.lg },
  swipeHint: {
    ...typography.micro,
    color: colors.textMuted,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
    // Solid background so the swipe actions don't bleed through the row.
    backgroundColor: colors.bg,
  },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  val: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  swipeActions: { flexDirection: 'row' },
  swipeAction: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeActionTxt: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: '700',
  },
  // Inline value-history timeline beneath a holding row.
  historyList: {
    paddingLeft: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: spacing.sm,
  },
  historyRail: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  historyDate: { color: colors.textMuted, fontSize: 12 },
  historyVal: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  link: { color: colors.accent, marginTop: spacing.md },

  // Pinned footer with the destructive action.
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  // Outlined (not filled) so it reads as a clear button but doesn't invite
  // an accidental tap the way a big solid red bar would. Confirmed by an
  // Alert on press.
  deleteBtn: {
    borderWidth: 1.5,
    borderColor: colors.negative,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteBtnTxt: { color: colors.negative, fontWeight: '700', fontSize: 15 },

  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  sheetScroll: { padding: spacing.lg },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  sheetTitle: { ...typography.h2, color: colors.textPrimary },
  sheetName: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sheetDone: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  err: { color: colors.negative, fontSize: 13, marginBottom: spacing.sm },
  histBox: {
    marginTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  histTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  histDate: { color: colors.textSecondary, fontSize: 13 },
  histVal: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
