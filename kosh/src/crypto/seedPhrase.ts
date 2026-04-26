// Seed phrase generation. Uses BIP-39 24-word English wordlist.
// In v1 the seed is shown once at setup so the user can record it physically;
// it is not used to derive the SQLCipher key. That's because the user-chosen
// passphrase is the actual decryption secret. The seed exists only as a future
// hook for a "reset passphrase via paper backup" flow we'll wire up post-v1.

import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import * as bip39 from 'bip39';

// Patch global Buffer for bip39 in RN
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

export function generateMnemonic24(): string {
  // 256 bits of entropy → 24-word mnemonic
  return bip39.generateMnemonic(256);
}

export function isValidMnemonic(s: string): boolean {
  return bip39.validateMnemonic(s.trim().toLowerCase());
}
