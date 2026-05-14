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

// One point in a holding's value history.
export interface HoldingValuePoint {
  id: string;
  holdingId: string;
  valueInr: number;
  asOfDate: string;
  createdAt: string;
}

// One point in a profile's reconstructed net-worth timeline.
export interface NetWorthPoint {
  date: string;
  value: number;
}

// Normalise an instrument name for fuzzy matching across statement
// re-uploads — uppercase, drop everything that isn't alphanumeric. So
// "Axis Arbitrage Direct-G" and "AXIS ARBITRAGE DIRECT - G" both become
// "AXISARBITRAGEDIRECTG" and still match.
function normalizeForMatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Append a value-history row for a holding. Caller is responsible for the
// surrounding transaction if atomicity with the holdings table is needed.
function insertHoldingValue(
  db: ReturnType<typeof getDb>,
  holdingId: string,
  valueInr: number,
  asOfDate: string,
  ts: string
) {
  db.executeSync(
    `INSERT INTO holding_values (id, holding_id, value_inr, as_of_date, created_at)
     VALUES (?, ?, ?, ?, ?);`,
    [ulid(), holdingId, valueInr, asOfDate, ts]
  );
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
    db.executeSync('BEGIN;');
    try {
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
      // Seed the value history with this initial valuation.
      insertHoldingValue(db, id, input.valueInr, input.asOfDate, ts);
      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw err;
    }
    return this.get(id)!;
  },

  // Re-value an existing holding for a given date. Upsert-by-date: one
  // value point per date — re-recording the same date overwrites that
  // point rather than stacking a duplicate. The denormalised current
  // value/date on the holdings row is recomputed as the latest by date,
  // so back-dating an old value never clobbers a newer "current".
  updateValue(holdingId: string, valueInr: number, asOfDate: string) {
    const db = getDb();
    const ts = now();
    db.executeSync('BEGIN;');
    try {
      const existing = db.executeSync(
        'SELECT id FROM holding_values WHERE holding_id = ? AND as_of_date = ? LIMIT 1;',
        [holdingId, asOfDate]
      );
      const existingId = (existing.rows?.[0] as { id?: string } | undefined)?.id;
      if (existingId) {
        db.executeSync(
          'UPDATE holding_values SET value_inr = ?, created_at = ? WHERE id = ?;',
          [valueInr, ts, existingId]
        );
      } else {
        insertHoldingValue(db, holdingId, valueInr, asOfDate, ts);
      }
      // Recompute the denormalised current value = latest history point.
      const latest = db.executeSync(
        `SELECT value_inr, as_of_date FROM holding_values
         WHERE holding_id = ? ORDER BY as_of_date DESC, created_at DESC LIMIT 1;`,
        [holdingId]
      );
      const row = latest.rows?.[0] as
        | { value_inr: number; as_of_date: string }
        | undefined;
      if (row) {
        db.executeSync(
          'UPDATE holdings SET value_inr = ?, as_of_date = ?, updated_at = ? WHERE id = ?;',
          [row.value_inr, row.as_of_date, ts, holdingId]
        );
      }
      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw err;
    }
  },

  // Merge a freshly-parsed set of holdings into an account, PRESERVING
  // value history. Used when a periodic statement (PMS, CAS) is uploaded
  // again next period. Each incoming holding is matched to an existing one
  //   - by ISIN if present (CAS), else
  //   - by a normalised instrument name (Fisdom has no ISIN; the
  //     normalisation strips case + punctuation so minor parse drift
  //     still matches).
  // Matched -> append a value point at the statement date + refresh
  // metadata. Unmatched -> created fresh. Existing holdings absent from
  // the new statement are left alone (the user deletes those manually).
  mergeForAccount(
    accountId: string,
    incoming: CreateHoldingInput[]
  ): { updated: number; created: number } {
    const db = getDb();
    const existing = this.listByAccount(accountId);
    const byIsin = new Map<string, Holding>();
    const byName = new Map<string, Holding>();
    for (const h of existing) {
      if (h.isin) byIsin.set(h.isin.toUpperCase(), h);
      byName.set(normalizeForMatch(h.instrumentName), h);
    }
    let updated = 0;
    let created = 0;
    for (const inc of incoming) {
      let match: Holding | undefined;
      if (inc.isin) match = byIsin.get(inc.isin.toUpperCase());
      if (!match) match = byName.get(normalizeForMatch(inc.instrumentName));
      if (match) {
        // Consume the match so a second incoming row can't re-match it.
        if (match.isin) byIsin.delete(match.isin.toUpperCase());
        byName.delete(normalizeForMatch(match.instrumentName));
        this.updateValue(match.id, inc.valueInr, inc.asOfDate);
        // Refresh the holding's metadata to the latest statement's values.
        db.executeSync(
          `UPDATE holdings SET instrument_name = ?, isin = ?, quantity = ?, unit_price = ?, extras_json = ?, parser_name = ?, parser_version = ?, source_document_id = ?, updated_at = ? WHERE id = ?;`,
          [
            inc.instrumentName,
            inc.isin ?? null,
            inc.quantity ?? null,
            inc.unitPrice ?? null,
            inc.extras ? JSON.stringify(inc.extras) : null,
            inc.parserName ?? null,
            inc.parserVersion ?? null,
            inc.sourceDocumentId ?? null,
            now(),
            match.id,
          ]
        );
        updated += 1;
      } else {
        this.create(inc);
        created += 1;
      }
    }
    return { updated, created };
  },

  // Full value history for one holding, oldest first.
  valueHistory(holdingId: string): HoldingValuePoint[] {
    const db = getDb();
    const res = db.executeSync(
      `SELECT id, holding_id, value_inr, as_of_date, created_at
       FROM holding_values WHERE holding_id = ?
       ORDER BY as_of_date ASC, created_at ASC;`,
      [holdingId]
    );
    return (res.rows ?? []).map((r) => {
      const row = r as unknown as {
        id: string;
        holding_id: string;
        value_inr: number;
        as_of_date: string;
        created_at: string;
      };
      return {
        id: row.id,
        holdingId: row.holding_id,
        valueInr: row.value_inr,
        asOfDate: row.as_of_date,
        createdAt: row.created_at,
      };
    });
  },

  // Reconstruct the profile's net worth at every date any holding was
  // valued. For each such date, net worth = sum over all holdings of that
  // holding's most-recent value at-or-before the date. Holdings that
  // didn't exist yet contribute nothing.
  netWorthHistory(profileId: string): NetWorthPoint[] {
    const db = getDb();
    const res = db.executeSync(
      `SELECT hv.holding_id, hv.value_inr, hv.as_of_date
       FROM holding_values hv
       JOIN holdings h ON h.id = hv.holding_id
       JOIN accounts a ON a.id = h.account_id
       WHERE a.profile_id = ?
       ORDER BY hv.as_of_date ASC, hv.created_at ASC;`,
      [profileId]
    );
    const rows = (res.rows ?? []) as unknown as {
      holding_id: string;
      value_inr: number;
      as_of_date: string;
    }[];
    if (rows.length === 0) return [];

    const byHolding = new Map<string, { date: string; value: number }[]>();
    const dateSet = new Set<string>();
    for (const r of rows) {
      dateSet.add(r.as_of_date);
      const arr = byHolding.get(r.holding_id) ?? [];
      arr.push({ date: r.as_of_date, value: r.value_inr });
      byHolding.set(r.holding_id, arr);
    }
    const dates = Array.from(dateSet).sort();

    return dates.map((d) => {
      let total = 0;
      for (const hist of byHolding.values()) {
        // hist is already sorted ascending; take the last entry <= d.
        let v: number | null = null;
        for (const entry of hist) {
          if (entry.date <= d) v = entry.value;
          else break;
        }
        if (v !== null) total += v;
      }
      return { date: d, value: Math.round(total * 100) / 100 };
    });
  },

  get(id: string): Holding | null {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM holdings WHERE id = ?;', [id]);
    const row = res.rows?.[0];
    return row ? rowToHolding(row as unknown as Row) : null;
  },

  delete(id: string) {
    // holding_values rows cascade-delete via the FK.
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
        // Seed the value history for each replacement holding.
        insertHoldingValue(db, id, h.valueInr, h.asOfDate, ts);
      }
      db.executeSync('COMMIT;');
    } catch (err) {
      db.executeSync('ROLLBACK;');
      throw err;
    }
  },
};
