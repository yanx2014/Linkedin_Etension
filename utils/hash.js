// Deterministic hashing helpers. Uses Web Crypto (available in service workers,
// content scripts, extension pages, and Node 20+ via globalThis.crypto).

// SHA-256 hex digest of a string, prefixed with the algorithm label.
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `sha256:${hex}`;
}

// Stable, order-independent hash of an object by hashing its canonical JSON.
export async function hashObject(obj) {
  return sha256Hex(canonicalJson(obj));
}

// Produce canonical JSON with sorted object keys so equal objects hash equally.
export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

// Short, non-cryptographic 32-bit FNV-1a hash for cheap keys (e.g. dedupe hints).
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
