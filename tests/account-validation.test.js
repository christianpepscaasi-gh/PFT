const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');
const { createInMemoryPersistenceStore, models } = require('../src/persistence');

test('account creation rejects invalid names and unsupported types without saving them', async () => {
  const app = createTestApp();
  for (const name of ['   ', '\t\n', 42, {}, ['Wallet']]) {
    assert.equal((await request(app).post('/api/accounts').send({ name, type: 'Cash' })).status, 400);
  }
  for (const type of ['Unsupported', ' ', 42, {}, ['Cash']]) {
    assert.equal((await request(app).post('/api/accounts').send({ name: 'Wallet', type })).status, 400);
  }
  assert.deepEqual((await request(app).get('/api/accounts')).body, []);
});

test('supported account types preserve compatibility and names are trimmed', async () => {
  const app = createTestApp();
  for (const type of ['Cash', 'Bank', 'E-wallet', 'Credit Card', 'Other', 'cash', 'bank', 'wallet', 'credit', 'other']) {
    const response = await request(app).post('/api/accounts').send({ name: '  My account  ', type, initialBalance: -1.25 });
    assert.equal(response.status, 201);
    assert.equal(response.body.name, 'My account');
    assert.equal(response.body.type, type);
    assert.equal(response.body.balance, -1.25);
  }
});

test('transaction filters reject operator objects, arrays and empty IDs', async () => {
  const app = createTestApp();
  for (const query of ['accountId[$ne]=x', 'accountId[$in][]=x', 'accountId[]=x', 'accountId=x&accountId=y', 'accountId=', 'accountId=%20']) {
    assert.equal((await request(app).get('/api/transactions?' + query)).status, 400, query);
  }
  assert.equal((await request(app).get('/api/transactions')).status, 200);
  assert.deepEqual((await request(app).get('/api/transactions?accountId=unknown')).body, []);
});

test('invalid transaction account references are rejected without changing history', async () => {
  const app = createTestApp();
  const account = (await request(app).post('/api/accounts').send({ name: 'Wallet', type: 'Cash' })).body;
  const payload = { accountId: account._id, type: 'expense', amount: 1, description: 'Lunch' };
  const saved = (await request(app).post('/api/transactions').send(payload)).body;
  for (const accountId of [{ $ne: null }, [account._id], 42, '', ' ']) {
    assert.equal((await request(app).post('/api/transactions').send({ ...payload, accountId })).status, 400);
    assert.equal((await request(app).patch('/api/transactions/' + saved._id).send({ accountId })).status, 400);
  }
  const history = (await request(app).get('/api/transactions')).body;
  assert.equal(history.length, 1);
  assert.equal(history[0].accountId, account._id);
});

test('Mongo schema and memory adapter enforce account names and types consistently', async () => {
  const store = createInMemoryPersistenceStore();
  for (const payload of [{ name: ' ', type: 'Cash' }, { name: 'Wallet', type: 'Unsupported' }]) {
    await assert.rejects(new models.Account({ ...payload, initialBalance: 0 }).validate(), { name: 'ValidationError' });
    await assert.rejects(store.createAccount({ ...payload, initialBalance: 0 }), { name: 'ValidationError' });
  }
  const account = await store.createAccount({ name: ' Wallet ', type: 'Other', initialBalance: 0 });
  assert.equal(account.name, 'Wallet');
  assert.equal((await store.listAccounts()).length, 1);
});
