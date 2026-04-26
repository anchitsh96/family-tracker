// Inline migration SQL keyed by version. Bumping a version requires adding a new
// numbered entry below; never edit a shipped migration after install.

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  accent_color TEXT NOT NULL DEFAULT '#7DD3FC',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  provider TEXT NOT NULL,
  nickname TEXT NOT NULL,
  account_number_last4 TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_profile ON accounts(profile_id);
CREATE INDEX IF NOT EXISTS idx_accounts_bucket ON accounts(bucket);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instrument_name TEXT NOT NULL,
  isin TEXT,
  quantity REAL,
  unit_price REAL,
  value_inr REAL NOT NULL,
  value_native REAL,
  native_currency TEXT,
  as_of_date TEXT NOT NULL,
  extras_json TEXT,
  parser_name TEXT,
  parser_version TEXT,
  source_document_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  filename TEXT,
  encrypted_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_inr REAL NOT NULL,
  breakdown_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_profile ON snapshots(profile_id, created_at);

CREATE TABLE IF NOT EXISTS account_metadata (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (account_id, key)
);
`,
  },
];
