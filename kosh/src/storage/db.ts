import { open, type DB } from '@op-engineering/op-sqlite';
import { MIGRATIONS } from './migrations';

const DB_NAME = 'kosh.db';

let _db: DB | null = null;

export function isOpen(): boolean {
  return _db !== null;
}

export function getDb(): DB {
  if (!_db) throw new Error('Database is locked. Unlock with passphrase first.');
  return _db;
}

export function openDb(passphrase: string): DB {
  if (_db) return _db;
  // op-sqlite uses SQLCipher when the plugin is enabled and `encryptionKey` is set.
  // SQLCipher 4 default KDF is PBKDF2-SHA512 with 256k iterations — strong enough
  // for a single-device personal app. We pass the user passphrase straight through
  // rather than re-deriving with Argon2 separately.
  _db = open({ name: DB_NAME, encryptionKey: passphrase });
  // Validate the key by issuing a trivial read; SQLCipher returns "file is not a
  // database" when the key is wrong.
  try {
    _db.executeSync('PRAGMA cipher_version;');
    _db.executeSync('PRAGMA foreign_keys = ON;');
    runMigrations();
  } catch (err) {
    closeDb();
    throw new Error('WRONG_PASSPHRASE');
  }
  return _db;
}

export function closeDb() {
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore
    }
    _db = null;
  }
}

export function changePassphrase(newPassphrase: string) {
  const db = getDb();
  // SQLCipher rekey: re-encrypts the entire DB with a new key.
  db.executeSync(`PRAGMA rekey = '${newPassphrase.replace(/'/g, "''")}';`);
}

function getUserVersion(): number {
  const db = getDb();
  const res = db.executeSync('PRAGMA user_version;');
  const row = res.rows?.[0] as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

function setUserVersion(v: number) {
  const db = getDb();
  db.executeSync(`PRAGMA user_version = ${v};`);
}

function runMigrations() {
  const db = getDb();
  const current = getUserVersion();
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.executeSync('BEGIN;');
    try {
      // op-sqlite executes a single statement per call; split on `;` carefully.
      const statements = m.sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        db.executeSync(stmt + ';');
      }
      setUserVersion(m.version);
      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw new Error(`Migration ${m.version} failed: ${(err as Error).message}`);
    }
  }
}

export function dbExists(): boolean {
  // op-sqlite doesn't expose a stat API; check by trying to open with a dummy
  // key just enough to confirm the file is on disk. We do this only via the
  // first-open flag stored separately in SecureStore — see crypto/keystore.ts.
  return false;
}
