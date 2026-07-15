// IndexedDB schema definition and migrations. Bump DB_VERSION and add a case to
// applyMigrations when the schema changes.

export const DB_NAME = 'prospect_tool';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  CONTACTS: 'contacts',
  LISTS: 'lists',
  JOBS: 'jobs',
  SOURCES: 'sources',
  AUDIT: 'audit',
  PAYLOADS: 'payloads',
  ENRICHMENT: 'enrichment'
});

// Called inside onupgradeneeded. `db` is the IDBDatabase; `oldVersion` the prior
// version (0 for a fresh install).
export function applyMigrations(db, oldVersion) {
  if (oldVersion < 1) {
    const contacts = db.createObjectStore(STORES.CONTACTS, { keyPath: 'canonical_url' });
    contacts.createIndex('by_company', 'company', { unique: false });
    contacts.createIndex('by_source', 'source_type', { unique: false });
    contacts.createIndex('by_list', 'list_ids', { unique: false, multiEntry: true });

    db.createObjectStore(STORES.LISTS, { keyPath: 'id' });

    const jobs = db.createObjectStore(STORES.JOBS, { keyPath: 'id' });
    jobs.createIndex('by_state', 'state', { unique: false });

    db.createObjectStore(STORES.SOURCES, { keyPath: 'id' });

    const audit = db.createObjectStore(STORES.AUDIT, { keyPath: 'id', autoIncrement: true });
    audit.createIndex('by_job', 'job_id', { unique: false });

    db.createObjectStore(STORES.PAYLOADS, { keyPath: 'key' });
    db.createObjectStore(STORES.ENRICHMENT, { keyPath: 'key' });
  }
  // Future: if (oldVersion < 2) { ... }
}
