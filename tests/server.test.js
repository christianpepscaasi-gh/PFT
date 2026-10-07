const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

test('Express app bootstraps without crashing', async () => {
  const app = createApp();
  assert.ok(app);
  assert.equal(typeof app.get, 'function');
});
