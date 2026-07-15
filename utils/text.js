// Text helpers shared by selector, avatar, and extraction code.

// Collapse all Unicode whitespace to single spaces and trim.
export function collapseWhitespace(str) {
  return String(str == null ? '' : str).replace(/\s+/gu, ' ').trim();
}

// Normalize apostrophes and dash variants to plain ASCII forms.
export function normalizePunctuationVariants(str) {
  return String(str == null ? '' : str)
    .replace(/[‘’ʼ′]/gu, "'") // curly / prime apostrophes
    .replace(/[“”]/gu, '"')
    .replace(/[‐‑‒–—−]/gu, '-'); // hyphen/dash variants
}

// Truncate to a maximum length without breaking mid-surrogate, appending an
// ellipsis when truncation occurs.
export function truncate(str, max) {
  const s = String(str == null ? '' : str);
  if (s.length <= max) return s;
  return `${Array.from(s).slice(0, max).join('')}…`;
}

// Split a string into words using Unicode letter/number tokens. Used for the
// conservative word-count checks (not for matching — matching uses tokenize.js).
export function wordCount(str) {
  const matches = String(str == null ? '' : str).match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

// Escape a string for safe inclusion inside a Markdown table/inline context by
// neutralizing characters that would break rendering of the avatar cell.
export function escapeMarkdownInline(str) {
  return String(str == null ? '' : str).replace(/([\\`*_{}[\]<>])/g, '\\$1');
}
