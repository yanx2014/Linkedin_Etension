import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTerm, evaluateMatch, buildPreviewCorpus } from '../../selector/match.js';
import { tokenize } from '../../selector/tokenize.js';

const T = (s) => tokenize(s);

test('single-token match requires whole-token equality', () => {
  assert.equal(matchTerm(T('chief executive officer'), 'ceo'), false);
  assert.equal(matchTerm(T('the ocean blue'), 'ceo'), false);
  assert.equal(matchTerm(T('our ceo spoke'), 'ceo'), true);
});

test('substring false positives are rejected', () => {
  assert.equal(matchTerm(T('wholesales manager'), 'sales'), false);
  assert.equal(matchTerm(T('sales manager'), 'sales'), true);
});

test('multi-word terms match contiguous tokens', () => {
  assert.equal(matchTerm(T('experienced vp sales leader'), 'vp sales'), true);
  assert.equal(matchTerm(T('vp of sales'), 'vp sales'), false);
});

test('accent-insensitive and hyphen-equivalent matching', () => {
  assert.equal(matchTerm(T('Développeur backend'), 'developpeur'), true);
  assert.equal(matchTerm(T('Co-Founder & CEO'), 'co founder'), true);
});

test('technical term matching', () => {
  assert.equal(matchTerm(T('Senior C++ Engineer'), 'c++'), true);
  assert.equal(matchTerm(T('Java developer'), 'c++'), false);
});

test('evaluateMatch enforces group AND / term OR logic', () => {
  const criteria = {
    preview_required_groups: [
      { name: 'seniority', terms: ['founder', 'ceo', 'head'] },
      { name: 'function', terms: ['sales', 'revenue'] }
    ],
    preview_required_terms: [],
    preview_excluded_terms: ['recruiter']
  };
  const pass = evaluateMatch({ headline: 'Founder and Head of Sales' }, criteria);
  assert.equal(pass.passed, true);
  assert.deepEqual(Object.keys(pass.matchedGroups).sort(), ['function', 'seniority']);

  const missFunction = evaluateMatch({ headline: 'Founder and CEO' }, criteria);
  assert.equal(missFunction.passed, false);
  assert.deepEqual(missFunction.missingGroups, ['function']);
});

test('exclusion terms cause failure', () => {
  const criteria = {
    preview_required_groups: [{ name: 'g', terms: ['sales'] }],
    preview_excluded_terms: ['recruiter']
  };
  const res = evaluateMatch({ headline: 'Sales recruiter' }, criteria);
  assert.equal(res.passed, false);
  assert.deepEqual(res.matchedExcludedTerms, ['recruiter']);
});

test('preview corpus uses only explicit fields and company alias', () => {
  const corpus = buildPreviewCorpus({ full_name: 'A B', headline: 'CEO', company: 'Acme', location: 'Paris' });
  assert.match(corpus, /Acme/);
  assert.match(corpus, /Paris/);
});
