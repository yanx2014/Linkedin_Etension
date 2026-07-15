// Selector maps for standard LinkedIn pages (search, connections, profile,
// feed, post reactions/comments, groups, events). Each entry lists multiple
// fallbacks; adapters use the first that matches. Layout changes are expected —
// see README "Selector maintenance guide".

export const STANDARD = {
  resultContainers: [
    'li.reusable-search__result-container',
    'div.entity-result',
    '[data-view-name="search-entity-result"]',
    'li.search-result',
    'li[data-testid="prospect-card"]'
  ],
  profileLink: [
    'a.app-aware-link[href*="/in/"]',
    'a[href*="/in/"]'
  ],
  nameText: [
    'span[aria-hidden="true"]',
    '.entity-result__title-text',
    '.actor-name',
    '[data-testid="prospect-name"]'
  ],
  headline: [
    '.entity-result__primary-subtitle',
    '.subline-level-1',
    '[data-testid="prospect-headline"]'
  ],
  location: [
    '.entity-result__secondary-subtitle',
    '.subline-level-2',
    '[data-testid="prospect-location"]'
  ],
  nextPage: [
    'button[aria-label="Next"]',
    'button.artdeco-pagination__button--next',
    'a[rel="next"]'
  ],
  scrollContainer: [
    'main',
    '.scaffold-finite-scroll',
    '[data-testid="results-container"]'
  ],
  // Single profile page
  profileName: [
    'h1.text-heading-xlarge',
    'h1[data-testid="profile-name"]',
    'main h1'
  ],
  profileHeadline: [
    '.text-body-medium.break-words',
    '[data-testid="profile-headline"]'
  ],
  profileLocation: [
    '.text-body-small.inline.t-black--light',
    '[data-testid="profile-location"]'
  ],
  profileAbout: [
    'section[data-testid="about"] .display-full',
    '#about ~ * .inline-show-more-text',
    '[data-testid="about-text"]'
  ],
  experienceItems: [
    'section[data-testid="experience"] li',
    '#experience ~ * li.artdeco-list__item',
    '[data-testid="experience-item"]'
  ],
  activityLink: [
    'a[href*="/recent-activity/"]',
    'a[data-testid="activity-link"]'
  ],
  postItems: [
    '[data-testid="post-item"]',
    'div.feed-shared-update-v2',
    'li.profile-creator-shared-feed-update__container'
  ],
  postText: [
    '[data-testid="post-text"]',
    '.feed-shared-update-v2__description',
    '.update-components-text'
  ],
  companyLink: [
    'a[href*="/company/"]'
  ]
};
