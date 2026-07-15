// Rank search results into candidate company domains. Disqualified hosts
// (social/directory/marketplace/job boards) are dropped. Preliminary scoring
// uses name overlap in title/description; the official-site-validator makes the
// final decision after fetching.

import { normalizeCompanyName, isDisqualifiedHost } from '../website/official-site-validator.js';
import { normalizeText } from '../../selector/normalize.js';

export function rankCandidates(results, context = {}) {
  const target = normalizeCompanyName(context.companyName);
  const targetTokens = target ? target.split(' ').filter((t) => t.length > 1) : [];
  const seenHosts = new Set();
  const candidates = [];

  for (const r of results || []) {
    if (!r.url || isDisqualifiedHost(r.url)) continue;
    const host = hostOf(r.url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);

    const hay = normalizeText(`${r.title} ${r.description}`);
    let score = 0;
    if (target && hay.includes(target)) score += 20;
    const tokenHits = targetTokens.filter((t) => hay.includes(t)).length;
    score += Math.min(15, tokenHits * 5);
    // Domain contains a company token.
    if (targetTokens.some((t) => host.includes(t))) score += 15;
    candidates.push({ url: r.url, host, title: r.title, preliminaryScore: score });
  }

  return candidates.sort((a, b) => b.preliminaryScore - a.preliminaryScore);
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
