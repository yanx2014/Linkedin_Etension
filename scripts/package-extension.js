// Package the extension into dist/extension.zip using a dependency-free ZIP
// writer (store method, no compression) so the build has no external deps. The
// backend/, tests/, scripts/, and node_modules/ directories are excluded.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(root, 'dist');
const OUT_FILE = join(OUT_DIR, 'extension.zip');

const INCLUDE = [
  'manifest.json', 'popup', 'sidepanel', 'background', 'content', 'import',
  'selector', 'avatar', 'storage', 'schemas', 'utils', 'data', 'assets',
  'README.md', 'PRIVACY.md', 'LICENSE'
];
const EXCLUDE_DIRS = new Set(['node_modules', 'backend', 'tests', 'scripts', 'dist', '.git']);

function walk(absPath, relPath, files) {
  const st = statSync(absPath);
  if (st.isDirectory()) {
    const base = relPath.split('/')[0];
    if (EXCLUDE_DIRS.has(base)) return;
    for (const entry of readdirSync(absPath)) {
      if (entry.startsWith('.')) continue;
      walk(join(absPath, entry), relPath ? `${relPath}/${entry}` : entry, files);
    }
  } else if (st.isFile()) {
    files.push(relPath);
  }
}

function collectFiles() {
  const files = [];
  for (const item of INCLUDE) {
    const abs = join(root, item);
    try { walk(abs, item, files); } catch { /* optional path missing */ }
  }
  return files.filter((f) => !EXCLUDE_DIRS.has(f.split('/')[0]));
}

// Minimal ZIP writer (deflate). Sufficient for Chrome "Load unpacked" via unzip.
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const rel of files) {
    const data = readFileSync(join(root, rel));
    const nameBuf = Buffer.from(rel, 'utf8');
    const crc = crc32(data) >>> 0;
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8); cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

const files = collectFiles();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, buildZip(files));
console.log(`Packaged ${files.length} files into ${relative(root, OUT_FILE)}`);
