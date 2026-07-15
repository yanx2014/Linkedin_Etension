// Deterministic grounding validation. Given an LLM (or deterministic) structured
// output and the EvidenceMap, verify that every factual value is supported by
// its cited sources. Unsupported items are moved to warnings and never replaced.
//
// A second LLM is never used; support is checked with normalized lexical
// overlap plus strict rules for numbers, dates, and URLs.

import { normalizeText } from '../selector/normalize.js';
import { tokenize } from '../selector/tokenize.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'is', 'are', 'was', 'were', 'be', 'our', 'we', 'us', 'their', 'this',
  'that', 'as', 'from', 'it', 'its', 'i', 'my', 'your', 'you', 'they', 'he',
  'she', 'his', 'her', 'has', 'have', 'had', 'will', 'would', 'may', 'might',
  'could', 'about', 'across', 'into', 'over', 'per'
]);

const NUMBER_RE = /^\d[\d.,%+/-]*$/;

// Check whether a single claim value is supported by referenced source text.
export function isValueSupported(value, sourceText) {
  const claim = normalizeText(value);
  if (claim === '') return true; // empty claims are placeholders, not facts
  const src = normalizeText(sourceText);
  if (src === '') return false;

  // Fast path: exact normalized substring.
  if (src.includes(claim)) return true;

  const claimTokens = tokenize(value);
  if (claimTokens.length === 0) return true;
  const srcTokens = new Set(tokenize(sourceText));

  for (const tok of claimTokens) {
    // Numbers/dates must appear verbatim in the source.
    if (NUMBER_RE.test(tok)) {
      if (!srcTokens.has(tok)) return false;
      continue;
    }
    if (STOPWORDS.has(tok)) continue;
    if (!srcTokens.has(tok)) return false;
  }
  return true;
}

// Validate a { value, source_ids } item. Returns { ok, reason }.
export function validateItem(item, evidence) {
  if (!item || item.value == null || item.value === '') return { ok: false, reason: 'empty' };
  const ids = Array.isArray(item.source_ids) ? item.source_ids : [];
  if (ids.length === 0) return { ok: false, reason: 'no_source_ids' };
  for (const id of ids) {
    if (!evidence.has(id)) return { ok: false, reason: `unknown_source_id:${id}` };
  }
  const sourceText = evidence.normalizedTextFor(ids);
  if (!isValueSupported(item.value, sourceText)) return { ok: false, reason: 'unsupported_claim' };
  return { ok: true, reason: 'supported' };
}

// Validate a full structured object. Returns { validated, warnings }.
// Only factual sections are validated; hypothesis sections are handled
// separately (deterministic templates) and are not part of this input.
export function validateGrounding(structured, evidence) {
  const warnings = [];
  const validated = JSON.parse(JSON.stringify(structured || {}));

  const validateField = (obj, key, label) => {
    const field = obj[key];
    if (!field || field.value == null || field.value === '') return;
    const res = validateItem(field, evidence);
    if (!res.ok) {
      warnings.push({ field: label, value: field.value, reason: res.reason });
      obj[key] = { value: null, source_ids: [] };
    }
  };

  const validateArray = (obj, key, label) => {
    if (!Array.isArray(obj[key])) { obj[key] = []; return; }
    const kept = [];
    for (const item of obj[key]) {
      const res = validateItem(item, evidence);
      if (res.ok) kept.push(item);
      else warnings.push({ field: label, value: item?.value, reason: res.reason });
    }
    obj[key] = kept;
  };

  if (validated.person) {
    validateField(validated.person, 'real_professional_name', 'person.real_professional_name');
    validateField(validated.person, 'current_role', 'person.current_role');
    validateField(validated.person, 'current_company', 'person.current_company');
    // professional_experience is validated separately (derived deterministically).
    validateArray(validated.person, 'verified_responsibilities', 'person.verified_responsibilities');
    validateArray(validated.person, 'verified_professional_interests', 'person.verified_professional_interests');
    validateArray(validated.person, 'observed_prospect_facts', 'person.observed_prospect_facts');
  }
  if (validated.company) {
    validateArray(validated.company, 'company_context', 'company.company_context');
    validateArray(validated.company, 'verified_company_priorities', 'company.verified_company_priorities');
    validateArray(validated.company, 'observed_company_facts', 'company.observed_company_facts');
  }

  return { validated, warnings };
}
