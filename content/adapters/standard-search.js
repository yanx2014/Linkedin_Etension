// Standard LinkedIn People-search adapter. Uses the DEDICATED card extractor
// (not the generic base-adapter algorithm) so it selects one primary person per
// card and rejects mutual-connection / avatar links. Exposes renderedSlugs for
// the orchestrator's pagination fingerprint.

import { detectBlocked, queryOne, isUsableNextControl } from '../selectors/common.js';
import { STANDARD } from '../selectors/standard.js';
import { extractStandardSearchCards, renderedSlugs } from '../extractors/standard-search-card-extractor.js';
import { BlockedStateError, UnsupportedLayoutError } from '../../utils/errors.js';

const ID = 'standard_search';
const LABEL = 'LinkedIn people search';

export default {
  id: ID,

  canHandle({ url }) {
    return /\/search\/results\/people/i.test(url || '');
  },

  detectSourceMetadata({ url }) {
    return { source_type: ID, source_url: url, source_search: LABEL };
  },

  detectBlockedState({ url, document }) {
    return detectBlocked({ url, document });
  },

  // Return the Next control only when it is actually usable.
  findNextPageControl({ document }) {
    const control = queryOne(document, STANDARD.nextPage || []);
    return isUsableNextControl(control) ? control : null;
  },

  scrollContainer({ document }) {
    return queryOne(document, STANDARD.scrollContainer || []);
  },

  // Canonical slugs currently rendered — used to fingerprint the page.
  renderedSlugs({ document }) {
    return renderedSlugs(document);
  },

  collectPreviewRows({ url, document, limit = 1000 }) {
    const blocked = detectBlocked({ url, document });
    if (blocked.blocked) throw new BlockedStateError(`blocked state on ${ID}`, blocked);
    const rows = extractStandardSearchCards(document, { sourceType: ID, label: LABEL }).slice(0, limit);
    if (rows.length === 0) {
      throw new UnsupportedLayoutError(`no people cards matched for ${ID}`, { id: ID });
    }
    return rows;
  },

  // Rows are already normalized by the extractor.
  normalizePreviewRow(raw) {
    return raw;
  }
};
