// Contact list with search. Selecting a contact renders its detail.

import { renderProfileDetail } from './profile-detail.js';

export function renderContactList(root, api) {
  root.innerHTML = `
    <label for="contact-search">Search contacts</label>
    <input id="contact-search" type="text" placeholder="name, company, role, tag, source">
    <div id="contact-results" class="muted">Loading…</div>
    <div id="contact-detail"></div>
  `;
  const searchEl = root.querySelector('#contact-search');
  const resultsEl = root.querySelector('#contact-results');
  const detailEl = root.querySelector('#contact-detail');

  let all = [];
  load();

  async function load(query) {
    try {
      all = await api.rpc(api.MessageTypes.CONTACTS_QUERY, { query: query || '' });
      renderList(all);
    } catch (e) { resultsEl.textContent = e.message; }
  }

  function renderList(contacts) {
    if (!contacts.length) { resultsEl.innerHTML = '<p class="muted">No contacts yet.</p>'; return; }
    resultsEl.innerHTML = contacts.map((c, i) =>
      `<div class="contact" data-i="${i}" role="button" tabindex="0">
        <div class="contact-name">${escapeHtml(c.full_name || c.canonical_url)}</div>
        <div class="muted">${escapeHtml([c.role, c.company].filter(Boolean).join(' · '))}</div>
      </div>`).join('');
    resultsEl.querySelectorAll('.contact').forEach((el) => {
      const open = () => renderProfileDetail(detailEl, contacts[Number(el.dataset.i)]);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  let debounce = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => load(searchEl.value), 200);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
