// GET /v1/jobs/:jobId — the backend is stateless regarding extension jobs
// (authoritative job state lives in the extension). This returns cached
// enrichment metadata if present, else 404.

import { getStore } from '../db/database.js';

export function jobStatusRoute(jobId) {
  const store = getStore();
  const meta = store.data.meta || {};
  return {
    job_id: jobId,
    backend_stateful: false,
    note: 'Authoritative job state lives in the extension. The backend only caches enrichment results.',
    schema_version: meta.schema_version || 1
  };
}
