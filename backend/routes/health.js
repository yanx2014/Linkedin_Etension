// GET /v1/health — liveness + capability flags (no secrets returned).

import { isDeepseekConfigured, isSearchConfigured, config } from '../config.js';

export function healthRoute() {
  return {
    status: 'ok',
    deepseek_configured: isDeepseekConfigured(),
    search_configured: isSearchConfigured(),
    model: config.deepseekModel,
    reasoning_effort: config.deepseekReasoningEffort,
    time: new Date().toISOString()
  };
}
