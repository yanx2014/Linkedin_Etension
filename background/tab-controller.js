// Controls a single worker tab for page collection. Navigates the tab, waits for
// the content script to report DOM stability, and requests data via typed
// messages. Concurrency is one navigation at a time (enforced by navigation-state).
//
// Uses only tabs + scripting (declared permissions). Never touches cookies,
// webRequest, or the debugger.

import { makeRequest } from '../utils/messages.js';
import { getWorkerTabId, setWorkerTabId, beginNavigation, endNavigation } from './navigation-state.js';
import { BlockedStateError, UnsupportedLayoutError } from '../utils/errors.js';

const NAV_TIMEOUT_MS = 30000;

// Ensure a reusable worker tab exists; returns its id.
export async function ensureWorkerTab(initialUrl) {
  let tabId = getWorkerTabId();
  if (tabId != null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) return tabId;
    } catch {
      // tab gone; recreate
    }
  }
  const tab = await chrome.tabs.create({ url: initialUrl, active: false });
  setWorkerTabId(tab.id);
  return tab.id;
}

// Navigate the worker tab and wait until it finishes loading.
export async function navigate(tabId, url) {
  beginNavigation(url);
  try {
    await chrome.tabs.update(tabId, { url });
    await waitForComplete(tabId);
    // Content-script readiness / blocked check. A messaging hiccup here (the
    // page still settling) must not abort navigation — only a real blocked
    // state should propagate.
    try {
      await sendToTab(tabId, makeRequest('CS_CHECK_BLOCKED', { url }));
    } catch (err) {
      if (err && (err.code === 'BLOCKED_CHECKPOINT' || err.name === 'BlockedStateError')) throw err;
      // otherwise: content script not ready yet; proceed, later reads will retry
    }
  } finally {
    endNavigation();
  }
}

function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('navigation timeout'));
    }, NAV_TIMEOUT_MS);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Read-only message types are safe to retry (no page side effects).
const RETRYABLE_TYPES = new Set([
  'CS_CHECK_BLOCKED', 'CS_DETECT', 'CS_COLLECT_PREVIEWS',
  'CS_COLLECT_PROFILE', 'CS_COLLECT_ACTIVITY', 'CS_COLLECT_COMPANY'
]);

function isTransientMessagingError(err) {
  const m = (err && err.message) || '';
  return /message channel closed|Could not establish connection|Receiving end does not exist|no response from content script/i.test(m);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Send a typed request to the content script in a tab and await its response.
// Read-only messages retry a few times on transient messaging errors (the
// content script may still be (re)loading after a navigation/re-render).
export async function sendToTab(tabId, message, { retries = 3, delayMs = 500 } = {}) {
  const canRetry = RETRYABLE_TYPES.has(message.type);
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await sendToTabOnce(tabId, message);
    } catch (err) {
      if (err && (err.name === 'BlockedStateError' || err.name === 'UnsupportedLayoutError')) throw err;
      attempt += 1;
      if (!canRetry || !isTransientMessagingError(err) || attempt > retries) throw err;
      // eslint-disable-next-line no-await-in-loop
      await wait(delayMs * attempt);
    }
  }
}

function sendToTabOnce(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) { reject(new Error('no response from content script')); return; }
      if (!response.ok) {
        const err = response.error || {};
        if (err.code === 'BLOCKED_CHECKPOINT') reject(new BlockedStateError(err.message, err.details));
        else if (err.code === 'UNSUPPORTED_LAYOUT') reject(new UnsupportedLayoutError(err.message, err.details));
        else reject(new Error(err.message || 'content script error'));
        return;
      }
      resolve(response.data);
    });
  });
}

// Collect a full profile + activity for a canonical/source URL.
export async function collectProfile(tabId, url) {
  await navigate(tabId, url);
  const profile = await sendToTab(tabId, makeRequest('CS_COLLECT_PROFILE', { url }));
  let posts = [];
  if (profile && profile.activity_url) {
    try {
      await navigate(tabId, profile.activity_url);
      posts = await sendToTab(tabId, makeRequest('CS_COLLECT_ACTIVITY', { url: profile.activity_url }));
    } catch {
      posts = []; // activity is optional
    }
  }
  return { ...profile, posts: (posts || []).slice(0, 7) };
}
