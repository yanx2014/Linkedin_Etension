// Contacts repository. Contacts are keyed by canonical_url and deduplicated
// across the whole workspace. Merges only fill empty fields; conflicts are
// recorded as warnings on the contact.

import { put, get, getAll, del, STORES } from './database.js';
import { mergeInto } from '../selector/dedupe.js';
import { normalizeTerm } from '../selector/normalize.js';

// Secondary identity key: normalized full_name + company. Used to detect an
// already-imported person when a canonical URL is unavailable or differs.
// NEVER used to merge records — two different canonical URLs stay separate.
export function nameCompanyKey(fullName, company) {
  const n = normalizeTerm(fullName || '');
  const c = normalizeTerm(company || '');
  if (!n || !c) return null; // need BOTH to be a usable identity signal
  return `${n}::${c}`;
}

export async function upsertContact(contact) {
  if (!contact.canonical_url) throw new Error('contact requires canonical_url');
  const existing = await get(STORES.CONTACTS, contact.canonical_url);
  if (!existing) {
    const record = {
      list_ids: [], tags: [], warnings: [],
      // Maintain the secondary index on the record itself so lookups don't have
      // to recompute it and stay consistent with how it was first stored.
      name_company_key: nameCompanyKey(contact.full_name, contact.company),
      ...contact
    };
    await put(STORES.CONTACTS, record);
    return { created: true, contact: record };
  }
  const warnings = mergeInto(existing, contact);
  if (warnings.length) existing.warnings = Array.from(new Set([...(existing.warnings || []), ...warnings]));
  existing.list_ids = Array.from(new Set([...(existing.list_ids || []), ...(contact.list_ids || [])]));
  // Refresh the secondary key if it was previously unset (e.g. company arrived
  // during enrichment). Do not overwrite a set key with a different identity.
  if (!existing.name_company_key) existing.name_company_key = nameCompanyKey(existing.full_name, existing.company);
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

// Set of name+company keys already imported — a secondary "already imported"
// signal used to skip re-importing the same person seen under a different URL.
export async function seenNameCompanyKeys() {
  const all = await allContacts();
  return all.map((c) => c.name_company_key || nameCompanyKey(c.full_name, c.company)).filter(Boolean);
}

// Find an existing contact by name+company (returns the first match, or null).
// This is a read-only lookup; it never merges records.
export async function findByNameCompany(fullName, company) {
  const key = nameCompanyKey(fullName, company);
  if (!key) return null;
  const all = await allContacts();
  return all.find((c) => (c.name_company_key || nameCompanyKey(c.full_name, c.company)) === key) || null;
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
