// CORS restricted to configured extension origins. When no extension IDs are
// configured, only same-origin/no-origin requests are allowed (dev convenience
// still requires the install token).

import { config } from '../config.js';

export function allowedOrigins() {
  return config.allowedExtensionIds.map((id) => `chrome-extension://${id}`);
}

export function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser / same-origin
  return allowedOrigins().includes(origin);
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}
