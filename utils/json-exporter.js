// JSON export helpers for audit.json and job_summary.json. Stable key ordering
// is not required by consumers, but we pretty-print for human inspection.

import { sha256Hex } from './hash.js';

export function exportJson(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

// Build the job_summary.json payload.
export function buildJobSummary({
  job,
  auditEntries,
  exportHashes = {},
  schemaVersions = {},
  // Not hardcoded — supplied by the caller from the model the backend actually
  // used (null when no LLM enrichment ran, e.g. import-only jobs).
  model = { model: null, reasoning_effort: 'max' }
}) {
  const byDecision = tally(auditEntries, (e) => e.decision);
  const bySource = tally(auditEntries, (e) => e.source_type || 'unknown');
  const byEnrichment = tally(auditEntries, (e) => e.enrichment_status || 'unknown');
  const failures = auditEntries.filter((e) => (e.reasons || []).some((r) => r.startsWith('llm_') || r === 'failed'));
  const blocked = auditEntries.filter((e) => (e.reasons || []).includes('blocked_checkpoint'));

  return {
    job_id: job.id,
    source_type: job.source_type || null,
    source_url: job.source_url || null,
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
    counts: {
      total_inputs: auditEntries.length,
      by_decision: byDecision,
      by_source: bySource,
      by_enrichment_status: byEnrichment
    },
    failures: failures.map((e) => ({ input_index: e.input_index, reasons: e.reasons })),
    blocked_states: blocked.map((e) => ({ input_index: e.input_index })),
    selector_version: job.selector_version || '1',
    schema_versions: schemaVersions,
    prompt_version: job.prompt_version || '1',
    model,
    export_hashes: exportHashes
  };
}

// Compute export content hashes (async).
export async function hashExports(files) {
  const out = {};
  for (const [name, content] of Object.entries(files)) {
    out[name] = await sha256Hex(content);
  }
  return out;
}

function tally(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}
