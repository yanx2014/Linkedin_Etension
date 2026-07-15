// POST /v1/enrich/batch — enrich several profiles sequentially (bounded). Each
// profile is independent; one failure does not fail the batch.

import { enrichProfileRoute } from './enrich-profile.js';

const MAX_BATCH = 25;

export async function enrichBatchRoute(payload, deps = {}) {
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles.slice(0, MAX_BATCH) : [];
  const results = [];
  for (const profile of profiles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await enrichProfileRoute({ profile, options: payload.options }, deps);
      results.push({ ok: true, ...res });
    } catch (err) {
      results.push({ ok: false, status: 'failed', error: err.message });
    }
  }
  return { count: results.length, results };
}

export { MAX_BATCH };
