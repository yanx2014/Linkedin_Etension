// Extract up to seven recent company-authored posts from a company activity
// page. Used as a distinctly-labelled fallback when the official website has no
// usable activity feed.

import { text, attr, queryOne, firstMatching } from '../selectors/common.js';
import { STANDARD } from '../selectors/standard.js';

const MAX_POSTS = 7;

export function extractCompanyActivity({ document } = {}) {
  const { nodes } = firstMatching(document, STANDARD.postItems);
  const posts = [];
  for (const item of nodes) {
    if (posts.length >= MAX_POSTS) break;
    const body = text(queryOne(item, STANDARD.postText));
    if (!body) continue;
    const dateEl = queryOne(item, ['.post-date', 'time']);
    posts.push({
      id: attr(item, 'data-urn') || null,
      text: body,
      created_at: null,
      date_label: text(dateEl) || null,
      source_url: null,
      author_type: 'organization'
    });
  }
  return posts.slice(0, MAX_POSTS);
}

export { MAX_POSTS };
