// Encrypted backup using SQLCipher's sqlcipher_export.
// Strategy:
//   - On backup: ATTACH a new file at the cache dir as encrypted DB with the
//     SAME key as the current open DB, then SELECT sqlcipher_export('bkp').
//     The result is a portable encrypted SQLite file.
//   - On restore: copy the picked file to the on-disk DB path and re-open. The
//     user must enter the passphrase that was active when the backup was made.

import * as FileSystem from 'expo-file-system/legacy';
import { getDb } from '@/storage/db';

export interface BackupResult {
  path: string;
  filename: string;
}

export async function createBackup(passphrase: string): Promise<BackupResult> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `kosh-${ts}.kosh`;
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory!;
  const target = `${dir}${filename}`;

  // Remove any prior file at that path
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore
  }

  const db = getDb();
  // SQLCipher requires the path quoting via single-quote escaping; use ATTACH ... AS bkp KEY ...
  const safePath = target.replace(/'/g, "''");
  const safeKey = passphrase.replace(/'/g, "''");
  db.executeSync(`ATTACH DATABASE '${safePath}' AS bkp KEY '${safeKey}';`);
  try {
    db.executeSync(`SELECT sqlcipher_export('bkp');`);
  } finally {
    db.executeSync(`DETACH DATABASE bkp;`);
  }

  return { path: target, filename };
}
