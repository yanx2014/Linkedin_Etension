import { createListAdapter } from './base-adapter.js';
import { SALES } from '../selectors/sales-navigator.js';

export default createListAdapter({
  id: 'sales_saved_search',
  label: 'Sales Navigator saved search',
  urlTest: (url) => /\/sales\/search\/people/i.test(url) && /savedSearchId/i.test(url),
  sourceSpecific: true,
  selectors: SALES
});
