import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TextInput } from '@/components/TextInput';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

// Cross-platform passphrase prompt. React Native's Alert.prompt is iOS-only —
// on Android it silently degrades to a button-only dialog. Since the entire
// device-to-device sync flow on Android entry-points through a passphrase
// prompt, we need this rather than Alert.prompt.
//
// Usage:
//   const [prompt, promptHandle] = usePassphrasePrompt();
//   const p = await promptHandle.ask({ title: 'Encrypt with passphrase', ... });
//   // …render <prompt /> somewhere in your tree so the modal can mount.

interface AskOpts {
  title: string;
  message?: string;
  submitLabel?: string;
  destructive?: boolean;
}

interface PendingAsk extends AskOpts {
  resolve: (value: string | null) => void;
}

export function usePassphrasePrompt(): [
  React.ReactElement,
  { ask: (opts: AskOpts) => Promise<string | null> },
] {
  const [pending, setPending] = useState<PendingAsk | null>(null);

  const ask = (opts: AskOpts) =>
    new Promise<string | null>((resolve) => {
      setPending({ ...opts, resolve });
    });

  const onSubmit = (value: string) => {
    pending?.resolve(value);
    setPending(null);
  };
  const onCancel = () => {
    pending?.resolve(null);
    setPending(null);
  };

  const element = (
    <PassphrasePromptModal
      pending={pending}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  return [element, { ask }];
}

function PassphrasePromptModal({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: PendingAsk | null;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');

  // Reset the input each time a new prompt opens so the previous
  // session's text doesn't bleed through.
  React.useEffect(() => {
    if (pending) setValue('');
  }, [pending?.title, pending?.message]);

  if (!pending) return null;

  const submit = () => {
    if (value.length === 0) return;
    onSubmit(value);
  };

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessible={false}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{pending.title}</Text>
          {pending.message ? (
            <Text style={styles.message}>{pending.message}</Text>
          ) : null}
          <TextInput
            label="Passphrase"
            value={value}
            onChangeText={setValue}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.btnGhost}>
              <Text style={styles.btnGhostTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              style={[
                styles.btnPrimary,
                pending.destructive && styles.btnDestructive,
                value.length === 0 && styles.btnDisabled,
              ]}
              disabled={value.length === 0}
            >
              <Text
                style={[
                  styles.btnPrimaryTxt,
                  pending.destructive && styles.btnDestructiveTxt,
                ]}
              >
                {pending.submitLabel ?? 'Continue'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnGhost: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  btnGhostTxt: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  btnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  btnPrimaryTxt: {
    color: colors.accentInk,
    fontWeight: '700',
    fontSize: 14,
  },
  btnDestructive: { backgroundColor: colors.negative },
  btnDestructiveTxt: { color: '#fff' },
  btnDisabled: { opacity: 0.5 },
});
