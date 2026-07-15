import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultFingerprint, validatePaginationTransition, isUsableNextControl, isNewPage } from '../../import/pagination-fingerprint.js';

test('resultFingerprint is deterministic and order-independent', () => {
  assert.equal(resultFingerprint(['b', 'a', 'c']), resultFingerprint(['c', 'b', 'a']));
  assert.notEqual(resultFingerprint(['a', 'b']), resultFingerprint(['a', 'b', 'c']));
  assert.equal(resultFingerprint([]), 'empty');
});

test('validatePaginationTransition detects url and fingerprint changes vs stalled', () => {
  assert.deepEqual(
    validatePaginationTransition({ beforeUrl: 'x?page=1', afterUrl: 'x?page=2', beforeFingerprint: 'f', afterFingerprint: 'f' }),
    { changed: true, reason: 'url_changed' }
  );
  assert.deepEqual(
    validatePaginationTransition({ beforeUrl: 'x', afterUrl: 'x', beforeFingerprint: 'f1', afterFingerprint: 'f2' }),
    { changed: true, reason: 'fingerprint_changed' }
  );
  assert.deepEqual(
    validatePaginationTransition({ beforeUrl: 'x', afterUrl: 'x', beforeFingerprint: 'f', afterFingerprint: 'f' }),
    { changed: false, reason: 'stalled' }
  );
});

test('url fragment differences do not count as a change', () => {
  const r = validatePaginationTransition({ beforeUrl: 'x#a', afterUrl: 'x#b', beforeFingerprint: 'f', afterFingerprint: 'f' });
  assert.equal(r.changed, false);
});

test('isUsableNextControl rejects disabled/aria-disabled/hidden controls', () => {
  const stub = (attrs) => ({ getAttribute: (n) => attrs[n] ?? null, hasAttribute: (n) => n in attrs });
  assert.equal(isUsableNextControl(null), false);
  assert.equal(isUsableNextControl(stub({})), true);
  assert.equal(isUsableNextControl(stub({ disabled: '' })), false);
  assert.equal(isUsableNextControl(stub({ 'aria-disabled': 'true' })), false);
  assert.equal(isUsableNextControl(stub({ hidden: '' })), false);
  assert.equal(isUsableNextControl(stub({ class: 'btn is-disabled' })), false);
  assert.equal(isUsableNextControl(stub({ style: 'display: none' })), false);
});

test('isNewPage guards repeated (url|fingerprint) pages', () => {
  const seen = new Set();
  assert.equal(isNewPage(seen, 'x?page=1', 'f1'), true);
  assert.equal(isNewPage(seen, 'x?page=1', 'f1'), false); // repeat
  assert.equal(isNewPage(seen, 'x?page=2', 'f2'), true);
});
