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
    <button id="btn-start-page" class="primary" disabled>Start import from page</button>

    <h3>Import a file</h3>
    <input id="file" type="file" accept=".csv,.json,.txt">
    <button id="btn-import-file">Import file</button>

    <h3>Paste profile URLs</h3>
    <textarea id="url-list" placeholder="https://www.linkedin.com/in/... (one per line)"></textarea>
    <button id="btn-import-urls">Import URLs</button>
  `;

  refreshStatus();

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
      if (detect.supported) {
        setPill('cap-page', detect.source_search || 'supported', 'pill-available');
        btn.disabled = false;
        btn.dataset.sourceType = detect.source_type;
        btn.dataset.sourceUrl = tab.url;
        root.querySelector('#page-hint').textContent = `Detected: ${detect.source_search}.`;
      } else {
        setPill('cap-page', 'unsupported', 'pill-unavailable');
        btn.disabled = true;
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
      const res = await api.rpc(api.MessageTypes.IMPORT_START, {
        source_type: btn.dataset.sourceType, source_url: btn.dataset.sourceUrl,
        criteria: api.state.criteria || {}
      });
      api.setMessage(`Import job ${res.job_id.slice(0, 8)} started.`);
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
