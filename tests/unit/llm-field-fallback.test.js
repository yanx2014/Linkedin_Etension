import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvatar } from '../../avatar/avatar.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

// Simulates the real LinkedIn case: field-level scrape failed (empty role/company),
// but the visible preview/raw text was captured, and DeepSeek extracted grounded
// role/company citing that text.
const collectedProfile = {
  full_name: 'Frédéric Allouch',
  role: '', company: '', headline: '', location: '',
  profile_url: 'https://www.linkedin.com/in/frederic-allouch',
  preview_text: "chef d'entreprise NERYTEC CONSULTING Cabinet de recrutement Paris et périphérie"
};

const llmOutput = {
  person: {
    real_professional_name: { value: 'Frédéric Allouch', source_ids: ['PERSON_PROFILE_NAME'] },
    current_role: { value: "chef d'entreprise", source_ids: ['PERSON_PROFILE_RAWTEXT'] },
    current_company: { value: 'NERYTEC CONSULTING', source_ids: ['PERSON_PROFILE_RAWTEXT'] },
    verified_responsibilities: [],
    verified_professional_interests: [],
    observed_prospect_facts: []
  },
  company: { company_context: [], verified_company_priorities: [], observed_company_facts: [] },
  outreach: { suggested_message: null, source_ids: [] }
};

test('LLM-extracted role/company fill in when the page scrape is empty (grounded)', async () => {
  const res = await buildAvatar({ collectedProfile, llmOutput, nowMs: NOW });
  assert.equal(res.model.current_role, "chef d'entreprise");
  assert.equal(res.model.current_company, 'NERYTEC CONSULTING');
  assert.match(res.avatar_markdown, /chef d'entreprise/);
});

test('unsupported LLM role is rejected by grounding, not shown', async () => {
  const bad = JSON.parse(JSON.stringify(llmOutput));
  bad.person.current_role = { value: 'Chief Astronaut', source_ids: ['PERSON_PROFILE_RAWTEXT'] };
  const res = await buildAvatar({ collectedProfile, llmOutput: bad, nowMs: NOW });
  // "Chief Astronaut" is absent from the preview text -> dropped -> Not determinable
  assert.notEqual(res.model.current_role, 'Chief Astronaut');
});

test('deterministic profile fields still take precedence over the LLM', async () => {
  const withRole = { ...collectedProfile, role: 'Directeur Général', company: 'ACME' };
  const res = await buildAvatar({ collectedProfile: withRole, llmOutput, nowMs: NOW });
  assert.equal(res.model.current_role, 'Directeur Général');
  assert.equal(res.model.current_company, 'ACME');
});
