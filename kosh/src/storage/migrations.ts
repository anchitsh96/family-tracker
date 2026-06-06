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
  {
    // v2: holding value history. Every holding can be re-valued over time
    // (PPF balance grows, an FD accrues, a stock moves). Each re-valuation
    // appends a row here; the holdings table keeps the LATEST value/date
    // denormalised for fast reads. The net-worth-over-time chart is
    // reconstructed from this history.
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS holding_values (
  id TEXT PRIMARY KEY,
  holding_id TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  value_inr REAL NOT NULL,
  as_of_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holding_values_holding ON holding_values(holding_id, as_of_date);

INSERT INTO holding_values (id, holding_id, value_inr, as_of_date, created_at)
SELECT h.id || '-v0', h.id, h.value_inr, h.as_of_date, h.created_at
FROM holdings h
WHERE NOT EXISTS (SELECT 1 FROM holding_values hv WHERE hv.holding_id = h.id)
`,
  },
  {
    // v3: native-currency tracking on the value-history rows. For an INR
    // holding both columns stay NULL; for a USD holding (INDmoney /
    // DriveWealth) we record the USD value at the point's date so the
    // dashboard can re-convert it at the current FX rate every render.
    version: 3,
    sql: `
ALTER TABLE holding_values ADD COLUMN value_native REAL;
ALTER TABLE holding_values ADD COLUMN native_currency TEXT
`,
  },
];
