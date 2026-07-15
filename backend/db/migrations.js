// Migrations for the JSON store. The store is schemaless, so migrations only
// normalize shape across versions. Kept for parity with the SQLite schema.

export const SCHEMA_VERSION = 1;

export function migrate(data) {
  if (!data.meta) data.meta = {};
  if (!data.enrichment) data.enrichment = {};
  data.meta.schema_version = SCHEMA_VERSION;
  return data;
}
