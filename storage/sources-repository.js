// Saved-source (auto-import) repository. Sources hold a URL, criteria,
// destination list, schedule, and enrichment/export settings.

import { put, get, getAll, del, STORES } from './database.js';
import { newId } from '../utils/messages.js';

export async function saveSource(source) {
  const record = {
    id: source.id || newId(),
    name: source.name || 'Saved source',
    source_type: source.source_type || null,
    url: source.url || null,
    criteria: source.criteria || null,
    destination_list_id: source.destination_list_id || null,
    max_profiles: source.max_profiles || 500,
    schedule: source.schedule || 'disabled', // daily|weekly|monthly|disabled
    auto_enrich: source.auto_enrich !== false,
    auto_export: source.auto_export !== false,
    last_run_at: source.last_run_at || null,
    last_status: source.last_status || null,
    created_at: source.created_at || new Date().toISOString()
  };
  await put(STORES.SOURCES, record);
  return record;
}

export async function getSource(id) { return get(STORES.SOURCES, id); }
export async function allSources() { return getAll(STORES.SOURCES); }
export async function deleteSource(id) { return del(STORES.SOURCES, id); }

export async function scheduledSources() {
  const all = await allSources();
  return all.filter((s) => s.schedule && s.schedule !== 'disabled');
}
