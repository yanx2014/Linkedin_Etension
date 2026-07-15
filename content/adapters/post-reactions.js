import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

// People who reacted to a post (reactions modal / page).
export default createListAdapter({
  id: 'post_reactions',
  label: 'Post reactions',
  urlTest: (url) => /(reactions|\/detail\/reactions)/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'li.social-details-reactors-tab-body-list-item',
      'div.artdeco-entity-lockup',
      '[data-testid="reactor-item"]'
    ],
    profileLink: ['a[href*="/in/"]'],
    nameText: ['.artdeco-entity-lockup__title span[aria-hidden="true"]', '.artdeco-entity-lockup__title', 'span[aria-hidden="true"]'],
    headline: ['.artdeco-entity-lockup__subtitle', '.entity-result__primary-subtitle'],
    nextPage: ['button[aria-label="Next"]'],
    scrollContainer: ['.artdeco-modal__content', '.scaffold-finite-scroll']
  }
});
