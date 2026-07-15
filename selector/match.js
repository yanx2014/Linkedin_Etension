// Matching logic: phrase-aware term matching and criteria evaluation.
//
// A term matches the preview when its normalized token sequence appears as a
// contiguous run within the preview's token sequence. Single-token terms match
// a single token exactly (so "ceo" never matches "ocean", "sales" never matches
// "wholesales"). Multi-token terms ("vp sales") match contiguous tokens.

import { tokenize } from './tokenize.js';

// The explicit preview fields, in order, used to build the preview corpus.
const PREVIEW_FIELDS = ['full_name', 'headline', 'current_company', 'location', 'preview_text'];

// Build the preview corpus string from a preview/profile record. Accepts
// `company` as an alias for `current_company`.
export function buildPreviewCorpus(record) {
  const parts = [];
  for (const field of PREVIEW_FIELDS) {
    let val = record[field];
    if (field === 'current_company' && (val == null || val === '')) val = record.company;
    if (val != null && val !== '') parts.push(String(val));
  }
  return parts.join(' \n ');
}

// Does the corpus token list contain the term as a contiguous token run?
export function matchTerm(corpusTokens, term) {
  const termTokens = tokenize(term);
  if (termTokens.length === 0) return false;
  if (termTokens.length === 1) return corpusTokens.includes(termTokens[0]);
  return containsSubsequence(corpusTokens, termTokens);
}

function containsSubsequence(haystack, needle) {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Return the first matching term from a list, or null.
export function firstMatchingTerm(corpusTokens, terms) {
  for (const term of terms) {
    if (matchTerm(corpusTokens, term)) return term;
  }
  return null;
}

// Evaluate a criteria object against a preview record. Returns structured match
// details plus a boolean `passed` reflecting group/term/exclusion logic ONLY
// (URL validity and profile cap are enforced by select.js).
export function evaluateMatch(record, criteria) {
  const corpusTokens = tokenize(buildPreviewCorpus(record));

  const matchedGroups = {};
  const missingGroups = [];
  for (const group of criteria.preview_required_groups || []) {
    const hit = firstMatchingTerm(corpusTokens, group.terms || []);
    if (hit) {
      matchedGroups[group.name] = [hit];
    } else {
      missingGroups.push(group.name);
    }
  }

  const matchedRequiredTerms = [];
  const missingRequiredTerms = [];
  for (const term of criteria.preview_required_terms || []) {
    if (matchTerm(corpusTokens, term)) matchedRequiredTerms.push(term);
    else missingRequiredTerms.push(term);
  }

  const matchedExcludedTerms = [];
  for (const term of criteria.preview_excluded_terms || []) {
    if (matchTerm(corpusTokens, term)) matchedExcludedTerms.push(term);
  }

  const passed =
    missingGroups.length === 0 &&
    missingRequiredTerms.length === 0 &&
    matchedExcludedTerms.length === 0;

  return {
    passed,
    corpusTokens,
    matchedGroups,
    missingGroups,
    matchedRequiredTerms,
    missingRequiredTerms,
    matchedExcludedTerms
  };
}
