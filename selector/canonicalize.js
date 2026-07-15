// URL canonicalization for LinkedIn profile identities.
//
// Two concepts:
//  - Source navigation URL: may be a standard /in/ URL, a Sales Navigator lead
//    URL, or a Recruiter candidate URL. Used only to navigate during collection.
//  - Canonical profile URL: the final identity, always
//    https://www.linkedin.com/in/<slug>
//
// canonicalizeProfileUrl() returns { ok, canonical, reason } and never throws.

const ALLOWED_HOSTS_DEFAULT = ['linkedin.com', 'www.linkedin.com'];

// Hosts that indicate a source-specific (non-/in/) profile that must be
// resolved to a standard /in/ URL during collection.
const SOURCE_HOST_HINTS = ['linkedin.com', 'www.linkedin.com'];

function stripTrailingSlash(path) {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

// Validate + canonicalize a standard profile URL.
// allowedHosts defaults to linkedin.com / www.linkedin.com.
export function canonicalizeProfileUrl(rawUrl, allowedHosts = ALLOWED_HOSTS_DEFAULT) {
  if (rawUrl == null || String(rawUrl).trim() === '') {
    return { ok: false, canonical: null, reason: 'missing_profile_url' };
  }

  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }

  // Scheme must be HTTPS.
  if (url.protocol !== 'https:') {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }

  // Reject embedded credentials.
  if (url.username || url.password) {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }

  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.map((h) => h.toLowerCase());
  if (!allowed.includes(host)) {
    return { ok: false, canonical: null, reason: 'disallowed_host' };
  }

  // Reject encoded path traversal or malformed percent-encoding.
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }
  if (decodedPath.includes('..') || decodedPath.includes('%2e%2e')) {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }

  const path = stripTrailingSlash(url.pathname);
  const segments = path.split('/').filter(Boolean);

  // Must be exactly /in/<slug>
  if (segments.length !== 2 || segments[0].toLowerCase() !== 'in') {
    return { ok: false, canonical: null, reason: 'unsupported_profile_path' };
  }

  const slug = segments[1];
  if (!slug) {
    return { ok: false, canonical: null, reason: 'invalid_profile_url' };
  }

  // Normalize slug: keep decoded value but re-encode safely. Slugs are
  // case-sensitive on LinkedIn but the public vanity is lowercased; we lowercase
  // for a stable identity while preserving percent-safe encoding.
  const normalizedSlug = encodeURIComponent(decodeURIComponent(slug)).toLowerCase();

  return {
    ok: true,
    canonical: `https://www.linkedin.com/in/${normalizedSlug}`,
    reason: 'ok'
  };
}

// Classify a source navigation URL: is it a standard /in/ URL, a source-specific
// profile URL (sales/recruiter), or unsupported? Returns
// { kind: 'standard'|'source_specific'|'unsupported', host }.
export function classifySourceUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return { kind: 'unsupported', host: null };
  }
  if (url.protocol !== 'https:') return { kind: 'unsupported', host: url.hostname };
  const host = url.hostname.toLowerCase();
  if (!SOURCE_HOST_HINTS.includes(host)) return { kind: 'unsupported', host };
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'in') return { kind: 'standard', host };
  // Sales Navigator: /sales/lead/... ; Recruiter: /talent/... or /hire/candidate/
  if (
    (segments[0] === 'sales' && (segments[1] === 'lead' || segments[1] === 'people')) ||
    (segments[0] === 'talent') ||
    (segments[0] === 'hire')
  ) {
    return { kind: 'source_specific', host };
  }
  return { kind: 'unsupported', host };
}
