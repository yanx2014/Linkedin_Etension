import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, normalizeCompanyName, isDisqualifiedHost } from '../../backend/website/official-site-validator.js';
import { extractHtml } from '../../backend/website/html-extractor.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const homepage = readFileSync(join(here, '..', 'fixtures', 'company-homepage.html'), 'utf8');

test('accepts a strong official-site match', () => {
  const extracted = extractHtml(homepage, 'https://acme-analytics.example/');
  const res = scoreCandidate({
    url: 'https://acme-analytics.example/',
    extracted,
    context: { companyName: 'Acme Analytics', companyLocation: 'EMEA', importedWebsiteFragment: 'acme-analytics.example' }
  });
  assert.ok(res.score >= 60, `score ${res.score}`);
  assert.equal(res.accepted, true);
});

test('rejects a different company with the same-ish name (name conflict)', () => {
  const html = '<html><head><script type="application/ld+json">{"@type":"Organization","name":"Globex Corporation"}</script><title>Globex</title></head><body><h1>Globex</h1></body></html>';
  const extracted = extractHtml(html, 'https://globex.example');
  const res = scoreCandidate({ url: 'https://globex.example', extracted, context: { companyName: 'Acme Analytics' } });
  assert.equal(res.accepted, false);
});

test('disqualifies social/directory hosts', () => {
  assert.equal(isDisqualifiedHost('https://www.linkedin.com/company/acme'), true);
  assert.equal(isDisqualifiedHost('https://acme-analytics.example'), false);
});

test('normalizeCompanyName strips legal suffixes', () => {
  assert.equal(normalizeCompanyName('Acme Analytics, Inc.'), 'acme analytics');
  assert.equal(normalizeCompanyName('Globex GmbH'), 'globex');
});
