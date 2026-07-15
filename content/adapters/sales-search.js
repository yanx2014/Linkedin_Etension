import { createListAdapter } from './base-adapter.js';
import { SALES } from '../selectors/sales-navigator.js';

export default createListAdapter({
  id: 'sales_search',
  label: 'Sales Navigator search',
  urlTest: (url) => /\/sales\/search\/people/i.test(url) && !/savedSearchId/i.test(url),
  sourceSpecific: true,
  selectors: SALES
});
