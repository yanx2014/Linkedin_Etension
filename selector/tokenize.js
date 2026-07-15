// Tokenization for matching. Operates on already-normalized text (normalize.js).
//
// Tokens are maximal runs of letters, numbers, and the retained professional
// characters (+ # . / &). Leading/trailing retained-punctuation is stripped so
// "sales." tokenizes to "sales", while known technical tokens (c++, c#, .net,
// node.js, tcp/ip, r&d) are preserved verbatim.

import { normalizeText } from './normalize.js';

const KEEP_CLASS = '+#./&';
const TOKEN_RE = new RegExp(`[\\p{L}\\p{N}${escapeForClass(KEEP_CLASS)}]+`, 'gu');
const STRIP_RE = new RegExp(`^[${escapeForClass(KEEP_CLASS)}]+|[${escapeForClass(KEEP_CLASS)}]+$`, 'g');

// Technical tokens whose punctuation is meaningful at the edges.
const TECH_TOKENS = new Set([
  'c++', 'c#', 'f#', '.net', 'node.js', 'asp.net', 'tcp/ip', 'r&d', 'a/b'
]);

function escapeForClass(chars) {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

function trimPunct(token) {
  if (TECH_TOKENS.has(token)) return token;
  return token.replace(STRIP_RE, '');
}

// Tokenize a normalized string into an array of tokens.
export function tokenizeNormalized(normalized) {
  const raw = String(normalized == null ? '' : normalized).match(TOKEN_RE) || [];
  const out = [];
  for (const t of raw) {
    const trimmed = trimPunct(t);
    if (trimmed) out.push(trimmed);
  }
  return out;
}

// Convenience: normalize then tokenize raw input.
export function tokenize(input) {
  return tokenizeNormalized(normalizeText(input));
}

// Segment-aware tokenization using Intl.Segmenter when available, kept for
// completeness. Falls back to the Unicode-property tokenizer above. The result
// is intersected with tokenizeNormalized so retained technical tokens survive.
export function tokenizeSegments(input) {
  const normalized = normalizeText(input);
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
      const words = [];
      for (const { segment, isWordLike } of seg.segment(normalized)) {
        if (isWordLike) {
          const t = trimPunct(segment);
          if (t) words.push(t);
        }
      }
      // Intl.Segmenter may split on '+'/'#'; prefer the property tokenizer when
      // it yields fewer (i.e. keeps technical tokens intact).
      const propTokens = tokenizeNormalized(normalized);
      return propTokens.length <= words.length ? propTokens : words;
    } catch {
      // fall through
    }
  }
  return tokenizeNormalized(normalized);
}
