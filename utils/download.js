// Download helper for the extension. Wraps chrome.downloads to save generated
// files. Uses data URLs so no blob object-URL lifecycle management is needed in
// the service worker. Guarded so the module can be imported in non-extension
// (test) contexts without throwing.

function hasChromeDownloads() {
  return typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function';
}

// Encode a UTF-8 string to a base64 data URL of the given MIME type.
export function toDataUrl(content, mime = 'text/plain') {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:${mime};charset=utf-8;base64,${b64}`;
}

// Trigger a download. Returns the download id (or null in non-extension ctx).
export async function downloadFile(filename, content, mime = 'text/plain') {
  if (!hasChromeDownloads()) return null;
  const url = toDataUrl(content, mime);
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(downloadId);
    });
  });
}
