// Extract up to seven recent person-authored posts from an activity page.
// Reposts without visible commentary are excluded. Relative date labels are
// preserved but not converted into exact dates.

import { text, attr, queryOne, firstMatching } from '../selectors/common.js';
import { STANDARD } from '../selectors/standard.js';

const MAX_POSTS = 7;

const SEL = {
  repostMarker: ['.update-components-header--with-control-menu', '.feed-shared-reshared-update'],
  postLink: ['a[data-testid="post-link"]', 'a[href*="/feed/update/"]', 'a[href*="/posts/"]'],
  dateLabel: ['.post-date', '.update-components-actor__sub-description', 'time']
};

export function extractActivity({ document, authorName } = {}) {
  const { nodes } = firstMatching(document, STANDARD.postItems);
  const posts = [];
  for (const item of nodes) {
    if (posts.length >= MAX_POSTS) break;
    const bodyEl = queryOne(item, STANDARD.postText);
    const body = text(bodyEl);
    if (!body) continue;

    // Exclude reposts without commentary: if the item is a reshare and the
    // commentary body is empty, skip. Here `body` is the commentary; a pure
    // repost with no commentary would have no post-text, already skipped above.
    const isRepost = !!queryOne(item, SEL.repostMarker);
    if (isRepost && /^repost/i.test(body)) continue;

    const link = queryOne(item, SEL.postLink);
    const dateEl = queryOne(item, SEL.dateLabel);
    posts.push({
      id: attr(item, 'data-urn') || null,
      text: body,
      created_at: null, // relative labels are not converted to exact dates
      date_label: text(dateEl) || null,
      source_url: link ? attr(link, 'href') : null,
      author_type: 'person'
    });
  }
  return posts.slice(0, MAX_POSTS);
}

export { MAX_POSTS };
