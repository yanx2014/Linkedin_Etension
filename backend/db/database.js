// Dependency-free JSON-file key/value store. Chosen over a native SQLite binding
// so the backend installs and tests with zero native build steps. The
// schema.sql file documents the equivalent relational schema for a future
// better-sqlite3 upgrade.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

export class JsonStore {
  constructor(path = config.databasePath.replace(/\.sqlite$/, '.json')) {
    this.path = path;
    this.data = { enrichment: {}, meta: { created_at: new Date().toISOString() } };
    this.load();
  }

  load() {
    try {
      if (existsSync(this.path)) this.data = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch { /* start fresh on corruption */ }
  }

  persist() {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.path); // atomic replace
  }

  getEnrichment(key) { return this.data.enrichment[key] || null; }

  setEnrichment(key, value) {
    this.data.enrichment[key] = { ...value, stored_at: new Date().toISOString() };
    this.persist();
  }

  clearAll() {
    this.data = { enrichment: {}, meta: { created_at: new Date().toISOString(), cleared_at: new Date().toISOString() } };
    this.persist();
  }

  // Enforce retention: drop enrichment entries older than `days`.
  pruneOlderThan(days, nowMs = Date.now()) {
    const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const [key, val] of Object.entries(this.data.enrichment)) {
      const t = Date.parse(val.stored_at || '');
      if (Number.isFinite(t) && t < cutoff) { delete this.data.enrichment[key]; removed += 1; }
    }
    if (removed) this.persist();
    return removed;
  }
}

let singleton = null;
export function getStore() {
  if (!singleton) singleton = new JsonStore();
  return singleton;
}
