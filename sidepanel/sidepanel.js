// Side-panel controller. Owns tab switching and a shared `api` passed to each
// view. Views render into #view-root. All data operations go through typed
// messages to the service worker.

import { MessageTypes, makeRequest } from '../utils/messages.js';
import { renderSourcesView } from './views/import-view.js';
import { renderCriteriaView } from './components/criteria-editor.js';
import { renderRunView } from './views/jobs-view.js';
import { renderContactsView } from './views/contacts-view.js';
import { renderSettingsView } from './views/settings-view.js';

function rpc(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(makeRequest(type, payload), (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.ok) return reject(new Error(res?.error?.message || 'request failed'));
      resolve(res.data);
    });
  });
}

const state = {
  view: 'sources',
  criteria: null,
  activeJob: null
};

const api = {
  rpc,
  MessageTypes,
  state,
  setMessage(text, isError = false) {
    const el = document.getElementById('global-message');
    el.textContent = text || '';
    el.className = `global-message${isError ? ' error' : ''}`;
  },
  switchView(view) { switchView(view); }
};

const VIEWS = {
  sources: renderSourcesView,
  criteria: renderCriteriaView,
  run: renderRunView,
  contacts: renderContactsView,
  settings: renderSettingsView
};

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  api.setMessage('');
  const render = VIEWS[view];
  if (render) render(root, api);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// Live job progress events.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MessageTypes.EVENT_JOB_PROGRESS) {
    state.activeJob = message.payload.job;
    if (state.view === 'run') switchView('run');
  }
});

// Initial load: fetch last criteria then render.
(async () => {
  try {
    const settings = await rpc(MessageTypes.SETTINGS_GET);
    state.criteria = settings.last_criteria || null;
  } catch { /* backend/service worker may be starting */ }
  switchView('sources');
})();
