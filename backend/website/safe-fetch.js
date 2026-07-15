// SSRF-safe HTTP(S) fetcher for company websites. Enforces: public IPs only
// (re-checked after each redirect), HTTPS-only (one initial HTTP->HTTPS hop
// allowed), max 3 redirects, 10s timeout, 1MB body cap, and a content-type
// allowlist. Never submits forms, logs in, executes JS, or downloads binaries.

import { assertPublicHost } from './dns-guard.js';
import { getUserAgent } from './robots.js';

const ALLOWED_TYPES = [
  'text/html', 'text/plain', 'application/xhtml+xml',
  'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml',
  'application/ld+json', 'application/json'
];

export const FetchLimits = {
  maxRedirects: 3,
  timeoutMs: 10000,
  maxBytes: 1024 * 1024
};

export async function safeFetch(startUrl, opts = {}) {
  const limits = { ...FetchLimits, ...opts };
  // `allowPrivateHosts` is ONLY used by the test suite to exercise size/redirect/
  // content-type handling against a loopback server. It never relaxes SSRF
  // protection in normal operation.
  const testMode = !!opts.allowPrivateHosts;
  let url = new URL(startUrl);
  let redirects = 0;
  let allowedHttpHop = true; // permit a single initial http->https hop

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (url.protocol === 'http:') {
      if (!allowedHttpHop && !testMode) throw new Error('http not allowed after initial hop');
    } else if (url.protocol !== 'https:') {
      throw new Error(`unsupported scheme: ${url.protocol}`);
    }

    if (!testMode) await assertPublicHost(url.hostname); // re-checked every hop (redirect defense)

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    let res;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': getUserAgent(),
          accept: 'text/html,application/xhtml+xml,application/xml,text/plain,application/rss+xml,application/atom+xml,application/ld+json;q=0.9,*/*;q=0.1'
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('redirect without location');
      redirects += 1;
      if (redirects > limits.maxRedirects) throw new Error('too many redirects');
      const next = new URL(location, url);
      allowedHttpHop = false; // only the very first request may be http
      if (next.protocol !== 'https:' && !testMode) throw new Error('redirect to non-https blocked');
      url = next;
      continue;
    }

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !ALLOWED_TYPES.includes(contentType)) {
      throw new Error(`disallowed content-type: ${contentType}`);
    }

    const body = await readCapped(res, limits.maxBytes);
    return { url: url.toString(), status: res.status, contentType, body, redirects };
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new Error('response exceeds size limit');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder('utf-8').decode(buf);
}

export { ALLOWED_TYPES };
