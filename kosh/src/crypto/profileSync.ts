// Per-profile encrypted snapshot export + import.
//
// Use case (see spec §10 amendment for sync): Anchit uploads statements
// on his iPhone; periodically he exports the "Dad" profile as a single
// encrypted .kosh file and ships it to Dad's Android via the OS share
// sheet (AirDrop / WhatsApp / Drive / whatever). Dad's app imports the
// file, which atomically replaces his local profile data with the
// snapshot. No external network call, no cloud relay — every transfer
// is user-mediated and the file is ciphertext end-to-end.
//
// Crypto choice: SQLCipher's sqlcipher_export — same primitive used by
// the full-DB backup flow. We clone the live DB into an attached file
// with the SAME passphrase, then strip everything that isn't the target
// profile. Reuses libsodium/Argon2id-grade crypto already approved
// under §10 ("Use libsodium / Argon2id / SQLCipher only").

import * as FileSystem from 'expo-file-system/legacy';
import { getDb } from '@/storage/db';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';

export interface ProfileExportResult {
  path: string;
  filename: string;
}

// Slug a display name for use in the export filename. "Dad" → "dad",
// "My Dad's Folio" → "my-dad-s-folio".
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile'
  );
}

// SQLCipher's ATTACH ... KEY '…' doesn't accept bind parameters, so any
// values that go inline need their single-quotes escaped. The DB and
// keystore enforce alphanumeric+printable passphrases at setup, so this
// is mostly defensive.
function sqlQuote(v: string): string {
  return v.replace(/'/g, "''");
}

export async function exportProfile(
  profileId: string,
  passphrase: string
): Promise<ProfileExportResult> {
  const profile = ProfileRepository.get(profileId);
  if (!profile) throw new Error('Profile not found.');

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `kosh-${slugify(profile.displayName)}-${ts}.kosh`;
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory!;
  const target = `${dir}${filename}`;

  // Wipe any prior file at this path.
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore — caller will surface a failure if the ATTACH below dies.
  }

  const db = getDb();
  const safePath = sqlQuote(target);
  const safeKey = sqlQuote(passphrase);
  const safeId = sqlQuote(profileId);

  db.executeSync(`ATTACH DATABASE '${safePath}' AS bkp KEY '${safeKey}';`);
  try {
    // Full clone.
    db.executeSync(`SELECT sqlcipher_export('bkp');`);

    // Strip everything that isn't the target profile. Order is leaves
    // first → roots, which works regardless of whether FK cascade is
    // wired on the attached DB.
    //
    // documents is dropped wholesale: its rows reference encrypted PDF
    // blobs on local disk that don't exist on the recipient device.
    db.executeSync(`DELETE FROM bkp.documents;`);
    db.executeSync(
      `DELETE FROM bkp.snapshots WHERE profile_id != '${safeId}';`
    );
    db.executeSync(
      `DELETE FROM bkp.holding_values WHERE holding_id IN (
         SELECT id FROM bkp.holdings WHERE account_id IN (
           SELECT id FROM bkp.accounts WHERE profile_id != '${safeId}'
         )
       );`
    );
    db.executeSync(
      `DELETE FROM bkp.account_metadata WHERE account_id IN (
         SELECT id FROM bkp.accounts WHERE profile_id != '${safeId}'
       );`
    );
    db.executeSync(
      `DELETE FROM bkp.holdings WHERE account_id IN (
         SELECT id FROM bkp.accounts WHERE profile_id != '${safeId}'
       );`
    );
    db.executeSync(
      `DELETE FROM bkp.accounts WHERE profile_id != '${safeId}';`
    );
    db.executeSync(`DELETE FROM bkp.profiles WHERE id != '${safeId}';`);
  } finally {
    db.executeSync(`DETACH DATABASE bkp;`);
  }

  return { path: target, filename };
}

export interface SourceProfilePreview {
  sourceProfileId: string;
  sourceProfileName: string;
  accountCount: number;
  holdingCount: number;
}

// Peek at an export file: ATTACH read-only, count rows, DETACH. Lets the
// import UI show a confirmation like "Replace 'Dad' with snapshot of 3
// accounts / 27 holdings exported by 'Dad' on …" without committing.
export async function previewExport(
  srcUri: string,
  passphrase: string
): Promise<SourceProfilePreview> {
  const stagedPath = await stageImportFile(srcUri);
  const db = getDb();
  const safePath = sqlQuote(stagedPath);
  const safeKey = sqlQuote(passphrase);

  db.executeSync(`ATTACH DATABASE '${safePath}' AS imp KEY '${safeKey}';`);
  try {
    const profilesRes = db.executeSync(
      `SELECT id, display_name FROM imp.profiles;`
    );
    const rows = (profilesRes.rows ?? []) as {
      id: string;
      display_name: string;
    }[];
    if (rows.length === 0) {
      throw new Error('File contains no profile data.');
    }
    if (rows.length > 1) {
      throw new Error(
        'File contains multiple profiles — expected exactly one.'
      );
    }
    const src = rows[0]!;
    const safeSrcId = sqlQuote(src.id);

    const accountsRes = db.executeSync(
      `SELECT COUNT(*) AS n FROM imp.accounts WHERE profile_id = '${safeSrcId}';`
    );
    const holdingsRes = db.executeSync(
      `SELECT COUNT(*) AS n FROM imp.holdings WHERE account_id IN (
         SELECT id FROM imp.accounts WHERE profile_id = '${safeSrcId}'
       );`
    );
    const accountCount =
      (accountsRes.rows?.[0] as { n?: number } | undefined)?.n ?? 0;
    const holdingCount =
      (holdingsRes.rows?.[0] as { n?: number } | undefined)?.n ?? 0;

    return {
      sourceProfileId: src.id,
      sourceProfileName: src.display_name,
      accountCount,
      holdingCount,
    };
  } finally {
    db.executeSync(`DETACH DATABASE imp;`);
  }
}

export interface ProfileImportResult {
  sourceProfileName: string;
  importedAccountCount: number;
  importedHoldingCount: number;
}

// Atomically replace the local TARGET profile's child rows with the
// snapshot from the export file. The local profile row (id, displayName,
// accentColor) is untouched — only its child data is overwritten. Any
// account ids that collide between source and a DIFFERENT local profile
// would fail PRIMARY KEY; in practice this can't happen because all ids
// are ULIDs and Dad's device has only one profile.
export async function importIntoProfile(
  srcUri: string,
  passphrase: string,
  targetProfileId: string
): Promise<ProfileImportResult> {
  const db = getDb();
  const stagedPath = await stageImportFile(srcUri);
  const safePath = sqlQuote(stagedPath);
  const safeKey = sqlQuote(passphrase);
  const safeTarget = sqlQuote(targetProfileId);

  db.executeSync(`ATTACH DATABASE '${safePath}' AS imp KEY '${safeKey}';`);
  try {
    const profilesRes = db.executeSync(
      `SELECT id, display_name FROM imp.profiles;`
    );
    const rows = (profilesRes.rows ?? []) as {
      id: string;
      display_name: string;
    }[];
    if (rows.length === 0) throw new Error('File contains no profile data.');
    if (rows.length > 1) {
      throw new Error(
        'File contains multiple profiles — expected exactly one.'
      );
    }
    const source = rows[0]!;
    const safeSrcId = sqlQuote(source.id);

    db.executeSync('BEGIN TRANSACTION;');
    try {
      // 1) Wipe the local target profile's data (leaves the profile row).
      db.executeSync(
        `DELETE FROM holding_values WHERE holding_id IN (
           SELECT id FROM holdings WHERE account_id IN (
             SELECT id FROM accounts WHERE profile_id = '${safeTarget}'
           )
         );`
      );
      db.executeSync(
        `DELETE FROM account_metadata WHERE account_id IN (
           SELECT id FROM accounts WHERE profile_id = '${safeTarget}'
         );`
      );
      db.executeSync(
        `DELETE FROM documents WHERE account_id IN (
           SELECT id FROM accounts WHERE profile_id = '${safeTarget}'
         );`
      );
      db.executeSync(
        `DELETE FROM holdings WHERE account_id IN (
           SELECT id FROM accounts WHERE profile_id = '${safeTarget}'
         );`
      );
      db.executeSync(
        `DELETE FROM accounts WHERE profile_id = '${safeTarget}';`
      );
      db.executeSync(
        `DELETE FROM snapshots WHERE profile_id = '${safeTarget}';`
      );

      // 2) Copy from the attached snapshot, rewriting profile_id to the
      //    local target slot wherever it appears.
      db.executeSync(`
        INSERT INTO accounts (id, profile_id, bucket, provider, nickname, account_number_last4, currency, status, created_at, updated_at)
        SELECT id, '${safeTarget}', bucket, provider, nickname, account_number_last4, currency, status, created_at, updated_at
        FROM imp.accounts WHERE profile_id = '${safeSrcId}';
      `);
      db.executeSync(`
        INSERT INTO holdings (id, account_id, instrument_name, isin, quantity, unit_price, value_inr, value_native, native_currency, as_of_date, extras_json, parser_name, parser_version, source_document_id, created_at, updated_at)
        SELECT id, account_id, instrument_name, isin, quantity, unit_price, value_inr, value_native, native_currency, as_of_date, extras_json, parser_name, parser_version, source_document_id, created_at, updated_at
        FROM imp.holdings;
      `);
      db.executeSync(`
        INSERT INTO holding_values (id, holding_id, value_inr, value_native, native_currency, as_of_date, created_at)
        SELECT id, holding_id, value_inr, value_native, native_currency, as_of_date, created_at
        FROM imp.holding_values;
      `);
      db.executeSync(`
        INSERT INTO account_metadata (account_id, key, value)
        SELECT account_id, key, value FROM imp.account_metadata;
      `);
      db.executeSync(`
        INSERT INTO snapshots (id, profile_id, total_inr, breakdown_json, created_at)
        SELECT id, '${safeTarget}', total_inr, breakdown_json, created_at
        FROM imp.snapshots WHERE profile_id = '${safeSrcId}';
      `);

      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw err;
    }

    const accountCountRow = db.executeSync(
      `SELECT COUNT(*) AS n FROM accounts WHERE profile_id = '${safeTarget}';`
    ).rows?.[0] as { n?: number } | undefined;
    const holdingCountRow = db.executeSync(
      `SELECT COUNT(*) AS n FROM holdings WHERE account_id IN (
         SELECT id FROM accounts WHERE profile_id = '${safeTarget}'
       );`
    ).rows?.[0] as { n?: number } | undefined;

    return {
      sourceProfileName: source.display_name,
      importedAccountCount: accountCountRow?.n ?? 0,
      importedHoldingCount: holdingCountRow?.n ?? 0,
    };
  } finally {
    db.executeSync(`DETACH DATABASE imp;`);
    try {
      await FileSystem.deleteAsync(stagedPath, { idempotent: true });
    } catch {
      // ignore cleanup failure
    }
  }
}

// expo-document-picker returns a URI we shouldn't ATTACH directly — copy
// it to a stable cache path so SQLCipher can open it. The caller deletes
// after the import completes.
async function stageImportFile(srcUri: string): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory!;
  const stagedPath = `${dir}kosh-import-staged-${Date.now()}.kosh`;
  await FileSystem.copyAsync({ from: srcUri, to: stagedPath });
  return stagedPath;
}
