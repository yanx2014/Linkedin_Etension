// Contacts repository. Contacts are keyed by canonical_url and deduplicated
// across the whole workspace. Merges only fill empty fields; conflicts are
// recorded as warnings on the contact.

import { put, get, getAll, del, STORES } from './database.js';
import { mergeInto } from '../selector/dedupe.js';

export async function upsertContact(contact) {
  if (!contact.canonical_url) throw new Error('contact requires canonical_url');
  const existing = await get(STORES.CONTACTS, contact.canonical_url);
  if (!existing) {
    const record = { list_ids: [], tags: [], warnings: [], ...contact };
    await put(STORES.CONTACTS, record);
    return { created: true, contact: record };
  }
  const warnings = mergeInto(existing, contact);
  if (warnings.length) existing.warnings = Array.from(new Set([...(existing.warnings || []), ...warnings]));
  existing.list_ids = Array.from(new Set([...(existing.list_ids || []), ...(contact.list_ids || [])]));
  await put(STORES.CONTACTS, existing);
  return { created: false, contact: existing, warnings };
}

export async function getContact(canonicalUrl) {
  return get(STORES.CONTACTS, canonicalUrl);
}

export async function allContacts() {
  return getAll(STORES.CONTACTS);
}

export async function deleteContact(canonicalUrl) {
  return del(STORES.CONTACTS, canonicalUrl);
}

// Set of canonical urls already in the workspace, for cross-job dedupe seeding.
export async function seenCanonicalUrls() {
  const all = await allContacts();
  return all.map((c) => c.canonical_url);
}

// Simple search across name, company, role, tag, and source.
export async function searchContacts(queryText) {
  const q = String(queryText || '').toLowerCase().trim();
  const all = await allContacts();
  if (!q) return all;
  return all.filter((c) => {
    const hay = [c.full_name, c.company, c.role, c.source_type, ...(c.tags || [])]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}
