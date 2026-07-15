import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore } from '../../selector/score.js';
import { evaluateMatch } from '../../selector/match.js';

const criteria = {
  search_keywords: 'enterprise sales',
  preview_required_groups: [{ name: 'g', terms: ['sales'] }],
  preview_required_terms: ['director']
};

test('complete accepted profile scores high', () => {
  const record = {
    full_name: 'Jane Doe', headline: 'Sales Director', role: 'Sales Director',
    company: 'Acme', location: 'Paris', canonical_url: 'https://www.linkedin.com/in/jane',
    posts: [{ text: 'enterprise sales insights' }]
  };
  const md = evaluateMatch({ ...record, headline: 'Sales Director enterprise' }, criteria);
  const { score, breakdown } = computeScore(record, criteria, md, {
    hasPersonPosts: true, hasConfirmedWebsite: true
  });
  assert.ok(score >= 75, `expected >=75, got ${score}`);
  assert.equal(breakdown.reduce((a, c) => a + c.points, 0), score);
});

test('score is bounded 0..100 and deterministic', () => {
  const record = { full_name: 'X' };
  const md = evaluateMatch(record, criteria);
  const a = computeScore(record, criteria, md, {});
  const b = computeScore(record, criteria, md, {});
  assert.deepEqual(a, b);
  assert.ok(a.score >= 0 && a.score <= 100);
});

test('activity and company evidence add points', () => {
  const record = { full_name: 'A B', headline: 'Sales', company: 'Acme', location: 'NYC', canonical_url: 'https://www.linkedin.com/in/ab' };
  const md = evaluateMatch(record, criteria);
  const without = computeScore(record, criteria, md, {}).score;
  const withEv = computeScore(record, criteria, md, { hasPersonPosts: true, hasConfirmedWebsite: true }).score;
  assert.equal(withEv - without, 20);
});
