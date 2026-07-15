// Bearer-token auth for the loopback backend. When an install token is
// configured, every non-health request must present it. Uses a timing-safe
// comparison.

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function extractBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export function isAuthorized(req) {
  if (!config.installToken) return true; // no token configured -> open (loopback dev)
  const token = extractBearer(req);
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.installToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
