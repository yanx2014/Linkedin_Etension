import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

export default createListAdapter({
  id: 'connections',
  label: 'First-degree connections',
  urlTest: (url) => /\/mynetwork\/(invite-connect\/)?connections/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'li.mn-connection-card',
      'div.entity-result',
      '[data-view-name="connection-card"]',
      'li[data-testid="connection-item"]'
    ],
    nameText: ['.mn-connection-card__name', 'span[aria-hidden="true"]', '[data-testid="prospect-name"]'],
    headline: ['.mn-connection-card__occupation', '.entity-result__primary-subtitle', '[data-testid="prospect-headline"]']
  }
});
