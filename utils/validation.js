// Criteria validation. Returns { valid, errors, warnings, normalized }.
// Errors block a job from starting; warnings do not.

import { normalizeTerm } from '../selector/normalize.js';

const KNOWN_TOP_LEVEL = new Set([
  'search_keywords', 'preview_required_groups', 'preview_required_terms',
  'preview_excluded_terms', 'max_profiles', 'allowed_profile_hosts',
  'collection', 'enrichment', 'automation', 'matching'
]);

const DEFAULT_CRITERIA = Object.freeze({
  search_keywords: '',
  preview_required_groups: [],
  preview_required_terms: [],
  preview_excluded_terms: [],
  max_profiles: 500,
  allowed_profile_hosts: ['linkedin.com', 'www.linkedin.com'],
  collection: {
    collect_profile_details: true,
    collect_person_posts: true,
    max_person_posts: 7,
    collect_company_profile: true,
    collect_company_posts: true,
    max_company_posts: 7
  },
  enrichment: {
    company_website_first: true,
    use_company_profile_fallback: true,
    use_deepseek: true,
    auto_enrich: true
  },
  automation: {
    auto_export: true,
    schedule: 'disabled'
  }
});

export function defaultCriteria() {
  return structuredCloneSafe(DEFAULT_CRITERIA);
}

export function validateCriteria(input) {
  const errors = [];
  const warnings = [];

  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['criteria must be an object'], warnings, normalized: null };
  }

  // Unknown top-level fields -> warnings.
  for (const key of Object.keys(input)) {
    if (!KNOWN_TOP_LEVEL.has(key)) warnings.push(`unknown criteria field: ${key}`);
  }

  const normalized = defaultCriteria();

  // search_keywords
  if (input.search_keywords != null) {
    if (typeof input.search_keywords !== 'string') errors.push('search_keywords must be a string');
    else normalized.search_keywords = input.search_keywords;
  }

  // preview_required_groups
  if (input.preview_required_groups != null) {
    if (!Array.isArray(input.preview_required_groups)) {
      errors.push('preview_required_groups must be an array');
    } else {
      const seenNames = new Set();
      const groups = [];
      input.preview_required_groups.forEach((g, i) => {
        if (g == null || typeof g !== 'object') { errors.push(`group[${i}] must be an object`); return; }
        if (typeof g.name !== 'string' || g.name.trim() === '') { errors.push(`group[${i}].name must be a non-empty string`); return; }
        if (seenNames.has(g.name)) { errors.push(`duplicate group name: ${g.name}`); return; }
        seenNames.add(g.name);
        if (!Array.isArray(g.terms)) { errors.push(`group[${i}].terms must be an array`); return; }
        const terms = cleanTerms(g.terms, `group "${g.name}"`, warnings);
        if (terms.length === 0) warnings.push(`group "${g.name}" has no usable terms`);
        groups.push({ name: g.name, terms });
      });
      normalized.preview_required_groups = groups;
    }
  }

  // preview_required_terms / preview_excluded_terms
  normalized.preview_required_terms = validateTermArray(input.preview_required_terms, 'preview_required_terms', errors, warnings);
  normalized.preview_excluded_terms = validateTermArray(input.preview_excluded_terms, 'preview_excluded_terms', errors, warnings);

  // max_profiles
  if (input.max_profiles != null) {
    const n = Number(input.max_profiles);
    if (!Number.isInteger(n) || n < 1 || n > 999) errors.push('max_profiles must be an integer from 1 to 999');
    else normalized.max_profiles = n;
  }

  // allowed_profile_hosts
  if (input.allowed_profile_hosts != null) {
    if (!Array.isArray(input.allowed_profile_hosts) || !input.allowed_profile_hosts.every((h) => typeof h === 'string' && h.trim())) {
      errors.push('allowed_profile_hosts must be an array of hostname strings');
    } else {
      normalized.allowed_profile_hosts = input.allowed_profile_hosts.map((h) => h.trim().toLowerCase());
    }
  }

  // collection post limits (0-7)
  if (input.collection != null) {
    if (typeof input.collection !== 'object') errors.push('collection must be an object');
    else {
      Object.assign(normalized.collection, pickBooleans(input.collection, [
        'collect_profile_details', 'collect_person_posts', 'collect_company_profile', 'collect_company_posts'
      ]));
      normalized.collection.max_person_posts = validatePostLimit(input.collection.max_person_posts, 'max_person_posts', errors, 7);
      normalized.collection.max_company_posts = validatePostLimit(input.collection.max_company_posts, 'max_company_posts', errors, 7);
    }
  }

  // enrichment / automation booleans
  if (input.enrichment != null && typeof input.enrichment === 'object') {
    Object.assign(normalized.enrichment, pickBooleans(input.enrichment, [
      'company_website_first', 'use_company_profile_fallback', 'use_deepseek', 'auto_enrich'
    ]));
  }
  if (input.automation != null && typeof input.automation === 'object') {
    Object.assign(normalized.automation, pickBooleans(input.automation, ['auto_export']));
    if (input.automation.schedule != null) {
      const sched = String(input.automation.schedule);
      if (!['disabled', 'daily', 'weekly', 'monthly'].includes(sched)) {
        errors.push('automation.schedule must be one of disabled, daily, weekly, monthly');
      } else {
        normalized.automation.schedule = sched;
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, normalized };
}

function cleanTerms(terms, label, warnings) {
  const out = [];
  for (const t of terms) {
    if (typeof t !== 'string') { warnings.push(`${label}: non-string term ignored`); continue; }
    if (normalizeTerm(t) === '') { warnings.push(`${label}: empty-after-normalization term ignored`); continue; }
    out.push(t);
  }
  return out;
}

function validateTermArray(value, label, errors, warnings) {
  if (value == null) return [];
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return []; }
  return cleanTerms(value, label, warnings);
}

function validatePostLimit(value, label, errors, fallback) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 7) { errors.push(`${label} must be an integer from 0 to 7`); return fallback; }
  return n;
}

function pickBooleans(obj, keys) {
  const out = {};
  for (const k of keys) if (typeof obj[k] === 'boolean') out[k] = obj[k];
  return out;
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
