// MV3 service worker. Wires the message router, opens the side panel on toolbar
// click, restores active-job status on startup, and fires scheduled imports.
// Holds no authoritative job state in globals — everything persists in IndexedDB
// / chrome.storage.

import { attachRouter, registerAll } from './message-router.js';
import { MessageTypes } from '../utils/messages.js';
import { detectAdapter } from '../content/source-detector.js';
import { createJob, getJob, saveJob, allJobs, activeJob, JobState } from '../storage/jobs-repository.js';
import { runJob, downloadExports } from './job-orchestrator.js';
import { validateCriteria } from '../utils/validation.js';
import { parseCsv } from '../import/csv-parser.js';
import { parseJsonImport } from '../import/json-parser.js';
import { parseUrlList } from '../import/url-list-parser.js';
import { normalizeRecord } from '../import/source-metadata.js';
import { getSettings, setSettings } from '../storage/settings-store.js';
import { allContacts, searchContacts } from '../storage/contacts-repository.js';
import { createList, renameList, deleteList, allLists } from '../storage/lists-repository.js';
import { saveSource, allSources, deleteSource, getSource } from '../storage/sources-repository.js';
import { syncAlarms, sourceIdFromAlarm } from './alarm-manager.js';
import { clearAll } from '../storage/database.js';
import { recordDeletion } from '../storage/audit-repository.js';
import { health, deleteAllData } from './backend-client.js';

// Open side panel on toolbar click.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
  syncAlarms().catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => { syncAlarms().catch(() => {}); });

chrome.action?.onClicked?.addListener((tab) => {
  if (chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// Scheduled source imports.
chrome.alarms?.onAlarm?.addListener(async (alarm) => {
  const sourceId = sourceIdFromAlarm(alarm.name);
  if (!sourceId) return;
  const source = await getSource(sourceId);
  if (!source) return;
  const job = await createJob({
    source_type: source.source_type, source_url: source.url, criteria: source.criteria,
    max_profiles: source.max_profiles, destination_list_id: source.destination_list_id,
    auto_export: source.auto_export, use_deepseek: source.auto_enrich, scheduled: true
  });
  runJob(job.id).catch(() => {});
});

// ---- Message handlers ----
registerAll({
  [MessageTypes.DETECT_SOURCE]: async ({ url }) => {
    const adapter = detectAdapter({ url });
    return adapter ? { supported: true, ...adapter.detectSourceMetadata({ url }) } : { supported: false };
  },

  [MessageTypes.IMPORT_START]: async (payload) => {
    const { valid, errors, normalized } = validateCriteria(payload.criteria || {});
    if (!valid) throw new Error(`invalid criteria: ${errors.join('; ')}`);
    const job = await createJob({
      source_type: payload.source_type || 'standard_search',
      source_url: payload.source_url || null,
      criteria: normalized,
      max_profiles: normalized.max_profiles,
      destination_list_id: payload.destination_list_id || null,
      auto_export: normalized.automation.auto_export,
      use_deepseek: normalized.enrichment.use_deepseek,
      import_only: !!payload.import_only
    });
    runJob(job.id).catch(() => {});
    return { job_id: job.id };
  },

  [MessageTypes.IMPORT_FILE]: async ({ filename, content, format, criteria }) => {
    const parsed = parseImport(filename, content, format);
    const { valid, errors, normalized } = validateCriteria(criteria || {});
    if (!valid) throw new Error(`invalid criteria: ${errors.join('; ')}`);
    const job = await createJob({
      source_type: `import_${parsed.kind}`, source_url: null, criteria: normalized,
      max_profiles: normalized.max_profiles, import_only: true,
      auto_export: normalized.automation.auto_export, records: parsed.records
    });
    runJob(job.id).catch(() => {});
    return { job_id: job.id, imported: parsed.records.length, warnings: parsed.warnings };
  },

  [MessageTypes.IMPORT_PAUSE]: async ({ job_id }) => setJobState(job_id, JobState.PAUSED),
  [MessageTypes.IMPORT_RESUME]: async ({ job_id }) => {
    const job = await setJobState(job_id, JobState.SELECTING);
    runJob(job_id).catch(() => {});
    return job;
  },
  [MessageTypes.IMPORT_CANCEL]: async ({ job_id }) => setJobState(job_id, JobState.CANCELLED),
  [MessageTypes.IMPORT_RETRY_FAILED]: async ({ job_id }) => {
    runJob(job_id).catch(() => {});
    return { job_id };
  },

  [MessageTypes.JOB_STATUS]: async ({ job_id }) => {
    const job = job_id ? await getJob(job_id) : await activeJob();
    return job ? publicJob(job) : null;
  },
  [MessageTypes.JOB_LIST]: async () => (await allJobs()).map(publicJob),

  [MessageTypes.EXPORT_RESULTS]: async ({ job_id }) => {
    const job = await getJob(job_id);
    if (!job || !job.export_contents) throw new Error('no exports available for job');
    await downloadExports(job, job.export_contents);
    return { downloaded: Object.keys(job.export_contents) };
  },

  [MessageTypes.CONTACTS_QUERY]: async ({ query }) => (query ? searchContacts(query) : allContacts()),
  [MessageTypes.LIST_CREATE]: async ({ name }) => createList(name),
  [MessageTypes.LIST_RENAME]: async ({ id, name }) => renameList(id, name),
  [MessageTypes.LIST_DELETE]: async ({ id }) => { await deleteList(id); return { deleted: id }; },
  [MessageTypes.SOURCE_SAVE]: async (payload) => { const s = await saveSource(payload); await syncAlarms(); return s; },
  [MessageTypes.SOURCE_LIST]: async () => allSources(),
  [MessageTypes.SOURCE_DELETE]: async ({ id }) => { await deleteSource(id); await syncAlarms(); return { deleted: id }; },

  [MessageTypes.SETTINGS_GET]: async () => getSettings(),
  [MessageTypes.SETTINGS_SET]: async (patch) => setSettings(patch),

  [MessageTypes.HEALTH_CHECK]: async () => {
    const out = { backend: false, deepseek: false };
    try { const h = await health(); out.backend = true; out.deepseek = !!h.deepseek_configured; out.search = !!h.search_configured; }
    catch { out.backend = false; }
    return out;
  },

  [MessageTypes.DELETE_ALL_DATA]: async () => {
    await clearAll();
    await recordDeletion('all_local_data');
    try { await deleteAllData(); } catch { /* backend may be offline */ }
    return { deleted: true };
  }
});

attachRouter();

// ---- helpers ----
function parseImport(filename, content, format) {
  const fmt = format || (filename && filename.endsWith('.json') ? 'json' : filename && filename.endsWith('.csv') ? 'csv' : 'urls');
  if (fmt === 'csv') {
    const rows = parseCsv(content);
    const records = [];
    const warnings = [];
    rows.forEach((raw, i) => {
      const { record, warnings: w } = normalizeRecord(raw, 'import_csv');
      if (!record.source_record_id) record.source_record_id = `import_csv-${i}`;
      records.push(record);
      warnings.push(...w);
    });
    return { kind: 'csv', records, warnings };
  }
  if (fmt === 'json') {
    const { records, warnings } = parseJsonImport(content, 'import_json');
    return { kind: 'json', records, warnings };
  }
  const { records, warnings } = parseUrlList(content, 'url_list');
  return { kind: 'urls', records, warnings };
}

async function setJobState(jobId, state) {
  const job = await getJob(jobId);
  if (!job) throw new Error('job not found');
  job.state = state;
  await saveJob(job);
  return publicJob(job);
}

function publicJob(job) {
  const { export_contents, records, ...rest } = job;
  return rest;
}
