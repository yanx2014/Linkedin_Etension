import { createListAdapter } from './base-adapter.js';
import { RECRUITER } from '../selectors/recruiter-lite.js';

export default createListAdapter({
  id: 'recruiter_search',
  label: 'Recruiter Lite search',
  urlTest: (url) => /\/talent\/search/i.test(url),
  sourceSpecific: true,
  selectors: RECRUITER
});
