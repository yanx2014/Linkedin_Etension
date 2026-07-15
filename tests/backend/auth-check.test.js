import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCheckRoute } from '../../backend/routes/auth-check.js';
import { config } from '../../backend/config.js';

function reqWith(auth) {
  return { headers: auth ? { authorization: auth } : {} };
}

test('auth-check reports open backend when no token configured', () => {
  const prev = config.installToken;
  config.installToken = '';
  try {
    const r = authCheckRoute(reqWith(null));
    assert.equal(r.ok, true);
    assert.equal(r.backend, true);
    assert.equal(r.token_required, false);
    assert.equal(r.token_valid, true); // open => valid
  } finally { config.installToken = prev; }
});

test('auth-check distinguishes valid vs invalid token', () => {
  const prev = config.installToken;
  config.installToken = 'secret-token';
  try {
    assert.equal(authCheckRoute(reqWith('Bearer secret-token')).token_valid, true);
    assert.equal(authCheckRoute(reqWith('Bearer wrong')).token_valid, false);
    assert.equal(authCheckRoute(reqWith(null)).token_valid, false);
    assert.equal(authCheckRoute(reqWith(null)).token_required, true);
  } finally { config.installToken = prev; }
});

test('auth-check never leaks the token or key values', () => {
  const prev = config.installToken;
  config.installToken = 'super-secret';
  try {
    const r = authCheckRoute(reqWith('Bearer super-secret'));
    const json = JSON.stringify(r);
    assert.ok(!json.includes('super-secret'), 'token value must not appear in the response');
  } finally { config.installToken = prev; }
});
