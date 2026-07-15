import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConfidence } from '../../avatar/confidence.js';

test('all baseline fields + coverage >= 75 and no conflict => high', () => {
  const { level } = computeConfidence({
    hasName: true, hasRole: true, hasCompany: true, hasConfirmedWebsite: true,
    hasResponsibility: true, hasPersonPostOrInterest: true, companyFactCount: 2,
    hasCompanyPriorityOrActivity: true, hasConflict: false
  });
  assert.equal(level, 'high');
});

test('conflict downgrades from high to at most medium', () => {
  const { level } = computeConfidence({
    hasName: true, hasRole: true, hasCompany: true, hasConfirmedWebsite: true,
    hasResponsibility: true, hasPersonPostOrInterest: true, companyFactCount: 2,
    hasCompanyPriorityOrActivity: true, hasConflict: true
  });
  assert.notEqual(level, 'high');
});

test('only name and url => low', () => {
  const { level } = computeConfidence({ hasName: true, onlyNameAndUrl: true });
  assert.equal(level, 'low');
});

test('name + two of three + some context => medium', () => {
  const { level } = computeConfidence({
    hasName: true, hasRole: true, hasCompany: true, hasLocation: false,
    hasPersonPostOrInterest: true, companyFactCount: 1
  });
  assert.equal(level, 'medium');
});

test('missing name forces low', () => {
  const { level } = computeConfidence({ hasName: false, hasRole: true, hasCompany: true });
  assert.equal(level, 'low');
});
