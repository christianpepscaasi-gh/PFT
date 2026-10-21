const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');

test('budget and reserve planning remain separate from actual balances', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T04:00:00Z') });
  const app = createTestApp();

  await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 100000 });

  await request(app)
    .post('/api/budgets')
    .send({ month: '2026-10', amount: 50000 });

  await request(app)
    .post('/api/planning/reserves')
    .send({ amount: 15000, label: 'Emergency fund' });

  const response = await request(app)
    .get('/api/planning/payday')
    .query({ nextExpectedPayday: '2026-10-21' });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'estimate');
  assert.equal(response.body.inputs.availableBalance, 100000);
  assert.equal(response.body.inputs.reserves, 15000);
  assert.equal(response.body.amount > 0, true);
});

test('missing payday planning inputs return unavailable instead of fabricated values', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/api/planning/payday')
    .query({});

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'unavailable');
  assert.equal(response.body.amount, null);
});

test('daily target uses the monthly budget as a suggestion, not a restriction', async () => {
  const app = createTestApp();

  await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 100000 });

  await request(app)
    .post('/api/budgets')
    .send({ month: '2026-10', amount: 50000 });

  const response = await request(app)
    .get('/api/planning/daily-target')
    .query({ date: '2026-10-07', month: '2026-10' });

  assert.equal(response.status, 200);
  assert.equal(response.body.monthlyBudget, 50000);
  assert.equal(response.body.kind, 'suggestion');
  assert.equal(response.body.amount > 0, true);
});


test('daily spending warnings change state without blocking transactions or changing balances', async () => {
  const app = createTestApp();
  const account = await request(app).post('/api/accounts').send({ name: 'Cash', type: 'Cash', initialBalance: 100 });
  await request(app).post('/api/daily-limits/override').send({ date: '2026-10-07', targetAmount: 10 });
  for (const [amount, state] of [[5, 'below-limit'], [3, 'approaching-limit'], [3, 'over-limit']]) {
    const saved = await request(app).post('/api/transactions').send({ accountId: account.body._id, type: 'expense', amount, description: 'Spending', occurredAt: '2026-10-07T12:00:00+08:00' });
    assert.equal(saved.status, 201);
    const target = await request(app).get('/api/planning/daily-target?date=2026-10-07');
    assert.equal(target.body.spendingState, state);
  }
  const target = await request(app).get('/api/planning/daily-target?date=2026-10-07');
  assert.equal(target.body.spending, 11);
  assert.equal(target.body.remaining, -1);
  assert.equal((await request(app).get('/api/accounts')).body[0].balance, 89);
});
