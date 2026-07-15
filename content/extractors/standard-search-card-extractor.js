// Dedicated extractor for LinkedIn standard People-search result cards.
//
// Unlike the generic base adapter (which grabs the first /in/ link + first
// hidden span per container and can pick a mutual connection), this selects
// exactly ONE primary person per semantic result card and rejects
// mutual-connection / avatar / UI-control links. Grouping is by semantic
// structure (li / [role=listitem] / bounded ancestor), not by class names.

import { text, attr, absoluteUrl, queryOne } from '../selectors/common.js';
import { canonicalizeProfileUrl } from '../../selector/canonicalize.js';

const DEGREE_RE = /\s*[·•]\s*(1er|1st|2e|2nd|3e|3rd|3e\+|3rd\+)\b.*$/i;
const MUTUAL_RE = /(en commun|relations? en commun|mutual connection|shared connection|connexions? en commun)/i;
const UI_LABELS = new Set([
  'se connecter', 'connect', 'message', 'suivre', 'follow', 'plus', 'more',
  'voir le profil', 'view profile', 'en savoir plus', 'learn more', 'suivant',
  'next', 's’abonner', "s'abonner", 'accepter', 'accept', 'ignorer', 'ignore'
]);

// Fallback subtitle/location selectors (used only when deterministically
// identifiable; otherwise fields stay empty and preview_text carries the text).
const SEL = {
  headline: ['.entity-result__primary-subtitle', '.subline-level-1', '[data-testid="prospect-headline"]'],
  location: ['.entity-result__secondary-subtitle', '.subline-level-2', '[data-testid="prospect-location"]']
};

function parentOf(el) { return el.parentElement || el.parent || null; }

// Nearest semantic result card for a link.
function cardOf(link) {
  const li = link.closest && link.closest('li');
  if (li) return li;
  const listitem = link.closest && link.closest('[role="listitem"]');
  if (listitem) return listitem;
  // Bounded ancestor with enough text to be a card.
  let el = link;
  for (let i = 0; i < 6 && el; i++) {
    if (text(el).length >= 40) return el;
    el = parentOf(el);
  }
  return parentOf(link) || link;
}

// Canonical /in/ slug (query/fragment stripped) or null.
function canonicalOf(href) {
  const abs = absoluteUrl(href, 'https://www.linkedin.com');
  if (!abs) return null;
  const r = canonicalizeProfileUrl(abs);
  return r.ok ? r.canonical : null;
}
function slugOf(canonical) {
  const m = canonical && canonical.match(/\/in\/([^/]+)$/);
  return m ? m[1] : null;
}

function cleanName(raw) {
  let n = String(raw || '').replace(/\s+/g, ' ').trim();
  n = n.replace(DEGREE_RE, '').trim();
  if (!n) return '';
  if (UI_LABELS.has(n.toLowerCase())) return '';
  if (n.length > 70) return ''; // effectively whole-card text — not a name
  return n;
}

function nameFromAriaLabel(link) {
  const label = attr(link, 'aria-label');
  if (!label) return '';
  const n = label
    .replace(/^voir le profil de\s+/i, '')
    .replace(/^view\s+/i, '')
    .replace(/[’']s profile$/i, '')
    .replace(/\s+profile$/i, '');
  return cleanName(n);
}

// Best name for a candidate link: name span -> aria-label -> link text.
function nameOf(link) {
  const span = link.querySelector('span[aria-hidden="true"]');
  const fromSpan = cleanName(span ? text(span) : '');
  if (fromSpan) return fromSpan;
  const fromLabel = nameFromAriaLabel(link);
  if (fromLabel) return fromLabel;
  return cleanName(text(link));
}

// Is this link an image-only avatar with no usable text/label?
function isImageOnlyLink(link) {
  const hasImg = !!(link.querySelector && link.querySelector('img'));
  const hasText = !!cleanName(text(link));
  const hasLabel = !!nameFromAriaLabel(link);
  return hasImg && !hasText && !hasLabel;
}

// A dedicated mutual/shared-connections container: its text names the mutual
// relationship AND none of its /in/ links carry a real name (they are avatars).
// This avoids misfiring when the primary name link merely has a sibling mutual
// widget under a shared ancestor (whose combined text would include "en commun").
function isMutualContainer(el) {
  if (!MUTUAL_RE.test(text(el))) return false;
  const links = el.querySelectorAll ? el.querySelectorAll('a[href*="/in/"]') : [];
  for (const l of links) {
    const span = l.querySelector && l.querySelector('span[aria-hidden="true"]');
    if (cleanName(span ? text(span) : '') || nameFromAriaLabel(l)) return false; // has a named link -> not a pure mutual widget
  }
  return true;
}

// Is this link inside a mutual/shared-connections subtree within its card?
function isInMutualSection(link, card) {
  let el = parentOf(link);
  while (el && el !== card) {
    if (isMutualContainer(el)) return true;
    el = parentOf(el);
  }
  return false;
}

// Select the primary person's link for a card, or null.
function primaryLink(card, links) {
  const usable = links.filter((l) => !isImageOnlyLink(l) && !isInMutualSection(l, card) && cleanName(text(l)) !== undefined);
  // Prefer a link that yields a real name (name span or aria-label or text).
  const named = usable.filter((l) => nameOf(l));
  const pool = named.length ? named : usable;
  return pool.length ? pool[0] : null;
}

// Extract one row per result card. Deduped by canonical slug.
export function extractStandardSearchCards(document, { base = 'https://www.linkedin.com', sourceType = 'standard_search', label = 'LinkedIn people search' } = {}) {
  const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]'));

  // Group anchors by their card element.
  const cards = new Map(); // cardEl -> { card, links: [] }
  for (const a of anchors) {
    if (!canonicalOf(attr(a, 'href'))) continue; // skip non-canonicalizable early
    const card = cardOf(a);
    if (!cards.has(card)) cards.set(card, { card, links: [] });
    cards.get(card).links.push(a);
  }

  const bySlug = new Map();
  for (const { card, links } of cards.values()) {
    const link = primaryLink(card, links);
    if (!link) continue;
    const canonical = canonicalOf(attr(link, 'href'));
    if (!canonical) continue;
    const slug = slugOf(canonical);
    if (!slug || bySlug.has(slug)) continue; // dedupe by slug immediately

    bySlug.set(slug, {
      source_type: sourceType,
      source_record_id: slug,
      profile_url: canonical, // no query/fragment
      source_url: canonical,
      source_search: label,
      full_name: nameOf(link),
      headline: text(queryOne(card, SEL.headline)) || '',
      current_company: '',
      location: text(queryOne(card, SEL.location)) || '',
      preview_text: text(card)
    });
  }

  return Array.from(bySlug.values());
}

// Sorted canonical slugs currently rendered — the pagination fingerprint input.
export function renderedSlugs(document) {
  const slugs = new Set();
  for (const a of document.querySelectorAll('a[href*="/in/"]')) {
    const c = canonicalOf(attr(a, 'href'));
    const s = slugOf(c);
    if (s) slugs.add(s);
  }
  return Array.from(slugs);
}
