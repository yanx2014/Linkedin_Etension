import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAdapter } from '../../content/source-detector.js';

test('detects standard people search', () => {
  const a = detectAdapter({ url: 'https://www.linkedin.com/search/results/people/?keywords=sales', document: null });
  assert.equal(a?.id, 'standard_search');
});

test('detects single profile', () => {
  const a = detectAdapter({ url: 'https://www.linkedin.com/in/jane-doe/', document: null });
  assert.equal(a?.id, 'single_profile');
});

test('detects sales navigator search vs saved search', () => {
  assert.equal(detectAdapter({ url: 'https://www.linkedin.com/sales/search/people?query=x' }).id, 'sales_search');
  assert.equal(detectAdapter({ url: 'https://www.linkedin.com/sales/search/people?savedSearchId=123' }).id, 'sales_saved_search');
});

test('detects sales lead and recruiter candidate profiles', () => {
  assert.equal(detectAdapter({ url: 'https://www.linkedin.com/sales/lead/ABC123,NAME_xyz' }).id, 'sales_profile');
  assert.equal(detectAdapter({ url: 'https://www.linkedin.com/talent/profile/abc' }).id, 'recruiter_profile');
});

test('returns null for unsupported pages', () => {
  assert.equal(detectAdapter({ url: 'https://www.linkedin.com/jobs/' }), null);
});
