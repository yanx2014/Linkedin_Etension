// Company research orchestrator (website-first). Validates a supplied website or
// discovers the official site via search, fetches a bounded set of pages under
// SSRF + robots + size/timeout limits, and extracts company facts. Dependencies
// are injectable for testing.

import { safeFetch } from './safe-fetch.js';
import { extractHtml } from './html-extractor.js';
import { scoreCandidate } from './official-site-validator.js';
import { discoverPages } from './page-discovery.js';
import { buildCompanyFacts } from './company-facts.js';
import { parseRobots, isAllowed } from './robots.js';
import { rankCandidates } from '../search/candidate-ranker.js';
import { buildCompanyQuery } from '../search/search-provider.js';

const MAX_PAGES = 5;

export async function researchCompany(profile, deps = {}) {
  const fetchPage = deps.safeFetch || safeFetch;
  const searchProvider = deps.searchProvider || null;

  const companyName = profile.company || profile.current_company || null;
  const context = {
    companyName,
    companyLocation: profile.location || null,
    importedWebsiteFragment: profile.company_website || null,
    knownLinkedInVanity: vanityFrom(profile.company_linkedin_url)
  };

  const candidateUrls = [];
  if (profile.company_website) candidateUrls.push(ensureHttps(profile.company_website));

  // Discover via search when no confirmed import and a provider is configured.
  if (candidateUrls.length === 0 && searchProvider && companyName) {
    try {
      const results = await searchProvider.searchOfficialCompanyWebsite(buildCompanyQuery(context), context);
      const ranked = rankCandidates(results, context).slice(0, 4);
      candidateUrls.push(...ranked.map((c) => c.url));
    } catch { /* search failure -> unconfirmed */ }
  }

  // Validate candidates by fetching homepages.
  let confirmed = null;
  const rejected = [];
  for (const url of candidateUrls) {
    let homepage;
    try { homepage = await fetchPage(url); } catch (e) { rejected.push({ url, reason: e.message }); continue; }
    const extracted = extractHtml(homepage.body, homepage.url);
    const scored = scoreCandidate({ url: homepage.url, extracted, context });
    if (scored.accepted) { confirmed = { url: homepage.url, extracted, homepageBody: homepage.body, score: scored.score, evidence: scored.evidence }; break; }
    rejected.push({ url, score: scored.score, evidence: scored.evidence });
  }

  if (!confirmed) {
    return {
      name: companyName,
      website_status: candidateUrls.length ? 'unconfirmed' : 'absent',
      official_website: null,
      website_pages: [],
      facts: [],
      candidates_rejected: rejected
    };
  }

  // Robots for the confirmed origin.
  const origin = new URL(confirmed.url).origin;
  let robotsGroups = [];
  try {
    const robotsRes = await fetchPage(`${origin}/robots.txt`);
    robotsGroups = parseRobots(robotsRes.body);
  } catch { robotsGroups = []; }

  // Fetch prioritized pages.
  const pageUrls = discoverPages(confirmed.url, confirmed.extracted.links, MAX_PAGES);
  const pages = [];
  const retrievedAt = new Date().toISOString();
  for (const url of pageUrls) {
    const path = pathOf(url);
    if (!isAllowed(robotsGroups, path)) continue;
    let extracted;
    if (url === confirmed.url) {
      extracted = confirmed.extracted;
    } else {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetchPage(url);
        extracted = extractHtml(res.body, res.url);
      } catch { continue; }
    }
    pages.push({ url, title: extracted.title, description: extracted.description, headings: extracted.headings, paragraphs: extracted.paragraphs, text: extracted.text, jsonld: extracted.jsonld, retrieved_at: retrievedAt });
    if (pages.length >= MAX_PAGES) break;
  }

  const facts = buildCompanyFacts(pages);
  return {
    name: companyName,
    website_status: 'confirmed',
    official_website: confirmed.url,
    website_pages: pages,
    facts,
    validation_score: confirmed.score,
    validation_evidence: confirmed.evidence
  };
}

function ensureHttps(url) {
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:/i, 'https:');
  return `https://${s}`;
}
function vanityFrom(linkedinUrl) {
  if (!linkedinUrl) return null;
  const m = String(linkedinUrl).match(/company\/([^/?#]+)/i);
  return m ? m[1] : null;
}
function pathOf(url) { try { return new URL(url).pathname; } catch { return '/'; } }

export { MAX_PAGES };
