import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import * as LocalAuth from 'expo-local-authentication';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { openDb } from '@/storage/db';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';
import { enableBiometricUnlock, markSetupComplete } from '@/crypto/keystore';
import { useAuth } from '@/state/auth';
import { useActiveProfile } from '@/state/activeProfile';

interface Props {
  passphrase: string;
}

export function ProfileSetupScreen({ passphrase }: Props) {
  const setStatus = useAuth((s) => s.setStatus);
  const setActive = useActiveProfile((s) => s.setActive);
  const [name1, setName1] = useState('Anchit');
  const [name2, setName2] = useState('Dad');
  const [useBio, setUseBio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!name1.trim() || !name2.trim()) {
      setError('Both profile names are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      openDb(passphrase);
      const a = ProfileRepository.create({
        displayName: name1.trim(),
        isDefault: true,
        accentColor: colors.profileAnchit,
      });
      ProfileRepository.create({
        displayName: name2.trim(),
        isDefault: false,
        accentColor: colors.profileDad,
      });

      if (useBio) {
        const compat = await LocalAuth.hasHardwareAsync();
        const enrolled = await LocalAuth.isEnrolledAsync();
        if (compat && enrolled) {
          await enableBiometricUnlock(passphrase);
        }
      }

      await markSetupComplete();
      setActive(a.id);
      setStatus('unlocked');
    } catch (e: any) {
      setError(e?.message ?? 'Setup failed');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View>
        <Text style={styles.h1}>Set up two profiles</Text>
        <Text style={styles.sub}>One device, two portfolios. Switch between them at any time.</Text>

        <View style={{ marginTop: spacing.xl }}>
          <TextInput label="Profile 1 (default)" value={name1} onChangeText={setName1} />
          <TextInput label="Profile 2" value={name2} onChangeText={setName2} />
        </View>

        <View style={styles.bioRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bioLabel}>Enable Face ID unlock</Text>
            <Text style={styles.bioHint}>Recommended. You can change this later in Settings.</Text>
          </View>
          <Switch value={useBio} onValueChange={setUseBio} />
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <PrimaryButton title="Finish setup" onPress={finish} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.lg },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  bioLabel: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  bioHint: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  err: { color: colors.negative, fontSize: 13, marginTop: spacing.md },
});
