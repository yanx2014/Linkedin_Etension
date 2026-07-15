import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHtml } from '../helpers/mini-dom.js';
import { extractStandardSearchCards, renderedSlugs } from '../../content/extractors/standard-search-card-extractor.js';
import standardSearch from '../../content/adapters/standard-search.js';
import { UnsupportedLayoutError, BlockedStateError } from '../../utils/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseHtml(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

test('one primary person per card; mutual/avatar links rejected', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = extractStandardSearchCards(doc);
  const names = rows.map((r) => r.full_name).sort();
  assert.deepEqual(names, ['Abdoulaye YEHIYA', 'Frédéric ALLOUCH', 'Jean-Claude ESTRAMPES']);
  // mutual connections must NOT appear
  assert.ok(!rows.some((r) => /philippedurante|florence-l|patrichlomenou|early-mutual/.test(r.profile_url)));
});

test('names are clean (degree markers and card text stripped)', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = extractStandardSearchCards(doc);
  const jc = rows.find((r) => r.full_name.startsWith('Jean-Claude'));
  assert.equal(jc.full_name, 'Jean-Claude ESTRAMPES'); // recovered from whole-card-text link
  const fred = rows.find((r) => r.full_name.startsWith('Frédéric'));
  assert.doesNotMatch(fred.full_name, /2e|chef d'entreprise/);
});

test('canonical URL has no query/fragment; preview_text carries role/company', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = extractStandardSearchCards(doc);
  const fred = rows.find((r) => r.full_name.startsWith('Frédéric'));
  assert.equal(fred.profile_url, 'https://www.linkedin.com/in/frederic-allouch-177b961a');
  assert.match(fred.preview_text, /NERYTEC CONSULTING/);
  assert.match(fred.preview_text, /Cabinet de recrutement/);
});

test('aria-label name is used when only an image link exists', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = extractStandardSearchCards(doc);
  assert.ok(rows.some((r) => r.full_name === 'Abdoulaye YEHIYA'));
});

test('duplicate profile links in a card dedupe to one row', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = extractStandardSearchCards(doc);
  const freds = rows.filter((r) => r.profile_url.includes('frederic-allouch'));
  assert.equal(freds.length, 1);
});

test('renderedSlugs returns canonical slugs of all /in/ links', () => {
  const doc = load('linkedin-search-realistic.html');
  const slugs = renderedSlugs(doc);
  assert.ok(slugs.includes('frederic-allouch-177b961a'));
  assert.ok(slugs.includes('philippedurante')); // fingerprint counts everything rendered
});

test('adapter: disabled Next control is not usable', () => {
  const doc = load('linkedin-search-realistic.html');
  assert.equal(standardSearch.findNextPageControl({ document: doc }), null);
});

test('adapter collectPreviewRows returns primary people only', () => {
  const doc = load('linkedin-search-realistic.html');
  const rows = standardSearch.collectPreviewRows({ url: 'https://www.linkedin.com/search/results/people/', document: doc, limit: 50 });
  assert.equal(rows.length, 3);
});

test('adapter throws on empty layout and on blocked pages', () => {
  const empty = parseHtml('<html><body><main>nothing</main></body></html>');
  assert.throws(() => standardSearch.collectPreviewRows({ url: 'https://www.linkedin.com/search/results/people/', document: empty }), UnsupportedLayoutError);
  const blocked = load('blocked-page.html');
  assert.throws(() => standardSearch.collectPreviewRows({ url: 'https://www.linkedin.com/search/results/people/', document: blocked }), BlockedStateError);
});
