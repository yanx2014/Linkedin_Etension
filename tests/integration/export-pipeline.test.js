import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runImportPipeline } from '../../import/import-job.js';
import { validateCriteria } from '../../utils/validation.js';
import { CSV_COLUMNS } from '../../utils/csv-exporter.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const criteria = validateCriteria({ preview_required_groups: [{ name: 'g', terms: ['sales'] }], max_profiles: 10 }).normalized;

test('CSV header is exact and BOM/CRLF present', async () => {
  const res = await runImportPipeline({
    records: [{ source_record_id: 'a', full_name: 'A B', headline: 'Sales Lead', profile_url: 'https://www.linkedin.com/in/a' }],
    criteria, nowMs: NOW, job: { id: 'exp' }
  });
  const csv = res.exports['profiles_selected.csv'];
  assert.ok(csv.startsWith('﻿'));
  const header = csv.slice(1).split('\r\n')[0];
  assert.equal(header, CSV_COLUMNS.join(';'));
});

test('formula-like imported values are neutralized', async () => {
  const res = await runImportPipeline({
    records: [{ source_record_id: 'a', full_name: '=HYPERLINK("http://evil")', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' }],
    criteria, nowMs: NOW, job: { id: 'exp' }
  });
  assert.match(res.exports['profiles_selected.csv'], /'=HYPERLINK/);
  assert.ok(res.escapedCsvCells.length >= 1);
});

test('multiline avatar stays inside one quoted cell', async () => {
  const res = await runImportPipeline({
    records: [{ source_record_id: 'a', full_name: 'A B', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' }],
    criteria, nowMs: NOW, job: { id: 'exp' }
  });
  const csv = res.exports['profiles_selected.csv'];
  assert.match(csv, /"# LinkedIn Prospect Avatar[\s\S]*?"/);
});

test('job summary counts inputs by decision', async () => {
  const res = await runImportPipeline({
    records: [
      { source_record_id: 'a', full_name: 'A', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' },
      { source_record_id: 'b', full_name: 'B', headline: 'Marketing', profile_url: 'https://www.linkedin.com/in/b' }
    ],
    criteria, nowMs: NOW, job: { id: 'exp' }
  });
  const summary = JSON.parse(res.exports['job_summary.json']);
  assert.equal(summary.counts.total_inputs, 2);
  assert.equal(summary.counts.by_decision.accepted, 1);
  assert.equal(summary.counts.by_decision.rejected, 1);
  assert.ok(summary.export_hashes['profiles_selected.csv'].startsWith('sha256:'));
});
