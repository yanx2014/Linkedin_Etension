// Job progress component: state, counts, and pause/resume/cancel/retry controls.

export function renderJobProgress(root, api, job) {
  if (!job) {
    root.innerHTML = '<p class="muted">No active job. Start an import from the Sources tab.</p>';
    return;
  }
  const counts = job.counts || {};
  const accepted = counts.accepted ?? 0;
  const rejected = counts.rejected ?? 0;
  const discovered = counts.discovered ?? (accepted + rejected);
  const blockedNote = job.blocked ? `<p class="error">Blocked at ${escapeHtml(job.blocked.phase || 'checkpoint')} — sign in / complete verification in the tab, then retry. The tool does not bypass this.</p>` : '';

  root.innerHTML = `
    <div class="card">
      <div class="row"><strong>Job ${escapeHtml(String(job.id).slice(0, 8))}</strong><span class="pill ${stateClass(job.state)}">${escapeHtml(job.state)}</span></div>
      <div class="row"><span>Discovered</span><span>${discovered}</span></div>
      <div class="row"><span>Accepted</span><span>${accepted}</span></div>
      <div class="row"><span>Rejected</span><span>${rejected}</span></div>
      ${job.error ? `<p class="error">${escapeHtml(job.error)}</p>` : ''}
      ${blockedNote}
      <div class="btn-row">
        <button id="btn-pause">Pause</button>
        <button id="btn-resume">Resume</button>
        <button id="btn-cancel">Cancel</button>
        <button id="btn-retry">Retry failed</button>
      </div>
      <div class="btn-row">
        <button id="btn-export" class="primary">Export results</button>
      </div>
    </div>
  `;

  const send = (type) => api.rpc(type, { job_id: job.id }).then(() => api.switchView('run')).catch((e) => api.setMessage(e.message, true));
  root.querySelector('#btn-pause').addEventListener('click', () => send(api.MessageTypes.IMPORT_PAUSE));
  root.querySelector('#btn-resume').addEventListener('click', () => send(api.MessageTypes.IMPORT_RESUME));
  root.querySelector('#btn-cancel').addEventListener('click', () => send(api.MessageTypes.IMPORT_CANCEL));
  root.querySelector('#btn-retry').addEventListener('click', () => send(api.MessageTypes.IMPORT_RETRY_FAILED));
  root.querySelector('#btn-export').addEventListener('click', async () => {
    try { await api.rpc(api.MessageTypes.EXPORT_RESULTS, { job_id: job.id }); api.setMessage('Export downloaded.'); }
    catch (e) { api.setMessage(e.message, true); }
  });
}

function stateClass(state) {
  if (['COMPLETED'].includes(state)) return 'pill-ok';
  if (['FAILED', 'BLOCKED'].includes(state)) return 'pill-err';
  if (['PARTIAL', 'PAUSED'].includes(state)) return 'pill-warn';
  return '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
