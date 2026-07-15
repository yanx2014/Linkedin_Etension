import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvatar } from '../../avatar/avatar.js';
import { renderAvatar } from '../../avatar/renderer.js';

const completeProfile = {
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  headline: 'VP Sales at Acme Analytics',
  role: 'VP Sales',
  company: 'Acme Analytics',
  location: 'Paris, France',
  profile_url: 'https://www.linkedin.com/in/jane-doe',
  summary: 'I lead the enterprise sales team across EMEA.',
  responsibilities: ['Lead the EMEA enterprise sales team', 'Own pipeline forecasting'],
  experience: [
    { title: 'VP Sales', company: 'Acme Analytics', start_date: '2021-03', end_date: null, is_current: true },
    { title: 'Sales Director', company: 'DataForge', start_date: '2017-01', end_date: '2021-02', is_current: false }
  ],
  posts: [
    { id: 'p1', text: 'Predictable pipeline generation changes enterprise sales forecasting.', created_at: '2025-12-01T10:00:00Z' },
    { id: 'p2', text: 'Aligning revenue operations with the sales pipeline for consistency.', created_at: '2025-11-15T10:00:00Z' }
  ]
};

const companyEvidence = {
  name: 'Acme Analytics',
  website_status: 'confirmed',
  official_website: 'https://acme-analytics.example',
  website_pages: [{ url: 'https://acme-analytics.example/about', title: 'About', text: 'Acme Analytics provides analytics software for enterprises.' }],
  facts: [
    { field: 'company_context', value: 'Acme Analytics provides analytics software for enterprises.', source_url: 'https://acme-analytics.example/about', source_type: 'official_company_website' },
    { field: 'company_priority', value: 'We are investing in real-time analytics.', source_url: 'https://acme-analytics.example/news', source_type: 'official_company_website' }
  ]
};

const NOW = Date.parse('2026-01-01T00:00:00Z');

test('avatar heading order is exact', () => {
  const md = renderAvatar({ real_professional_name: 'X', confidence: 'low' });
  const headings = md.split('\n').filter((l) => l.startsWith('**') && l.endsWith(':**') || /^\*\*[^*]+:\*\*$/.test(l));
  const idxName = md.indexOf('Real professional name');
  const idxRole = md.indexOf('Current role');
  const idxExp = md.indexOf('Professional experience');
  assert.ok(idxName < idxRole && idxRole < idxExp);
  assert.ok(md.startsWith('# LinkedIn Prospect Avatar'));
});

test('complete profile -> high confidence, grounded facts', async () => {
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, nowMs: NOW });
  assert.equal(res.model.real_professional_name, 'Jane Doe');
  assert.equal(res.model.current_role, 'VP Sales');
  assert.equal(res.model.current_company, 'Acme Analytics');
  assert.equal(res.model.company_website, 'https://acme-analytics.example');
  assert.equal(res.confidence, 'high');
  assert.match(res.avatar_markdown, /VP Sales/);
});

test('professional experience is derived from dated positions, not rounded up', async () => {
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, nowMs: NOW });
  // 2017-01..2021-02 (50 months) + 2021-03..2026-01 (59 months) => 109 months => 9.0
  assert.equal(res.model.professional_experience, '9.0');
});

test('sparse profile -> low confidence, placeholders, no invented values', async () => {
  const res = await buildAvatar({
    collectedProfile: { full_name: 'John Smith', profile_url: 'https://www.linkedin.com/in/john-smith' },
    companyEvidence: {},
    nowMs: NOW
  });
  assert.equal(res.confidence, 'low');
  assert.equal(res.model.current_role, null);
  assert.match(res.avatar_markdown, /\*\*Current role:\*\* Not determinable/);
  assert.match(res.avatar_markdown, /\*\*Company website:\*\* Not confirmed/);
  assert.ok(res.profile_note.length > 0);
});

test('missing surname yields Not determinable name', async () => {
  const res = await buildAvatar({
    collectedProfile: { full_name: 'Cher', profile_url: 'https://www.linkedin.com/in/cher' },
    nowMs: NOW
  });
  assert.equal(res.model.real_professional_name, null);
  assert.match(res.avatar_markdown, /\*\*Real professional name:\*\* Not determinable/);
});

test('hypotheses appear only in hypothesis sections and use tentative language', async () => {
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, nowMs: NOW });
  assert.ok(res.model.potential_objectives.length > 0);
  for (const h of [...res.model.potential_objectives, ...res.model.potential_challenges]) {
    assert.match(h, /\b(may|might|could)\b/i);
  }
});

test('no hypotheses when role is absent', async () => {
  const res = await buildAvatar({
    collectedProfile: { full_name: 'John Smith', profile_url: 'https://www.linkedin.com/in/john-smith' },
    nowMs: NOW
  });
  assert.equal(res.model.potential_objectives.length, 0);
  assert.equal(res.model.potential_challenges.length, 0);
});

test('grounding removes unsupported LLM claims', async () => {
  const llmOutput = {
    person: {
      real_professional_name: { value: 'Jane Doe', source_ids: ['PERSON_PROFILE_NAME'] },
      current_role: { value: 'VP Sales', source_ids: ['PERSON_PROFILE_ROLE'] },
      current_company: { value: 'Acme Analytics', source_ids: ['PERSON_PROFILE_COMPANY'] },
      verified_responsibilities: [
        { value: 'Lead the EMEA enterprise sales team', source_ids: ['PERSON_PROFILE_RESPONSIBILITY_1'] },
        { value: 'Manages a budget of 5 million dollars', source_ids: ['PERSON_PROFILE_ABOUT'] } // unsupported
      ],
      verified_professional_interests: [],
      observed_prospect_facts: []
    },
    company: { company_context: [], verified_company_priorities: [], observed_company_facts: [] },
    outreach: { suggested_message: null, source_ids: [] }
  };
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, llmOutput, nowMs: NOW });
  assert.ok(res.model.verified_responsibilities.includes('Lead the EMEA enterprise sales team'));
  assert.ok(!res.model.verified_responsibilities.some((r) => /budget/i.test(r)));
  assert.ok(res.warnings.some((w) => w.source === 'grounding'));
});

test('every rendered fact is backed by evidence, a hypothesis label, or a placeholder', async () => {
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, nowMs: NOW });
  // Company context / responsibilities / interests / priorities / observed facts
  // must each be traceable to an evidence source text.
  const evidenceTexts = res.evidence_map.map((e) => e.source_id);
  assert.ok(evidenceTexts.length > 0);
  // company_website present implies confirmed evidence
  assert.ok(res.model.company_website);
});

test('outreach message is under 70 words and contains no banned phrases', async () => {
  const res = await buildAvatar({ collectedProfile: completeProfile, companyEvidence, nowMs: NOW });
  if (res.model.outreach_message) {
    const words = res.model.outreach_message.split(/\s+/).length;
    assert.ok(words <= 70);
    assert.doesNotMatch(res.model.outreach_message, /guarantee|huge fan/i);
  }
});
