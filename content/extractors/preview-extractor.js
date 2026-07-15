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

// Best-effort visible name for a profile anchor. LinkedIn renders the name in a
// span[aria-hidden="true"] alongside a visually-hidden duplicate, so prefer the
// aria-hidden span; otherwise de-duplicate doubled anchor text.
function bestName(anchor) {
  const span = anchor.querySelector('span[aria-hidden="true"]');
  const spanText = span ? text(span) : '';
  if (spanText) return spanText;
  const t = text(anchor);
  if (!t) return '';
  // "NameName" -> "Name"
  const half = Math.floor(t.length / 2);
  if (t.length % 2 === 0 && t.slice(0, half) === t.slice(half)) return t.slice(0, half).trim();
  // "Name\n Voir le profil de Name" -> take the first line
  return t.split('\n')[0].trim();
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

// Extract people preview rows from a search/list page without relying on class
// names. Dedupes by /in/ slug. Puts the full card text into preview_text so the
// selector can match role/company/headline even when they can't be split into
// individual fields.
export function extractGenericPeople(document, base = 'https://www.linkedin.com') {
  const anchors = document.querySelectorAll('a[href*="/in/"]');
  const bySlug = new Map();

  for (const anchor of anchors) {
    const href = attr(anchor, 'href');
    const slug = slugOf(href);
    if (!slug) continue;
    const name = bestName(anchor);
    const existing = bySlug.get(slug);
    if (!existing) {
      bySlug.set(slug, { href, name, anchor });
    } else if (!existing.name && name) {
      bySlug.set(slug, { href, name, anchor });
    }
  }

  const rows = [];
  for (const { href, name, anchor } of bySlug.values()) {
    const card = cardContainer(anchor);
    const previewText = card ? text(card) : '';
    rows.push({
      profile_url: absoluteUrl(href, base),
      full_name: name || '',
      headline: '',
      current_company: '',
      location: '',
      preview_text: previewText
    });
  }
  return rows;
}
