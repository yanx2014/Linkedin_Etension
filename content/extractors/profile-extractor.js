// Extract a full collected-profile record from a rendered standard profile page.
// Only explicitly visible fields are read. First/last name are NOT inferred by
// splitting the full name.

import { text, attr, queryOne, firstMatching, detectBlocked } from '../selectors/common.js';
import { STANDARD } from '../selectors/standard.js';
import { extractExperienceItem } from './experience-extractor.js';
import { BlockedStateError } from '../../utils/errors.js';

export function extractProfile({ url, document, collectedAt } = {}) {
  const blocked = detectBlocked({ url, document });
  if (blocked.blocked) throw new BlockedStateError('blocked state on profile page', blocked);

  const warnings = [];
  const full_name = text(queryOne(document, STANDARD.profileName));
  const headline = text(queryOne(document, STANDARD.profileHeadline));
  const location = text(queryOne(document, STANDARD.profileLocation));
  const summary = text(queryOne(document, STANDARD.profileAbout));

  const experience = [];
  const { nodes } = firstMatching(document, STANDARD.experienceItems);
  for (const item of nodes) {
    const parsed = extractExperienceItem(item);
    if (parsed.title || parsed.company) experience.push(parsed);
  }

  const current = experience.find((e) => e.is_current === true) || experience[0] || null;
  const companyLink = queryOne(document, STANDARD.companyLink);
  const activityLink = queryOne(document, STANDARD.activityLink);

  if (!full_name) warnings.push('missing_name');

  return {
    full_name: full_name || '',
    first_name: '',
    last_name: '',
    headline: headline || '',
    role: current ? current.title : '',
    company: current ? current.company : '',
    current_company: current ? current.company : '',
    location: location || '',
    summary: summary || '',
    profile_url: url || null,
    experience,
    responsibilities: [],
    posts: [],
    company_website: '',
    company_linkedin_url: (current && current.company_linkedin_url) || (companyLink ? attr(companyLink, 'href') : ''),
    activity_url: activityLink ? attr(activityLink, 'href') : null,
    collected_at: collectedAt || null,
    extraction_warnings: warnings
  };
}
