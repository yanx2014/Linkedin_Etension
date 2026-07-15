import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeepseekClient, classifyUpstream } from '../../backend/llm/deepseek-client.js';
import { isTransient } from '../../backend/llm/retry-policy.js';

test('classifyUpstream maps DeepSeek HTTP statuses to codes', () => {
  assert.equal(classifyUpstream(401).code, 'LLM_UNAUTHORIZED');
  assert.equal(classifyUpstream(402).code, 'LLM_PAYMENT_REQUIRED');
  assert.equal(classifyUpstream(429).code, 'LLM_RATE_LIMITED');
  assert.equal(classifyUpstream(500).code, 'LLM_SERVER_ERROR');
  assert.equal(classifyUpstream(503).code, 'LLM_SERVER_ERROR');
  assert.equal(classifyUpstream(400).code, 'LLM_BAD_REQUEST');
});

test('classifyUpstream marks 429/5xx transient and 4xx permanent', () => {
  assert.equal(isTransient(classifyUpstream(429)), true);
  assert.equal(isTransient(classifyUpstream(503)), true);
  assert.equal(isTransient(classifyUpstream(401)), false);
  assert.equal(isTransient(classifyUpstream(402)), false);
});

test('classifyUpstream includes an upstream detail snippet', () => {
  const e = classifyUpstream(401, 'Authentication Fails');
  assert.match(e.message, /401/);
  assert.match(e.message, /Authentication Fails/);
});

test('client surfaces a classified 401 as LLM_UNAUTHORIZED (no retry)', async () => {
  let calls = 0;
  const client = new DeepseekClient({
    apiKey: 'x', baseUrl: 'https://api.example',
    fetchImpl: async () => { calls += 1; return { ok: false, status: 401, text: async () => 'bad key' }; }
  });
  await assert.rejects(() => client.structure({ messages: [{ content: 's' }, { content: 'u' }] }), (err) => {
    assert.equal(err.code, 'LLM_UNAUTHORIZED');
    assert.equal(err.status, 401);
    return true;
  });
  assert.equal(calls, 1, '401 must not be retried');
});

test('client classifies a non-JSON 200 body as LLM_INVALID_JSON', async () => {
  const client = new DeepseekClient({
    apiKey: 'x', baseUrl: 'https://api.example',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } })
  });
  await assert.rejects(() => client.structure({ messages: [{ content: 's' }, { content: 'u' }] }), (err) => {
    assert.equal(err.code, 'LLM_INVALID_JSON');
    return true;
  });
});
