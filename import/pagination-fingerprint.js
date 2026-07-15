// Pure, Chrome-independent helpers for pagination handling: a deterministic
// result fingerprint and a transition validator. Unit-testable without a DOM.

import { fnv1a } from '../utils/hash.js';

// Deterministic fingerprint of the currently-rendered result set, from the
// sorted canonical /in/ slugs. Same set -> same fingerprint, order-independent.
export function resultFingerprint(slugs) {
  const sorted = Array.from(new Set((slugs || []).filter(Boolean))).sort();
  if (sorted.length === 0) return 'empty';
  return `${sorted.length}:${fnv1a(sorted.join('|'))}`;
}

// Validate a pagination transition. Returns
// { changed: boolean, reason: 'url_changed'|'fingerprint_changed'|'stalled' }.
export function validatePaginationTransition({ beforeUrl, afterUrl, beforeFingerprint, afterFingerprint }) {
  if (beforeUrl != null && afterUrl != null && normalizeUrl(beforeUrl) !== normalizeUrl(afterUrl)) {
    return { changed: true, reason: 'url_changed' };
  }
  if (beforeFingerprint != null && afterFingerprint != null && beforeFingerprint !== afterFingerprint) {
    return { changed: true, reason: 'fingerprint_changed' };
  }
  return { changed: false, reason: 'stalled' };
}

// (isUsableNextControl lives in content/selectors/common.js so it is reachable
//  from content scripts; re-exported here for the orchestrator/tests.)
export { isUsableNextControl } from '../content/selectors/common.js';

// Guard against re-processing an already-seen (url|fingerprint) page. Returns
// true when this page is new and should be processed.
export function isNewPage(seenKeys, url, fingerprint) {
  const key = `${normalizeUrl(url)}::${fingerprint}`;
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
}

// Build the URL for page N of a LinkedIn search by setting the `page` query
// param. LinkedIn people/search results paginate via ?page=N (10 results each),
// so navigating by URL is more reliable than clicking a lazy "Next" button —
// especially in a background tab.
export function buildSearchPageUrl(base, page) {
  const n = Math.max(1, Math.floor(Number(page) || 1));
  try {
    const u = new URL(base);
    u.searchParams.set('page', String(n));
    return u.toString();
  } catch {
    const [path, hash] = String(base || '').split('#');
    let p = path.replace(/([?&])page=\d+/i, `$1page=${n}`);
    if (!/[?&]page=/i.test(p)) p += (p.includes('?') ? '&' : '?') + `page=${n}`;
    return hash ? `${p}#${hash}` : p;
  }
}

// The starting page number encoded in a search URL (defaults to 1).
export function pageOf(url) {
  try { return Math.max(1, parseInt(new URL(url).searchParams.get('page') || '1', 10) || 1); }
  catch {
    const m = String(url || '').match(/[?&]page=(\d+)/i);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
  }
}

function normalizeUrl(u) {
  const s = String(u || '');
  try {
    const url = new URL(s);
    url.hash = '';
    return url.toString();
  } catch {
    // Relative/partial URL: strip fragment via string.
    return s.split('#')[0];
  }
}
