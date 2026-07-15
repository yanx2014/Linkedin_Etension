// Content-script bootstrap (classic script). Lazy-loads ES modules as
// web-accessible resources and handles typed CS_* requests from the service
// worker. Reads only rendered page data; never touches cookies, storage, or
// network beyond normal navigation.

(() => {
  const load = (path) => import(chrome.runtime.getURL(path));

  const modules = {};
  async function getModules() {
    if (modules.loaded) return modules;
    modules.detector = await load('content/source-detector.js');
    modules.profile = await load('content/extractors/profile-extractor.js');
    modules.activity = await load('content/extractors/activity-extractor.js');
    modules.companyProfile = await load('content/extractors/company-profile-extractor.js');
    modules.companyActivity = await load('content/extractors/company-activity-extractor.js');
    modules.stability = await load('content/dom-stability.js');
    modules.pageState = await load('content/page-state.js');
    modules.common = await load('content/selectors/common.js');
    modules.loaded = true;
    return modules;
  }

  function ok(requestId, data) { return { requestId, ok: true, data, error: null }; }
  function fail(requestId, code, message, details = {}) {
    return { requestId, ok: false, data: null, error: { code, message, details } };
  }

  async function handle(message) {
    const m = await getModules();
    const url = location.href;
    const { detectAdapter } = m.detector;

    switch (message.type) {
      case 'CS_CHECK_BLOCKED': {
        const blocked = m.common.detectBlocked({ url, document });
        if (blocked.blocked) return fail(message.requestId, 'BLOCKED_CHECKPOINT', 'blocked state detected', blocked);
        return ok(message.requestId, { blocked: false });
      }
      case 'CS_DETECT': {
        const adapter = detectAdapter({ url, document });
        return ok(message.requestId, adapter ? { supported: true, ...adapter.detectSourceMetadata({ url }) } : { supported: false });
      }
      case 'CS_COLLECT_PREVIEWS': {
        await m.stability.waitForStable(document);
        const adapter = detectAdapter({ url, document });
        if (!adapter) return fail(message.requestId, 'UNSUPPORTED_LAYOUT', 'no adapter for page');
        // LinkedIn lazily mounts result cards as the page scrolls; without this,
        // extraction sees only the few cards initially rendered (this is why a
        // run could stop at ~4). Scroll the page until the profile-link count
        // stops growing so every card on the page is present before extracting.
        await loadAllRendered(m);
        try {
          const rows = adapter.collectPreviewRows({ url, document, limit: message.payload?.limit || 500 });
          const hasNext = !!(adapter.findNextPageControl && adapter.findNextPageControl({ document }));
          const hasScroll = !!(adapter.scrollContainer && adapter.scrollContainer({ document }));
          return ok(message.requestId, { rows, hasNext, hasScroll });
        } catch (err) {
          return errToFail(message.requestId, err);
        }
      }
      case 'CS_NEXT_PAGE': {
        const adapter = detectAdapter({ url, document });
        const control = adapter && adapter.findNextPageControl ? adapter.findNextPageControl({ document }) : null;
        if (control && typeof control.click === 'function') control.click();
        await m.stability.waitForStable(document);
        return ok(message.requestId, { clicked: !!control });
      }
      case 'CS_SCROLL': {
        const adapter = detectAdapter({ url, document });
        const container = adapter && adapter.scrollContainer ? adapter.scrollContainer({ document }) : null;
        m.pageState.scrollStep(container);
        await m.stability.waitForStable(document);
        return ok(message.requestId, { scrolled: true });
      }
      case 'CS_COLLECT_PROFILE': {
        await m.stability.waitForStable(document);
        try {
          const profile = m.profile.extractProfile({ url, document, collectedAt: new Date().toISOString() });
          return ok(message.requestId, profile);
        } catch (err) { return errToFail(message.requestId, err); }
      }
      case 'CS_COLLECT_ACTIVITY': {
        await m.stability.waitForStable(document);
        const posts = m.activity.extractActivity({ document });
        return ok(message.requestId, posts);
      }
      case 'CS_COLLECT_COMPANY': {
        await m.stability.waitForStable(document);
        const profile = m.companyProfile.extractCompanyProfile({ url, document });
        const posts = m.companyActivity.extractCompanyActivity({ document });
        return ok(message.requestId, { profile, posts });
      }
      default:
        return fail(message.requestId, 'UNKNOWN_TYPE', `unknown ${message.type}`);
    }
  }

  // Scroll the page in steps until the count of profile links stops growing
  // (LinkedIn mounts result cards lazily). Bounded by iterations/time so it can
  // never loop forever; scrolls back to top afterward so pagination controls and
  // the next navigation start from a consistent position.
  async function loadAllRendered(m, { maxSteps = 15 } = {}) {
    const count = () => document.querySelectorAll('a[href*="/in/"]').length;
    let stable = 0;
    for (let i = 0; i < maxSteps && stable < 2; i++) {
      const before = count();
      try { m.pageState.scrollStep(null); } catch { /* ignore */ }
      // eslint-disable-next-line no-await-in-loop
      await m.stability.waitForStable(document, { quietMs: 350, maxMs: 2500 });
      if (count() <= before) stable += 1; else stable = 0;
    }
    try {
      const top = document.scrollingElement || document.documentElement;
      if (top) top.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch { /* ignore */ }
  }

  function errToFail(requestId, err) {
    if (err && (err.code === 'BLOCKED_CHECKPOINT' || err.name === 'BlockedStateError')) {
      return fail(requestId, 'BLOCKED_CHECKPOINT', err.message, err.details || {});
    }
    if (err && (err.code === 'UNSUPPORTED_LAYOUT' || err.name === 'UnsupportedLayoutError')) {
      return fail(requestId, 'UNSUPPORTED_LAYOUT', err.message, err.details || {});
    }
    return fail(requestId, 'CONTENT_ERROR', err ? err.message : 'unknown error');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('CS_')) return false;
    handle(message).then(sendResponse).catch((err) => sendResponse(fail(message.requestId, 'CONTENT_ERROR', String(err))));
    return true; // async response
  });
})();
