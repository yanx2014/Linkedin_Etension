import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHtml } from '../helpers/mini-dom.js';
import adapter from '../../content/adapters/standard-search.js';
import { UnsupportedLayoutError, BlockedStateError } from '../../utils/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseHtml(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

test('collects preview rows from search results', () => {
  const document = load('standard-search.html');
  const url = 'https://www.linkedin.com/search/results/people/?keywords=sales';
  assert.equal(adapter.canHandle({ url }), true);
  const rows = adapter.collectPreviewRows({ url, document, limit: 10 });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].full_name, 'Jane Doe');
  // Canonicalized: query string stripped.
  assert.equal(rows[0].profile_url, 'https://www.linkedin.com/in/jane-doe-sample');
  assert.match(rows[0].preview_text, /VP Sales/);
});

test('finds the next-page control', () => {
  const document = load('standard-search.html');
  const next = adapter.findNextPageControl({ document });
  assert.ok(next, 'expected a next-page control');
});

test('throws UnsupportedLayoutError when no containers match', () => {
  const document = parseHtml('<html><body><main>nothing</main></body></html>');
  assert.throws(
    () => adapter.collectPreviewRows({ url: 'https://www.linkedin.com/search/results/people/', document }),
    UnsupportedLayoutError
  );
});

test('throws BlockedStateError on a checkpoint page', () => {
  const document = load('blocked-page.html');
  assert.throws(
    () => adapter.collectPreviewRows({ url: 'https://www.linkedin.com/search/results/people/', document }),
    BlockedStateError
  );
});
