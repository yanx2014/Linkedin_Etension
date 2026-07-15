// Thin wrapper exposing preview extraction for a container element using a
// selector map. Adapters use base-adapter's internal extractor; this module
// provides the same logic as a reusable, testable unit.

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
