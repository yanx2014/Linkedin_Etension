import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { safeFetch } from '../../backend/website/safe-fetch.js';
import { isPrivateIp, assertPublicHost } from '../../backend/website/dns-guard.js';

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('dns-guard flags private / loopback / link-local addresses', () => {
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.0.0.5'), true);
  assert.equal(isPrivateIp('192.168.1.1'), true);
  assert.equal(isPrivateIp('169.254.169.254'), true); // cloud metadata
  assert.equal(isPrivateIp('172.16.0.1'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('::1'), true);
});

test('assertPublicHost rejects loopback hostname (rebinding defense)', async () => {
  await assert.rejects(() => assertPublicHost('127.0.0.1'));
});

test('safeFetch blocks private hosts by default', async () => {
  const { server, port } = await startServer((req, res) => { res.end('ok'); });
  try {
    await assert.rejects(() => safeFetch(`http://127.0.0.1:${port}/`), /blocked private address/);
  } finally { server.close(); }
});

test('safeFetch enforces the response size limit', async () => {
  const big = 'x'.repeat(5000);
  const { server, port } = await startServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(big); });
  try {
    await assert.rejects(
      () => safeFetch(`http://127.0.0.1:${port}/`, { allowPrivateHosts: true, maxBytes: 1000 }),
      /size limit/
    );
  } finally { server.close(); }
});

test('safeFetch rejects disallowed content types', async () => {
  const { server, port } = await startServer((req, res) => { res.setHeader('content-type', 'application/octet-stream'); res.end('binary'); });
  try {
    await assert.rejects(
      () => safeFetch(`http://127.0.0.1:${port}/`, { allowPrivateHosts: true }),
      /disallowed content-type/
    );
  } finally { server.close(); }
});

test('safeFetch limits redirects', async () => {
  const { server, port } = await startServer((req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${port}${req.url}1` });
    res.end();
  });
  try {
    await assert.rejects(
      () => safeFetch(`http://127.0.0.1:${port}/`, { allowPrivateHosts: true, maxRedirects: 2 }),
      /too many redirects/
    );
  } finally { server.close(); }
});

test('safeFetch returns body for an allowed HTML response', async () => {
  const { server, port } = await startServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<h1>hi</h1>'); });
  try {
    const r = await safeFetch(`http://127.0.0.1:${port}/`, { allowPrivateHosts: true });
    assert.match(r.body, /<h1>hi<\/h1>/);
    assert.equal(r.status, 200);
  } finally { server.close(); }
});
