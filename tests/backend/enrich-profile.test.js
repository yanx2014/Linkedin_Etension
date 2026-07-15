import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enrichProfileRoute } from '../../backend/routes/enrich-profile.js';

const here = dirname(fileURLToPath(import.meta.url));
const homepage = readFileSync(join(here, '..', 'fixtures', 'company-homepage.html'), 'utf8');
const validResponse = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'deepseek-valid-response.json'), 'utf8'));

const profile = {
  full_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe',
  headline: 'VP Sales at Acme Analytics', role: 'VP Sales', company: 'Acme Analytics',
  location: 'Paris, France', company_website: 'https://acme-analytics.example',
  summary: 'I lead the enterprise sales team across EMEA.',
  responsibilities: ['Lead the EMEA enterprise sales team'],
  posts: [
    { id: 'p1', text: 'Predictable pipeline generation changes enterprise sales forecasting.', created_at: '2025-12-01T00:00:00Z' },
    { id: 'p2', text: 'Aligning revenue operations with the sales pipeline for consistency.', created_at: '2025-11-15T00:00:00Z' }
  ]
};

// Fake fetch mapping URLs to bodies.
function fakeSafeFetch(url) {
  if (url.endsWith('/robots.txt')) return Promise.resolve({ url, status: 200, contentType: 'text/plain', body: '', redirects: 0 });
  if (/\/about/.test(url)) return Promise.resolve({ url, status: 200, contentType: 'text/html', body: '<html><head><title>About Acme</title></head><body><h1>About</h1><p>We are focused on real-time analytics for enterprises.</p></body></html>', redirects: 0 });
  if (/\/products/.test(url)) return Promise.resolve({ url, status: 200, contentType: 'text/html', body: '<html><head><title>Products</title></head><body><p>Acme Analytics offers dashboards and reporting tools.</p></body></html>', redirects: 0 });
  if (/\/news/.test(url)) return Promise.resolve({ url, status: 200, contentType: 'text/html', body: '<html><head><title>News</title></head><body><p>We launched a new real-time analytics product.</p></body></html>', redirects: 0 });
  return Promise.resolve({ url, status: 200, contentType: 'text/html', body: homepage, redirects: 0 });
}

const fakeDeepseek = { structure: async () => validResponse };

test('website is confirmed and researched, DeepSeek output returned', async () => {
  const res = await enrichProfileRoute(
    { profile, options: { use_deepseek: true } },
    { safeFetch: fakeSafeFetch, deepseek: fakeDeepseek }
  );
  assert.equal(res.companyEvidence.website_status, 'confirmed');
  assert.equal(res.companyEvidence.official_website, 'https://acme-analytics.example');
  assert.ok(res.companyEvidence.facts.length > 0);
  assert.ok(res.avatar, 'expected deepseek avatar output');
  assert.equal(res.status, 'complete');
});

test('facts include an explicit priority statement', async () => {
  const res = await enrichProfileRoute({ profile, options: { use_deepseek: false } }, { safeFetch: fakeSafeFetch });
  const priorities = res.companyEvidence.facts.filter((f) => f.field === 'company_priority');
  assert.ok(priorities.length >= 1);
  assert.equal(res.avatar, null); // deepseek disabled
  assert.equal(res.status, 'deterministic');
});

test('unconfirmed website when no candidate validates', async () => {
  const noSiteProfile = { ...profile, company_website: '' };
  const res = await enrichProfileRoute(
    { profile: noSiteProfile, options: { use_deepseek: false } },
    { safeFetch: fakeSafeFetch, searchProvider: null }
  );
  // No search provider + no imported website => absent.
  assert.ok(['absent', 'unconfirmed'].includes(res.companyEvidence.website_status));
});

test('missing profile is a 400', async () => {
  await assert.rejects(() => enrichProfileRoute({}, {}), /profile required/);
});
