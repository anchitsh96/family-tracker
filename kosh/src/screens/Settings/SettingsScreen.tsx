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
import {
  exportProfile,
  importIntoProfile,
  previewExport,
} from '@/crypto/profileSync';
import { evaluateStrength, isPassphraseAcceptable } from '@/crypto/passphrase';

export function SettingsScreen() {
  const setStatus = useAuth((s) => s.setStatus);
  const setActive = useActiveProfile((s) => s.setActive);
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const bumpData = useActiveProfile((s) => s.bump);
  const profiles = activeId ? ProfileRepository.list() : [];
  const activeProfile = activeId ? ProfileRepository.get(activeId) : null;
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

  // Per-profile share: produce a single-profile encrypted .kosh file and
  // open the share sheet. Use case: Anchit shares the "Dad" profile with
  // Dad's Android device every month. The receiver imports via the
  // matching "Import profile data" action below.
  const shareActiveProfile = () => {
    if (!activeProfile) {
      Alert.alert('No active profile');
      return;
    }
    Alert.prompt(
      'Encrypt with passphrase',
      `The file will be encrypted with this passphrase. The receiver needs the same passphrase to import. For Dad's device, use the passphrase you set on his app.`,
      async (p?: string) => {
        if (!p) return;
        try {
          const { path, filename } = await exportProfile(activeProfile.id, p);
          const ok = await Sharing.isAvailableAsync();
          if (ok) {
            await Sharing.shareAsync(path, {
              dialogTitle: filename,
              UTI: 'public.data',
            });
          } else {
            Alert.alert('Export ready', `Saved to: ${path}`);
          }
        } catch (e: any) {
          Alert.alert('Export failed', e?.message ?? 'unknown error');
        }
      },
      'secure-text'
    );
  };

  // Per-profile import: pick a .kosh file, enter the sender's passphrase,
  // preview the snapshot, confirm, atomically replace the active
  // profile's data. Local profile row (name, color) stays the same.
  const importProfileFile = async () => {
    if (!activeProfile) {
      Alert.alert('No active profile');
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file) return;
    Alert.prompt(
      'File passphrase',
      'Enter the passphrase the sender used when exporting the file.',
      async (p?: string) => {
        if (!p) return;
        try {
          const preview = await previewExport(file.uri, p);
          Alert.alert(
            'Replace local data?',
            `Replace your "${activeProfile.displayName}" data with the snapshot of "${preview.sourceProfileName}" (${preview.accountCount} accounts · ${preview.holdingCount} holdings)? Your current data will be overwritten.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Replace',
                style: 'destructive',
                onPress: async () => {
                  try {
                    const result = await importIntoProfile(
                      file.uri,
                      p,
                      activeProfile.id
                    );
                    bumpData();
                    Alert.alert(
                      'Import complete',
                      `${result.importedAccountCount} accounts · ${result.importedHoldingCount} holdings.`
                    );
                  } catch (e: any) {
                    Alert.alert(
                      'Import failed',
                      e?.message ?? 'unknown error'
                    );
                  }
                },
              },
            ]
          );
        } catch (e: any) {
          Alert.alert('Could not read file', e?.message ?? 'unknown error');
        }
      },
      'secure-text'
    );
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
        <Text style={styles.sectionTitle}>Sync with another device</Text>
        <Text style={styles.sectionHint}>
          Send the active profile to another Kosh install as an encrypted
          file. The receiver imports it; their copy of the profile is
          overwritten. Nothing leaves the device except via the share
          sheet — no cloud relay.
        </Text>
        <Pressable style={styles.action} onPress={shareActiveProfile}>
          <Text style={styles.actionTxt}>
            Share "{activeProfile?.displayName ?? '...'}" data
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={importProfileFile}>
          <Text style={styles.actionTxt}>Import profile data</Text>
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
  sectionHint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  rowHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  actionTxt: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  chev: { color: colors.textMuted, fontSize: 18 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  activeBadge: { color: colors.accent, fontSize: 12, fontWeight: '600' },
});
