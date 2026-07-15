// Pure import→select→enrich→export pipeline. Reused by the service-worker job
// orchestrator and exercised directly by integration tests. No Chrome or network
// dependency — enrichment is injected via `enrichProfile`.

import { selectProfiles } from '../selector/select.js';
import { computeScore } from '../selector/score.js';
import { evaluateMatch } from '../selector/match.js';
import { buildAvatar } from '../avatar/avatar.js';
import { exportProfilesCsv, exportRejectedCsv, CSV_COLUMNS } from '../utils/csv-exporter.js';
import { exportJson, buildJobSummary, hashExports } from '../utils/json-exporter.js';
import { isoNow } from '../utils/dates.js';

// enrichProfile(acceptedRecord) => Promise<{ collectedProfile, companyEvidence, llmOutput? }>
// When omitted, import-only mode uses the record itself with no company research.
export async function runImportPipeline({ records, criteria, seenKeys = [], enrichProfile = null, nowMs = Date.now(), job = {} } = {}) {
  const collectedAt = isoNow(nowMs);
  const selection = selectProfiles(records, criteria, { seenKeys, collectedAt });
  const auditByCanonical = indexAuditByCanonical(selection.audit);

  const enriched = [];
  const evidenceExport = [];

  for (const accepted of selection.accepted) {
    let collectedProfile = accepted;
    let companyEvidence = {};
    let llmOutput = null;
    let enrichmentStatus = 'complete';
    let enrichmentError = null;

    if (enrichProfile) {
      try {
        const res = await enrichProfile(accepted);
        if (res) {
          collectedProfile = res.collectedProfile || accepted;
          companyEvidence = res.companyEvidence || {};
          llmOutput = res.llmOutput || null;
          enrichmentStatus = res.status || 'complete';
          enrichmentError = res.enrichmentError || null;
        }
      } catch (err) {
        enrichmentStatus = 'failed';
        enrichmentError = err.message;
      }
    } else {
      enrichmentStatus = 'import_only';
    }

    const avatar = await buildAvatar({ collectedProfile, companyEvidence, llmOutput, nowMs });
    // Make the enrichment failure reason visible in the exports (profile_note),
    // so DeepSeek/backend errors are diagnosable instead of silent.
    if (enrichmentError) {
      avatar.profile_note = `${avatar.profile_note ? avatar.profile_note + ' ' : ''}[enrichment: ${enrichmentError}]`;
      avatar.warnings = [...(avatar.warnings || []), { field: 'enrichment', reason: enrichmentError }];
    }

    // Recompute score now that enrichment evidence is known.
    const md = evaluateMatch(accepted, criteria);
    const evidence = {
      hasPersonPosts: Array.isArray(collectedProfile.posts) && collectedProfile.posts.length > 0,
      hasConfirmedWebsite: !!avatar.model.company_website,
      hasCompanyProfile: Array.isArray(companyEvidence.profile_fields) && companyEvidence.profile_fields.length > 0
    };
    const scored = computeScore(accepted, criteria, md, evidence);

    const csvRecord = buildCsvRecord(accepted, collectedProfile, avatar, scored.score);
    enriched.push(csvRecord);

    // Update audit entry.
    const auditEntry = auditByCanonical.get(accepted.canonical_url);
    if (auditEntry) {
      auditEntry.enrichment_status = enrichmentStatus;
      auditEntry.collection_status = 'complete';
      auditEntry.score = scored.score;
      auditEntry.score_breakdown = scored.breakdown;
      auditEntry.confidence = avatar.confidence;
      if (avatar.warnings.length) {
        auditEntry.warnings = [...(auditEntry.warnings || []), ...avatar.warnings.map((w) => w.reason || w.field || 'warning')];
      }
    }

    evidenceExport.push({
      profile_url: accepted.canonical_url,
      confidence: avatar.confidence,
      coverage: avatar.coverage,
      model: { model: 'deepseek-v4-pro', reasoning_effort: 'max' },
      evidence_map: avatar.evidence_map,
      warnings: avatar.warnings,
      avatar_model: avatar.model
    });
  }

  const csv = exportProfilesCsv(enriched);
  const rejectedCsv = exportRejectedCsv(selection.rejected);
  const auditJson = exportJson(selection.audit);
  const evidenceJson = exportJson(evidenceExport);

  const exportHashes = await hashExports({
    'profiles_selected.csv': csv.content,
    'audit.json': auditJson,
    'avatar_evidence.json': evidenceJson
  });

  const summary = buildJobSummary({
    job: { ...job, completed_at: collectedAt, started_at: job.started_at || collectedAt },
    auditEntries: selection.audit,
    exportHashes,
    schemaVersions: { criteria: '1', collected_profile: '1', llm_avatar: '1', audit: '1' }
  });

  return {
    accepted: selection.accepted,
    rejected: selection.rejected,
    audit: selection.audit,
    enriched,
    escapedCsvCells: csv.escaped,
    exports: {
      'profiles_selected.csv': csv.content,
      'profiles_rejected.csv': rejectedCsv.content,
      'audit.json': auditJson,
      'avatar_evidence.json': evidenceJson,
      'job_summary.json': exportJson(summary)
    }
  };
}

function buildCsvRecord(accepted, collectedProfile, avatar, score) {
  const m = avatar.model;
  const record = {
    full_name: collectedProfile.full_name || accepted.full_name || '',
    headline: collectedProfile.headline || accepted.headline || '',
    company: m.current_company || collectedProfile.company || accepted.company || '',
    location: collectedProfile.location || accepted.location || '',
    profile_url: accepted.canonical_url || '',
    source_search: accepted.source_search || accepted.source_url || '',
    collected_at: collectedProfile.collected_at || accepted.collected_at || '',
    last_name: collectedProfile.last_name || accepted.last_name || '',
    first_name: collectedProfile.first_name || accepted.first_name || '',
    role: m.current_role || collectedProfile.role || accepted.role || '',
    email: collectedProfile.email || accepted.email || '',
    website: m.company_website || '',
    score,
    avatar_profile: avatar.avatar_markdown,
    profile_note: avatar.profile_note || ''
  };
  // Ensure only known columns are present.
  const clean = {};
  for (const col of CSV_COLUMNS) clean[col] = record[col];
  return clean;
}

function indexAuditByCanonical(audit) {
  const map = new Map();
  for (const entry of audit) {
    if (entry.decision === 'accepted' && entry.canonical_url) map.set(entry.canonical_url, entry);
  }
  return map;
}
