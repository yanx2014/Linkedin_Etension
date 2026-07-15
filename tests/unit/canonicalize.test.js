import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeProfileUrl, classifySourceUrl } from '../../selector/canonicalize.js';

test('canonicalizes a standard profile URL', () => {
  const r = canonicalizeProfileUrl('https://www.linkedin.com/in/jane-doe/');
  assert.equal(r.ok, true);
  assert.equal(r.canonical, 'https://www.linkedin.com/in/jane-doe');
});

test('normalizes host and strips query + fragment', () => {
  const r = canonicalizeProfileUrl('https://linkedin.com/in/Jane-Doe?trk=abc#section');
  assert.equal(r.ok, true);
  assert.equal(r.canonical, 'https://www.linkedin.com/in/jane-doe');
});

test('uppercase host is accepted and lowercased', () => {
  const r = canonicalizeProfileUrl('https://WWW.LINKEDIN.COM/in/jane-doe');
  assert.equal(r.ok, true);
  assert.equal(r.canonical, 'https://www.linkedin.com/in/jane-doe');
});

test('rejects non-https', () => {
  assert.equal(canonicalizeProfileUrl('http://www.linkedin.com/in/jane').reason, 'invalid_profile_url');
});

test('rejects disallowed host / lookalike domains', () => {
  assert.equal(canonicalizeProfileUrl('https://linkedin.com.evil.com/in/jane').reason, 'disallowed_host');
  assert.equal(canonicalizeProfileUrl('https://example.com/in/jane').reason, 'disallowed_host');
});

test('rejects non-/in/ paths', () => {
  assert.equal(canonicalizeProfileUrl('https://www.linkedin.com/company/acme').reason, 'unsupported_profile_path');
  assert.equal(canonicalizeProfileUrl('https://www.linkedin.com/in/jane/detail/skills').reason, 'unsupported_profile_path');
});

test('rejects empty slug and embedded credentials', () => {
  assert.equal(canonicalizeProfileUrl('https://www.linkedin.com/in/').reason, 'unsupported_profile_path');
  assert.equal(canonicalizeProfileUrl('https://user:pass@www.linkedin.com/in/jane').reason, 'invalid_profile_url');
});

test('rejects path traversal', () => {
  assert.equal(canonicalizeProfileUrl('https://www.linkedin.com/in/%2e%2e%2fadmin').ok, false);
});

test('missing/invalid urls', () => {
  assert.equal(canonicalizeProfileUrl('').reason, 'missing_profile_url');
  assert.equal(canonicalizeProfileUrl('not a url').reason, 'invalid_profile_url');
});

test('classifySourceUrl distinguishes standard vs source-specific', () => {
  assert.equal(classifySourceUrl('https://www.linkedin.com/in/jane').kind, 'standard');
  assert.equal(classifySourceUrl('https://www.linkedin.com/sales/lead/ABC123,NAME_abc').kind, 'source_specific');
  assert.equal(classifySourceUrl('https://www.linkedin.com/talent/profile/xyz').kind, 'source_specific');
  assert.equal(classifySourceUrl('https://example.com/in/jane').kind, 'unsupported');
});
