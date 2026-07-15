import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runImportPipeline } from '../../import/import-job.js';
import { validateCriteria } from '../../utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const NOW = Date.parse('2026-01-01T00:00:00Z');

const janeProfile = {
  source_record_id: 'jane',
  source_type: 'import_json',
  full_name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe',
  headline: 'VP Sales at Acme Analytics', role: 'VP Sales', company: 'Acme Analytics',
  location: 'Paris, France', profile_url: 'https://www.linkedin.com/in/jane-doe',
  summary: 'I lead the enterprise sales team across EMEA.',
  responsibilities: ['Lead the EMEA enterprise sales team'],
  experience: [{ title: 'VP Sales', company: 'Acme Analytics', start_date: '2021-03', is_current: true }],
  posts: [
    { id: 'p1', text: 'Predictable pipeline generation changes enterprise sales forecasting.', created_at: '2025-12-01T10:00:00Z' },
    { id: 'p2', text: 'Aligning revenue operations with the sales pipeline for consistency.', created_at: '2025-11-15T10:00:00Z' }
  ]
};

const companyEvidence = {
  name: 'Acme Analytics', website_status: 'confirmed', official_website: 'https://acme-analytics.example',
  website_pages: [{ url: 'https://acme-analytics.example/about', title: 'About', text: 'Acme Analytics provides analytics software for enterprises.' }],
  facts: [
    { field: 'company_context', value: 'Acme Analytics provides analytics software for enterprises', source_url: 'https://acme-analytics.example/about', source_type: 'official_company_website' },
    { field: 'company_priority', value: 'We are investing in real-time analytics', source_url: 'https://acme-analytics.example/news', source_type: 'official_company_website' }
  ]
};

const criteria = validateCriteria({
  preview_required_groups: [{ name: 'function', terms: ['sales'] }],
  max_profiles: 10
}).normalized;

test('full enrichment with website + validated LLM output -> high confidence', async () => {
  const llmOutput = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'deepseek-valid-response.json'), 'utf8'));
  const res = await runImportPipeline({
    records: [janeProfile],
    criteria,
    nowMs: NOW,
    job: { id: 'job-enrich' },
    enrichProfile: async () => ({ collectedProfile: janeProfile, companyEvidence, llmOutput })
  });
  assert.equal(res.accepted.length, 1);
  const csv = res.exports['profiles_selected.csv'];
  assert.match(csv, /Acme Analytics/);
  assert.match(csv, /acme-analytics\.example/);
  assert.match(csv, /Confidence level:\*\* high/);
  // Website researched: evidence export has company website source ids.
  const evidence = JSON.parse(res.exports['avatar_evidence.json']);
  assert.ok(evidence[0].evidence_map.some((e) => e.source_id.startsWith('COMPANY_WEBSITE')));
  assert.ok(evidence[0].evidence_map.some((e) => e.source_id.startsWith('PERSON_POST')));
});

test('deepseek failure falls back to deterministic avatar and completes as partial', async () => {
  const res = await runImportPipeline({
    records: [janeProfile],
    criteria,
    nowMs: NOW,
    job: { id: 'job-fail' },
    enrichProfile: async () => { throw new Error('deepseek unavailable'); }
  });
  assert.equal(res.accepted.length, 1);
  // enrichment_status recorded as failed, but avatar still rendered from profile.
  const failedAudit = res.audit.find((a) => a.decision === 'accepted');
  assert.equal(failedAudit.enrichment_status, 'failed');
  assert.match(res.exports['profiles_selected.csv'], /Jane Doe/);
});

test('current_page_only: enrich from search-card evidence (no profile visit) still scores role/company and guarantees collected_at', async () => {
  // Preview-only record — the shape produced by current_page_only discovery.
  const preview = {
    source_record_id: 'jane-preview',
    source_type: 'standard_search',
    full_name: 'Jane Doe',
    headline: 'VP Sales at Acme Analytics',
    company: 'Acme Analytics',
    location: 'Paris, France',
    profile_url: 'https://www.linkedin.com/in/jane-doe',
    preview_text: 'Jane Doe · VP Sales at Acme Analytics · Paris'
  };
  const res = await runImportPipeline({
    records: [preview],
    criteria,
    nowMs: NOW,
    job: { id: 'job-current-page' },
    // No profile navigation: collectedProfile is just the preview.
    enrichProfile: async () => ({ collectedProfile: preview, companyEvidence })
  });
  assert.equal(res.accepted.length, 1);
  const csv = res.exports['profiles_selected.csv'];
  assert.match(csv, /Acme Analytics/); // company carried through from the card
  // collected_at is guaranteed (falls back to the pipeline collection time).
  const acceptedAudit = res.audit.find((a) => a.decision === 'accepted');
  assert.ok(acceptedAudit.collected_at, 'audit collected_at set');
  const enriched = res.enriched[0];
  assert.ok(enriched.collected_at && enriched.collected_at.length > 0, 'csv collected_at set');
  // Core-profile completeness (name+role/headline+company+location+url) scores high.
  assert.ok(enriched.score >= 60, `expected score >= 60, got ${enriched.score}`);
});

test('person and company posts are capped at seven in evidence', async () => {
  const manyPosts = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: `Post number ${i} about sales pipeline`, created_at: `2025-1${i % 2}-01T00:00:00Z` }));
  const profile = { ...janeProfile, posts: manyPosts };
  const companyMany = { ...companyEvidence, posts: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, text: `Company post ${i}` })) };
  const res = await runImportPipeline({
    records: [profile],
    criteria,
    nowMs: NOW,
    job: { id: 'job-cap' },
    enrichProfile: async () => ({ collectedProfile: profile, companyEvidence: companyMany })
  });
  const evidence = JSON.parse(res.exports['avatar_evidence.json'])[0];
  const personPosts = evidence.evidence_map.filter((e) => e.source_id.startsWith('PERSON_POST'));
  const companyPosts = evidence.evidence_map.filter((e) => e.source_id.startsWith('COMPANY_POST'));
  assert.equal(personPosts.length, 7);
  assert.equal(companyPosts.length, 7);
});
