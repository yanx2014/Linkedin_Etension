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
    // Give the content script a moment to settle the DOM.
    await sendToTab(tabId, makeRequest('CS_CHECK_BLOCKED', { url }));
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

// Send a typed request to the content script in a tab and await its response.
export function sendToTab(tabId, message) {
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
