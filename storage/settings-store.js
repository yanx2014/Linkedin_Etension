// Settings live in chrome.storage.local (small, non-sensitive). No LinkedIn
// tokens or client secrets are ever stored here. The backend installation token
// (a local shared secret for the loopback backend) is stored here so the
// extension can authenticate to its own backend.

const DEFAULTS = {
  backend_url: 'http://127.0.0.1:8787',
  backend_token: '',
  consent_given: false,
  use_deepseek: true,
  auto_export: true,
  last_criteria: null,
  criteria_presets: []
};

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

export async function getSettings() {
  if (!hasChromeStorage()) return { ...DEFAULTS };
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (res) => {
      resolve({ ...DEFAULTS, ...(res.settings || {}) });
    });
  });
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  if (!hasChromeStorage()) return next;
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: next }, () => resolve(next));
  });
}

export async function saveCriteriaPreset(name, criteria) {
  const s = await getSettings();
  const presets = (s.criteria_presets || []).filter((p) => p.name !== name);
  presets.push({ name, criteria, saved_at: new Date().toISOString() });
  return setSettings({ criteria_presets: presets });
}

export { DEFAULTS };
