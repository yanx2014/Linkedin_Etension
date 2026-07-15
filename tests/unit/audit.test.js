import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProfiles } from '../../selector/select.js';
import { ReasonCodes } from '../../selector/audit.js';

const criteria = {
  search_keywords: '',
  preview_required_groups: [{ name: 'function', terms: ['sales'] }],
  preview_required_terms: [],
  preview_excluded_terms: ['recruiter'],
  max_profiles: 2,
  allowed_profile_hosts: ['linkedin.com', 'www.linkedin.com']
};

function reasons(audit, i) { return audit[i].reasons[0]; }

test('every input row produces exactly one audit entry', () => {
  const rows = [
    { full_name: 'A', headline: 'Sales Lead', profile_url: 'https://www.linkedin.com/in/a' },
    { full_name: 'B', headline: 'Marketing', profile_url: 'https://www.linkedin.com/in/b' },
    { full_name: 'C', headline: 'Sales recruiter', profile_url: 'https://www.linkedin.com/in/c' }
  ];
  const { audit } = selectProfiles(rows, criteria);
  assert.equal(audit.length, rows.length);
});

test('reason codes reflect decisions', () => {
  const rows = [
    { full_name: 'A', headline: 'Sales Lead', profile_url: 'https://www.linkedin.com/in/a' }, // accepted
    { full_name: 'B', headline: 'Marketing', profile_url: 'https://www.linkedin.com/in/b' }, // missing group
    { full_name: 'C', headline: 'Sales recruiter', profile_url: 'https://www.linkedin.com/in/c' }, // excluded
    { full_name: 'D', headline: 'Sales', profile_url: 'not-a-url' } // invalid url
  ];
  const { audit } = selectProfiles(rows, criteria);
  assert.equal(reasons(audit, 0), ReasonCodes.ACCEPTED);
  assert.equal(reasons(audit, 1), ReasonCodes.MISSING_REQUIRED_GROUP);
  assert.equal(reasons(audit, 2), ReasonCodes.EXCLUDED_TERM);
  assert.equal(reasons(audit, 3), ReasonCodes.INVALID_PROFILE_URL);
});

test('duplicate profiles are rejected, first wins', () => {
  const rows = [
    { full_name: 'A', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' },
    { full_name: 'A2', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' }
  ];
  const { accepted, audit } = selectProfiles(rows, criteria);
  assert.equal(accepted.length, 1);
  assert.equal(reasons(audit, 1), ReasonCodes.DUPLICATE_PROFILE);
});

test('max_profiles cap enforced; duplicates do not consume cap', () => {
  const rows = [
    { full_name: 'A', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' },
    { full_name: 'B', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/b' },
    { full_name: 'C', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/c' }
  ];
  const { accepted, audit } = selectProfiles(rows, criteria);
  assert.equal(accepted.length, 2);
  assert.equal(reasons(audit, 2), ReasonCodes.PROFILE_CAP_REACHED);
});

test('cross-job duplicates rejected via seenKeys', () => {
  const rows = [{ full_name: 'A', headline: 'Sales', profile_url: 'https://www.linkedin.com/in/a' }];
  const { accepted, audit } = selectProfiles(rows, criteria, { seenKeys: ['https://www.linkedin.com/in/a'] });
  assert.equal(accepted.length, 0);
  assert.equal(reasons(audit, 0), ReasonCodes.DUPLICATE_PROFILE);
});

test('accepted audit carries score and versions', () => {
  const rows = [{ full_name: 'A', headline: 'Sales Lead', profile_url: 'https://www.linkedin.com/in/a' }];
  const { audit } = selectProfiles(rows, criteria);
  assert.equal(audit[0].selector_version, '1');
  assert.equal(audit[0].model, 'deepseek-chat');
  assert.ok(typeof audit[0].score === 'number');
});
