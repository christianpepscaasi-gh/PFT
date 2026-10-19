const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');

test('archiving an account preserves history and excludes it from current balances', async () => {
  const app = createTestApp();

  const accountResponse = await request(app)
    .post('/api/accounts')
    .send({ name: 'Old Wallet', type: 'Cash', initialBalance: 20000 });

  const accountId = accountResponse.body._id;

  await request(app)
    .post('/api/transactions')
    .send({
      accountId,
      type: 'expense',
      amount: 5000,
      description: 'Lunch',
      category: 'Food',
      occurredAt: '2026-10-07T12:00:00+08:00'
    });

  const archiveResponse = await request(app)
    .post(`/api/accounts/${accountId}/archive`)
    .send({ confirm: true });

  assert.equal(archiveResponse.status, 200);
  assert.equal(archiveResponse.body.archived, true);

  const accountsResponse = await request(app).get('/api/accounts');
  assert.equal(accountsResponse.body.some((account) => account._id === accountId && account.archived), true);

  const overviewResponse = await request(app).get('/api/reports/overview');
  assert.equal(overviewResponse.body.accounts.some((account) => account._id === accountId), false);
});

test('daily override affects only the selected date and does not change the monthly budget', async () => {
  const app = createTestApp();

  await request(app)
    .post('/api/budgets')
    .send({ month: '2026-10', amount: 40000 });

  const overrideResponse = await request(app)
    .post('/api/daily-limits/override')
    .send({
      date: '2026-10-07',
      targetAmount: 6000,
      reason: 'Celebration'
    });

  assert.equal(overrideResponse.status, 201);
  assert.equal(overrideResponse.body.targetAmount, 6000);
  assert.equal(overrideResponse.body.reason, 'Celebration');

  const targetResponse = await request(app)
    .get('/api/planning/daily-target')
    .query({ date: '2026-10-07', month: '2026-10' });

  assert.equal(targetResponse.body.monthlyBudget, 40000);
  assert.equal(targetResponse.body.amount > 0, true);
});
