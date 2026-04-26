import { ulid } from 'ulid';
import { getDb } from '../db';
import { Holding, HoldingExtras, HoldingExtrasSchema, HoldingSchema } from '@/types/holding';

interface Row {
  id: string;
  account_id: string;
  instrument_name: string;
  isin: string | null;
  quantity: number | null;
  unit_price: number | null;
  value_inr: number;
  value_native: number | null;
  native_currency: string | null;
  as_of_date: string;
  extras_json: string | null;
  parser_name: string | null;
  parser_version: string | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToHolding(r: Row): Holding {
  let extras: HoldingExtras | undefined;
  if (r.extras_json) {
    try {
      const parsed = HoldingExtrasSchema.safeParse(JSON.parse(r.extras_json));
      if (parsed.success) extras = parsed.data;
    } catch {
      // ignore corrupt extras; surface as missing
    }
  }
  return HoldingSchema.parse({
    id: r.id,
    accountId: r.account_id,
    instrumentName: r.instrument_name,
    isin: r.isin ?? undefined,
    quantity: r.quantity ?? undefined,
    unitPrice: r.unit_price ?? undefined,
    valueInr: r.value_inr,
    valueNative: r.value_native ?? undefined,
    nativeCurrency: (r.native_currency ?? undefined) as 'INR' | 'USD' | undefined,
    asOfDate: r.as_of_date,
    extras,
    parserName: r.parser_name ?? undefined,
    parserVersion: r.parser_version ?? undefined,
    sourceDocumentId: r.source_document_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

const now = () => new Date().toISOString();

export interface CreateHoldingInput {
  accountId: string;
  instrumentName: string;
  isin?: string;
  quantity?: number;
  unitPrice?: number;
  valueInr: number;
  asOfDate: string;
  extras?: HoldingExtras;
  parserName?: string;
  parserVersion?: string;
  sourceDocumentId?: string;
}

export const HoldingRepository = {
  listByAccount(accountId: string): Holding[] {
    const db = getDb();
    const res = db.executeSync(
      'SELECT * FROM holdings WHERE account_id = ? ORDER BY value_inr DESC;',
      [accountId]
    );
    return (res.rows ?? []).map((r) => rowToHolding(r as unknown as Row));
  },

  listByProfile(profileId: string): Holding[] {
    const db = getDb();
    const res = db.executeSync(
      `SELECT h.* FROM holdings h
       JOIN accounts a ON a.id = h.account_id
       WHERE a.profile_id = ?
       ORDER BY h.value_inr DESC;`,
      [profileId]
    );
    return (res.rows ?? []).map((r) => rowToHolding(r as unknown as Row));
  },

  create(input: CreateHoldingInput): Holding {
    const db = getDb();
    const id = ulid();
    const ts = now();
    db.executeSync(
      `INSERT INTO holdings (id, account_id, instrument_name, isin, quantity, unit_price, value_inr, value_native, native_currency, as_of_date, extras_json, parser_name, parser_version, source_document_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.accountId,
        input.instrumentName,
        input.isin ?? null,
        input.quantity ?? null,
        input.unitPrice ?? null,
        input.valueInr,
        null,
        null,
        input.asOfDate,
        input.extras ? JSON.stringify(input.extras) : null,
        input.parserName ?? null,
        input.parserVersion ?? null,
        input.sourceDocumentId ?? null,
        ts,
        ts,
      ]
    );
    return this.get(id)!;
  },

  get(id: string): Holding | null {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM holdings WHERE id = ?;', [id]);
    const row = res.rows?.[0];
    return row ? rowToHolding(row as unknown as Row) : null;
  },

  delete(id: string) {
    getDb().executeSync('DELETE FROM holdings WHERE id = ?;', [id]);
  },

  // Replace all holdings on an account with a fresh set, preserving the account.
  // Used after re-uploading a parser file for an existing account.
  replaceForAccount(accountId: string, newOnes: CreateHoldingInput[]) {
    const db = getDb();
    db.executeSync('BEGIN;');
    try {
      db.executeSync('DELETE FROM holdings WHERE account_id = ?;', [accountId]);
      for (const h of newOnes) {
        const id = ulid();
        const ts = now();
        db.executeSync(
          `INSERT INTO holdings (id, account_id, instrument_name, isin, quantity, unit_price, value_inr, value_native, native_currency, as_of_date, extras_json, parser_name, parser_version, source_document_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            id,
            accountId,
            h.instrumentName,
            h.isin ?? null,
            h.quantity ?? null,
            h.unitPrice ?? null,
            h.valueInr,
            null,
            null,
            h.asOfDate,
            h.extras ? JSON.stringify(h.extras) : null,
            h.parserName ?? null,
            h.parserVersion ?? null,
            h.sourceDocumentId ?? null,
            ts,
            ts,
          ]
        );
      }
      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw err;
    }
  },
};
