// Run tab: shows the active job's progress and recent job history.

import { renderJobProgress } from '../components/job-progress.js';

export function renderRunView(root, api) {
  root.innerHTML = '<h2>Run</h2><div id="active-job"></div><h3>Recent jobs</h3><div id="job-history" class="muted">Loading…</div>';
  const activeBox = root.querySelector('#active-job');

  (async () => {
    let job = api.state.activeJob;
    try { job = await api.rpc(api.MessageTypes.JOB_STATUS, {}); } catch { /* keep cached */ }
    renderJobProgress(activeBox, api, job);

    try {
      const jobs = await api.rpc(api.MessageTypes.JOB_LIST);
      const box = root.querySelector('#job-history');
      if (!jobs.length) { box.textContent = 'No jobs yet.'; return; }
      box.innerHTML = jobs.slice(-10).reverse().map((j) =>
        `<div class="row"><span>${escapeHtml(String(j.id).slice(0, 8))} · ${escapeHtml(j.source_type || 'import')}</span><span class="pill">${escapeHtml(j.state)}</span></div>`).join('');
    } catch (e) {
      root.querySelector('#job-history').textContent = e.message;
    }
  })();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
