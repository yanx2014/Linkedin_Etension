// Extension-independent test entry point. Discovers every *.test.js file under
// tests/ and runs them with Node's built-in test runner. Exits non-zero on any
// failure.

import { run } from 'node:test';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'fixtures' || entry === 'node_modules' || entry === 'helpers') continue;
      out.push(...findTestFiles(full));
    } else if (entry.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = findTestFiles(here).sort();
if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

const stream = run({ files, concurrency: true });

// Consume the object-mode stream via async iteration so it flows to completion.
for await (const event of stream) {
  if (event.type === 'test:pass') {
    if (event.data.details?.type === 'suite') continue;
    passed += 1;
  } else if (event.type === 'test:fail') {
    if (event.data.details?.type === 'suite') continue;
    failed += 1;
    failures.push({
      name: event.data.name,
      file: event.data.file ? relative(here, event.data.file) : '?',
      error: event.data.details?.error?.message || 'failed'
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed (${files.length} files)`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}  [${f.file}]\n    ${String(f.error).split('\n')[0]}`);
  }
  process.exitCode = 1;
}
