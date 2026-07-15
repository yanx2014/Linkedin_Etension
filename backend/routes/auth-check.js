// GET /v1/auth/check — diagnostic endpoint that reports, without leaking any
// secret, four independent facts the UI needs to explain setup problems:
//   - backend reachable   (implicit: a 200 response proves it)
//   - token_required      (is an install token configured at all?)
//   - token_valid         (did THIS request present the right token?)
//   - deepseek_configured (is DEEPSEEK_API_KEY set?)
//   - search_configured   (is BRAVE_SEARCH_API_KEY set?)
//
// Unlike the enrichment routes this never returns 401 — it always answers 200
// so the client can distinguish "token wrong" from "backend down". It reveals
// only booleans, never the token or key values.

import { isDeepseekConfigured, isSearchConfigured, config } from '../config.js';
import { isAuthorized } from '../security/request-auth.js';

export function authCheckRoute(req) {
  const tokenRequired = !!config.installToken;
  return {
    ok: true,
    backend: true,
    token_required: tokenRequired,
    // When no token is configured the backend is open, so any request is valid.
    token_valid: tokenRequired ? isAuthorized(req) : true,
    deepseek_configured: isDeepseekConfigured(),
    search_configured: isSearchConfigured(),
    model: config.deepseekModel,
    reasoning_effort: config.deepseekReasoningEffort
  };
}
