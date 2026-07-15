// Deterministic professional-interest extraction from person posts and explicit
// profile text. A topic is accepted only when it appears in at least two
// separate posts, or the person explicitly labels it as a focus/interest.

import { normalizeText } from '../selector/normalize.js';
import { tokenize } from '../selector/tokenize.js';

const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'is', 'are', 'was', 'were', 'be', 'our', 'we', 'us', 'their', 'this',
  'that', 'as', 'from', 'it', 'its', 'i', 'my', 'your', 'you', 'they', 'how',
  'what', 'why', 'when', 'about', 'more', 'new', 'just', 'very', 'really', 'so',
  'can', 'will', 'would', 'should', 'could', 'has', 'have', 'had', 'do', 'does',
  'not', 'but', 'if', 'than', 'then', 'them', 'these', 'those', 'here', 'there',
  // French
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'et', 'à',
  'en', 'dans', 'pour', 'sur', 'par', 'avec', 'sans', 'sous', 'ce', 'cet',
  'cette', 'ces', 'cest', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa',
  'ses', 'nos', 'vos', 'leur', 'leurs', 'je', 'tu', 'il', 'elle', 'ils',
  'elles', 'nous', 'vous', 'est', 'sont', 'être', 'avoir', 'plus', 'moins',
  'tres', 'trop', 'bien', 'mais', 'ou', 'donc', 'ni', 'car', 'que', 'qui',
  'quoi', 'dont', 'quand', 'comme', 'si', 'ne', 'pas', 'rien', 'tout', 'tous',
  'toute', 'toutes', 'jai', 'nom', 'chez', 'vers', 'entre', 'depuis', 'aussi',
  'meme', 'fait', 'faire', 'etre', 'ete', 'cela', 'ceux', 'notre', 'votre'
]);

const FOCUS_MARKERS = ['focus on', 'focused on', 'passionate about', 'specialise in', 'specialize in', 'interested in', 'my area of work', 'i work on', 'expertise in'];

// Extract up to `max` interest phrases with supporting post ids.
export function extractInterests(posts, options = {}) {
  const max = options.max ?? 5;
  const list = Array.isArray(posts) ? posts.slice(0, 7) : [];
  if (list.length === 0) return [];

  // Count 1-3 token phrases per post (unique per post).
  const phraseCounts = new Map(); // phrase -> Set(postIndex)
  const explicit = new Map(); // phrase -> Set(postIndex) from focus markers

  list.forEach((post, idx) => {
    const norm = normalizeText(post.text);
    const tokens = tokenize(post.text).filter((t) => !STOPWORDS.has(t) && t.length >= 3);
    const seen = new Set();
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        if (!phraseCounts.has(phrase)) phraseCounts.set(phrase, new Set());
        phraseCounts.get(phrase).add(idx);
      }
    }
    // Explicit focus markers.
    for (const marker of FOCUS_MARKERS) {
      const at = norm.indexOf(marker);
      if (at >= 0) {
        const after = norm.slice(at + marker.length).trim().split(/[.!?,\n]/)[0];
        const focusPhrase = tokenize(after).filter((t) => !STOPWORDS.has(t)).slice(0, 3).join(' ');
        if (focusPhrase) {
          if (!explicit.has(focusPhrase)) explicit.set(focusPhrase, new Set());
          explicit.get(focusPhrase).add(idx);
        }
      }
    }
  });

  const results = [];
  const used = new Set();

  // Explicit focus phrases first.
  for (const [phrase, idxSet] of explicit) {
    if (used.has(phrase)) continue;
    used.add(phrase);
    results.push({ topic: phrase, postIndexes: Array.from(idxSet), reason: 'explicit_focus' });
    if (results.length >= max) return results;
  }

  // Phrases appearing in >= 2 distinct posts, longest/most-frequent first.
  const multi = Array.from(phraseCounts.entries())
    .filter(([phrase, idxSet]) => idxSet.size >= 2 && !used.has(phrase))
    .sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length);

  for (const [phrase, idxSet] of multi) {
    // Skip phrases fully contained in an already-selected longer phrase.
    if (results.some((r) => r.topic.includes(phrase))) continue;
    results.push({ topic: phrase, postIndexes: Array.from(idxSet), reason: 'multi_post' });
    used.add(phrase);
    if (results.length >= max) break;
  }

  return results.slice(0, max);
}
