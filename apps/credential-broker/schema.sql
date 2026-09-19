CREATE TABLE IF NOT EXISTS credential_vault (
  name TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credential_leases (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
