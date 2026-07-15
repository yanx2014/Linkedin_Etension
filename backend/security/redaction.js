// Redaction + hashing helpers for logs and facts. Names, post bodies, emails,
// URLs, and tokens are redacted from normal logs.

import { createHash } from 'node:crypto';

export function sha256HexSync(input) {
  return `sha256:${createHash('sha256').update(String(input)).digest('hex')}`;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s"']+/gi;

export function redactString(s) {
  return String(s == null ? '' : s)
    .replace(EMAIL_RE, '[email]')
    .replace(URL_RE, '[url]');
}

const SENSITIVE_KEYS = new Set(['text', 'about', 'summary', 'email', 'posts', 'body', 'authorization', 'token', 'apikey', 'api_key', 'password', 'full_name', 'first_name', 'last_name']);

export function redactObject(value) {
  if (Array.isArray(value)) return `[array(${value.length})]`;
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : redactObject(v);
    }
    return out;
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}
