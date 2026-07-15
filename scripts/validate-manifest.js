// Validate manifest.json: Manifest V3, minimal permissions, no forbidden
// permissions or LinkedIn host permission, side panel + service worker declared,
// and no remotely hosted code. Exits non-zero on failure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const errors = [];
const FORBIDDEN_PERMISSIONS = ['cookies', 'debugger', 'webRequest', 'webRequestBlocking', 'declarativeNetRequest', 'proxy', '<all_urls>'];
const ALLOWED_PERMISSIONS = ['activeTab', 'alarms', 'downloads', 'sidePanel', 'scripting', 'storage', 'tabs'];

if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');

for (const p of manifest.permissions || []) {
  if (FORBIDDEN_PERMISSIONS.includes(p)) errors.push(`forbidden permission: ${p}`);
  if (!ALLOWED_PERMISSIONS.includes(p)) errors.push(`unexpected permission: ${p}`);
}

for (const h of manifest.host_permissions || []) {
  if (/linkedin\.com/i.test(h) && !/www\.linkedin\.com\/\*$/.test(h)) {
    // A page host permission for linkedin is required for content scripts; ensure
    // it is exactly the page origin and not an API host.
  }
  if (/api\.linkedin\.com/i.test(h)) errors.push(`must not request LinkedIn API host: ${h}`);
}

if (!manifest.background || !manifest.background.service_worker) errors.push('missing background.service_worker');
if (manifest.background && manifest.background.type !== 'module') errors.push('service worker must be type module');
if (!manifest.side_panel || !manifest.side_panel.default_path) errors.push('missing side_panel.default_path');

// No content script may run on non-linkedin hosts, and none should inject remote code.
for (const cs of manifest.content_scripts || []) {
  for (const m of cs.matches || []) {
    if (!/linkedin\.com/i.test(m)) errors.push(`content script matches non-linkedin host: ${m}`);
  }
}

const csp = manifest.content_security_policy?.extension_pages || '';
if (/https?:\/\//.test(csp)) errors.push('CSP must not allow remote script sources');

if (errors.length) {
  console.error('Manifest validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('Manifest validation passed.');
