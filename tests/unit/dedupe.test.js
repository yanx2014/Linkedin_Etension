import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deduper, mergeInto } from '../../selector/dedupe.js';

test('first occurrence wins, later occurrence is duplicate', () => {
  const d = new Deduper();
  const a = { canonical_url: 'https://www.linkedin.com/in/jane', full_name: 'Jane' };
  const b = { canonical_url: 'https://www.linkedin.com/in/jane', full_name: 'Jane D' };
  assert.equal(d.consider(a).isDuplicate, false);
  d.register(a, 0);
  const res = d.consider(b);
  assert.equal(res.isDuplicate, true);
});

test('cross-job seen keys prevent duplicates across jobs', () => {
  const d = new Deduper(['https://www.linkedin.com/in/jane']);
  const res = d.consider({ canonical_url: 'https://www.linkedin.com/in/jane' });
  assert.equal(res.isDuplicate, true);
  assert.equal(res.crossJob, true);
});

test('mergeInto fills empty fields and reports conflicts', () => {
  const primary = { full_name: 'Jane', company: '' };
  const warnings = mergeInto(primary, { company: 'Acme', full_name: 'Janet' });
  assert.equal(primary.company, 'Acme');
  assert.equal(primary.full_name, 'Jane'); // not overwritten
  assert.ok(warnings.includes('conflict:full_name'));
});

test('source-native id used when no canonical url', () => {
  const d = new Deduper();
  const a = { source_record_id: 'abc' };
  assert.equal(Deduper.keyFor(a), 'src:abc');
  d.register(a, 0);
  assert.equal(d.consider({ source_record_id: 'abc' }).isDuplicate, true);
});
