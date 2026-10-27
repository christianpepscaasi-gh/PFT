const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createTestEnvironment } = require('../src/config/test-environment');

test('isolated configuration never falls back to the live connection', () => {
  assert.throws(() => createTestEnvironment({ MONGODB_URI: 'mongodb://localhost/live' }), /dedicated test/i);
  const source = { MONGODB_URI: 'mongodb://localhost/live', MONGODB_URI_TEST: 'mongodb://localhost/ledger_test', PORT: '3000' };
  const first = createTestEnvironment(source);
  const second = createTestEnvironment(source);
  assert.notEqual(first.MONGODB_URI, second.MONGODB_URI);
  assert.match(new URL(first.MONGODB_URI).pathname, /^\/pft_test_[a-f0-9]+$/);
  assert.ok(new URL(first.MONGODB_URI).pathname.slice(1).length <= 38, 'Generated names must fit the tested Atlas limit');
  for (const key of ['MONGODB_URI_TEST', 'MONGODB_TEST_URI', 'MONGO_URI_TEST']) assert.equal(first[key], first.MONGODB_URI);
  assert.equal(source.MONGODB_URI, 'mongodb://localhost/live');
  assert.equal(source.MONGODB_URI_TEST, 'mongodb://localhost/ledger_test');
});

test('test URI validation rejects live database names, malformed URIs and database overrides without exposing secrets', () => {
  for (const uri of ['mongodb://user:secret@localhost/live', 'https://user:secret@example.com/test', 'not-a-uri',
    'mongodb://localhost/ledger_test?dbName=live', 'mongodb://localhost/%6cive']) {
    assert.throws(() => createTestEnvironment({ MONGODB_URI_TEST: uri }), (error) => {
      assert.doesNotMatch(error.message, /secret|user:|mongodb:\/\//);
      return true;
    });
  }
});

test('URI aliases and unnamed dedicated test connections are supported', () => {
  for (const key of ['MONGODB_URI_TEST', 'MONGODB_TEST_URI', 'MONGO_URI_TEST']) {
    const env = createTestEnvironment({ [key]: 'mongodb://localhost/?authSource=admin' });
    assert.equal(new URL(env.MONGODB_URI).searchParams.get('authSource'), 'admin');
    assert.match(new URL(env.MONGODB_URI).pathname, /^\/pft_test_/);
  }
  assert.throws(() => createTestEnvironment({ MONGODB_URI_TEST: 'invalid', MONGO_URI_TEST: 'mongodb://localhost/test' }));
});

test('unit-only configuration disables every Mongo URI; localhost mode uses a stable test database', () => {
  const source = { MONGODB_URI: 'mongodb://localhost/live', MONGODB_URI_TEST: 'mongodb://localhost/test' };
  const unit = createTestEnvironment(source, { unit: true });
  for (const key of ['MONGODB_URI', 'MONGODB_URI_TEST', 'MONGODB_TEST_URI', 'MONGO_URI_TEST']) assert.equal(unit[key], '');
  assert.equal(new URL(createTestEnvironment(source, { server: true }).MONGODB_URI).pathname, '/pft_test_local');
});

test('test and localhost entrypoints refuse missing test configuration despite a live URI', () => {
  const env = { ...process.env, MONGODB_URI: 'mongodb://localhost/live', MONGODB_URI_TEST: '', MONGODB_TEST_URI: '', MONGO_URI_TEST: '' };
  for (const script of ['run-tests.js', 'test-server.js']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', script)], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /mongodb:\/\/localhost\/live|Server listening/);
  }
});
