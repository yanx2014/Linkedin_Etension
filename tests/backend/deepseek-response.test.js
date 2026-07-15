import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseModelJson, validateStructure, validateResponse } from '../../backend/llm/response-validator.js';
import { buildSourceBundle } from '../../avatar/source-bundle.js';
import { buildDeepseekRequest } from '../../backend/llm/avatar-request.js';

const here = dirname(fileURLToPath(import.meta.url));
const validResponse = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'deepseek-valid-response.json'), 'utf8'));

test('parseModelJson handles strings and objects', () => {
  assert.equal(parseModelJson('{"a":1}').ok, true);
  assert.equal(parseModelJson('not json').ok, false);
  assert.equal(parseModelJson({ a: 1 }).ok, true);
});

test('validateStructure accepts the valid fixture and rejects malformed', () => {
  assert.equal(validateStructure(validResponse).valid, true);
  assert.equal(validateStructure({ person: {} , company: { company_context: 'nope' } }).valid, false);
});

test('deepseek request uses V4 thinking-mode parameters (no response_format/temperature)', () => {
  const body = buildDeepseekRequest({ hello: 'world' });
  assert.equal(body.model, 'deepseek-v4-pro');
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'max');
  // Thinking mode does NOT support these — including them made every call fail.
  assert.ok(!('response_format' in body), 'response_format unsupported in thinking mode');
  assert.ok(!('temperature' in body), 'temperature unsupported in thinking mode');
  assert.equal(body.messages.length, 2);
});

test('parseModelJson extracts a JSON object wrapped in prose/code fences', async () => {
  const { parseModelJson } = await import('../../backend/llm/response-validator.js');
  assert.equal(parseModelJson('```json\n{"a":1}\n```').ok, true);
  assert.equal(parseModelJson('Here is the result: {"a":1} done').value.a, 1);
  assert.equal(parseModelJson('no json here').ok, false);
});

test('validateResponse grounds against the evidence map and drops unsupported facts', async () => {
  const profile = {
    full_name: 'Jane Doe', headline: 'VP Sales', role: 'VP Sales', company: 'Acme Analytics',
    summary: 'I lead the enterprise sales team across EMEA.',
    responsibilities: ['Lead the EMEA enterprise sales team'],
    posts: [
      { id: 'p1', text: 'Predictable pipeline generation changes enterprise sales forecasting.', created_at: '2025-12-01T00:00:00Z' },
      { id: 'p2', text: 'Aligning revenue operations with the sales pipeline for consistency.', created_at: '2025-11-15T00:00:00Z' }
    ]
  };
  const companyEvidence = {
    website_status: 'confirmed', official_website: 'https://acme-analytics.example',
    website_pages: [{ url: 'https://acme-analytics.example/about', title: 'About', text: 'Acme Analytics provides analytics software for enterprises.' }],
    facts: [
      { field: 'company_context', value: 'Acme Analytics provides analytics software for enterprises', source_url: 'https://acme-analytics.example/about' },
      { field: 'company_priority', value: 'We are investing in real-time analytics', source_url: 'https://acme-analytics.example/news' }
    ]
  };
  const { evidence } = await buildSourceBundle(profile, companyEvidence);

  // Inject an unsupported claim into the otherwise-valid response.
  const tampered = JSON.parse(JSON.stringify(validResponse));
  tampered.person.verified_responsibilities.push({ value: 'Manages a 5 million dollar budget', source_ids: ['PERSON_PROFILE_ABOUT'] });

  const res = validateResponse(tampered, evidence);
  assert.equal(res.valid, true);
  assert.ok(!res.validated.person.verified_responsibilities.some((r) => /budget/i.test(r.value)));
  assert.ok(res.warnings.length >= 1);
});
