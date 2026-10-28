const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../server');

test('serves the overview UI shell at the root path', async () => {
  const app = createApp();

  const response = await request(app).get('/');

  assert.equal(response.status, 200);
  assert.match(response.text, /Pocket Ledger/i);
  assert.match(response.text, /Overview/i);
  assert.match(response.text, /Reports/i);
  assert.match(response.text, /Quick Entry/i);
  assert.match(response.text, /Create Account/i);
  assert.match(response.text, /Account Name/i);
  assert.match(response.text, /Career/i);
  assert.match(response.text, /Probation/i);
  assert.match(response.text, /Skills/i);
  assert.match(response.text, /Planning/i);
  assert.match(response.text, /Monthly Budget/i);
  assert.match(response.text, /Reserve/i);
  assert.match(response.text, /id="user-workspace"[^>]*hidden/);
  assert.match(response.text, /id="admin-workspace"[^>]*hidden/);
  assert.match(response.text, /id="login-form"[^>]*hidden/);
  assert.ok(response.text.indexOf('/session-ui.js') < response.text.indexOf('/app.js'));
});
