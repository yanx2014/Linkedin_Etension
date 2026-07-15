// Deterministic official-website scoring. Given a fetched candidate page's
// extracted data and the company context, produce a score + evidence. Accept
// only when score >= 60 and no disqualifying condition applies.

import { normalizeText } from '../../selector/normalize.js';

const DISQUALIFYING_HOSTS = [
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'youtube.com', 'tiktok.com', 'crunchbase.com', 'glassdoor.com', 'indeed.com',
  'yelp.com', 'amazon.com', 'ebay.com', 'wikipedia.org', 'medium.com',
  'bloomberg.com', 'zoominfo.com', 'apollo.io', 'pitchbook.com', 'g2.com',
  'trustpilot.com', 'yellowpages.com', 'bbb.org'
];

const LEGAL_SUFFIXES = /\b(inc|incorporated|ltd|limited|llc|gmbh|sas|sa|s\.a|b\.v|bv|plc|co|corp|corporation)\b\.?/gi;

export function normalizeCompanyName(name) {
  return normalizeText(String(name || '').replace(LEGAL_SUFFIXES, ' ')).trim();
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function isDisqualifiedHost(url) {
  const host = hostOf(url);
  return DISQUALIFYING_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

// context: { companyName, companyLocation, importedWebsiteFragment, knownLinkedInVanity }
// extracted: output of extractHtml for the candidate's homepage
export function scoreCandidate({ url, extracted, context = {} }) {
  const evidence = [];
  let score = 0;
  const disqualified = isDisqualifiedHost(url);
  if (disqualified) { evidence.push({ rule: 'disqualified_host', points: -40 }); score -= 40; }

  const target = normalizeCompanyName(context.companyName);

  // +30 exact name in Organization JSON-LD
  const orgName = jsonldOrgName(extracted.jsonld);
  if (orgName) {
    const normOrg = normalizeCompanyName(orgName);
    if (target && normOrg === target) { score += 30; evidence.push({ rule: 'jsonld_name_exact', points: 30, value: orgName }); }
    else if (target && normOrg && normOrg !== target) { score -= 30; evidence.push({ rule: 'jsonld_name_conflict', points: -30, value: orgName }); }
  }

  // +20 name in title or primary heading
  const titleHay = normalizeText(`${extracted.title} ${extracted.ogSiteName} ${(extracted.headings || [])[0] || ''}`);
  if (target && titleHay.includes(target)) { score += 20; evidence.push({ rule: 'name_in_title_or_heading', points: 20 }); }

  // +20 LinkedIn company URL present in sameAs / footer links
  const sameAs = extracted.sameAs || [];
  const hasLinkedIn = sameAs.some((s) => /linkedin\.com\/company\//i.test(s)) ||
    (extracted.links || []).some((l) => /linkedin\.com\/company\//i.test(l.href));
  if (hasLinkedIn) {
    if (context.knownLinkedInVanity) {
      const match = sameAs.concat((extracted.links || []).map((l) => l.href)).some((s) => s.toLowerCase().includes(context.knownLinkedInVanity.toLowerCase()));
      if (match) { score += 20; evidence.push({ rule: 'linkedin_vanity_match', points: 20 }); }
      else { score += 20; evidence.push({ rule: 'linkedin_company_link_present', points: 20 }); }
    } else {
      score += 20; evidence.push({ rule: 'linkedin_company_link_present', points: 20 });
    }
  }

  // +15 domain agrees with imported website fragment
  if (context.importedWebsiteFragment) {
    const frag = String(context.importedWebsiteFragment).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (frag && hostOf(url).includes(frag)) { score += 15; evidence.push({ rule: 'domain_matches_import', points: 15 }); }
  }

  // +10 location agreement
  if (context.companyLocation) {
    const loc = normalizeText(context.companyLocation);
    const hay = normalizeText([extracted.text, ...(extracted.paragraphs || [])].join(' '));
    if (loc && loc.split(' ').some((tok) => tok.length > 2 && hay.includes(tok))) {
      score += 10; evidence.push({ rule: 'location_agreement', points: 10 });
    }
  }

  // +5 About/Company page present
  const hasAbout = (extracted.links || []).some((l) => /\/(about|company)/i.test(l.href) || /about|company/i.test(l.text));
  if (hasAbout) { score += 5; evidence.push({ rule: 'about_page_present', points: 5 }); }

  const accepted = score >= 60 && !disqualified;
  return { url, score, accepted, disqualified, evidence };
}

function jsonldOrgName(jsonld) {
  for (const item of jsonld || []) {
    const types = [].concat(item['@type'] || []);
    if (types.map(String).some((t) => /organization|corporation|localbusiness/i.test(t)) && item.name) return item.name;
  }
  // fall back to any top-level name
  for (const item of jsonld || []) if (item && item.name) return item.name;
  return null;
}
