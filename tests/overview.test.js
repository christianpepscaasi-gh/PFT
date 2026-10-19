const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');

test('overview reports current account balances and monthly income/expense totals', async () => {
  const app = createTestApp();

  const accountResponse = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 150000 });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId: accountResponse.body._id,
      type: 'income',
      amount: 40000,
      description: 'Pay',
      category: 'Salary',
      occurredAt: '2026-10-06T09:00:00+08:00'
    });

  await request(app)
    .post('/api/transactions')
    .send({
      accountId: accountResponse.body._id,
      type: 'expense',
      amount: 15000,
      description: 'Groceries',
      category: 'Groceries',
      occurredAt: '2026-10-07T08:00:00+08:00'
    });

  const response = await request(app)
    .get('/api/overview')
    .query({ month: '2026-10' });

  assert.equal(response.status, 200);
  assert.equal(response.body.currentBalance, 175000);
  assert.equal(response.body.monthlyIncome, 40000);
  assert.equal(response.body.monthlyExpenses, 15000);
  assert.equal(response.body.accounts[0].balance, 175000);
});

test('salary month initializes to the current month and stays synced with the queried month', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/api/overview')
    .query({ month: '2026-10' });

  assert.equal(response.status, 200);
  assert.equal(response.body.salaryMonth, '2026-10');
  assert.equal(response.body.queryMonth, '2026-10');
});
