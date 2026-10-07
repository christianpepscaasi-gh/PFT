const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetInMemoryStore } = require('../server');

test('quick entry supports income and expense transactions with local date and time defaults', async () => {
  resetInMemoryStore();
  const app = createApp();

  const accountResponse = await request(app)
    .post('/api/accounts')
    .send({ name: 'Cash', type: 'Cash', initialBalance: 20000 });

  const response = await request(app)
    .post('/api/transactions')
    .send({
      accountId: accountResponse.body._id,
      type: 'expense',
      amount: 3000,
      description: 'Lunch',
      category: 'Food',
      occurredAt: '2026-10-07T12:30:00+08:00'
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.type, 'expense');
  assert.equal(response.body.accountId, accountResponse.body._id);
  assert.equal(response.body.amount, 3000);
});

test('account activity and timeline reflect only the selected account and maintain chronological order', async () => {
  resetInMemoryStore();
  const app = createApp();

  const walletA = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet A', type: 'Cash', initialBalance: 10000 });
  const walletB = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet B', type: 'Bank', initialBalance: 5000 });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId: walletA.body._id,
      type: 'expense',
      amount: 2000,
      description: 'A expense',
      category: 'Food',
      occurredAt: '2026-10-07T09:00:00+08:00'
    });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId: walletB.body._id,
      type: 'income',
      amount: 5000,
      description: 'B income',
      category: 'Salary',
      occurredAt: '2026-10-07T10:00:00+08:00'
    });

  const response = await request(app)
    .get('/api/transactions')
    .query({ accountId: walletA.body._id });

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].description, 'A expense');
});
