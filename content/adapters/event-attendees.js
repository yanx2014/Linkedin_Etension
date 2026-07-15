import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

export default createListAdapter({
  id: 'event_attendees',
  label: 'Event attendees',
  urlTest: (url) => /\/events\/[^/]+\/(comments|attendees)?/i.test(url) && /events/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'li.event-attendee',
      'div.artdeco-entity-lockup',
      '[data-testid="attendee-item"]'
    ],
    profileLink: ['a[href*="/in/"]'],
    nameText: ['.artdeco-entity-lockup__title span[aria-hidden="true"]', 'span[aria-hidden="true"]'],
    headline: ['.artdeco-entity-lockup__subtitle', '.entity-result__primary-subtitle'],
    scrollContainer: ['.scaffold-finite-scroll', 'main']
  }
});
