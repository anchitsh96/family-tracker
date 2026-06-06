import * as SecureStore from 'expo-secure-store';

// Keychain keys
const K_PASSPHRASE = 'kosh.passphrase.v1';
const K_SETUP_FLAG = 'kosh.setup_complete.v1';
const K_BIOMETRIC_ENABLED = 'kosh.biometric_enabled.v1';
const K_LAST_ACTIVE_PROFILE = 'kosh.last_active_profile.v1';
const K_PRIVACY_MODE = 'kosh.privacy_mode.v1';
const K_FX_USD_INR = 'kosh.fx.usd_inr.v1';
const K_FX_FETCHED_AT = 'kosh.fx.usd_inr_at.v1';

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
  await SecureStore.deleteItemAsync(K_PRIVACY_MODE, PLAIN_OPTIONS).catch(() => undefined);
}

// Privacy mode: when on, all monetary figures render as an unreadable
// Braille-cell pattern. It's a UI preference (not a secret), persisted so
// the app reopens in whatever state it was left in.
export async function setPrivacyMode(hidden: boolean): Promise<void> {
  await SecureStore.setItemAsync(K_PRIVACY_MODE, hidden ? '1' : '0', PLAIN_OPTIONS);
}

export async function getPrivacyMode(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(K_PRIVACY_MODE, PLAIN_OPTIONS);
  return v === '1';
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

// USD→INR rate + the wall-clock time we fetched it. Cached so the app
// opens with the last-known rate instantly and only hits the network when
// the cache is older than ~1 hour. Both values live in SecureStore (not
// the encrypted DB) because they're a UI cache, not a secret — and they
// need to survive a passphrase-unlock window too.
export async function setUsdInrCache(rate: number, fetchedAtMs: number): Promise<void> {
  await SecureStore.setItemAsync(K_FX_USD_INR, String(rate), PLAIN_OPTIONS);
  await SecureStore.setItemAsync(K_FX_FETCHED_AT, String(fetchedAtMs), PLAIN_OPTIONS);
}

export async function getUsdInrCache(): Promise<{ rate: number; fetchedAtMs: number } | null> {
  const r = await SecureStore.getItemAsync(K_FX_USD_INR, PLAIN_OPTIONS);
  const t = await SecureStore.getItemAsync(K_FX_FETCHED_AT, PLAIN_OPTIONS);
  if (!r || !t) return null;
  const rate = Number(r);
  const fetchedAtMs = Number(t);
  if (!Number.isFinite(rate) || !Number.isFinite(fetchedAtMs) || rate <= 0) return null;
  return { rate, fetchedAtMs };
}
