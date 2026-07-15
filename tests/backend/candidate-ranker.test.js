import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCandidates } from '../../backend/search/candidate-ranker.js';

test('drops social/directory/job-board hosts', () => {
  const results = [
    { url: 'https://www.linkedin.com/company/acme', title: 'Acme', description: '' },
    { url: 'https://acme-analytics.example', title: 'Acme Analytics', description: 'analytics software' },
    { url: 'https://www.crunchbase.com/org/acme', title: 'Acme', description: '' }
  ];
  const ranked = rankCandidates(results, { companyName: 'Acme Analytics' });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].host, 'acme-analytics.example');
});

test('ranks exact-name matches higher', () => {
  const results = [
    { url: 'https://other.example', title: 'Something else', description: 'unrelated' },
    { url: 'https://acme-analytics.example', title: 'Acme Analytics — official', description: 'Acme Analytics provides analytics' }
  ];
  const ranked = rankCandidates(results, { companyName: 'Acme Analytics' });
  assert.equal(ranked[0].host, 'acme-analytics.example');
  assert.ok(ranked[0].preliminaryScore > 0);
});

test('dedupes by host', () => {
  const results = [
    { url: 'https://acme.example/a', title: 'Acme', description: '' },
    { url: 'https://acme.example/b', title: 'Acme', description: '' }
  ];
  const ranked = rankCandidates(results, { companyName: 'Acme' });
  assert.equal(ranked.length, 1);
});
