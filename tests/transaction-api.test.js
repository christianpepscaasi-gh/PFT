const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetInMemoryStore } = require('../server');

test('create account and transaction updates balances', async () => {
  resetInMemoryStore();
  const app = createApp();

  let response = await request(app)
    .post('/api/accounts')
    .send({ name: 'Main Cash', type: 'Cash', initialBalance: 100000 });

  assert.equal(response.status, 201);
  const account = response.body;

  response = await request(app)
    .post('/api/transactions')
    .send({
      accountId: account._id,
      type: 'expense',
      amount: 25000,
      description: 'Groceries',
      category: 'Groceries',
      occurredAt: '2026-10-07T08:00:00+08:00'
    });

  assert.equal(response.status, 201);
  const transaction = response.body;
  assert.equal(transaction.amount, 25000);

  response = await request(app).get('/api/accounts');

  assert.equal(response.status, 200);
  assert.equal(response.body[0].balance, 75000);
});

test('updating a transaction refreshes account balances', async () => {
  resetInMemoryStore();
  const app = createApp();

  let response = await request(app)
    .post('/api/accounts')
    .send({ name: 'Bank', type: 'Bank', initialBalance: 50000 });
  const account = response.body;

  response = await request(app)
    .post('/api/transactions')
    .send({
      accountId: account._id,
      type: 'income',
      amount: 30000,
      description: 'Pay',
      category: 'Salary',
      occurredAt: '2026-10-07T10:00:00+08:00'
    });
  const transaction = response.body;

  response = await request(app)
    .patch(`/api/transactions/${transaction._id}`)
    .send({ amount: 60000 });

  assert.equal(response.status, 200);

  response = await request(app).get('/api/accounts');
  assert.equal(response.body[0].balance, 110000);
});
