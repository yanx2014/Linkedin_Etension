// Wait for the DOM to settle before extracting. Resolves when no mutations have
// occurred for `quietMs`, or after `maxMs`. Deterministic waits only — no
// human-mimicking randomness.

export function waitForStable(target = document, { quietMs = 400, maxMs = 6000 } = {}) {
  return new Promise((resolve) => {
    let timer = null;
    const start = Date.now();
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      if (Date.now() - start > maxMs) { finish(); return; }
      timer = setTimeout(finish, quietMs);
    });
    function finish() {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      resolve();
    }
    observer.observe(target.documentElement || target, { childList: true, subtree: true });
    timer = setTimeout(finish, quietMs);
    setTimeout(finish, maxMs);
  });
}
