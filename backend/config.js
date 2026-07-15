// Backend configuration loaded from environment (and an optional .env file read
// without external dependencies).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = join(here, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.BIND_HOST || '127.0.0.1',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
  deepseekReasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT || 'max',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  braveApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
  databasePath: process.env.DATABASE_PATH || join(here, 'data', 'enrichment.json'),
  allowedExtensionIds: (process.env.ALLOWED_EXTENSION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  installToken: process.env.INSTALL_TOKEN || '',
  dataRetentionDays: Number(process.env.DATA_RETENTION_DAYS || 30),
  maxBodyBytes: 2 * 1024 * 1024
};

export function isDeepseekConfigured() { return !!config.deepseekApiKey; }
export function isSearchConfigured() { return !!config.braveApiKey; }
