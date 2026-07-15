// Shared message contracts between popup/side-panel, service worker, and content
// scripts. Every message uses a typed envelope; unknown types are rejected by
// the router.

export const MessageTypes = Object.freeze({
  // UI -> service worker
  DETECT_SOURCE: 'DETECT_SOURCE',
  IMPORT_START: 'IMPORT_START',
  IMPORT_PAUSE: 'IMPORT_PAUSE',
  IMPORT_RESUME: 'IMPORT_RESUME',
  IMPORT_CANCEL: 'IMPORT_CANCEL',
  IMPORT_RETRY_FAILED: 'IMPORT_RETRY_FAILED',
  IMPORT_FILE: 'IMPORT_FILE',
  JOB_STATUS: 'JOB_STATUS',
  JOB_LIST: 'JOB_LIST',
  CONTACTS_QUERY: 'CONTACTS_QUERY',
  LIST_CREATE: 'LIST_CREATE',
  LIST_RENAME: 'LIST_RENAME',
  LIST_DELETE: 'LIST_DELETE',
  SOURCE_SAVE: 'SOURCE_SAVE',
  SOURCE_LIST: 'SOURCE_LIST',
  SOURCE_DELETE: 'SOURCE_DELETE',
  EXPORT_RESULTS: 'EXPORT_RESULTS',
  DELETE_ALL_DATA: 'DELETE_ALL_DATA',
  HEALTH_CHECK: 'HEALTH_CHECK',
  SETTINGS_GET: 'SETTINGS_GET',
  SETTINGS_SET: 'SETTINGS_SET',

  // service worker -> content script
  CS_DETECT: 'CS_DETECT',
  CS_COLLECT_PREVIEWS: 'CS_COLLECT_PREVIEWS',
  CS_NEXT_PAGE: 'CS_NEXT_PAGE',
  CS_SCROLL: 'CS_SCROLL',
  CS_COLLECT_PROFILE: 'CS_COLLECT_PROFILE',
  CS_COLLECT_ACTIVITY: 'CS_COLLECT_ACTIVITY',
  CS_COLLECT_COMPANY: 'CS_COLLECT_COMPANY',
  CS_CHECK_BLOCKED: 'CS_CHECK_BLOCKED',
  CS_MARK_IMPORTED: 'CS_MARK_IMPORTED',

  // service worker -> UI (events)
  EVENT_JOB_PROGRESS: 'EVENT_JOB_PROGRESS'
});

const KNOWN = new Set(Object.values(MessageTypes));

export function isKnownType(type) {
  return KNOWN.has(type);
}

function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Deterministic-enough fallback for non-crypto contexts.
  const rnd = new Uint8Array(16);
  globalThis.crypto.getRandomValues(rnd);
  return Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Build a request envelope.
export function makeRequest(type, payload = {}, extra = {}) {
  return { type, requestId: newId(), ...extra, payload };
}

// Build a success response for a given request.
export function ok(requestId, data = {}) {
  return { requestId, ok: true, data, error: null };
}

// Build an error response for a given request.
export function fail(requestId, error) {
  return { requestId, ok: false, data: null, error };
}

export { newId };
