import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHtml } from '../helpers/mini-dom.js';
import { extractGenericPeople } from '../../content/extractors/preview-extractor.js';
import standardSearch from '../../content/adapters/standard-search.js';
import { selectProfiles } from '../../selector/select.js';
import { validateCriteria } from '../../utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseHtml(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

test('one primary person per card; mutual connections are ignored', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = extractGenericPeople(doc);
  // Only the two main results — not Philippe/Florence/Patrice (mutual connections).
  assert.equal(rows.length, 2);
  const names = rows.map((r) => r.full_name);
  assert.ok(names.includes('Frédéric ALLOUCH'));
  assert.ok(names.includes('Abdoulaye YEHIYA'));
  assert.ok(!names.includes('Philippe Duranté'));
});

test('name is clean (no degree marker or card text pollution)', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = extractGenericPeople(doc);
  const fred = rows.find((r) => r.full_name.startsWith('Frédéric'));
  assert.equal(fred.full_name, 'Frédéric ALLOUCH');
  assert.doesNotMatch(fred.full_name, /2e|chef d'entreprise/);
  // Role/company text is still available for matching via preview_text.
  assert.match(fred.preview_text, /NERYTEC CONSULTING/);
});

test('profile_url is the real canonical /in/ link', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = extractGenericPeople(doc);
  const fred = rows.find((r) => r.full_name.startsWith('Frédéric'));
  assert.match(fred.profile_url, /\/in\/frederic-allouch-177b961a/);
});

test('adapter falls back to generic extraction and feeds the selector', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = standardSearch.collectPreviewRows({
    url: 'https://www.linkedin.com/search/results/people/?keywords=recrutement',
    document: doc,
    limit: 50
  });
  assert.equal(rows.length, 2);
  const criteria = validateCriteria({
    preview_required_groups: [{ name: 'function', terms: ['recrutement', 'recruitment'] }],
    max_profiles: 50
  }).normalized;
  const { accepted } = selectProfiles(rows, criteria);
  assert.equal(accepted.length, 2);
});
