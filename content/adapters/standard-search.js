import { createListAdapter } from './base-adapter.js';
import { STANDARD } from '../selectors/standard.js';

export default createListAdapter({
  id: 'standard_search',
  label: 'LinkedIn people search',
  urlTest: (url) => /\/search\/results\/people/i.test(url),
  selectors: STANDARD
});
