import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Pressable } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LocalAuth from 'expo-local-authentication';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';
import { useActiveProfile } from '@/state/activeProfile';
import { useAuth } from '@/state/auth';
import { changePassphrase, closeDb } from '@/storage/db';
import {
  clearAllSecrets,
  disableBiometricUnlock,
  enableBiometricUnlock,
  getPassphraseFromKeychain,
  isBiometricEnabled,
} from '@/crypto/keystore';
import { createBackup } from '@/crypto/backup';
import { evaluateStrength, isPassphraseAcceptable } from '@/crypto/passphrase';

export function SettingsScreen() {
  const setStatus = useAuth((s) => s.setStatus);
  const setActive = useActiveProfile((s) => s.setActive);
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const profiles = activeId ? ProfileRepository.list() : [];
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [showPassphraseChange, setShowPassphraseChange] = useState(false);

  useEffect(() => {
    isBiometricEnabled().then(setBioEnabled);
  }, []);

  const toggleBio = async (enabled: boolean) => {
    setBioBusy(true);
    try {
      if (enabled) {
        const compat = await LocalAuth.hasHardwareAsync();
        const enrolled = await LocalAuth.isEnrolledAsync();
        if (!compat || !enrolled) {
          Alert.alert('Face ID not available', 'Set up Face ID in iOS Settings first.');
          return;
        }
        const result = await LocalAuth.authenticateAsync({ promptMessage: 'Confirm to enable Face ID' });
        if (!result.success) return;
        const stored = await getPassphraseFromKeychain();
        if (!stored) {
          Alert.alert(
            'Need passphrase',
            'To enable biometric unlock we need to re-store your passphrase. Lock the app, sign in with your passphrase, then enable biometric from this screen.'
          );
          return;
        }
        await enableBiometricUnlock(stored);
        setBioEnabled(true);
      } else {
        await disableBiometricUnlock();
        setBioEnabled(false);
      }
    } finally {
      setBioBusy(false);
    }
  };

  const lockNow = () => {
    closeDb();
    setStatus('locked');
  };

  const wipe = () => {
    Alert.alert(
      'Erase all data?',
      'Deletes the encrypted database and all stored secrets. Your backups (if any) are not affected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: async () => {
            closeDb();
            await clearAllSecrets();
            try {
              const dir = FileSystem.documentDirectory ?? '';
              for (const name of ['kosh.db', 'kosh.db-shm', 'kosh.db-wal']) {
                const p = `${dir}${name}`;
                const info = await FileSystem.getInfoAsync(p);
                if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
              }
            } catch {
              // ignore
            }
            setStatus('first_run');
          },
        },
      ]
    );
  };

  const exportBackup = async () => {
    Alert.prompt('Backup passphrase', 'Use the same passphrase as this app for now.', async (p?: string) => {
      if (!p) return;
      try {
        const { path, filename } = await createBackup(p);
        const ok = await Sharing.isAvailableAsync();
        if (ok) await Sharing.shareAsync(path, { dialogTitle: filename, UTI: 'public.data' });
        else Alert.alert('Backup ready', `Saved to: ${path}`);
      } catch (e: any) {
        Alert.alert('Backup failed', e?.message ?? 'unknown error');
      }
    });
  };

  const restoreBackup = async () => {
    Alert.alert(
      'Restore?',
      "Pick a .kosh file. The app will close, replace the local database, and ask for the passphrase that was active when the backup was made.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pick file',
          onPress: async () => {
            const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
            if (res.canceled) return;
            const file = res.assets?.[0];
            if (!file) return;
            try {
              const dir = FileSystem.documentDirectory ?? '';
              for (const name of ['kosh.db', 'kosh.db-shm', 'kosh.db-wal']) {
                const p = `${dir}${name}`;
                const info = await FileSystem.getInfoAsync(p);
                if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
              }
              await FileSystem.copyAsync({ from: file.uri, to: `${dir}kosh.db` });
              closeDb();
              setStatus('locked');
            } catch (e: any) {
              Alert.alert('Restore failed', e?.message ?? 'unknown error');
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <Text style={styles.h1}>Settings</Text>

      <Card>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Face ID unlock</Text>
            <Text style={styles.rowHint}>Use biometrics instead of typing the passphrase.</Text>
          </View>
          <Switch value={bioEnabled} onValueChange={toggleBio} disabled={bioBusy} />
        </View>
        <Pressable style={styles.action} onPress={() => setShowPassphraseChange((v) => !v)}>
          <Text style={styles.actionTxt}>Change passphrase</Text>
          <Text style={styles.chev}>{showPassphraseChange ? '▴' : '▾'}</Text>
        </Pressable>
        {showPassphraseChange ? <ChangePassphraseInline /> : null}
        <Pressable style={styles.action} onPress={lockNow}>
          <Text style={styles.actionTxt}>Lock now</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Backup & Restore</Text>
        <Pressable style={styles.action} onPress={exportBackup}>
          <Text style={styles.actionTxt}>Create backup file</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={restoreBackup}>
          <Text style={styles.actionTxt}>Restore from file</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Profiles</Text>
        {profiles.map((p) => (
          <Pressable
            key={p.id}
            style={styles.action}
            onPress={() => {
              setActive(p.id);
              ProfileRepository.setDefault(p.id);
            }}
          >
            <View style={[styles.dot, { backgroundColor: p.accentColor }]} />
            <Text style={styles.actionTxt}>{p.displayName}</Text>
            {p.id === activeId ? <Text style={styles.activeBadge}>Active</Text> : null}
          </Pressable>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Danger zone</Text>
        <Pressable style={styles.action} onPress={wipe}>
          <Text style={[styles.actionTxt, { color: colors.negative }]}>Erase all data</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

function ChangePassphraseInline() {
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = evaluateStrength(next);

  const submit = async () => {
    const ok = isPassphraseAcceptable(next);
    if (!ok.ok) {
      setError(ok.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // We trust the in-memory open DB (already authenticated). Re-key with new passphrase.
      changePassphrase(next);
      const bioOn = await isBiometricEnabled();
      if (bioOn) {
        await enableBiometricUnlock(next);
      }
      setOld('');
      setNext('');
      Alert.alert('Done', 'Passphrase changed. Make a new backup.');
    } catch (e: any) {
      setError(e?.message ?? 'change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 4, marginTop: 8 }}>
      <TextInput
        label="New passphrase"
        value={next}
        onChangeText={(t) => {
          setNext(t);
          setError(null);
        }}
        secureTextEntry={false}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="At least 12 characters"
        error={error ?? undefined}
        hint={`Strength: ${strength.label}`}
      />
      <PrimaryButton title="Change passphrase" onPress={submit} loading={busy} disabled={next.length < 12} />
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  rowHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  actionTxt: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  chev: { color: colors.textMuted, fontSize: 18 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  activeBadge: { color: colors.accent, fontSize: 12, fontWeight: '600' },
});
