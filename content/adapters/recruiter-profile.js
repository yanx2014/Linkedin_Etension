import { createProfileAdapter } from './single-profile.js';
import { RECRUITER } from '../selectors/recruiter-lite.js';

export default createProfileAdapter({
  id: 'recruiter_profile',
  label: 'Recruiter Lite candidate',
  urlTest: (url) => /\/talent\/profile\//i.test(url) || /\/hire\/candidate\//i.test(url),
  selectors: {
    profileName: ['span[data-test-row-lockup-full-name]', 'h1[data-test-candidate-name]', 'main h1'],
    profileHeadline: ['span[data-test-row-lockup-headline]', '[data-testid="candidate-headline"]'],
    profileLocation: ['span[data-test-row-lockup-location]', '[data-testid="candidate-location"]'],
    scrollContainer: RECRUITER.scrollContainer
  },
  canonicalFromUrl: (url, document, standardLink) => (standardLink ? standardLink.getAttribute('href') : url)
});
