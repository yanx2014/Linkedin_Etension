import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

// Feed authors: collect the authors of posts currently rendered in the feed.
export default createListAdapter({
  id: 'feed',
  label: 'LinkedIn feed authors',
  urlTest: (url) => /linkedin\.com\/feed\/?($|\?)/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'div.feed-shared-update-v2',
      '[data-testid="post-item"]',
      'div[data-urn*="activity"]'
    ],
    profileLink: ['a.update-components-actor__meta-link[href*="/in/"]', 'a[href*="/in/"]'],
    nameText: ['.update-components-actor__name span[aria-hidden="true"]', '.update-components-actor__name', 'span[aria-hidden="true"]'],
    headline: ['.update-components-actor__description', '.entity-result__primary-subtitle'],
    nextPage: [],
    scrollContainer: ['main', '.scaffold-finite-scroll']
  }
});
