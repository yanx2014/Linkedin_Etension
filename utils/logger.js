// Minimal, redaction-aware logger for the extension side. Never logs profile
// bodies, post text, emails, or tokens at the default level.

const REDACTED = '[redacted]';

const SENSITIVE_KEYS = new Set([
  'text', 'about', 'summary', 'email', 'token', 'authorization',
  'apiKey', 'api_key', 'password', 'cookie', 'posts', 'body'
]);

export function redact(value) {
  if (Array.isArray(value)) return `[array(${value.length})]`;
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level, msg, meta) {
  const line = { level, msg, ...(meta ? { meta: redact(meta) } : {}) };
  // eslint-disable-next-line no-console
  (console[level] || console.log)(JSON.stringify(line));
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta)
};
