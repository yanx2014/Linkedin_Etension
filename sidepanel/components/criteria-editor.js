// Criteria view: JSON editor + validation + presets. Renders into the given
// root. Persists the last criteria via SETTINGS_SET.

import { validateCriteria, defaultCriteria } from '../../utils/validation.js';

export function renderCriteriaView(root, api) {
  const current = api.state.criteria || defaultCriteria();
  root.innerHTML = `
    <h2>Criteria</h2>
    <p class="muted">Define required groups (AND across groups, OR within a group), required and excluded terms, and limits.</p>
    <label for="criteria-json">Criteria JSON</label>
    <textarea id="criteria-json" spellcheck="false" aria-describedby="criteria-errors"></textarea>
    <div id="criteria-errors" class="error" role="alert"></div>
    <div class="btn-row">
      <button id="btn-validate">Validate</button>
      <button id="btn-save-criteria" class="primary">Save as default</button>
      <button id="btn-load-example">Load example</button>
    </div>
    <h3>Saved presets</h3>
    <div id="presets"></div>
  `;

  const textarea = root.querySelector('#criteria-json');
  textarea.value = JSON.stringify(current, null, 2);

  const errorsEl = root.querySelector('#criteria-errors');

  function parseAndValidate() {
    let parsed;
    try { parsed = JSON.parse(textarea.value); }
    catch (e) { errorsEl.textContent = `JSON parse error: ${e.message}`; return null; }
    const res = validateCriteria(parsed);
    if (!res.valid) { errorsEl.textContent = `Errors: ${res.errors.join('; ')}`; return null; }
    errorsEl.textContent = res.warnings.length ? `Warnings: ${res.warnings.join('; ')}` : 'Valid ✓';
    errorsEl.className = res.warnings.length ? 'warn' : 'muted';
    return res.normalized;
  }

  root.querySelector('#btn-validate').addEventListener('click', parseAndValidate);

  root.querySelector('#btn-load-example').addEventListener('click', async () => {
    try {
      const url = chrome.runtime.getURL('data/criteria.example.json');
      const res = await fetch(url);
      textarea.value = JSON.stringify(await res.json(), null, 2);
      parseAndValidate();
    } catch (e) { errorsEl.textContent = `Could not load example: ${e.message}`; }
  });

  root.querySelector('#btn-save-criteria').addEventListener('click', async () => {
    const normalized = parseAndValidate();
    if (!normalized) return;
    api.state.criteria = normalized;
    await api.rpc(api.MessageTypes.SETTINGS_SET, { last_criteria: normalized });
    api.setMessage('Criteria saved as default.');
  });

  renderPresets();

  async function renderPresets() {
    try {
      const settings = await api.rpc(api.MessageTypes.SETTINGS_GET);
      const presets = settings.criteria_presets || [];
      const box = root.querySelector('#presets');
      if (presets.length === 0) { box.innerHTML = '<p class="muted">No presets saved.</p>'; return; }
      box.innerHTML = presets.map((p, i) =>
        `<div class="row"><span>${escapeHtml(p.name)}</span><button data-preset="${i}">Load</button></div>`).join('');
      box.querySelectorAll('button[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          textarea.value = JSON.stringify(presets[Number(btn.dataset.preset)].criteria, null, 2);
          parseAndValidate();
        });
      });
    } catch { /* ignore */ }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
