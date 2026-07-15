import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValueSupported, validateItem, validateGrounding } from '../../avatar/grounding-validator.js';
import { EvidenceMap } from '../../avatar/evidence-map.js';

function mapWith(entries) {
  const m = new EvidenceMap();
  for (const [id, text] of Object.entries(entries)) {
    m.add({ source_id: id, source_type: 'test', text });
  }
  return m;
}

test('supported when all significant tokens present in source', () => {
  assert.equal(isValueSupported('enterprise sales team', 'I lead the enterprise sales team across EMEA'), true);
});

test('rejects unsupported numbers/dates', () => {
  assert.equal(isValueSupported('budget of 5 million', 'I lead the enterprise sales team'), false);
  assert.equal(isValueSupported('10 years of experience', 'I lead the enterprise sales team'), false);
});

test('rejects claims with tokens absent from source', () => {
  assert.equal(isValueSupported('responsible for hiring', 'VP Sales at Acme'), false);
});

test('validateItem requires known source ids', () => {
  const m = mapWith({ A: 'enterprise sales team' });
  assert.equal(validateItem({ value: 'enterprise sales', source_ids: ['A'] }, m).ok, true);
  assert.equal(validateItem({ value: 'enterprise sales', source_ids: ['MISSING'] }, m).ok, false);
  assert.equal(validateItem({ value: 'enterprise sales', source_ids: [] }, m).ok, false);
});

test('validateGrounding drops unsupported array items and keeps supported', () => {
  const m = mapWith({
    R1: 'Lead the EMEA enterprise sales team',
    ABOUT: 'I lead the enterprise sales team'
  });
  const structured = {
    person: {
      verified_responsibilities: [
        { value: 'Lead the EMEA enterprise sales team', source_ids: ['R1'] },
        { value: 'Owns a 5 million budget', source_ids: ['ABOUT'] }
      ],
      verified_professional_interests: [],
      observed_prospect_facts: []
    },
    company: { company_context: [], verified_company_priorities: [], observed_company_facts: [] }
  };
  const { validated, warnings } = validateGrounding(structured, m);
  assert.equal(validated.person.verified_responsibilities.length, 1);
  assert.ok(warnings.length >= 1);
});
