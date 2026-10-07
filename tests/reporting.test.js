const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetInMemoryStore } = require('../server');

test('weekly report uses Monday to Sunday boundaries and actual income/expenses', async () => {
  resetInMemoryStore();
  const app = createApp();

  const accountResponse = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 100000 });

  const accountId = accountResponse.body._id;

  await request(app)
    .post('/api/transactions')
    .send({
      accountId,
      type: 'expense',
      amount: 2500,
      description: 'Snacks',
      category: 'Food',
      occurredAt: '2026-10-05T12:00:00+08:00'
    });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId,
      type: 'income',
      amount: 30000,
      description: 'Pay cycle',
      category: 'Salary',
      occurredAt: '2026-10-06T09:00:00+08:00'
    });

  const response = await request(app)
    .get('/api/reports/period')
    .query({ period: 'week', start: '2026-10-05', end: '2026-10-11' });

  assert.equal(response.status, 200);
  assert.equal(response.body.income, 30000);
  assert.equal(response.body.expenses, 2500);
  assert.equal(response.body.netCashFlow, 27500);
  assert.equal(response.body.accountBalances[0].balance, 127500);
});

test('salary summaries use actual income only and ignore expected payday values', async () => {
  resetInMemoryStore();
  const app = createApp();

  const accountResponse = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 50000 });

  const accountId = accountResponse.body._id;

  await request(app)
    .post('/api/transactions')
    .send({
      accountId,
      type: 'income',
      amount: 25000,
      description: 'Actual salary',
      category: 'Salary',
      occurredAt: '2026-10-06T09:00:00+08:00'
    });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId,
      type: 'income',
      amount: 15000,
      description: 'Second pay',
      category: 'Salary',
      occurredAt: '2026-10-21T09:00:00+08:00'
    });

  const response = await request(app)
    .get('/api/reports/salary')
    .query({ month: '2026-10' });

  assert.equal(response.status, 200);
  assert.equal(response.body.totalIncome, 40000);
  assert.equal(response.body.count, 2);
});
