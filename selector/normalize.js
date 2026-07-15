// Deterministic text normalization for matching. See plan "Normalization".
//
// Steps:
//  1. Safe string conversion.
//  2. Unicode NFKD normalization.
//  3. Remove combining accent marks.
//  4. Lowercase.
//  5. Normalize apostrophes and dashes.
//  6. Collapse all Unicode whitespace.
//  7. Trim.
//  8. Preserve characters meaningful to professional terms: + # . / &
//
// The result is a normalized string suitable for tokenization and phrase
// matching. Matching itself lives in tokenize.js / match.js.

const COMBINING_MARKS = /\p{M}/gu;

// Characters we deliberately keep (besides letters, numbers, and spaces),
// because they carry professional meaning (C++, C#, .NET, TC/O, R&D).
const KEEP = new Set(['+', '#', '.', '/', '&']);

export function normalizeText(input) {
  // 1. Safe string conversion
  let s = input == null ? '' : String(input);

  // 2. NFKD
  s = s.normalize('NFKD');

  // 3. Remove combining marks (accents). This also folds accented Latin to base
  //    letters; non-Latin scripts without combining marks are preserved.
  s = s.replace(COMBINING_MARKS, '');

  // 5. Normalize apostrophe and dash variants BEFORE lowercasing so the regex
  //    classes match reliably.
  s = s
    .replace(/[‘’ʼ′]/gu, "'")
    .replace(/[‐‑‒–—−]/gu, '-');

  // 4. Lowercase (locale-independent).
  s = s.toLowerCase();

  // 6/7. Collapse whitespace + trim happen after punctuation handling below.

  // Convert every character that is not a letter, number, space, or a KEEP
  // character into a space. Apostrophes and hyphens inside words are handled
  // specially: we drop apostrophes (o'brien -> obrien) and convert hyphens to
  // spaces (co-founder -> co founder) so hyphenated terms tokenize consistently.
  let out = '';
  for (const ch of s) {
    if (ch === "'") {
      // drop apostrophe entirely (join the word)
      continue;
    }
    if (ch === '-') {
      out += ' ';
      continue;
    }
    if (KEEP.has(ch)) {
      out += ch;
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(ch) || /\s/u.test(ch)) {
      out += ch;
      continue;
    }
    // everything else -> space
    out += ' ';
  }

  // 6/7. Collapse Unicode whitespace and trim.
  out = out.replace(/\s+/gu, ' ').trim();

  return out;
}

// Normalize a single search/criteria term. Identical pipeline to normalizeText
// but guarantees a trimmed single-line token sequence.
export function normalizeTerm(term) {
  return normalizeText(term);
}
