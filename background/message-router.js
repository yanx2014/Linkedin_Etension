// Typed message router. Handlers register by message type; unknown types are
// rejected. Every handler receives (payload, sender) and returns data (or
// throws), which the router wraps into the standard response envelope.

import { isKnownType, ok, fail } from '../utils/messages.js';
import { toErrorPayload } from '../utils/errors.js';

const handlers = new Map();

export function register(type, handler) {
  handlers.set(type, handler);
}

export function registerAll(map) {
  for (const [type, handler] of Object.entries(map)) register(type, handler);
}

// Wire the router into chrome.runtime.onMessage. Returns true to keep the
// message channel open for the async response.
export function attachRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handle(message, sender).then(sendResponse);
    return true;
  });
}

export async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') {
    return fail(message?.requestId || null, { code: 'BAD_MESSAGE', message: 'missing type' });
  }
  if (!isKnownType(message.type)) {
    return fail(message.requestId, { code: 'UNKNOWN_TYPE', message: `unknown message type: ${message.type}` });
  }
  const handler = handlers.get(message.type);
  if (!handler) {
    return fail(message.requestId, { code: 'NO_HANDLER', message: `no handler for ${message.type}` });
  }
  try {
    const data = await handler(message.payload || {}, sender, message);
    return ok(message.requestId, data);
  } catch (err) {
    return fail(message.requestId, toErrorPayload(err));
  }
}
