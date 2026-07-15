// Sources panel: current-page detection, capability/status, file import, and
// pasted-URL import.

export function renderSourcePanel(root, api) {
  root.innerHTML = `
    <h2>Sources</h2>
    <div class="card">
      <div class="row"><span>Backend</span><span id="cap-backend" class="pill">checking…</span></div>
      <div class="row"><span>DeepSeek enrichment</span><span id="cap-deepseek" class="pill">—</span></div>
      <div class="row"><span>Company website research</span><span id="cap-web" class="pill pill-available">available</span></div>
      <div class="row"><span>Current page</span><span id="cap-page" class="pill">—</span></div>
    </div>

    <h3>Import from current page</h3>
    <p class="muted" id="page-hint">Open a supported LinkedIn page, then start an import.</p>

    <label for="collection-mode">Collection mode</label>
    <select id="collection-mode">
      <option value="current_page_only" selected>Current page only (recommended)</option>
      <option value="background_search_pages">Background search pages (opt-in)</option>
    </select>
    <p class="muted" id="mode-hint">Reads only the result cards rendered in the tab you are viewing. No extra tabs are opened and the page is never navigated.</p>
    <label id="profile-visit-row" class="row hidden">
      <span>Visit each profile page for full details</span>
      <input id="profile-visit" type="checkbox">
    </label>

    <button id="btn-start-page" class="primary" disabled>Start import from page</button>
    <button id="btn-urls-only" disabled>Get profile URLs (this page)</button>
    <p class="muted">Collects only the profile URLs shown on the current LinkedIn page — no profile visits, no enrichment. Download the CSV when you want it.</p>

    <h3>Import a file</h3>
    <input id="file" type="file" accept=".csv,.json,.txt">
    <button id="btn-import-file">Import file</button>

    <h3>Paste profile URLs</h3>
    <textarea id="url-list" placeholder="https://www.linkedin.com/in/... (one per line)"></textarea>
    <button id="btn-import-urls">Import URLs</button>
  `;

  refreshStatus();

  // Collection-mode disclosure: reveal the profile-visit option only for the
  // opt-in background mode, and explain what each mode actually does.
  const modeSel = root.querySelector('#collection-mode');
  const modeHint = root.querySelector('#mode-hint');
  const profileVisitRow = root.querySelector('#profile-visit-row');
  modeSel.addEventListener('change', () => {
    if (modeSel.value === 'background_search_pages') {
      modeHint.textContent = 'Opens one background tab and navigates search-result pages only (never the current tab). LinkedIn may treat automated page navigation as a Terms violation — use with care.';
      profileVisitRow.classList.remove('hidden');
    } else {
      modeHint.textContent = 'Reads only the result cards rendered in the tab you are viewing. No extra tabs are opened and the page is never navigated.';
      profileVisitRow.classList.add('hidden');
      root.querySelector('#profile-visit').checked = false;
    }
  });

  async function refreshStatus() {
    try {
      const health = await api.rpc(api.MessageTypes.HEALTH_CHECK);
      setPill('cap-backend', health.backend ? 'online' : 'offline', health.backend ? 'pill-ok' : 'pill-err');
      setPill('cap-deepseek', health.deepseek ? 'configured' : 'not configured', health.deepseek ? 'pill-available' : 'pill-restricted');
    } catch {
      setPill('cap-backend', 'offline', 'pill-err');
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const detect = await api.rpc(api.MessageTypes.DETECT_SOURCE, { url: tab?.url || '' });
      const btn = root.querySelector('#btn-start-page');
      const urlsBtn = root.querySelector('#btn-urls-only');
      if (detect.supported) {
        setPill('cap-page', detect.source_search || 'supported', 'pill-available');
        btn.disabled = false;
        btn.dataset.sourceType = detect.source_type;
        btn.dataset.sourceUrl = tab.url;
        urlsBtn.disabled = false;
        urlsBtn.dataset.sourceType = detect.source_type;
        urlsBtn.dataset.sourceUrl = tab.url;
        root.querySelector('#page-hint').textContent = `Detected: ${detect.source_search}.`;
      } else {
        setPill('cap-page', 'unsupported', 'pill-unavailable');
        btn.disabled = true;
        urlsBtn.disabled = true;
      }
    } catch {
      setPill('cap-page', 'unknown', 'pill-unavailable');
    }
  }

  function setPill(id, text, cls) {
    const el = root.querySelector(`#${id}`);
    el.textContent = text;
    el.className = `pill ${cls}`;
  }

  root.querySelector('#btn-start-page').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      // Capture the active tab so current_page_only mode can collect from the
      // page the user is looking at (no worker tab, no navigation).
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const mode = modeSel.value;
      const criteria = {
        ...(api.state.criteria || {}),
        collection: {
          ...((api.state.criteria || {}).collection || {}),
          mode,
          profile_visit: mode === 'background_search_pages' && root.querySelector('#profile-visit').checked
        }
      };
      const res = await api.rpc(api.MessageTypes.IMPORT_START, {
        source_type: btn.dataset.sourceType, source_url: btn.dataset.sourceUrl,
        active_tab_id: active?.id ?? null,
        criteria
      });
      api.setMessage(`Import job ${res.job_id.slice(0, 8)} started.`);
      api.switchView('run');
    } catch (err) { api.setMessage(err.message, true); }
  });

  // URL-only collection: profile URLs from the current page, no enrichment,
  // no auto-download. The user exports the CSV from the job view when ready.
  root.querySelector('#btn-urls-only').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await api.rpc(api.MessageTypes.IMPORT_START, {
        source_type: btn.dataset.sourceType, source_url: btn.dataset.sourceUrl,
        active_tab_id: active?.id ?? null,
        urls_only: true,
        criteria: api.state.criteria || {}
      });
      api.setMessage(`Collecting URLs (job ${res.job_id.slice(0, 8)}). Use “Export results” to download when ready.`);
      api.switchView('run');
    } catch (err) { api.setMessage(err.message, true); }
  });

  root.querySelector('#btn-import-file').addEventListener('click', async () => {
    const file = root.querySelector('#file').files[0];
    if (!file) { api.setMessage('Choose a file first.', true); return; }
    const content = await file.text();
    const format = file.name.endsWith('.json') ? 'json' : file.name.endsWith('.csv') ? 'csv' : 'urls';
    try {
      const res = await api.rpc(api.MessageTypes.IMPORT_FILE, { filename: file.name, content, format, criteria: api.state.criteria || {} });
      api.setMessage(`Imported ${res.imported} record(s).`);
      api.switchView('run');
    } catch (err) { api.setMessage(err.message, true); }
  });

  root.querySelector('#btn-import-urls').addEventListener('click', async () => {
    const content = root.querySelector('#url-list').value;
    if (!content.trim()) { api.setMessage('Paste at least one URL.', true); return; }
    try {
      const res = await api.rpc(api.MessageTypes.IMPORT_FILE, { filename: 'urls.txt', content, format: 'urls', criteria: api.state.criteria || {} });
      api.setMessage(`Imported ${res.imported} URL(s).`);
      api.switchView('run');
    } catch (err) { api.setMessage(err.message, true); }
  });
}
