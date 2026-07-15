import { createProfileAdapter } from './single-profile.js';
import { SALES } from '../selectors/sales-navigator.js';

// Single Sales Navigator lead. Attempts to discover the standard /in/ URL from
// the rendered page so a canonical identity can be assigned later.
export default createProfileAdapter({
  id: 'sales_profile',
  label: 'Sales Navigator lead',
  urlTest: (url) => /\/sales\/(lead|people)\//i.test(url),
  selectors: {
    profileName: ['span[data-anonymize="person-name"]', 'h1[data-test-lead-name]', 'main h1'],
    profileHeadline: ['span[data-anonymize="title"]', '[data-testid="lead-title"]'],
    profileLocation: ['span[data-anonymize="location"]', '[data-testid="lead-location"]'],
    scrollContainer: SALES.scrollContainer
  },
  canonicalFromUrl: (url, document, standardLink) => (standardLink ? standardLink.getAttribute('href') : url)
});
