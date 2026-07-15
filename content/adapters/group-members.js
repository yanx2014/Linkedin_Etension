import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

export default createListAdapter({
  id: 'group_members',
  label: 'Group members',
  urlTest: (url) => /\/groups\/\d+\/members/i.test(url) || /\/groups\/.*\/members/i.test(url),
  selectors: {
    ...STANDARD,
    resultContainers: [
      'li.groups-members-list__member-item',
      'div.artdeco-entity-lockup',
      '[data-testid="group-member-item"]'
    ],
    profileLink: ['a[href*="/in/"]'],
    nameText: ['.artdeco-entity-lockup__title span[aria-hidden="true"]', 'span[aria-hidden="true"]'],
    headline: ['.artdeco-entity-lockup__subtitle', '.entity-result__primary-subtitle'],
    scrollContainer: ['.groups-members-list', '.scaffold-finite-scroll']
  }
});
