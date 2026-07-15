// Shared DOM helpers and selector fragments used by adapters/extractors. Only
// the small DOM surface (querySelector[All], getAttribute, textContent) is used
// so the same code runs against the real DOM and the test mini-DOM.

export function text(el) {
  if (!el) return '';
  return String(el.textContent || '').replace(/\s+/g, ' ').trim();
}

export function attr(el, name) {
  if (!el) return null;
  return el.getAttribute(name);
}

// Resolve a possibly-relative href against a base URL.
export function absoluteUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base || 'https://www.linkedin.com').toString();
  } catch {
    return null;
  }
}

// First selector (from a list) that yields at least one match within `root`.
export function firstMatching(root, selectors) {
  for (const sel of selectors) {
    const nodes = root.querySelectorAll(sel);
    if (nodes && nodes.length > 0) return { selector: sel, nodes };
  }
  return { selector: null, nodes: [] };
}

export function queryOne(root, selectors) {
  for (const sel of selectors) {
    const node = root.querySelector(sel);
    if (node) return node;
  }
  return null;
}

// Signals that the page is a login / checkpoint / restricted state. Detection is
// conservative and read-only; the tool never attempts to bypass these.
const BLOCKED_URL_PATTERNS = [
  /\/checkpoint\//i,
  /\/authwall/i,
  /\/uas\/login/i,
  /\/login/i,
  /\/security\//i
];

const BLOCKED_DOM_SELECTORS = [
  'form.login__form',
  'input[name="session_password"]',
  '#captcha-internal',
  '[data-test-id="challenge"]',
  '.challenge-dialog',
  '.authwall'
];

const BLOCKED_TEXT = [
  'security verification',
  'please verify',
  'sign in to linkedin',
  'you must sign in',
  'unusual activity'
];

export function detectBlocked({ url, document } = {}) {
  const u = url || '';
  for (const re of BLOCKED_URL_PATTERNS) {
    if (re.test(u)) return { blocked: true, reason: 'url_pattern', signal: re.source };
  }
  if (document) {
    for (const sel of BLOCKED_DOM_SELECTORS) {
      if (document.querySelector(sel)) return { blocked: true, reason: 'dom_signal', signal: sel };
    }
    const bodyText = text(document.body || document.documentElement).toLowerCase();
    for (const phrase of BLOCKED_TEXT) {
      if (bodyText.includes(phrase)) return { blocked: true, reason: 'text_signal', signal: phrase };
    }
  }
  return { blocked: false, reason: null, signal: null };
}
