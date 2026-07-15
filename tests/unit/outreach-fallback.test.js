import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackOutreach } from '../../avatar/outreach-validator.js';

test('a lone noise-word topic is NOT quoted in outreach', () => {
  // Regression: real run produced "...your recent comments about ville."
  const msg = buildFallbackOutreach({ firstName: 'there', role: null, company: null, postTopic: 'ville' });
  assert.equal(msg, null, 'no verified anchor + weak topic -> no message');
});

test('a weak topic is dropped but a role anchor still yields a message', () => {
  const msg = buildFallbackOutreach({ role: 'VP Sales', company: 'Acme', postTopic: 'ville' });
  assert.match(msg, /VP Sales at Acme/);
  assert.doesNotMatch(msg, /ville/);
});

test('a substantial multi-word topic is quoted', () => {
  const msg = buildFallbackOutreach({ role: 'VP Sales', postTopic: 'enterprise sales pipeline' });
  assert.match(msg, /enterprise sales pipeline/);
});
