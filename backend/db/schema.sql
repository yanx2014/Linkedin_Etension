-- Reference relational schema for a future better-sqlite3 upgrade. The shipped
-- backend uses a JSON key/value store (db/database.js); this documents the
-- equivalent tables so the storage layer can be swapped without changing the
-- service contract.

CREATE TABLE IF NOT EXISTS enrichment_cache (
  cache_key     TEXT PRIMARY KEY,
  bundle_hash   TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model         TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  value_json    TEXT NOT NULL,
  stored_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrichment_stored_at ON enrichment_cache (stored_at);

CREATE TABLE IF NOT EXISTS deletion_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  what        TEXT NOT NULL,
  deleted_at  TEXT NOT NULL
);
