// Selector maps for Recruiter Lite pages. Paid-product layout; adapters degrade
// with UnsupportedLayoutError when nothing matches.

export const RECRUITER = {
  resultContainers: [
    'li.profile-list__item',
    'div[data-test-paginated-list-item]',
    'li[data-testid="candidate-item"]'
  ],
  profileLink: [
    'a[href*="/talent/profile/"]',
    'a[href*="/hire/candidate/"]',
    'a[data-testid="candidate-link"]'
  ],
  standardProfileLink: [
    'a[href*="/in/"]'
  ],
  nameText: [
    'span[data-test-row-lockup-full-name]',
    '.candidate-name',
    '[data-testid="candidate-name"]'
  ],
  headline: [
    'span[data-test-row-lockup-headline]',
    '[data-testid="candidate-headline"]'
  ],
  location: [
    'span[data-test-row-lockup-location]',
    '[data-testid="candidate-location"]'
  ],
  nextPage: [
    'button[aria-label="Next"]',
    'a.pagination__next'
  ],
  scrollContainer: [
    '.profile-list',
    '#search-results'
  ]
};
