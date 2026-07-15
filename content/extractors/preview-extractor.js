// Preview extraction helpers.
//
// extractPreviewFromContainer: selector-map based (used when known class names
// match). extractGenericPeople: class-name-INDEPENDENT extraction that finds
// people by their stable /in/ profile links and grabs the surrounding card
// text. The generic path is the resilient fallback for LinkedIn's frequently
// changing / obfuscated markup.

import { text, attr, queryOne, absoluteUrl } from '../selectors/common.js';

export function extractPreviewFromContainer(container, selectors, base = 'https://www.linkedin.com') {
  const link =
    queryOne(container, selectors.profileLink || []) ||
    queryOne(container, selectors.standardProfileLink || []);
  const href = attr(link, 'href');
  return {
    profile_url: absoluteUrl(href, base),
    full_name: text(queryOne(container, selectors.nameText || [])) || (link ? text(link) : ''),
    headline: text(queryOne(container, selectors.headline || [])),
    current_company: selectors.company ? text(queryOne(container, selectors.company)) : '',
    location: text(queryOne(container, selectors.location || []))
  };
}

// DOM-agnostic parent accessor (real DOM: parentElement; mini-dom: parent).
function parentOf(el) {
  return el.parentElement || el.parent || null;
}

// The /in/ slug for a profile href, or null.
function slugOf(href) {
  if (!href) return null;
  const m = String(href).match(/\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

// Clean a candidate name: cut at a degree marker ("• 2e") or newline, collapse
// whitespace, and reject anything too long to be a name (i.e. whole-card text).
function cleanName(raw) {
  let n = String(raw || '').split('•')[0].split('\n')[0].replace(/\s+/g, ' ').trim();
  // Drop a trailing standalone degree marker if it slipped through.
  n = n.replace(/\s*[·•]\s*(1er|2e|2nd|3e|3rd|3e\+).*$/i, '').trim();
  if (!n || n.length > 70) return '';
  return n;
}

// Parse a name out of an anchor aria-label like "Voir le profil de Frédéric
// ALLOUCH" / "View Frédéric Allouch's profile".
function nameFromAriaLabel(anchor) {
  const label = anchor.getAttribute && anchor.getAttribute('aria-label');
  if (!label) return '';
  let n = label
    .replace(/^voir le profil de\s+/i, '')
    .replace(/^view\s+/i, '')
    .replace(/[’']s profile$/i, '')
    .replace(/\s+profile$/i, '');
  return cleanName(n);
}

// Best-effort visible name for a profile anchor. Prefer the first aria-hidden
// name span; then the aria-label; then the first line of the anchor text.
// Returns '' when no clean name can be found (caller skips such anchors).
function bestName(anchor) {
  const span = anchor.querySelector('span[aria-hidden="true"]');
  const fromSpan = cleanName(span ? text(span) : '');
  if (fromSpan) return fromSpan;
  const fromLabel = nameFromAriaLabel(anchor);
  if (fromLabel) return fromLabel;
  return cleanName(text(anchor));
}

// Walk up from a profile anchor to the smallest ancestor that looks like a full
// result card (enough text to include role/company/location), bounded to avoid
// climbing to the whole page.
function cardContainer(anchor) {
  const li = anchor.closest && anchor.closest('li');
  if (li && text(li).length >= 30) return li;
  let el = anchor;
  let best = null;
  for (let i = 0; i < 8 && el; i++) {
    const len = text(el).length;
    if (len >= 40 && len <= 2000) { best = el; break; }
    el = parentOf(el);
  }
  return best || parentOf(anchor) || anchor;
}

// Innermost result cards: <li> elements that contain a /in/ link and enough
// text to be a real result, excluding wrapper <li>s that nest other result
// <li>s. Each card yields ONE primary person (the first /in/ anchor with a
// clean name), so mutual-connection avatar links in the card are ignored.
function findResultCards(document) {
  const lis = Array.from(document.querySelectorAll('li'));
  return lis.filter((li) => {
    if (!li.querySelector('a[href*="/in/"]')) return false;
    if (text(li).length < 40) return false;
    const nested = li.querySelectorAll('li');
    for (const n of nested) if (n.querySelector('a[href*="/in/"]')) return false; // wrapper
    return true;
  });
}

function primaryPersonAnchor(card) {
  const anchors = card.querySelectorAll('a[href*="/in/"]');
  for (const a of anchors) if (bestName(a)) return a; // first anchor with a real name
  return anchors.length ? anchors[0] : null;
}

// Extract people preview rows from a search/list page without relying on class
// names. Prefers one primary person per result card; falls back to a per-link
// scan only when no card structure is found. Dedupes by /in/ slug. Puts the card
// text into preview_text so the selector can match role/company even when those
// can't be split into individual fields.
export function extractGenericPeople(document, base = 'https://www.linkedin.com') {
  const bySlug = new Map();

  const cards = findResultCards(document);
  for (const card of cards) {
    const anchor = primaryPersonAnchor(card);
    if (!anchor) continue;
    const href = attr(anchor, 'href');
    const slug = slugOf(href);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { href, name: bestName(anchor), preview: text(card) });
  }

  // Fallback: page without recognizable card <li>s — scan anchors directly, but
  // only keep those that resolve to a clean name (skips avatar/mutual links).
  if (bySlug.size === 0) {
    for (const anchor of document.querySelectorAll('a[href*="/in/"]')) {
      const href = attr(anchor, 'href');
      const slug = slugOf(href);
      if (!slug || bySlug.has(slug)) continue;
      const name = bestName(anchor);
      if (!name) continue;
      bySlug.set(slug, { href, name, preview: text(cardContainer(anchor)) });
    }
  }

  return Array.from(bySlug.values()).map((v) => ({
    profile_url: absoluteUrl(v.href, base),
    full_name: v.name || '',
    headline: '',
    current_company: '',
    location: '',
    preview_text: v.preview || ''
  }));
}
