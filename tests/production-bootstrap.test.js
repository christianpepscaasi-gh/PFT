const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { accountSetup, productionTarget, productionArguments } = require('../src/auth/production-bootstrap');
const { bootstrapPair } = require('../src/auth/bootstrap');
const { verifyPassword } = require('../src/auth/passwords');
const { createMemoryIdentityRepository } = require('./auth-helper');

const values = () => ({ ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'Synthetic-admin-passphrase-30',
  USER_EMAIL: 'user@example.test', USER_PASSWORD: 'Synthetic-personal-passphrase-30' });

test('production credentials require separate identities and never echo values on validation errors', () => {
  assert.equal(accountSetup(values()).admin.name, 'Owner Admin');
  assert.equal(accountSetup(values()).user.name, 'Personal User');
  assert.throws(() => accountSetup({ ADMIN_EMAIL: values().ADMIN_EMAIL }), /ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD/);
  for (const input of [{ ...values(), USER_EMAIL: values().ADMIN_EMAIL.toUpperCase() },
    { ...values(), ADMIN_EMAIL: 'invalid-private-email' }, { ...values(), ADMIN_PASSWORD: 'short' }]) {
    assert.throws(() => accountSetup(input), (error) => {
      for (const secret of Object.values(input)) assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});

test('production target requires explicit non-test database and hides malformed URI details', () => {
  assert.equal(productionTarget('mongodb://localhost/pocket_ledger').database, 'pocket_ledger');
  for (const uri of [undefined, 'mongodb://private:secret@localhost', 'mongodb://localhost/pft_test_local',
    'mongodb://localhost/admin', 'mongodb://localhost/config', 'https://private:secret@host/ledger',
    'mongodb://localhost/ledger?dbName=other', 'mongodb://localhost/%2Fprivate']) {
    assert.throws(() => productionTarget(uri), (error) => {
      assert.doesNotMatch(error.message, /private|secret|localhost/); return true;
    });
  }
});

test('production CLI requires precise target and explicit matching-database apply syntax', () => {
  assert.equal(productionArguments(['--target', 'production']).apply, false);
  assert.deepEqual(productionArguments(['--target', 'production', '--database', 'ledger', '--apply']), { apply: true, database: 'ledger' });
  for (const args of [[], ['--apply'], ['--target', 'production', '--apply'], ['--target', 'test'],
    ['--target', 'production', '--database', 'ledger', '--reset']]) {
    assert.throws(() => productionArguments(args));
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'bootstrap-production.js'), ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /mongodb|Synthetic-|provisioned/);
  }
});

test('production setup uses atomic bootstrap, hashes passwords, and preserves existing identities on rerun/conflict', async () => {
  const repository = createMemoryIdentityRepository();
  const setup = accountSetup(values());
  const dry = await bootstrapPair(null, setup);
  assert.equal(dry.dryRun, true);
  assert.equal(repository.users.size, 0);
  const pair = await bootstrapPair(repository, setup, { apply: true });
  const initial = structuredClone(repository.users);
  assert.ok(await verifyPassword(setup.admin.password, repository.users.get(pair.adminId).passwordHash));
  assert.ok(await verifyPassword(setup.user.password, repository.users.get(pair.userId).passwordHash));
  assert.equal((await bootstrapPair(repository, { ...setup, admin: { ...setup.admin, password: 'Different-private-password-30' } }, { apply: true })).created, false);
  assert.deepEqual(repository.users, initial);
  await assert.rejects(bootstrapPair(repository, { ...setup, admin: { ...setup.admin, email: 'other@example.test' } }, { apply: true }));
  assert.deepEqual(repository.users, initial);
  assert.equal(repository.audit.length, 1);
});
