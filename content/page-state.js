// Small helpers describing the current page for the content script.

export function currentUrl() {
  return location.href;
}

// Scroll a container (or the window) by roughly one viewport to trigger lazy
// loading. Returns the new scroll position. Deterministic; no fake human input.
export function scrollStep(container) {
  const el = container || document.scrollingElement || document.documentElement;
  const before = el.scrollTop;
  const delta = Math.max(600, Math.floor((el.clientHeight || window.innerHeight) * 0.9));
  el.scrollTop = before + delta;
  window.scrollBy(0, delta);
  return el.scrollTop;
}
