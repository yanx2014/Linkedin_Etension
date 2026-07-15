// Audit record construction. Every input row produces exactly one audit entry,
// including rejected rows. Reason codes are stable strings.

import { isoNow } from '../utils/dates.js';

export const ReasonCodes = Object.freeze({
  ACCEPTED: 'accepted',
  MISSING_REQUIRED_GROUP: 'missing_required_group',
  MISSING_REQUIRED_TERM: 'missing_required_term',
  EXCLUDED_TERM: 'excluded_term',
  MISSING_PROFILE_URL: 'missing_profile_url',
  INVALID_PROFILE_URL: 'invalid_profile_url',
  UNSUPPORTED_PROFILE_URL: 'unsupported_profile_url',
  DUPLICATE_PROFILE: 'duplicate_profile',
  PROFILE_CAP_REACHED: 'profile_cap_reached',
  PROFILE_PAGE_UNAVAILABLE: 'profile_page_unavailable',
  PROFILE_RESTRICTED: 'profile_restricted',
  ACTIVITY_UNAVAILABLE: 'activity_unavailable',
  COMPANY_NOT_DETERMINABLE: 'company_not_determinable',
  COMPANY_WEBSITE_UNCONFIRMED: 'company_website_unconfirmed',
  COMPANY_PROFILE_UNAVAILABLE: 'company_profile_unavailable',
  BLOCKED_CHECKPOINT: 'blocked_checkpoint',
  LLM_UNAVAILABLE: 'llm_unavailable',
  LLM_INVALID_JSON: 'llm_invalid_json',
  LLM_UNSUPPORTED_FACT: 'llm_unsupported_fact',
  PARTIAL_ENRICHMENT: 'partial_enrichment',
  MISSING_CANONICAL_PROFILE_URL: 'missing_canonical_profile_url'
});

export const SELECTOR_VERSION = '1';
export const PROMPT_VERSION = '1';
export const MODEL_ID = 'deepseek-chat';

// Map a canonicalization reason to an audit reason code.
export function canonReasonToCode(reason) {
  switch (reason) {
    case 'missing_profile_url': return ReasonCodes.MISSING_PROFILE_URL;
    case 'invalid_profile_url': return ReasonCodes.INVALID_PROFILE_URL;
    case 'disallowed_host': return ReasonCodes.UNSUPPORTED_PROFILE_URL;
    case 'unsupported_profile_path': return ReasonCodes.UNSUPPORTED_PROFILE_URL;
    default: return ReasonCodes.INVALID_PROFILE_URL;
  }
}

// Build a fully-formed audit entry. `partial` overrides are merged last.
export function buildAuditEntry({
  inputIndex,
  sourceType = null,
  sourceUrl = null,
  originalUrl = null,
  canonicalUrl = null,
  decision,
  reasons = [],
  matchDetails = {},
  score = 0,
  scoreBreakdown = [],
  duplicateOf = null,
  collectionStatus = 'pending',
  enrichmentStatus = 'pending',
  warnings = [],
  collectedAt = null,
  extra = {}
} = {}) {
  return {
    input_index: inputIndex,
    source_type: sourceType,
    source_url: sourceUrl,
    original_url: originalUrl,
    canonical_url: canonicalUrl,
    decision,
    reasons,
    matched_groups: matchDetails.matchedGroups || {},
    matched_required_terms: matchDetails.matchedRequiredTerms || [],
    matched_excluded_terms: matchDetails.matchedExcludedTerms || [],
    score,
    score_breakdown: scoreBreakdown,
    duplicate_of: duplicateOf,
    collection_status: collectionStatus,
    enrichment_status: enrichmentStatus,
    warnings,
    collected_at: collectedAt || isoNow(),
    selector_version: SELECTOR_VERSION,
    prompt_version: PROMPT_VERSION,
    model: MODEL_ID,
    ...extra
  };
}
