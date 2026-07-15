// Popup launcher. Shows backend/DeepSeek/page/job status and offers quick
// actions. All work happens in the service worker; the popup only sends typed
// messages.

import { MessageTypes, makeRequest } from '../utils/messages.js';

function rpc(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(makeRequest(type, payload), (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.ok) return reject(new Error(res?.error?.message || 'request failed'));
      resolve(res.data);
    });
  });
}

function setPill(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `pill pill-${kind}`;
}

function msg(text) { document.getElementById('message').textContent = text; }

async function refresh() {
  // Backend + DeepSeek health.
  try {
    const health = await rpc(MessageTypes.HEALTH_CHECK);
    setPill('status-backend', health.backend ? 'online' : 'offline', health.backend ? 'ok' : 'err');
    setPill('status-deepseek', health.deepseek ? 'configured' : 'not set', health.deepseek ? 'ok' : 'warn');
  } catch {
    setPill('status-backend', 'offline', 'err');
  }

  // Current page support.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const detect = await rpc(MessageTypes.DETECT_SOURCE, { url: tab?.url || '' });
    setPill('status-page', detect.supported ? detect.source_search || 'supported' : 'unsupported', detect.supported ? 'ok' : 'unknown');
    document.getElementById('btn-run-last').disabled = !detect.supported;
  } catch {
    setPill('status-page', '—', 'unknown');
  }

  // Active job.
  try {
    const job = await rpc(MessageTypes.JOB_STATUS, {});
    setPill('status-job', job ? job.state : 'none', job ? 'ok' : 'unknown');
  } catch {
    setPill('status-job', 'none', 'unknown');
  }
}

document.getElementById('btn-workspace').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const content = await file.text();
  const format = file.name.endsWith('.json') ? 'json' : file.name.endsWith('.csv') ? 'csv' : 'urls';
  try {
    const res = await rpc(MessageTypes.IMPORT_FILE, { filename: file.name, content, format, criteria: await lastCriteria() });
    msg(`Imported ${res.imported} record(s). Job ${res.job_id.slice(0, 8)} started.`);
    refresh();
  } catch (err) {
    msg(`Import failed: ${err.message}`);
  }
});

document.getElementById('btn-run-last').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const detect = await rpc(MessageTypes.DETECT_SOURCE, { url: tab?.url || '' });
    if (!detect.supported) { msg('This page is not a supported source.'); return; }
    const res = await rpc(MessageTypes.IMPORT_START, {
      source_type: detect.source_type, source_url: tab.url, active_tab_id: tab?.id ?? null, criteria: await lastCriteria()
    });
    msg(`Import job ${res.job_id.slice(0, 8)} started.`);
    refresh();
  } catch (err) {
    msg(`Could not start: ${err.message}`);
  }
});

async function lastCriteria() {
  try {
    const settings = await rpc(MessageTypes.SETTINGS_GET);
    return settings.last_criteria || { preview_required_groups: [], max_profiles: 500 };
  } catch {
    return { preview_required_groups: [], max_profiles: 500 };
  }
}

refresh();
