// Settings panel: backend URL/token, consent, DeepSeek toggle, saved sources,
// and data deletion. No LinkedIn client secret is ever entered here.

export function renderSettingsPanel(root, api) {
  root.innerHTML = `
    <h2>Settings</h2>
    <div class="card">
      <label for="backend-url">Backend URL</label>
      <input id="backend-url" type="url" placeholder="http://127.0.0.1:8787">
      <label for="backend-token">Backend installation token</label>
      <input id="backend-token" type="password" placeholder="local shared secret" autocomplete="off">
      <label><input id="use-deepseek" type="checkbox"> Use DeepSeek enrichment</label>
      <label><input id="consent" type="checkbox"> I consent to data collection from visible pages and DeepSeek processing</label>
      <div class="btn-row">
        <button id="btn-save-settings" class="primary">Save settings</button>
        <button id="btn-test-backend">Test backend connection</button>
      </div>
      <div id="conn-status" class="card" style="margin-top:8px">
        <div class="row"><span>Backend reachable</span><span id="st-backend" class="pill">—</span></div>
        <div class="row"><span>Token valid</span><span id="st-token" class="pill">—</span></div>
        <div class="row"><span>DeepSeek configured</span><span id="st-deepseek" class="pill">—</span></div>
        <div class="row"><span>Brave search configured</span><span id="st-search" class="pill">—</span></div>
      </div>
    </div>

    <h3>Saved auto-import sources</h3>
    <div id="sources-list" class="muted">Loading…</div>

    <h3>Data</h3>
    <p class="muted">Deleting removes all local imports, jobs, avatars, and audit data, and asks the backend to delete its stored data.</p>
    <div class="btn-row"><button id="btn-delete-data" class="error">Delete all data</button></div>

    <div class="card">
      <p class="muted">This tool operates only on user-visible pages, uses no official LinkedIn API, and does not bypass access controls. You are responsible for platform terms, privacy law, and outreach law.</p>
    </div>
  `;

  loadSettings();
  loadSources();

  async function loadSettings() {
    try {
      const s = await api.rpc(api.MessageTypes.SETTINGS_GET);
      root.querySelector('#backend-url').value = s.backend_url || '';
      root.querySelector('#backend-token').value = s.backend_token || '';
      root.querySelector('#use-deepseek').checked = s.use_deepseek !== false;
      root.querySelector('#consent').checked = !!s.consent_given;
    } catch (e) { api.setMessage(e.message, true); }
  }

  root.querySelector('#btn-save-settings').addEventListener('click', async () => {
    try {
      await api.rpc(api.MessageTypes.SETTINGS_SET, {
        backend_url: root.querySelector('#backend-url').value.trim(),
        backend_token: root.querySelector('#backend-token').value.trim(),
        use_deepseek: root.querySelector('#use-deepseek').checked,
        consent_given: root.querySelector('#consent').checked
      });
      api.setMessage('Settings saved.');
    } catch (e) { api.setMessage(e.message, true); }
  });

  // Test-connection: save first (so the current URL/token are used), then run
  // the diagnostic and show four independent statuses.
  root.querySelector('#btn-test-backend').addEventListener('click', async () => {
    setStatus('st-backend', 'checking…', 'pill');
    setStatus('st-token', '—', 'pill'); setStatus('st-deepseek', '—', 'pill'); setStatus('st-search', '—', 'pill');
    try {
      await api.rpc(api.MessageTypes.SETTINGS_SET, {
        backend_url: root.querySelector('#backend-url').value.trim(),
        backend_token: root.querySelector('#backend-token').value.trim()
      });
      const r = await api.rpc(api.MessageTypes.AUTH_CHECK);
      setStatus('st-backend', r.backend ? 'reachable' : 'unreachable', r.backend ? 'pill-ok' : 'pill-err');
      if (!r.backend) {
        api.setMessage(`Backend unreachable: ${r.error || 'no response'}`, true);
        return;
      }
      setStatus('st-token', r.token_required ? (r.token_valid ? 'valid' : 'invalid') : 'not required', r.token_valid ? 'pill-ok' : 'pill-err');
      setStatus('st-deepseek', r.deepseek ? 'configured' : 'not configured', r.deepseek ? 'pill-available' : 'pill-restricted');
      setStatus('st-search', r.search ? 'configured' : 'not configured', r.search ? 'pill-available' : 'pill-restricted');
      api.setMessage(r.token_required && !r.token_valid ? 'Backend reachable but token is invalid.' : 'Backend connection OK.');
    } catch (e) { setStatus('st-backend', 'error', 'pill-err'); api.setMessage(e.message, true); }
  });

  function setStatus(id, text, cls) {
    const el = root.querySelector(`#${id}`);
    if (el) { el.textContent = text; el.className = `pill ${cls}`; }
  }

  async function loadSources() {
    try {
      const sources = await api.rpc(api.MessageTypes.SOURCE_LIST);
      const box = root.querySelector('#sources-list');
      if (!sources.length) { box.innerHTML = '<p class="muted">No saved sources.</p>'; return; }
      box.innerHTML = sources.map((s) =>
        `<div class="row"><span>${escapeHtml(s.name)} · ${escapeHtml(s.schedule)}</span><button data-del="${s.id}">Delete</button></div>`).join('');
      box.querySelectorAll('button[data-del]').forEach((b) =>
        b.addEventListener('click', async () => { await api.rpc(api.MessageTypes.SOURCE_DELETE, { id: b.dataset.del }); loadSources(); }));
    } catch { /* ignore */ }
  }

  root.querySelector('#btn-delete-data').addEventListener('click', async () => {
    if (!confirm('Delete all local and backend data? This cannot be undone.')) return;
    try { await api.rpc(api.MessageTypes.DELETE_ALL_DATA); api.setMessage('All data deleted.'); }
    catch (e) { api.setMessage(e.message, true); }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
