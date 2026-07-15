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

test('generic extractor finds people by /in/ links on obfuscated markup', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = extractGenericPeople(doc);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].full_name, 'Frédéric ALLOUCH');
  assert.equal(rows[0].profile_url, 'https://www.linkedin.com/in/frederic-allouch-sample?miniProfileUrn=urn:li:x');
  // Card text (role/company/location) is captured for matching.
  assert.match(rows[0].preview_text, /NERYTEC CONSULTING/);
  assert.match(rows[0].preview_text, /Cabinet de recrutement/);
});

test('standard_search adapter falls back to generic extraction when classes do not match', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = standardSearch.collectPreviewRows({
    url: 'https://www.linkedin.com/search/results/people/?keywords=dirigeant%20cabinet%20de%20recrutement',
    document: doc,
    limit: 50
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.profile_url.includes('/in/')));
});

test('end-to-end: obfuscated search rows flow through the selector and match criteria', () => {
  const doc = load('linkedin-search-obfuscated.html');
  const rows = standardSearch.collectPreviewRows({
    url: 'https://www.linkedin.com/search/results/people/',
    document: doc,
    limit: 50
  });
  const criteria = validateCriteria({
    preview_required_groups: [{ name: 'function', terms: ['recrutement', 'recruitment'] }],
    max_profiles: 50
  }).normalized;
  const { accepted } = selectProfiles(rows, criteria);
  // All three mention "recrutement" in their card text -> all accepted.
  assert.equal(accepted.length, 3);
});
