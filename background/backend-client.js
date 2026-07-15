// Thin client for the local enrichment backend. Sends the installation token in
// the Authorization header. The backend holds all API keys; the extension never
// sees them.

import { getSettings } from '../storage/settings-store.js';

async function backend(path, options = {}) {
  const s = await getSettings();
  const url = `${s.backend_url.replace(/\/$/, '')}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (s.backend_token) headers.Authorization = `Bearer ${s.backend_token}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error((body && body.error) || `backend ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function health() {
  return backend('/v1/health', { method: 'GET' });
}

// Enrich one collected profile: returns { companyEvidence, llmOutput, ... }.
export async function enrichProfile(collectedProfile, options = {}) {
  return backend('/v1/enrich/profile', {
    method: 'POST',
    body: JSON.stringify({ profile: collectedProfile, options })
  });
}

export async function deleteAllData() {
  return backend('/v1/data', { method: 'DELETE' });
}
