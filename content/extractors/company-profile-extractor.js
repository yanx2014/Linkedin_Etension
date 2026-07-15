// Extract visible LinkedIn company-profile fields (fallback when no official
// website is confirmed). Returns { name, website, location, industry, tagline,
// profile_fields }.

import { text, attr, queryOne } from '../selectors/common.js';

const SEL = {
  name: ['.org-top-card-summary__title', 'h1[data-testid="org-name"]', 'main h1'],
  tagline: ['.org-top-card-summary__tagline', '[data-testid="org-tagline"]'],
  website: ['a.org-top-card-primary-actions__action[href^="http"]', 'a[data-testid="org-website"]', 'dd[data-testid="org-website"] a'],
  location: ['dd[data-testid="org-location"]', '.org-top-card-summary-info-list__info-item'],
  industry: ['dd[data-testid="org-industry"]']
};

export function extractCompanyProfile({ url, document } = {}) {
  const name = text(queryOne(document, SEL.name));
  const tagline = text(queryOne(document, SEL.tagline));
  const websiteEl = queryOne(document, SEL.website);
  const website = websiteEl ? (attr(websiteEl, 'href') || text(websiteEl)) : '';
  const location = text(queryOne(document, SEL.location));
  const industry = text(queryOne(document, SEL.industry));

  const profile_fields = [];
  const push = (field, value) => { if (value) profile_fields.push({ field, value, source_url: url || null, source_type: 'linkedin_company_profile' }); };
  push('name', name);
  push('tagline', tagline);
  push('website', website);
  push('location', location);
  push('industry', industry);

  return { name, tagline, website, location, industry, profile_fields };
}
