// Single standard profile adapter. Produces one preview row from a profile page
// so the same selection pipeline applies. Full detail is collected later by
// profile-extractor.js.

import { text, queryOne, detectBlocked } from '../selectors/common.js';
import { STANDARD } from '../selectors/standard.js';
import { UnsupportedLayoutError, BlockedStateError } from '../../utils/errors.js';

export function createProfileAdapter({ id, label, urlTest, selectors, canonicalFromUrl }) {
  return {
    id,
    canHandle({ url }) { return !!urlTest(url || ''); },
    detectSourceMetadata({ url }) { return { source_type: id, source_url: url, source_search: label }; },
    detectBlockedState({ url, document }) { return detectBlocked({ url, document }); },
    findNextPageControl() { return null; },
    scrollContainer({ document }) { return queryOne(document, selectors.scrollContainer || []); },

    collectPreviewRows({ url, document }) {
      const blocked = detectBlocked({ url, document });
      if (blocked.blocked) throw new BlockedStateError(`blocked state on ${id}`, blocked);

      const nameEl = queryOne(document, selectors.profileName || []);
      const standardLink = document.querySelector('a[href*="/in/"]');
      const canonical = canonicalFromUrl
        ? canonicalFromUrl(url, document, standardLink)
        : (standardLink ? standardLink.getAttribute('href') : url);

      if (!nameEl && !canonical) {
        throw new UnsupportedLayoutError(`profile layout not recognized for ${id}`, { id });
      }
      return [this.normalizePreviewRow({
        full_name: text(nameEl),
        headline: text(queryOne(document, selectors.profileHeadline || [])),
        location: text(queryOne(document, selectors.profileLocation || [])),
        profile_url_raw: canonical || url
      })];
    },

    normalizePreviewRow(raw) {
      return {
        source_type: id,
        source_record_id: raw.profile_url_raw || null,
        profile_url: raw.profile_url_raw,
        source_url: raw.profile_url_raw,
        source_search: label,
        full_name: raw.full_name || '',
        headline: raw.headline || '',
        current_company: raw.current_company || '',
        location: raw.location || ''
      };
    }
  };
}

export default createProfileAdapter({
  id: 'single_profile',
  label: 'Single LinkedIn profile',
  urlTest: (url) => /https:\/\/(www\.)?linkedin\.com\/in\//i.test(url),
  selectors: STANDARD,
  canonicalFromUrl: (url) => url
});
