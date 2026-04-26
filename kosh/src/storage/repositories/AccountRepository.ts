import { ulid } from 'ulid';
import { getDb } from '../db';
import { Account, AccountSchema, Bucket } from '@/types/account';

interface Row {
  id: string;
  profile_id: string;
  bucket: string;
  provider: string;
  nickname: string;
  account_number_last4: string | null;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToAccount(r: Row): Account {
  return AccountSchema.parse({
    id: r.id,
    profileId: r.profile_id,
    bucket: r.bucket,
    provider: r.provider,
    nickname: r.nickname,
    accountNumberLast4: r.account_number_last4 ?? undefined,
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

const now = () => new Date().toISOString();

export const AccountRepository = {
  listByProfile(profileId: string): Account[] {
    const db = getDb();
    const res = db.executeSync(
      'SELECT * FROM accounts WHERE profile_id = ? ORDER BY bucket ASC, nickname ASC;',
      [profileId]
    );
    return (res.rows ?? []).map((r) => rowToAccount(r as unknown as Row));
  },

  get(id: string): Account | null {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM accounts WHERE id = ?;', [id]);
    const row = res.rows?.[0];
    return row ? rowToAccount(row as unknown as Row) : null;
  },

  findOrCreate(input: {
    profileId: string;
    bucket: Bucket;
    provider: string;
    nickname: string;
    currency?: 'INR' | 'USD';
    accountNumberLast4?: string;
  }): Account {
    const db = getDb();
    const res = db.executeSync(
      'SELECT * FROM accounts WHERE profile_id = ? AND provider = ? AND nickname = ? LIMIT 1;',
      [input.profileId, input.provider, input.nickname]
    );
    const existing = res.rows?.[0];
    if (existing) return rowToAccount(existing as unknown as Row);
    return this.create(input);
  },

  create(input: {
    profileId: string;
    bucket: Bucket;
    provider: string;
    nickname: string;
    currency?: 'INR' | 'USD';
    accountNumberLast4?: string;
  }): Account {
    const db = getDb();
    const id = ulid();
    const ts = now();
    db.executeSync(
      `INSERT INTO accounts (id, profile_id, bucket, provider, nickname, account_number_last4, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?);`,
      [
        id,
        input.profileId,
        input.bucket,
        input.provider,
        input.nickname,
        input.accountNumberLast4 ?? null,
        input.currency ?? 'INR',
        ts,
        ts,
      ]
    );
    return this.get(id)!;
  },

  delete(id: string) {
    const db = getDb();
    db.executeSync('DELETE FROM accounts WHERE id = ?;', [id]);
  },
};
