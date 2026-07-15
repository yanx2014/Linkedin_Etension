// Selection stage: run each preview row through normalization, matching,
// canonicalization, deduplication, cap enforcement, scoring, and audit. Pure and
// deterministic — no network, Chrome, or backend dependencies.

import { canonicalizeProfileUrl, classifySourceUrl } from './canonicalize.js';
import { evaluateMatch } from './match.js';
import { computeScore } from './score.js';
import { Deduper } from './dedupe.js';
import { buildAuditEntry, canonReasonToCode, ReasonCodes } from './audit.js';

// selectProfiles(rows, criteria, options)
//   rows: array of preview/profile records (canonical input schema-ish)
//   criteria: validated criteria object
//   options: { seenKeys, allowedHosts, nowMs, collectedAt, evidenceFor }
// Returns { accepted, rejected, audit, deduper }.
export function selectProfiles(rows, criteria, options = {}) {
  const allowedHosts = criteria.allowed_profile_hosts || options.allowedHosts || ['linkedin.com', 'www.linkedin.com'];
  const maxProfiles = clampInt(criteria.max_profiles, 1, 999, 500);
  const deduper = new Deduper(options.seenKeys || []);
  const evidenceFor = typeof options.evidenceFor === 'function' ? options.evidenceFor : defaultEvidence;

  const accepted = [];
  const rejected = [];
  const audit = [];
  const state = { acceptedCount: 0 };

  rows.forEach((rawRow, inputIndex) => {
    const outcome = processRow(rawRow, inputIndex, {
      criteria, allowedHosts, maxProfiles, deduper, evidenceFor, state, collectedAt: options.collectedAt
    });
    audit.push(outcome.audit);
    if (outcome.decision === 'accepted') accepted.push(outcome.record);
    else rejected.push({ ...outcome.record, __reason: outcome.code });
  });

  return { accepted, rejected, audit, deduper };
}

function processRow(rawRow, inputIndex, ctx) {
  const { criteria, allowedHosts, maxProfiles, deduper, evidenceFor, state, collectedAt } = ctx;
  const row = { ...rawRow };
  const originalUrl = row.profile_url || row.source_url || row.url || null;
  const sourceType = row.source_type || null;
  const sourceUrl = row.source_search || row.source_url || null;
  const warnings = [];
  let canonicalUrl = null;

  const matchDetails = evaluateMatch(row, criteria);

  const reject = (code, reasons, opts = {}) => ({
    decision: 'rejected',
    code,
    record: row,
    audit: buildAuditEntry({
      inputIndex, sourceType, sourceUrl, originalUrl, canonicalUrl,
      decision: 'rejected',
      reasons: [code, ...reasons],
      matchDetails, score: 0, scoreBreakdown: [],
      duplicateOf: opts.duplicateOf ?? null,
      collectionStatus: 'skipped', enrichmentStatus: 'skipped',
      warnings: opts.warnings || warnings,
      collectedAt
    })
  });

  // 1. Exclusions take precedence.
  if (matchDetails.matchedExcludedTerms.length > 0) {
    return reject(ReasonCodes.EXCLUDED_TERM, ['excluded term matched']);
  }
  // 2. Required groups.
  if (matchDetails.missingGroups.length > 0) {
    return reject(ReasonCodes.MISSING_REQUIRED_GROUP, matchDetails.missingGroups.map((g) => `missing group: ${g}`));
  }
  // 3. Required terms.
  if (matchDetails.missingRequiredTerms.length > 0) {
    return reject(ReasonCodes.MISSING_REQUIRED_TERM, matchDetails.missingRequiredTerms.map((t) => `missing term: ${t}`));
  }

  // 4. URL canonicalization.
  const preCanon = row.canonical_url ? canonicalizeProfileUrl(row.canonical_url, allowedHosts) : null;
  if (preCanon && preCanon.ok) {
    canonicalUrl = preCanon.canonical;
  } else {
    const canon = canonicalizeProfileUrl(originalUrl, allowedHosts);
    if (canon.ok) {
      canonicalUrl = canon.canonical;
    } else {
      const cls = classifySourceUrl(originalUrl || '');
      if (cls.kind === 'source_specific' && row.source_record_id) {
        warnings.push(ReasonCodes.MISSING_CANONICAL_PROFILE_URL);
      } else {
        return reject(canonReasonToCode(canon.reason), [`url ${canon.reason}`]);
      }
    }
  }
  row.canonical_url = canonicalUrl;

  // 5. Deduplication (before cap so duplicates don't consume the cap).
  const dedupe = deduper.consider(row);
  if (dedupe.isDuplicate) {
    return reject(
      ReasonCodes.DUPLICATE_PROFILE,
      [dedupe.crossJob ? 'duplicate across jobs/sources' : 'duplicate within job'],
      { duplicateOf: dedupe.duplicateOf, warnings: [...warnings, ...dedupe.warnings] }
    );
  }

  // 6. Profile cap.
  if (state.acceptedCount >= maxProfiles) {
    return reject(ReasonCodes.PROFILE_CAP_REACHED, [`max_profiles ${maxProfiles} reached`]);
  }

  // 7. Accept.
  deduper.register(row, inputIndex);
  state.acceptedCount += 1;
  const evidence = evidenceFor(row);
  const { score, breakdown } = computeScore(row, criteria, matchDetails, evidence);
  row.score = score;
  row.score_breakdown = breakdown;

  return {
    decision: 'accepted',
    code: ReasonCodes.ACCEPTED,
    record: row,
    audit: buildAuditEntry({
      inputIndex, sourceType, sourceUrl, originalUrl, canonicalUrl,
      decision: 'accepted',
      reasons: [ReasonCodes.ACCEPTED],
      matchDetails, score, scoreBreakdown: breakdown,
      collectionStatus: 'pending', enrichmentStatus: 'pending',
      warnings, collectedAt
    })
  };
}

function defaultEvidence(row) {
  return {
    hasPersonPosts: Array.isArray(row.posts) && row.posts.length > 0,
    hasConfirmedWebsite: false,
    hasCompanyProfile: false
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
