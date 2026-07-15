import { createListAdapter } from './base-adapter.js';
import { SALES } from '../selectors/sales-navigator.js';

export default createListAdapter({
  id: 'sales_list',
  label: 'Sales Navigator lead list',
  urlTest: (url) => /\/sales\/lists\/people/i.test(url),
  sourceSpecific: true,
  selectors: {
    ...SALES,
    resultContainers: [
      'li.artdeco-list__item',
      'tr[data-testid="list-row"]',
      'div[data-x-search-result]'
    ]
  }
});
