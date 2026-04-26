import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as LocalAuth from 'expo-local-authentication';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { openDb } from '@/storage/db';
import {
  getPassphraseFromKeychain,
  isBiometricEnabled,
  getLastActiveProfile,
} from '@/crypto/keystore';
import { useAuth } from '@/state/auth';
import { useActiveProfile } from '@/state/activeProfile';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';

export function LockScreen() {
  const setStatus = useAuth((s) => s.setStatus);
  const setActive = useActiveProfile((s) => s.setActive);
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);

  const finalizeUnlock = useCallback(async () => {
    const profiles = ProfileRepository.list();
    const lastId = await getLastActiveProfile();
    const last = lastId ? profiles.find((p) => p.id === lastId) : undefined;
    const target = last ?? profiles.find((p) => p.isDefault) ?? profiles[0];
    if (target) setActive(target.id);
    setStatus('unlocked');
  }, [setStatus, setActive]);

  const tryBiometric = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const enabled = await isBiometricEnabled();
      if (!enabled) {
        setBusy(false);
        return;
      }
      const compat = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      if (!compat || !enrolled) {
        setBusy(false);
        return;
      }
      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Unlock Kosh',
        cancelLabel: 'Use passphrase',
        disableDeviceFallback: false,
      });
      if (!result.success) {
        setBusy(false);
        return;
      }
      const passphrase = await getPassphraseFromKeychain();
      if (!passphrase) {
        setBusy(false);
        setError('Could not retrieve key. Use passphrase.');
        return;
      }
      try {
        openDb(passphrase);
        finalizeUnlock();
      } catch (e: any) {
        setError(e?.message === 'WRONG_PASSPHRASE' ? 'Stored key is invalid.' : 'Unlock failed.');
      } finally {
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  }, [busy, finalizeUnlock]);

  useEffect(() => {
    (async () => {
      const compat = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      const enabled = await isBiometricEnabled();
      setBioAvailable(compat && enrolled && enabled);
      if (compat && enrolled && enabled) {
        tryBiometric();
      }
    })();
  }, [tryBiometric]);

  const submit = () => {
    if (!pass) return;
    setBusy(true);
    setError(null);
    try {
      openDb(pass);
      finalizeUnlock();
    } catch (e: any) {
      setAttempts((a) => a + 1);
      setError(e?.message === 'WRONG_PASSPHRASE' ? 'Wrong passphrase.' : 'Unlock failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>Kosh</Text>
          <Text style={styles.sub}>Locked</Text>
        </View>

        <View style={{ marginTop: spacing.xxl }}>
          <TextInput
            label="Passphrase"
            value={pass}
            onChangeText={(t) => {
              setPass(t);
              setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter your passphrase"
            error={error ?? undefined}
            onSubmitEditing={submit}
          />
          <PrimaryButton title="Unlock" onPress={submit} loading={busy} disabled={!pass} />
          {bioAvailable ? (
            <Pressable onPress={tryBiometric} style={styles.bioBtn}>
              <Text style={styles.bioTxt}>Use Face ID</Text>
            </Pressable>
          ) : null}
          {attempts >= 3 ? (
            <Text style={styles.warn}>
              Many failed attempts. If you've forgotten your passphrase you'll need to restore from a backup file.
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.sm },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  brand: { ...typography.display, color: colors.textPrimary, fontSize: 48 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  bioBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.md },
  bioTxt: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  warn: { color: colors.warning, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
