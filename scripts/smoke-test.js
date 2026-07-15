// Smoke test: run the import→select→avatar→export pipeline on the bundled sample
// data and confirm the exports are produced. Exits non-zero on failure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runImportPipeline } from '../import/import-job.js';
import { parseJsonImport } from '../import/json-parser.js';
import { validateCriteria } from '../utils/validation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const records = parseJsonImport(readFileSync(join(root, 'data', 'sample-profiles.json'), 'utf8')).records;
const criteria = validateCriteria(JSON.parse(readFileSync(join(root, 'data', 'criteria.example.json'), 'utf8'))).normalized;

const res = await runImportPipeline({ records, criteria, nowMs: Date.parse('2026-01-01T00:00:00Z'), job: { id: 'smoke' } });

const required = ['profiles_selected.csv', 'profiles_rejected.csv', 'audit.json', 'avatar_evidence.json', 'job_summary.json'];
for (const f of required) {
  if (!res.exports[f]) { console.error(`missing export: ${f}`); process.exit(1); }
}
if (!res.exports['profiles_selected.csv'].startsWith('﻿')) { console.error('CSV missing BOM'); process.exit(1); }
if (res.audit.length !== records.length) { console.error('audit does not cover every input'); process.exit(1); }

console.log(`Smoke test OK: ${res.accepted.length} accepted, ${res.rejected.length} rejected, ${res.audit.length} audited.`);
