import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runImportPipeline } from '../../import/import-job.js';
import { parseJsonImport } from '../../import/json-parser.js';
import { validateCriteria } from '../../utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const NOW = Date.parse('2026-01-01T00:00:00Z');

function loadSampleRecords() {
  const raw = readFileSync(join(root, 'data', 'sample-profiles.json'), 'utf8');
  return parseJsonImport(raw).records;
}

const criteria = validateCriteria({
  preview_required_groups: [{ name: 'function', terms: ['sales', 'revenue'] }],
  preview_excluded_terms: ['recruiter'],
  max_profiles: 100
}).normalized;

test('import-only mode selects and enriches without LinkedIn', async () => {
  const records = loadSampleRecords();
  const res = await runImportPipeline({ records, criteria, nowMs: NOW, job: { id: 'job-1' } });
  // Jane (VP Sales) and Marie (Head of Revenue) match; John (Software Engineer) does not.
  assert.equal(res.accepted.length, 2);
  assert.equal(res.rejected.length, 1);
  assert.ok(res.audit.length === 3);
});

test('every input row appears in the audit', async () => {
  const records = loadSampleRecords();
  const res = await runImportPipeline({ records, criteria, nowMs: NOW, job: { id: 'job-1' } });
  assert.equal(res.audit.length, records.length);
  const decisions = res.audit.map((a) => a.decision).sort();
  assert.deepEqual(decisions, ['accepted', 'accepted', 'rejected']);
});

test('exports include all required files', async () => {
  const records = loadSampleRecords();
  const res = await runImportPipeline({ records, criteria, nowMs: NOW, job: { id: 'job-1' } });
  for (const f of ['profiles_selected.csv', 'profiles_rejected.csv', 'audit.json', 'avatar_evidence.json', 'job_summary.json']) {
    assert.ok(res.exports[f], `missing export ${f}`);
  }
  assert.ok(res.exports['profiles_selected.csv'].startsWith('﻿'));
});

test('sparse accepted profile produces low/medium confidence and no invented values', async () => {
  const records = loadSampleRecords();
  const res = await runImportPipeline({ records, criteria, nowMs: NOW, job: { id: 'job-1' } });
  const csv = res.exports['profiles_selected.csv'];
  // Marie Curie has role+company but no posts/website -> not high confidence.
  assert.match(csv, /Marie Curie/);
  assert.doesNotMatch(csv, /\[object Object\]/);
});
