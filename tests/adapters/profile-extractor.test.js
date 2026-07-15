import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHtml } from '../helpers/mini-dom.js';
import { extractProfile } from '../../content/extractors/profile-extractor.js';
import { parseDateRange } from '../../content/extractors/experience-extractor.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseHtml(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

test('extracts a complete profile with experience', () => {
  const document = load('profile-complete.html');
  const p = extractProfile({ url: 'https://www.linkedin.com/in/jane-doe-sample', document });
  assert.equal(p.full_name, 'Jane Doe');
  assert.match(p.headline, /VP Sales/);
  assert.equal(p.location, 'Paris, France');
  assert.ok(p.experience.length >= 2);
  assert.equal(p.experience[0].title, 'VP Sales');
  assert.equal(p.experience[0].is_current, true);
  assert.equal(p.experience[1].start_date, '2017-01');
  assert.equal(p.experience[1].end_date, '2021-02');
  assert.ok(p.activity_url && p.activity_url.includes('recent-activity'));
});

test('does not infer first/last name from full name', () => {
  const document = load('profile-complete.html');
  const p = extractProfile({ url: 'https://www.linkedin.com/in/jane-doe-sample', document });
  assert.equal(p.first_name, '');
  assert.equal(p.last_name, '');
});

test('sparse profile yields warnings but no invented values', () => {
  const document = load('profile-sparse.html');
  const p = extractProfile({ url: 'https://www.linkedin.com/in/john-smith', document });
  assert.equal(p.full_name, 'John Smith');
  assert.equal(p.role, '');
  assert.equal(p.company, '');
  assert.equal(p.experience.length, 0);
});

test('parseDateRange handles present and month-year ranges', () => {
  assert.deepEqual(parseDateRange('Mar 2021 - Present'), { start_date: '2021-03', end_date: null, is_current: true });
  assert.deepEqual(parseDateRange('Jan 2017 - Feb 2021'), { start_date: '2017-01', end_date: '2021-02', is_current: false });
  assert.deepEqual(parseDateRange('2019 - 2021'), { start_date: '2019-01', end_date: '2021-01', is_current: false });
});
