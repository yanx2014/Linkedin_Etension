import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHtml } from '../helpers/mini-dom.js';
import { extractActivity } from '../../content/extractors/activity-extractor.js';
import { extractCompanyActivity } from '../../content/extractors/company-activity-extractor.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseHtml(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

test('extracts person posts and preserves order/text', () => {
  const document = load('person-activity.html');
  const posts = extractActivity({ document });
  assert.ok(posts.length >= 2);
  assert.match(posts[0].text, /Predictable pipeline generation/);
  assert.equal(posts[0].author_type, 'person');
});

test('caps person posts at seven', () => {
  // Build a doc with 10 posts by repeating a block.
  const block = '<div class="feed-shared-update-v2"><div class="feed-shared-update-v2__description" data-testid="post-text">Post %.</div></div>';
  let html = '<html><body><main>';
  for (let i = 0; i < 10; i++) html += block.replace('%', String(i));
  html += '</main></body></html>';
  const posts = extractActivity({ document: parseHtml(html) });
  assert.equal(posts.length, 7);
});

test('extracts company posts capped at seven', () => {
  const document = load('company-activity.html');
  const posts = extractCompanyActivity({ document });
  assert.ok(posts.length >= 2);
  assert.equal(posts[0].author_type, 'organization');
  assert.match(posts[0].text, /launched real-time dashboards/);
});
