// Audit repository. Stores per-job audit entries and deletion events.

import { put, getAll, STORES } from './database.js';

export async function appendAudit(jobId, entry) {
  await put(STORES.AUDIT, { job_id: jobId, ...entry, stored_at: new Date().toISOString() });
}

export async function appendAuditBatch(jobId, entries) {
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await appendAudit(jobId, e);
  }
}

export async function auditForJob(jobId) {
  const all = await getAll(STORES.AUDIT);
  return all.filter((e) => e.job_id === jobId);
}

export async function recordDeletion(what) {
  await put(STORES.AUDIT, { job_id: '__deletion__', action: 'delete', what, stored_at: new Date().toISOString() });
}
