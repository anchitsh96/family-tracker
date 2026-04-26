import { ulid } from 'ulid';
import { getDb } from '../db';
import { Snapshot, SnapshotSchema } from '@/types/snapshot';
import { Bucket } from '@/types/account';

interface Row {
  id: string;
  profile_id: string;
  total_inr: number;
  breakdown_json: string;
  created_at: string;
}

function rowToSnapshot(r: Row): Snapshot {
  return SnapshotSchema.parse({
    id: r.id,
    profileId: r.profile_id,
    totalInr: r.total_inr,
    breakdown: JSON.parse(r.breakdown_json),
    createdAt: r.created_at,
  });
}

export const SnapshotRepository = {
  listByProfile(profileId: string): Snapshot[] {
    const db = getDb();
    const res = db.executeSync(
      'SELECT * FROM snapshots WHERE profile_id = ? ORDER BY created_at ASC;',
      [profileId]
    );
    return (res.rows ?? []).map((r) => rowToSnapshot(r as unknown as Row));
  },

  latest(profileId: string): Snapshot | null {
    const db = getDb();
    const res = db.executeSync(
      'SELECT * FROM snapshots WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1;',
      [profileId]
    );
    const row = res.rows?.[0];
    return row ? rowToSnapshot(row as unknown as Row) : null;
  },

  create(input: {
    profileId: string;
    totalInr: number;
    breakdown: Partial<Record<Bucket, number>>;
  }): Snapshot {
    const db = getDb();
    const id = ulid();
    const ts = new Date().toISOString();
    db.executeSync(
      'INSERT INTO snapshots (id, profile_id, total_inr, breakdown_json, created_at) VALUES (?, ?, ?, ?, ?);',
      [id, input.profileId, input.totalInr, JSON.stringify(input.breakdown), ts]
    );
    return {
      id,
      profileId: input.profileId,
      totalInr: input.totalInr,
      breakdown: input.breakdown as Record<Bucket, number>,
      createdAt: ts,
    };
  },
};
