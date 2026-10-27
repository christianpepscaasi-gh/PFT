const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../server');
const { createInMemoryPersistenceStore } = require('../src/persistence');
const { createIdentityFixtures } = require('./fixtures/identities');
const { verifyOwnershipContract } = require('./ownership-contract');

test('memory repositories and HTTP calculations isolate every business resource', async () => {
  await verifyOwnershipContract(createInMemoryPersistenceStore());
});

test('unscoped repositories refuse business operations and invalid identities', async () => {
  const root = createInMemoryPersistenceStore();
  for (const [name, method] of Object.entries(root)) {
    if (typeof method === 'function' && !['connect', 'close', 'isReady', 'forUser'].includes(name)) {
      await assert.rejects(method(), /identity/i, name);
    }
  }
  for (const identity of [null, ...Object.values(createIdentityFixtures()).filter((user) => user.role !== 'user' || user.status !== 'active')]) {
    assert.throws(() => root.forUser(identity), /identity|active user/i);
  }
});

test('business APIs fail closed without a trusted identity, regardless of impersonation headers', async () => {
  const app = createApp({ persistenceStore: createInMemoryPersistenceStore() });
  const response = await request(app).get('/api/accounts').set('x-user-id', 'fixture-user-a');
  assert.equal(response.status, 401);
});

test('Admin, pending and disabled identities cannot use financial APIs', async () => {
  const identities = createIdentityFixtures();
  for (const identity of [identities.admin, identities.pending, identities.disabled]) {
    const app = createApp({ persistenceStore: createInMemoryPersistenceStore(), resolveIdentity: async () => identity });
    assert.equal((await request(app).get('/api/accounts')).status, 403);
    for (const path of ['/api/overview', '/api/reports/overview', '/api/reports/period', '/api/reports/salary', '/api/budgets',
      '/api/daily-limits/override', '/api/planning/payday', '/api/planning/daily-target', '/api/career/probation',
      '/api/career/checkpoints', '/api/career/skills', '/api/career/tasks', '/api/career/journal']) {
      assert.equal((await request(app).get(path)).status, 403, path);
    }
  }
});

test('Users cannot read, modify, archive, or reference another User\'s records', async () => {
  const root = createInMemoryPersistenceStore();
  const { userA, userB } = createIdentityFixtures();
  const appA = createApp({ persistenceStore: root, resolveIdentity: async () => userA });
  const appB = createApp({ persistenceStore: root, resolveIdentity: async () => userB });
  const account = (await request(appA).post('/api/accounts').send({ name: 'Private', type: 'Cash', initialBalance: 100 })).body;
  const payload = { accountId: account._id, type: 'expense', amount: 2, description: 'Private expense', occurredAt: '2026-10-01' };
  const transaction = (await request(appA).post('/api/transactions').send(payload)).body;
  assert.deepEqual((await request(appB).get('/api/accounts')).body, []);
  assert.deepEqual((await request(appB).get('/api/transactions')).body, []);
  assert.deepEqual((await request(appB).get('/api/transactions?accountId=' + account._id)).body, []);
  assert.equal((await request(appB).patch('/api/transactions/' + transaction._id).send({ amount: 99 })).status, 404);
  assert.equal((await request(appB).delete('/api/transactions/' + transaction._id)).status, 404);
  assert.equal((await request(appB).post('/api/accounts/' + account._id + '/archive').send({ confirm: true })).status, 404);
  assert.equal((await request(appB).post('/api/transactions').send(payload)).status, 404);
  const ownAccount = (await request(appB).post('/api/accounts').send({ name: 'B', type: 'Cash' })).body;
  const ownTransaction = (await request(appB).post('/api/transactions').send({ ...payload, accountId: ownAccount._id })).body;
  assert.equal((await request(appB).patch('/api/transactions/' + ownTransaction._id).send({ accountId: account._id })).status, 404);
  assert.equal((await request(appA).get('/api/accounts')).body[0].balance, 98);
  for (const forged of [{ userId: userB._id }, { role: 'admin' }]) {
    assert.equal((await request(appA).post('/api/accounts').send({ name: 'Forged', type: 'Cash', ...forged })).status, 400);
  }
  assert.equal((await request(appA).get('/api/transactions?userId=' + userB._id)).status, 400);
});
