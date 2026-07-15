// Enrichment cache backed by the JSON store. Keyed by bundle hash + prompt
// version + model + reasoning effort so a changed prompt/model misses the cache.

import { getStore } from '../db/database.js';
import { bundleCacheKey } from './cache-key.js';

export function getCached(sourceBundle) {
  const key = bundleCacheKey(sourceBundle);
  const hit = getStore().getEnrichment(key);
  return hit ? hit.value : null;
}

export function setCached(sourceBundle, value) {
  const key = bundleCacheKey(sourceBundle);
  getStore().setEnrichment(key, { value });
  return key;
}
