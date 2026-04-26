import { ulid } from 'ulid';
import { getDb } from '../db';
import { Profile, ProfileSchema } from '@/types/profile';

function nowISO() {
  return new Date().toISOString();
}

interface Row {
  id: string;
  display_name: string;
  is_default: number;
  accent_color: string;
  created_at: string;
}

function rowToProfile(r: Row): Profile {
  return ProfileSchema.parse({
    id: r.id,
    displayName: r.display_name,
    isDefault: r.is_default === 1,
    accentColor: r.accent_color,
    createdAt: r.created_at,
  });
}

export const ProfileRepository = {
  list(): Profile[] {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM profiles ORDER BY is_default DESC, created_at ASC;');
    return (res.rows ?? []).map((r) => rowToProfile(r as unknown as Row));
  },

  get(id: string): Profile | null {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM profiles WHERE id = ?;', [id]);
    const row = res.rows?.[0];
    return row ? rowToProfile(row as unknown as Row) : null;
  },

  create(input: { displayName: string; isDefault: boolean; accentColor: string }): Profile {
    const db = getDb();
    const id = ulid();
    const created = nowISO();
    db.executeSync(
      'INSERT INTO profiles (id, display_name, is_default, accent_color, created_at) VALUES (?, ?, ?, ?, ?);',
      [id, input.displayName, input.isDefault ? 1 : 0, input.accentColor, created]
    );
    return rowToProfile({
      id,
      display_name: input.displayName,
      is_default: input.isDefault ? 1 : 0,
      accent_color: input.accentColor,
      created_at: created,
    });
  },

  setDefault(id: string) {
    const db = getDb();
    db.executeSync('UPDATE profiles SET is_default = 0;');
    db.executeSync('UPDATE profiles SET is_default = 1 WHERE id = ?;', [id]);
  },
};
