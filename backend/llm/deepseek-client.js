// DeepSeek API client. Sends the exact model configuration, enforces a 90s
// timeout, retries transient failures, and repairs malformed JSON once. The API
// key never leaves the backend. `fetchImpl`/`baseUrl` are injectable for tests.

import { config } from '../config.js';
import { buildDeepseekRequest } from './avatar-request.js';
import { parseModelJson } from './response-validator.js';
import { RetryConfig, isTransient, backoffDelay } from './retry-policy.js';

export class DeepseekClient {
  constructor({ apiKey = config.deepseekApiKey, baseUrl = config.deepseekBaseUrl, fetchImpl = fetch } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  isConfigured() { return !!this.apiKey; }

  // Returns the parsed JSON object (raw model output). Throws on unrecoverable
  // error. `sourceBundle` is the object from buildSourceBundle.
  async structure(sourceBundle) {
    if (!this.apiKey) throw new Error('DEEPSEEK_API_KEY not configured');
    const body = buildDeepseekRequest(sourceBundle);

    let lastErr = null;
    for (let attempt = 0; attempt <= RetryConfig.maxTransientRetries; attempt++) {
      try {
        const raw = await this.call(body);
        const parsed = parseModelJson(raw);
        if (parsed.ok) return parsed.value;
        // Malformed JSON: attempt one repair pass with the same evidence.
        const repaired = await this.repair(body, raw);
        const parsedRepair = parseModelJson(repaired);
        if (parsedRepair.ok) return parsedRepair.value;
        const err = new Error('deepseek returned malformed JSON');
        err.code = 'LLM_INVALID_JSON';
        throw err;
      } catch (err) {
        lastErr = err;
        if (err.code === 'LLM_INVALID_JSON' || err.contentFilter) throw err;
        if (!isTransient(err) || attempt === RetryConfig.maxTransientRetries) throw err;
        // eslint-disable-next-line no-await-in-loop
        await sleep(await backoffDelay(attempt));
      }
    }
    throw lastErr || new Error('deepseek failed');
  }

  async call(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RetryConfig.timeoutMs);
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body)
      });
    } catch (err) {
      // AbortError => our timeout fired. Mark it transient so structure() retries.
      if (err && (err.name === 'AbortError' || controller.signal.aborted)) {
        const e = new Error(`deepseek request timed out after ${Math.round(RetryConfig.timeoutMs / 1000)}s`);
        e.code = 'LLM_TIMEOUT';
        e.transient = true;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      // Read the upstream body for a human-readable reason (no secrets here).
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw classifyUpstream(res.status, detail);
    }
    let data;
    try {
      data = await res.json();
    } catch {
      const err = new Error('deepseek returned a non-JSON response body');
      err.code = 'LLM_INVALID_JSON';
      throw err;
    }
    const choice = data.choices && data.choices[0];
    if (choice && choice.finish_reason === 'content_filter') {
      const err = new Error('deepseek response was content-filtered');
      err.contentFilter = true;
      err.code = 'LLM_CONTENT_FILTER';
      throw err;
    }
    return choice && choice.message ? choice.message.content : '';
  }

  async repair(originalBody, badOutput) {
    // Single-turn repair: do NOT append an assistant turn. In thinking mode,
    // DeepSeek requires reasoning_content to be passed back on assistant turns,
    // and omitting it triggers a 400. Instead, embed the bad output in a fresh
    // user message so the request stays a valid single reasoning turn.
    const repairBody = {
      ...originalBody,
      messages: [
        originalBody.messages[0], // system
        {
          role: 'user',
          content:
            `${originalBody.messages[1].content}\n\n` +
            'Your previous attempt was not valid JSON. Return ONLY a single valid JSON object matching the schema, with no prose, no code fences, and no invented values. Previous attempt was:\n' +
            String(badOutput).slice(0, 3000)
        }
      ]
    };
    return this.call(repairBody);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Map a DeepSeek HTTP status to a descriptive, classified error. Codes let the
// caller distinguish a bad key (permanent) from rate-limiting/server errors
// (transient, retried by structure() via isTransient).
export function classifyUpstream(status, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  let code;
  let message;
  switch (status) {
    case 400: code = 'LLM_BAD_REQUEST'; message = 'deepseek rejected the request (400 invalid parameters)'; break;
    case 401: code = 'LLM_UNAUTHORIZED'; message = 'deepseek API key is invalid or revoked (401)'; break;
    case 402: code = 'LLM_PAYMENT_REQUIRED'; message = 'deepseek account has insufficient balance (402)'; break;
    case 403: code = 'LLM_FORBIDDEN'; message = 'deepseek denied access (403)'; break;
    case 422: code = 'LLM_UNPROCESSABLE'; message = 'deepseek could not process the request (422)'; break;
    case 429: code = 'LLM_RATE_LIMITED'; message = 'deepseek rate limit reached (429)'; break;
    default:
      if (status >= 500) { code = 'LLM_SERVER_ERROR'; message = `deepseek server error (${status})`; }
      else { code = 'LLM_HTTP_ERROR'; message = `deepseek request failed (${status})`; }
  }
  const err = new Error(message + suffix);
  err.status = status;
  err.code = code;
  // 429 and 5xx are worth retrying; 4xx client errors are not.
  err.transient = status === 429 || status >= 500;
  return err;
}
