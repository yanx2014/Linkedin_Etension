import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCriteria, defaultCriteria } from '../../utils/validation.js';

test('valid criteria passes and normalizes defaults', () => {
  const res = validateCriteria({
    preview_required_groups: [{ name: 'g', terms: ['sales'] }]
  });
  assert.equal(res.valid, true);
  assert.equal(res.normalized.max_profiles, 500);
  assert.equal(res.normalized.collection.max_person_posts, 7);
});

test('max_profiles out of range is an error', () => {
  assert.equal(validateCriteria({ max_profiles: 0 }).valid, false);
  assert.equal(validateCriteria({ max_profiles: 1000 }).valid, false);
  assert.equal(validateCriteria({ max_profiles: 3.5 }).valid, false);
});

test('post limits cannot exceed 7', () => {
  const res = validateCriteria({ collection: { max_person_posts: 8 } });
  assert.equal(res.valid, false);
});

test('duplicate group names are errors', () => {
  const res = validateCriteria({
    preview_required_groups: [{ name: 'g', terms: ['a'] }, { name: 'g', terms: ['b'] }]
  });
  assert.equal(res.valid, false);
});

test('unknown top-level fields produce warnings, not errors', () => {
  const res = validateCriteria({ mystery: true });
  assert.equal(res.valid, true);
  assert.ok(res.warnings.some((w) => w.includes('mystery')));
});

test('invalid schedule value is an error', () => {
  assert.equal(validateCriteria({ automation: { schedule: 'hourly' } }).valid, false);
});

test('empty-after-normalization terms are dropped with a warning', () => {
  const res = validateCriteria({ preview_required_terms: ['🚀', 'sales'] });
  assert.deepEqual(res.normalized.preview_required_terms, ['sales']);
  assert.ok(res.warnings.length >= 1);
});

test('defaultCriteria returns a fresh clone', () => {
  const a = defaultCriteria();
  a.max_profiles = 1;
  assert.equal(defaultCriteria().max_profiles, 500);
});

test('collection.mode defaults to current_page_only and profile_visit off', () => {
  const res = validateCriteria({});
  assert.equal(res.normalized.collection.mode, 'current_page_only');
  assert.equal(res.normalized.collection.profile_visit, false);
});

test('unknown collection.mode is an error', () => {
  assert.equal(validateCriteria({ collection: { mode: 'turbo' } }).valid, false);
});

test('background_search_pages mode accepts profile_visit', () => {
  const res = validateCriteria({ collection: { mode: 'background_search_pages', profile_visit: true } });
  assert.equal(res.valid, true);
  assert.equal(res.normalized.collection.mode, 'background_search_pages');
  assert.equal(res.normalized.collection.profile_visit, true);
});

test('profile_visit is forced off in current_page_only mode with a warning', () => {
  const res = validateCriteria({ collection: { mode: 'current_page_only', profile_visit: true } });
  assert.equal(res.valid, true);
  assert.equal(res.normalized.collection.profile_visit, false);
  assert.ok(res.warnings.some((w) => w.includes('profile_visit')));
});
