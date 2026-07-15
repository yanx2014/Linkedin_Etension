// Results tab: contact list + detail/avatar preview.

import { renderContactList } from '../components/contact-list.js';

export function renderContactsView(root, api) {
  root.innerHTML = '<h2>Results</h2><div id="contacts"></div>';
  renderContactList(root.querySelector('#contacts'), api);
}
