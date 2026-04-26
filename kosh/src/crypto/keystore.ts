import * as SecureStore from 'expo-secure-store';

// Keychain keys
const K_PASSPHRASE = 'kosh.passphrase.v1';
const K_SETUP_FLAG = 'kosh.setup_complete.v1';
const K_BIOMETRIC_ENABLED = 'kosh.biometric_enabled.v1';
const K_LAST_ACTIVE_PROFILE = 'kosh.last_active_profile.v1';

const BIO_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock Kosh',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const PLAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function isFirstRun(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(K_SETUP_FLAG, PLAIN_OPTIONS);
  return v !== '1';
}

export async function markSetupComplete(): Promise<void> {
  await SecureStore.setItemAsync(K_SETUP_FLAG, '1', PLAIN_OPTIONS);
}

export async function clearAllSecrets(): Promise<void> {
  await SecureStore.deleteItemAsync(K_PASSPHRASE, BIO_OPTIONS).catch(() => undefined);
  await SecureStore.deleteItemAsync(K_PASSPHRASE, PLAIN_OPTIONS).catch(() => undefined);
  await SecureStore.deleteItemAsync(K_SETUP_FLAG, PLAIN_OPTIONS).catch(() => undefined);
  await SecureStore.deleteItemAsync(K_BIOMETRIC_ENABLED, PLAIN_OPTIONS).catch(() => undefined);
  await SecureStore.deleteItemAsync(K_LAST_ACTIVE_PROFILE, PLAIN_OPTIONS).catch(() => undefined);
}

// Last-viewed profile id. Persisted across launches so opening the app
// drops you back into whichever profile you were on. Falls back to the
// `is_default` profile when this isn't set (first launch after onboarding).
export async function setLastActiveProfile(id: string): Promise<void> {
  await SecureStore.setItemAsync(K_LAST_ACTIVE_PROFILE, id, PLAIN_OPTIONS);
}

export async function getLastActiveProfile(): Promise<string | null> {
  return SecureStore.getItemAsync(K_LAST_ACTIVE_PROFILE, PLAIN_OPTIONS);
}

export async function enableBiometricUnlock(passphrase: string): Promise<void> {
  await SecureStore.setItemAsync(K_PASSPHRASE, passphrase, BIO_OPTIONS);
  await SecureStore.setItemAsync(K_BIOMETRIC_ENABLED, '1', PLAIN_OPTIONS);
}

export async function disableBiometricUnlock(): Promise<void> {
  await SecureStore.deleteItemAsync(K_PASSPHRASE, BIO_OPTIONS).catch(() => undefined);
  await SecureStore.setItemAsync(K_BIOMETRIC_ENABLED, '0', PLAIN_OPTIONS);
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(K_BIOMETRIC_ENABLED, PLAIN_OPTIONS);
  return v === '1';
}

export async function getPassphraseFromKeychain(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(K_PASSPHRASE, BIO_OPTIONS);
  } catch {
    return null;
  }
}
