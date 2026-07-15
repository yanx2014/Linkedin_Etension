// Job orchestrator: drives discovery, selection, enrichment, and export.
// Connected mode collects previews/profiles via the worker tab and enriches via
// the backend; import-only mode runs entirely locally. Progress persists after
// each step so a job resumes after browser/service-worker/backend restarts.

import { makeRequest } from '../utils/messages.js';
import { runImportPipeline } from '../import/import-job.js';
import { decideNextAction } from '../import/paginator.js';
import { getJob, saveJob, JobState } from '../storage/jobs-repository.js';
import { upsertContact, seenCanonicalUrls } from '../storage/contacts-repository.js';
import { appendAuditBatch } from '../storage/audit-repository.js';
import { ensureWorkerTab, navigate, sendToTab, collectProfile } from './tab-controller.js';
import { markJobBlocked, isBlockedError } from './blocked-state-handler.js';
import { enrichProfile as backendEnrich } from './backend-client.js';
import { downloadFile } from '../utils/download.js';
import { logger } from '../utils/logger.js';

// Emit a progress event to any open UI.
function emitProgress(job) {
  try {
    chrome.runtime.sendMessage({ type: 'EVENT_JOB_PROGRESS', requestId: null, payload: { job: summarize(job) } });
  } catch { /* no UI open */ }
}

function summarize(job) {
  return {
    id: job.id, state: job.state, source_type: job.source_type,
    counts: job.counts || {}, blocked: job.blocked || null
  };
}

async function refreshControl(job) {
  const latest = await getJob(job.id);
  return {
    cancelled: latest?.state === JobState.CANCELLED,
    paused: latest?.state === JobState.PAUSED
  };
}

// Discovery: collect preview rows from a source page with bounded pagination.
async function discoverPreviews(job) {
  const tabId = await ensureWorkerTab(job.source_url);
  await navigate(tabId, job.source_url);

  const previews = [];
  const seen = new Set();
  let lastDiscoveredTotal = 0;
  let noGrowthAttempts = 0;
  let blocked = false;

  // Loop pages/scrolls until a stop condition.
  // Bound the loop hard to avoid runaway behaviour. Any messaging failure stops
  // discovery gracefully with whatever previews were already collected — it must
  // never fail the whole job (we can still enrich + export what we have).
  for (let step = 0; step < 200; step++) {
    const control = await refreshControl(job);
    if (control.cancelled || control.paused) break;

    let batch = { rows: [], hasNext: false, hasScroll: false };
    try {
      batch = await sendToTab(tabId, makeRequest('CS_COLLECT_PREVIEWS', { url: job.source_url, sourceType: job.source_type, limit: job.max_profiles || 500 }));
    } catch (err) {
      if (isBlockedError(err)) { blocked = true; }
      else { logger.warn('preview collection failed; stopping discovery', { reason: err.message }); break; }
    }
    for (const row of (batch && batch.rows) || []) {
      const key = row.profile_url || row.source_record_id;
      if (key && !seen.has(key)) { seen.add(key); previews.push(row); }
    }

    // Persist progress immediately so counts survive even if a later step fails.
    job.counts = { discovered: previews.length };
    await saveJob(job);
    emitProgress(job);

    const decision = decideNextAction({
      acceptedCount: previews.length,
      maxProfiles: job.max_profiles || 500,
      discoveredTotal: previews.length,
      lastDiscoveredTotal,
      noGrowthAttempts,
      hasNextControl: !!(batch && batch.hasNext),
      hasScrollContainer: !!(batch && batch.hasScroll),
      blocked,
      cancelled: control.cancelled,
      paused: control.paused
    });
    lastDiscoveredTotal = previews.length;
    noGrowthAttempts = decision.noGrowthAttempts ?? noGrowthAttempts;

    if (decision.action === 'stop' || decision.action === 'pause') {
      if (decision.reason === 'blocked') markJobBlocked(job, { phase: 'discovery' });
      break;
    }
    try {
      if (decision.action === 'next') {
        await sendToTab(tabId, makeRequest('CS_NEXT_PAGE', { url: job.source_url }));
      } else if (decision.action === 'scroll') {
        await sendToTab(tabId, makeRequest('CS_SCROLL', { url: job.source_url }));
      }
    } catch (err) {
      // Page-turn/scroll re-render closed the message channel — stop discovery
      // with the previews collected so far rather than failing the job.
      logger.warn('pagination/scroll failed; continuing with collected previews', { reason: err.message });
      break;
    }
  }
  return previews;
}

// Build the enrichment function for connected mode.
function makeEnricher(job) {
  return async (accepted) => {
    if (job.import_only) return { collectedProfile: accepted, status: 'import_only' };
    const tabId = await ensureWorkerTab(job.source_url);
    let collectedProfile = accepted;
    try {
      const collected = await collectProfile(tabId, accepted.profile_url || accepted.source_url);
      collectedProfile = { ...accepted, ...collected, canonical_url: accepted.canonical_url };
    } catch (err) {
      if (isBlockedError(err)) throw err;
      logger.warn('profile collection failed', { reason: err.message });
    }
    // Backend enrichment: company research + DeepSeek structuring.
    try {
      const res = await backendEnrich(collectedProfile, { use_deepseek: job.use_deepseek !== false });
      const firstWarning = Array.isArray(res.warnings) && res.warnings.length
        ? (res.warnings[0].reason || JSON.stringify(res.warnings[0]))
        : null;
      return {
        collectedProfile,
        companyEvidence: res.companyEvidence || {},
        llmOutput: res.avatar || res.llmOutput || null,
        status: res.status || 'complete',
        enrichmentError: res.avatar ? null : firstWarning || `deepseek ${res.status || 'no output'}`
      };
    } catch (err) {
      logger.warn('backend enrichment failed', { reason: err.message });
      // Surface the HTTP status when present (e.g. 401 bad key, 400 bad request).
      const detail = err.status ? `http ${err.status}: ${err.message}` : err.message;
      return { collectedProfile, companyEvidence: {}, status: 'failed', enrichmentError: detail };
    }
  };
}

// Run a job end-to-end.
export async function runJob(jobId) {
  let job = await getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);

  try {
    // 1. Discovery (page source) or use provided records (file import).
    job.state = JobState.DISCOVERING; job.started_at = job.started_at || new Date().toISOString();
    await saveJob(job); emitProgress(job);

    let records = job.records || [];
    if (job.source_url && !job.import_only && (!records || records.length === 0)) {
      records = await discoverPreviews(job);
    }
    if (job.state === JobState.BLOCKED) { await saveJob(job); emitProgress(job); return job; }

    // 2. Selection + enrichment + export (reuses the tested pipeline).
    job.state = JobState.SELECTING; await saveJob(job); emitProgress(job);
    const seen = await seenCanonicalUrls();
    const enricher = job.import_only ? null : makeEnricher(job);

    const result = await runImportPipeline({
      records,
      criteria: job.criteria,
      seenKeys: seen,
      enrichProfile: enricher,
      job
    });

    // 3. Persist contacts + audit.
    for (const rec of result.enriched) {
      if (rec.profile_url) {
        // eslint-disable-next-line no-await-in-loop
        await upsertContact({
          canonical_url: rec.profile_url,
          full_name: rec.full_name, company: rec.company, role: rec.role,
          source_type: job.source_type, list_ids: job.destination_list_id ? [job.destination_list_id] : [],
          score: rec.score, avatar_profile: rec.avatar_profile, enriched_at: new Date().toISOString()
        });
      }
    }
    await appendAuditBatch(job.id, result.audit);

    // 4. Export (auto or on demand).
    job.exports = Object.keys(result.exports);
    job.completed_at = new Date().toISOString();
    job.state = result.audit.some((a) => a.enrichment_status === 'failed') ? JobState.PARTIAL : JobState.COMPLETED;
    job.counts = { ...(job.counts || {}), accepted: result.accepted.length, rejected: result.rejected.length };
    await saveJob(job); emitProgress(job);

    if (job.auto_export) await downloadExports(job, result.exports);
    // Stash exports on the job for on-demand download.
    job.export_contents = result.exports;
    await saveJob(job);

    return job;
  } catch (err) {
    if (isBlockedError(err)) {
      markJobBlocked(job, { phase: job.state });
    } else {
      job.state = JobState.FAILED;
      job.error = err.message;
      // Surface the reason in the service-worker console (message only — no
      // profile data) so failures are diagnosable.
      // eslint-disable-next-line no-console
      console.error(`[job ${job.id}] FAILED at ${job.state}: ${err.message}`);
    }
    await saveJob(job); emitProgress(job);
    return job;
  }
}

export async function downloadExports(job, exports) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const map = {
    'profiles_selected.csv': `profiles_selected_${job.id}_${ts}.csv`,
    'profiles_rejected.csv': `profiles_rejected_${job.id}_${ts}.csv`,
    'audit.json': `audit_${job.id}_${ts}.json`,
    'avatar_evidence.json': `avatar_evidence_${job.id}_${ts}.json`,
    'job_summary.json': `job_summary_${job.id}_${ts}.json`
  };
  for (const [key, filename] of Object.entries(map)) {
    if (!exports[key]) continue;
    const mime = key.endsWith('.csv') ? 'text/csv' : 'application/json';
    // eslint-disable-next-line no-await-in-loop
    await downloadFile(filename, exports[key], mime);
  }
}
