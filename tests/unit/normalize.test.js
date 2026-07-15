import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, normalizeTerm } from '../../selector/normalize.js';

test('NFKD + accent removal folds accented Latin to base letters', () => {
  assert.equal(normalizeText('Développeur'), 'developpeur');
  assert.equal(normalizeText('José'), 'jose');
  assert.equal(normalizeText('Zoë'), 'zoe');
});

test('lowercases and collapses unicode whitespace', () => {
  assert.equal(normalizeText('  VP   Sales Lead '), 'vp sales lead');
});

test('curly apostrophes are normalized and dropped inside words', () => {
  assert.equal(normalizeText('O’Brien'), 'obrien');
  assert.equal(normalizeText("D'Angelo"), 'dangelo');
});

test('hyphens become spaces', () => {
  assert.equal(normalizeText('Co-Founder'), 'co founder');
  assert.equal(normalizeText('data—driven'), 'data driven');
});

test('retains professional characters + # . / &', () => {
  assert.equal(normalizeText('C++ Engineer'), 'c++ engineer');
  assert.equal(normalizeText('C# / .NET'), 'c# / .net');
  assert.equal(normalizeText('R&D Lead'), 'r&d lead');
});

test('non-Latin scripts are preserved', () => {
  assert.equal(normalizeText('Москва'), 'москва');
  assert.equal(normalizeText('東京'), '東京');
});

test('emoji and stray punctuation collapse to nothing/space', () => {
  assert.equal(normalizeText('Sales 🚀 Lead'), 'sales lead');
  assert.equal(normalizeText('Head of Sales.'), 'head of sales.');
});

test('null/undefined are safe', () => {
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeTerm(''), '');
});
