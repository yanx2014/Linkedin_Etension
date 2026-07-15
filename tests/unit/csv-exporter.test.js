import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportProfilesCsv, formulaGuard, csvQuoteField, CSV_COLUMNS } from '../../utils/csv-exporter.js';

test('exact header order with BOM and CRLF', () => {
  const { content } = exportProfilesCsv([]);
  assert.ok(content.startsWith('﻿'), 'has BOM');
  const firstLine = content.slice(1).split('\r\n')[0];
  assert.equal(firstLine, CSV_COLUMNS.join(','));
});

test('fields with commas, quotes, and newlines are quoted/escaped', () => {
  const { content } = exportProfilesCsv([{
    full_name: 'Doe, Jane', headline: 'She said "hi"', avatar_profile: 'line1\nline2'
  }]);
  assert.match(content, /"Doe, Jane"/);
  assert.match(content, /"She said ""hi"""/);
  assert.match(content, /"line1\nline2"/);
});

test('formula injection is neutralized for every dangerous leading character', () => {
  for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\tTAB', '\rCR']) {
    const g = formulaGuard(bad);
    assert.equal(g.escaped, true, `expected guard for ${JSON.stringify(bad)}`);
    assert.ok(g.value.startsWith("'"));
  }
});

test('formula guard respects leading spaces then dangerous char', () => {
  assert.equal(formulaGuard('   =1+2').escaped, true);
  assert.equal(formulaGuard('safe text').escaped, false);
});

test('guarded formula cell is also present in export and audited', () => {
  const { content, escaped } = exportProfilesCsv([{ full_name: '=cmd()' }]);
  assert.match(content, /'=cmd\(\)/);
  assert.ok(escaped.some((e) => e.column === 'full_name'));
});

test('unicode is preserved', () => {
  const { content } = exportProfilesCsv([{ full_name: 'José Δοκιμή 東京' }]);
  assert.match(content, /José Δοκιμή 東京/);
});

test('arrays never stringify as [object Object]', () => {
  const { content } = exportProfilesCsv([{ full_name: 'A', profile_note: ['a', 'b'] }]);
  assert.doesNotMatch(content, /\[object Object\]/);
  assert.match(content, /a; b/);
});

test('csvQuoteField leaves plain values unquoted', () => {
  assert.equal(csvQuoteField('plain'), 'plain');
  assert.equal(csvQuoteField('a,b'), '"a,b"');
});
