import { createListAdapter } from './base-adapter.js';
import { RECRUITER } from '../selectors/recruiter-lite.js';

export default createListAdapter({
  id: 'recruiter_project',
  label: 'Recruiter Lite project',
  urlTest: (url) => /\/talent\/(hire|projects?)\//i.test(url) || /\/talent\/.*\/pipeline/i.test(url),
  sourceSpecific: true,
  selectors: {
    ...RECRUITER,
    resultContainers: [
      'li.profile-list__item',
      'div[data-test-paginated-list-item]',
      'li[data-testid="pipeline-candidate"]'
    ]
  }
});
