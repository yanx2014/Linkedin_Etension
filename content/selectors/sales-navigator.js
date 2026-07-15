// Selector maps for Sales Navigator pages. These layouts are behind a paid
// product and change frequently; adapters degrade with UnsupportedLayoutError
// when no selector matches.

export const SALES = {
  resultContainers: [
    'li.artdeco-list__item.search-results__result-item',
    'div[data-x-search-result]',
    'li[data-testid="lead-item"]'
  ],
  profileLink: [
    'a[href*="/sales/lead/"]',
    'a[href*="/sales/people/"]',
    'a[data-testid="lead-link"]'
  ],
  standardProfileLink: [
    'a[href*="/in/"]'
  ],
  nameText: [
    'span[data-anonymize="person-name"]',
    '.result-lockup__name',
    '[data-testid="lead-name"]'
  ],
  headline: [
    'span[data-anonymize="title"]',
    '.result-lockup__highlight-keyword',
    '[data-testid="lead-title"]'
  ],
  company: [
    'span[data-anonymize="company-name"]',
    '[data-testid="lead-company"]'
  ],
  location: [
    'span[data-anonymize="location"]',
    '[data-testid="lead-location"]'
  ],
  nextPage: [
    'button.artdeco-pagination__button--next',
    'button[aria-label="Next"]'
  ],
  scrollContainer: [
    '#search-results-container',
    '.search-results__container'
  ]
};
