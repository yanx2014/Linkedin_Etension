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
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const err = new Error(`deepseek ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    if (choice && choice.finish_reason === 'content_filter') {
      const err = new Error('content filtered');
      err.contentFilter = true;
      throw err;
    }
    return choice && choice.message ? choice.message.content : '';
  }

  async repair(originalBody, badOutput) {
    const repairBody = {
      ...originalBody,
      messages: [
        ...originalBody.messages,
        { role: 'assistant', content: String(badOutput).slice(0, 4000) },
        { role: 'user', content: 'Your previous message was not valid JSON. Return only valid JSON matching the schema, with no prose. Do not invent any values.' }
      ]
    };
    return this.call(repairBody);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
