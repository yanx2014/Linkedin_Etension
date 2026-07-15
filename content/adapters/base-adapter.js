// Base list-adapter factory. Most import sources are "lists of people cards";
// they share this scraping skeleton and differ only by URL test and selector
// map. Single-profile adapters are built separately.
//
// Every adapter fails independently: collectPreviewRows throws
// UnsupportedLayoutError when no container selector matches, and detects blocked
// states before extracting.

import { text, attr, absoluteUrl, firstMatching, queryOne, detectBlocked } from '../selectors/common.js';
import { extractGenericPeople } from '../extractors/preview-extractor.js';
import { UnsupportedLayoutError, BlockedStateError } from '../../utils/errors.js';

// config: { id, label, urlTest(url), selectors, sourceSpecific }
export function createListAdapter(config) {
  const { id, label, urlTest, selectors, sourceSpecific = false } = config;

  return {
    id,

    canHandle({ url }) {
      return !!urlTest(url || '');
    },

    detectSourceMetadata({ url }) {
      return { source_type: id, source_url: url, source_search: label || id };
    },

    detectBlockedState({ url, document }) {
      return detectBlocked({ url, document });
    },

    findNextPageControl({ document }) {
      return queryOne(document, selectors.nextPage || []);
    },

    scrollContainer({ document }) {
      return queryOne(document, selectors.scrollContainer || []);
    },

    collectPreviewRows({ url, document, limit = 1000 }) {
      const blocked = detectBlocked({ url, document });
      if (blocked.blocked) {
        throw new BlockedStateError(`blocked state on ${id}`, blocked);
      }
      const { nodes } = firstMatching(document, selectors.resultContainers || []);
      let rows = [];
      if (nodes && nodes.length > 0) {
        for (const container of nodes) {
          if (rows.length >= limit) break;
          const raw = extractRow(container, selectors);
          if (raw.profile_url_raw) rows.push(this.normalizePreviewRow(raw));
        }
      }

      // Fallback: class-name-independent extraction by /in/ links. Used when the
      // known selectors don't match LinkedIn's current markup. Only applies to
      // standard /in/ pages (not Sales Navigator / Recruiter source URLs).
      if (rows.length === 0 && !sourceSpecific) {
        const generic = extractGenericPeople(document);
        rows = generic.slice(0, limit).map((g) => ({
          source_type: id,
          source_record_id: g.profile_url,
          profile_url: g.profile_url,
          source_url: g.profile_url,
          source_search: label || id,
          full_name: g.full_name,
          headline: g.headline || '',
          current_company: g.current_company || '',
          location: g.location || '',
          preview_text: g.preview_text || '',
          source_specific: false
        }));
      }

      if (rows.length === 0) {
        throw new UnsupportedLayoutError(`no result containers matched for ${id}`, { id });
      }
      return rows;
    },

    normalizePreviewRow(raw) {
      const abs = absoluteUrl(raw.profile_url_raw, 'https://www.linkedin.com');
      return {
        source_type: id,
        source_record_id: deriveRecordId(abs),
        profile_url: abs,
        source_url: abs,
        source_search: label || id,
        full_name: raw.full_name || '',
        headline: raw.headline || '',
        current_company: raw.current_company || '',
        location: raw.location || '',
        source_specific: sourceSpecific
      };
    }
  };
}

function extractRow(container, selectors) {
  const link =
    queryOne(container, selectors.profileLink || []) ||
    queryOne(container, selectors.standardProfileLink || []);
  const href = attr(link, 'href');
  const name =
    text(queryOne(container, selectors.nameText || [])) ||
    (link ? text(link) : '');
  const headline = text(queryOne(container, selectors.headline || []));
  const location = text(queryOne(container, selectors.location || []));
  const company = selectors.company ? text(queryOne(container, selectors.company)) : '';
  return { profile_url_raw: href, full_name: name, headline, current_company: company, location };
}

function deriveRecordId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return url;
  }
}
