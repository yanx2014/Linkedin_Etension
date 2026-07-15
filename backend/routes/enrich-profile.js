// POST /v1/enrich/profile — company research + optional DeepSeek structuring for
// one collected profile. Returns companyEvidence and the raw (grounding-checked)
// LLM output; the extension renders and re-grounds the avatar client-side.

import { researchCompany } from '../website/research.js';
import { buildSourceBundle } from '../../avatar/source-bundle.js';
import { DeepseekClient } from '../llm/deepseek-client.js';
import { validateResponse } from '../llm/response-validator.js';
import { getCached, setCached } from '../cache/enrichment-cache.js';
import { BraveSearchProvider } from '../search/brave-search-provider.js';
import { isDeepseekConfigured, isSearchConfigured, config } from '../config.js';
import { PROMPT_VERSION } from '../llm/avatar-system-prompt.js';

// deps allows tests to inject searchProvider / safeFetch / deepseek.
export async function enrichProfileRoute(payload, deps = {}) {
  const profile = payload && payload.profile;
  if (!profile || typeof profile !== 'object') {
    const err = new Error('profile required');
    err.statusCode = 400;
    throw err;
  }
  const useDeepseek = payload.options?.use_deepseek !== false;

  // 1. Company research (website-first).
  const searchProvider = deps.searchProvider || (isSearchConfigured() ? new BraveSearchProvider() : null);
  const companyEvidence = await researchCompany(profile, { searchProvider, safeFetch: deps.safeFetch });

  // 2. DeepSeek structuring (optional).
  let avatar = null;
  let status = 'complete';
  let enrichmentError = null;
  const warnings = [];

  if (useDeepseek && (deps.deepseek || isDeepseekConfigured())) {
    const client = deps.deepseek || new DeepseekClient();
    const { bundle, evidence } = await buildSourceBundle(profile, companyEvidence);
    const cached = getCached(bundle);
    if (cached) {
      avatar = cached;
    } else {
      try {
        const raw = await client.structure(bundle);
        const validation = validateResponse(raw, evidence);
        if (validation.valid) {
          avatar = raw; // client re-grounds; we return the raw structured output
          warnings.push(...validation.warnings);
          setCached(bundle, raw);
        } else {
          status = 'llm_invalid_json';
          warnings.push(...validation.errors.map((e) => ({ reason: e })));
          enrichmentError = { phase: 'deepseek', code: 'LLM_SCHEMA_INVALID', status: null, message: validation.errors[0] || 'schema validation failed' };
        }
      } catch (err) {
        status = err.code === 'LLM_INVALID_JSON' ? 'llm_invalid_json' : 'llm_unavailable';
        // Structured error so the extension can surface a precise reason
        // (401 bad key, 402 balance, 429 rate limit, timeout, content filter…).
        enrichmentError = { phase: 'deepseek', code: err.code || 'LLM_ERROR', status: err.status || null, message: err.message };
        warnings.push({ reason: err.message, code: err.code || 'LLM_ERROR' });
      }
    }
  } else {
    status = 'deterministic';
  }

  return {
    companyEvidence,
    avatar,
    status,
    enrichmentError,
    warnings,
    prompt_version: PROMPT_VERSION,
    model: config.deepseekModel
  };
}
