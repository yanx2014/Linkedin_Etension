// Tracks the readiness of the single worker tab used for collection. Ensures
// only one navigation is in flight at a time.

const state = {
  tabId: null,
  navigating: false,
  lastUrl: null
};

export function getWorkerTabId() { return state.tabId; }
export function setWorkerTabId(id) { state.tabId = id; }
export function isNavigating() { return state.navigating; }
export function beginNavigation(url) { state.navigating = true; state.lastUrl = url; }
export function endNavigation() { state.navigating = false; }
export function reset() { state.tabId = null; state.navigating = false; state.lastUrl = null; }
