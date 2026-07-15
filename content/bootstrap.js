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
