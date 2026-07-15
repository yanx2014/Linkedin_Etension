// Job orchestrator: drives discovery, selection, enrichment, and export.
// Connected mode collects previews/profiles via the worker tab and enriches via
// the backend; import-only mode runs entirely locally. Progress persists after
// each step so a job resumes after browser/service-worker/backend restarts.

import { makeRequest } from '../utils/messages.js';
import { runImportPipeline } from '../import/import-job.js';
import { decideNextAction } from '../import/paginator.js';
import { resultFingerprint, validatePaginationTransition, isNewPage } from '../import/pagination-fingerprint.js';
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

// Collection mode: 'current_page_only' (default) or 'background_search_pages'.
function collectionMode(job) {
  return job.criteria?.collection?.mode || 'current_page_only';
}

// Profile visits (/in/ navigation) are only allowed in background_search_pages
// mode AND only when the user explicitly enabled profile_visit.
function profileVisitEnabled(job) {
  return collectionMode(job) === 'background_search_pages'
    && job.criteria?.collection?.profile_visit === true;
}

// Same LinkedIn page (ignoring query/fragment) — used to stop current-page
// discovery if the user navigates the active tab away.
function samePage(a, b) {
  try { return new URL(a).pathname === new URL(b).pathname; }
  catch { return String(a) === String(b); }
}

// Canonical /in/ slug from a profile URL (for the pagination fingerprint).
function slugOf(profileUrl) {
  const m = String(profileUrl || '').match(/\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Is this a linkedin.com URL? Guards current-page collection to LinkedIn pages.
function isLinkedInUrl(u) {
  try { return /(^|\.)linkedin\.com$/i.test(new URL(u).hostname); }
  catch { return false; }
}

// Merge collected profile fields onto the preview WITHOUT clobbering non-empty
// preview values with empty collected ones (task: retain preview values).
function mergeProfile(preview, collected) {
  const out = { ...preview };
  for (const [k, v] of Object.entries(collected || {})) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// Route discovery to the mode-appropriate collector.
async function discoverPreviews(job) {
  return collectionMode(job) === 'background_search_pages'
    ? discoverBackgroundPages(job)
    : discoverCurrentPage(job);
}

// current_page_only (DEFAULT): collect from the ACTIVE tab the user is on.
// No chrome.tabs.create, no navigation, no page turns. Only bounded scrolling
// while the URL is unchanged; stop if the user navigates the tab away.
async function discoverCurrentPage(job) {
  const tabId = job.active_tab_id;
  if (tabId == null) {
    throw new Error('current_page_only mode needs an active LinkedIn tab — open the search page, then start the import');
  }
  let baseUrl = job.source_url;
  try {
    const tab = await chrome.tabs.get(tabId);
    baseUrl = tab?.url || baseUrl;
  } catch {
    throw new Error('the LinkedIn tab is no longer available');
  }

  // The collected profile URLs must belong to the LinkedIn page you are on.
  // Refuse to collect from a non-LinkedIn tab so URLs are always related to the
  // current search page.
  if (!isLinkedInUrl(baseUrl)) {
    throw new Error('open a LinkedIn search/list page in the active tab before collecting URLs');
  }

  const previews = [];
  const seen = new Set();
  let lastDiscoveredTotal = 0;
  let noGrowthAttempts = 0;
  let blocked = false;

  for (let step = 0; step < 200; step++) {
    const control = await refreshControl(job);
    if (control.cancelled || control.paused) break;

    // Never navigate. If the tab left the search page, stop with what we have.
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !samePage(tab.url, baseUrl)) {
        logger.warn('active tab left the search page; stopping current-page discovery');
        break;
      }
    } catch { break; }

    let batch = { rows: [], hasNext: false, hasScroll: false };
    try {
      batch = await sendToTab(tabId, makeRequest('CS_COLLECT_PREVIEWS', { url: baseUrl, sourceType: job.source_type, limit: job.max_profiles || 500 }));
    } catch (err) {
      if (isBlockedError(err)) { blocked = true; }
      else { logger.warn('preview collection failed; stopping discovery', { reason: err.message }); break; }
    }
    for (const row of (batch && batch.rows) || []) {
      const key = row.profile_url || row.source_record_id;
      if (key && !seen.has(key)) {
        // Stamp the origin: each profile URL is tied to the exact LinkedIn page
        // it was collected from (shown in the CSV source_search column).
        seen.add(key);
        previews.push({ ...row, source_search: baseUrl, source_url: baseUrl });
      }
    }

    job.counts = { discovered: previews.length };
    await saveJob(job); emitProgress(job);

    const decision = decideNextAction({
      acceptedCount: previews.length,
      maxProfiles: job.max_profiles || 500,
      discoveredTotal: previews.length,
      lastDiscoveredTotal,
      noGrowthAttempts,
      hasNextControl: false, // page turns require navigation — never in this mode
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
    if (decision.action === 'scroll') {
      try {
        await sendToTab(tabId, makeRequest('CS_SCROLL', { url: baseUrl }));
      } catch (err) {
        logger.warn('scroll failed; stopping current-page discovery', { reason: err.message });
        break;
      }
    } else {
      // 'next' would require navigating the active tab — not allowed here.
      break;
    }
  }
  return previews;
}

// background_search_pages (opt-in): one inactive worker tab, navigating
// search-result pages only. Discovery walks pages with bounded pagination.
async function discoverBackgroundPages(job) {
  const tabId = await ensureWorkerTab(job.source_url);
  await navigate(tabId, job.source_url);

  const previews = [];
  const seen = new Set();
  const seenPages = new Set(); // (url|fingerprint) pages already processed
  let lastDiscoveredTotal = 0;
  let noGrowthAttempts = 0;
  let blocked = false;
  let lastFingerprint = null;

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
    // Read the tab's current URL first so each row can be stamped with the exact
    // page it came from (documents origin; also the fingerprint's page key).
    let currentUrl = job.source_url;
    try { currentUrl = (await chrome.tabs.get(tabId))?.url || job.source_url; } catch { /* keep source_url */ }

    for (const row of (batch && batch.rows) || []) {
      const key = row.profile_url || row.source_record_id;
      // Dedup across ALL pages in this run by canonical profile URL.
      if (key && !seen.has(key)) {
        seen.add(key);
        previews.push({ ...row, source_search: currentUrl });
      }
    }

    // Deterministic result fingerprint (from the rendered slugs) — a robust
    // stall signal: if a page turn yields the same fingerprint, the page did
    // not actually advance even if a "next" control is present.
    const slugs = (batch && batch.rows ? batch.rows : []).map((r) => slugOf(r.profile_url)).filter(Boolean);
    const fingerprint = resultFingerprint(slugs);
    const freshPage = isNewPage(seenPages, currentUrl, fingerprint);
    const transition = lastFingerprint == null
      ? { changed: true, reason: 'first_page' }
      : validatePaginationTransition({ beforeFingerprint: lastFingerprint, afterFingerprint: fingerprint });
    lastFingerprint = fingerprint;

    // Persist progress immediately so counts survive even if a later step fails.
    job.counts = { discovered: previews.length };
    await saveJob(job);
    emitProgress(job);

    // Treat a stalled fingerprint / already-seen page as "no growth" so the
    // bounded stop logic converges even when a stale "next" control lingers.
    const stalled = !freshPage || transition.reason === 'stalled';

    const decision = decideNextAction({
      acceptedCount: previews.length,
      maxProfiles: job.max_profiles || 500,
      discoveredTotal: previews.length,
      lastDiscoveredTotal,
      noGrowthAttempts,
      hasNextControl: !!(batch && batch.hasNext) && !stalled,
      hasScrollContainer: !!(batch && batch.hasScroll) && !stalled,
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
  const visitProfiles = profileVisitEnabled(job);
  return async (accepted) => {
    if (job.import_only) return { collectedProfile: accepted, status: 'import_only' };
    let collectedProfile = accepted;
    // Only visit the person's /in/ page when explicitly enabled (background
    // mode + profile_visit). Otherwise enrich from search-card evidence and
    // backend company research only — no profile/activity navigation.
    if (visitProfiles) {
      const tabId = await ensureWorkerTab(job.source_url);
      try {
        const collected = await collectProfile(tabId, accepted.profile_url || accepted.source_url);
        // Keep non-empty preview values; let non-empty collected values win.
        collectedProfile = { ...mergeProfile(accepted, collected), canonical_url: accepted.canonical_url };
      } catch (err) {
        if (isBlockedError(err)) throw err;
        logger.warn('profile collection failed', { reason: err.message });
      }
    }
    // Backend enrichment: company research + DeepSeek structuring.
    try {
      const res = await backendEnrich(collectedProfile, { use_deepseek: job.use_deepseek !== false });
      // Prefer the backend's structured error {phase, code, status, message}.
      let enrichmentError = null;
      if (!res.avatar) {
        if (res.enrichmentError) {
          enrichmentError = formatEnrichmentError(res.enrichmentError);
        } else if (Array.isArray(res.warnings) && res.warnings.length) {
          enrichmentError = res.warnings[0].reason || JSON.stringify(res.warnings[0]);
        } else {
          enrichmentError = `deepseek ${res.status || 'no output'}`;
        }
      }
      return {
        collectedProfile,
        companyEvidence: res.companyEvidence || {},
        llmOutput: res.avatar || res.llmOutput || null,
        status: res.status || 'complete',
        model: res.model || null,
        enrichmentError
      };
    } catch (err) {
      logger.warn('backend enrichment failed', { reason: err.message });
      // Transport-level failure reaching the backend itself (not a DeepSeek
      // error the backend classified). Surface HTTP status when present.
      const detail = formatEnrichmentError({ phase: 'backend', code: err.body?.code || null, status: err.status || null, message: err.message });
      return { collectedProfile, companyEvidence: {}, status: 'failed', enrichmentError: detail };
    }
  };
}

// Render a structured enrichment error as a compact, human-readable suffix for
// the CSV profile_note, e.g. "deepseek/LLM_UNAUTHORIZED http 401: key revoked".
function formatEnrichmentError(e) {
  if (!e) return null;
  if (typeof e === 'string') return e;
  const parts = [];
  if (e.phase) parts.push(e.code ? `${e.phase}/${e.code}` : e.phase);
  else if (e.code) parts.push(e.code);
  if (e.status) parts.push(`http ${e.status}`);
  const head = parts.join(' ');
  return head ? `${head}: ${e.message || 'enrichment failed'}` : (e.message || 'enrichment failed');
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
    // URL-only jobs skip enrichment entirely (no backend, no DeepSeek): we just
    // want the profile URLs from the current page in the CSV.
    const enricher = (job.import_only || job.urls_only) ? null : makeEnricher(job);

    const result = await runImportPipeline({
      records,
      criteria: job.criteria,
      seenKeys: seen,
      enrichProfile: enricher,
      job
    });

    // 3. Persist contacts + audit. Persist the FULL enriched record (every CSV
    // field) so the contact store is a complete, exportable database — not just
    // name/company/role. Keyed by canonical_url; the name+company secondary
    // index is maintained by upsertContact for already-imported detection.
    const enrichedAt = new Date().toISOString();
    for (const rec of result.enriched) {
      if (rec.profile_url) {
        // eslint-disable-next-line no-await-in-loop
        await upsertContact({
          canonical_url: rec.profile_url,
          full_name: rec.full_name,
          headline: rec.headline,
          company: rec.company,
          location: rec.location,
          source_search: rec.source_search,
          collected_at: rec.collected_at,
          last_name: rec.last_name,
          first_name: rec.first_name,
          role: rec.role,
          email: rec.email,
          website: rec.website,
          score: rec.score,
          avatar_profile: rec.avatar_profile,
          profile_note: rec.profile_note,
          source_type: job.source_type,
          list_ids: job.destination_list_id ? [job.destination_list_id] : [],
          enriched_at: enrichedAt
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
