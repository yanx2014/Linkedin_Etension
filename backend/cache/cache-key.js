// Cache key derivation for enrichment results: source-bundle hash + prompt
// version + model + reasoning effort.

import { sha256HexSync } from '../security/redaction.js';
import { config } from '../config.js';
import { PROMPT_VERSION } from '../llm/avatar-system-prompt.js';

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}
function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortValue(v[k]);
    return o;
  }
  return v;
}

export function bundleCacheKey(sourceBundle) {
  const h = sha256HexSync(canonicalJson(sourceBundle));
  return [h, PROMPT_VERSION, config.deepseekModel, config.deepseekReasoningEffort].join('|');
}
