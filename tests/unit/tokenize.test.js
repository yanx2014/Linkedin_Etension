import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, tokenizeNormalized } from '../../selector/tokenize.js';

test('splits into word tokens', () => {
  assert.deepEqual(tokenize('VP Sales Lead'), ['vp', 'sales', 'lead']);
});

test('preserves technical tokens', () => {
  assert.deepEqual(tokenize('C++ and C# and .NET'), ['c++', 'and', 'c#', 'and', '.net']);
  assert.deepEqual(tokenize('node.js developer'), ['node.js', 'developer']);
  assert.deepEqual(tokenize('R&D team'), ['r&d', 'team']);
});

test('strips trailing/leading punctuation from ordinary tokens', () => {
  assert.deepEqual(tokenize('Head of Sales.'), ['head', 'of', 'sales']);
  assert.deepEqual(tokenizeNormalized('sales/'), ['sales']);
});

test('drops punctuation-only tokens', () => {
  assert.deepEqual(tokenize('++ ## //'), []);
});

test('empty input yields empty array', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});
