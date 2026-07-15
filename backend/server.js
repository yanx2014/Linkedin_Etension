// Local enrichment backend (node:http, no framework dependency). Binds to
// 127.0.0.1 by default. Handles CORS (extension origins only), install-token
// auth, JSON body limits, security headers, and rate limiting.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { config } from './config.js';
import { applyCors, isOriginAllowed } from './security/cors.js';
import { isAuthorized } from './security/request-auth.js';
import { createRateLimiter } from './security/rate-limit.js';
import { healthRoute } from './routes/health.js';
import { enrichProfileRoute } from './routes/enrich-profile.js';
import { enrichBatchRoute } from './routes/enrich-batch.js';
import { jobStatusRoute } from './routes/job-status.js';
import { deleteDataRoute } from './routes/delete-data.js';

const limiter = createRateLimiter({ capacity: 30, refillPerSec: 0.5 });

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) { reject(Object.assign(new Error('payload too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

// deps are injected into enrich routes for testing (searchProvider, deepseek, safeFetch).
export async function handleRequest(req, res, deps = {}) {
  securityHeaders(res);
  applyCors(req, res);

  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) { send(res, 403, { error: 'origin not allowed' }); return; }

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${config.host}:${config.port}`);
  const path = url.pathname;

  // Health is unauthenticated.
  if (req.method === 'GET' && path === '/v1/health') { send(res, 200, healthRoute()); return; }

  // Everything else requires the install token (when configured).
  if (!isAuthorized(req)) { send(res, 401, { error: 'unauthorized' }); return; }

  // Rate limit enrichment endpoints.
  if (path.startsWith('/v1/enrich')) {
    const key = req.socket.remoteAddress || 'local';
    const rl = limiter(key);
    if (!rl.allowed) { res.setHeader('Retry-After', String(rl.retryAfter)); send(res, 429, { error: 'rate limited' }); return; }
  }

  try {
    if (req.method === 'POST' && path === '/v1/enrich/profile') {
      const body = await readBody(req, config.maxBodyBytes);
      send(res, 200, await enrichProfileRoute(body, deps));
      return;
    }
    if (req.method === 'POST' && path === '/v1/enrich/batch') {
      const body = await readBody(req, config.maxBodyBytes);
      send(res, 200, await enrichBatchRoute(body, deps));
      return;
    }
    if (req.method === 'GET' && path.startsWith('/v1/jobs/')) {
      send(res, 200, jobStatusRoute(decodeURIComponent(path.slice('/v1/jobs/'.length))));
      return;
    }
    if (req.method === 'DELETE' && path === '/v1/data') {
      send(res, 200, deleteDataRoute());
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, err.statusCode || 500, { error: err.message });
  }
}

export function createServer(deps = {}) {
  return http.createServer((req, res) => { handleRequest(req, res, deps).catch(() => send(res, 500, { error: 'internal error' })); });
}

// Start when run directly. Compare the real on-disk paths (case- and
// encoding-normalized) instead of URL strings, so this works on Windows
// (drive-letter casing, %20 in paths) as well as POSIX.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
const isMain = isMainModule();
if (isMain) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`Enrichment backend listening on http://${config.host}:${config.port}`);
  });
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
