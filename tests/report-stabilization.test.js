const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');
const { createIdentityFixtures } = require('./fixtures/identities');

async function fixture(app, entries) {
  const account = await request(app).post('/api/accounts')
    .send({ name: 'Report regression', type: 'Cash', initialBalance: 100 });
  assert.equal(account.status, 201);
  const ids = [];
  for (const entry of entries) {
    const response = await request(app).post('/api/transactions').send({
      accountId: account.body._id, type: 'income', category: 'Salary',
      description: 'Report regression', ...entry
    });
    assert.equal(response.status, 201);
    ids.push(response.body._id);
  }
  return ids;
}

test('future salary is absent from every actual-income report without deleting the source record', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-20T04:00:00Z') });
  const app = createTestApp();
  const ids = await fixture(app, [
    { amount: 10.01, occurredAt: '2026-10-20T09:00:00+08:00' },
    { amount: 2.02, category: 'Other', occurredAt: '2026-10-20T10:00:00+08:00' },
    { amount: 1.01, type: 'expense', category: 'Food', occurredAt: '2026-10-20T11:00:00+08:00' },
    { amount: 20.02, occurredAt: '2026-10-21T00:00:00+08:00' }
  ]);
  assert.equal((await app.locals.persistenceStore.forUser(createIdentityFixtures().userA).getTransaction(ids[3])).amount, 2002);
  assert.equal((await request(app).get('/api/transactions')).body.length, 4);

  const overview = await request(app).get('/api/overview?month=2026-10');
  assert.equal(overview.body.monthlyIncome, 12.03);
  assert.equal(overview.body.monthlyExpenses, 1.01);
  assert.equal(overview.body.currentBalance, 111.02);
  const allTime = await request(app).get('/api/reports/overview');
  assert.equal(allTime.body.income, 12.03);
  for (const query of ['period=today', 'period=week', 'period=month',
    'period=custom&start=2026-10-20&end=2026-10-21']) {
    const response = await request(app).get('/api/reports/period?' + query);
    assert.equal(response.status, 200);
    assert.equal(response.body.income, 12.03, query);
    assert.equal(response.body.expenses, 1.01, query);
    assert.equal(response.body.netCashFlow, 11.02, query);
    assert.equal(response.body.count, 3, query);
    assert.ok(response.body.transactions.every((entry) => entry._id !== ids[3]), query);
  }
  const salary = await request(app).get('/api/reports/salary?month=2026-10');
  assert.equal(salary.body.totalIncome, 10.01);
  assert.equal(salary.body.count, 1);
});

test('salary becomes actual at Philippine midnight without a new write, including next-month queries', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-31T15:59:59.999Z') });
  const app = createTestApp();
  await fixture(app, [{ amount: 123.45, occurredAt: '2026-10-31T16:00:00Z' }]);
  const before = await request(app).get('/api/reports/salary?month=2026-11');
  assert.equal(before.body.totalIncome, 0);
  assert.equal(before.body.count, 0);
  assert.equal((await request(app).get('/api/overview?month=2026-11')).body.monthlyIncome, 0);
  assert.equal((await request(app).get('/api/reports/period?period=month&start=2026-11-01')).body.income, 0);
  t.mock.timers.setTime(new Date('2026-10-31T16:00:00Z').getTime());
  const after = await request(app).get('/api/reports/salary');
  assert.equal(after.body.month, '2026-11');
  assert.equal(after.body.totalIncome, 123.45);
  assert.equal(after.body.count, 1);
  assert.equal((await request(app).get('/api/overview')).body.monthlyIncome, 123.45);
  assert.equal((await request(app).get('/api/reports/period?period=today')).body.income, 123.45);
  assert.equal((await request(app).get('/api/transactions')).body.length, 1);
});

test('same-Philippine-day salary retains existing calendar-date semantics', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-19T16:00:00Z') });
  const app = createTestApp();
  await fixture(app, [{ amount: 0.01, occurredAt: '2026-10-20T23:59:59+08:00' }]);
  assert.equal((await request(app).get('/api/reports/salary?month=2026-10')).body.totalIncome, 0.01);
});

test('explicit weekly dates select the entire containing Monday-Sunday week', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-10T04:00:00Z') });
  const app = createTestApp();
  await fixture(app, [
    { amount: 9, occurredAt: '2026-12-27T23:59:59+08:00' },
    { amount: 1.01, occurredAt: '2026-12-28T00:00:00+08:00' },
    { amount: 2.02, occurredAt: '2027-01-03T23:59:59.999+08:00' },
    { amount: 9, occurredAt: '2027-01-04T00:00:00+08:00' }
  ]);
  for (const query of ['start=2026-12-30', 'end=2026-12-30',
    'start=2026-12-29&end=2027-01-01', 'start=2027-01-03',
    'start=2026-12-28&end=2027-01-03']) {
    const response = await request(app).get('/api/reports/period?period=week&' + query);
    assert.equal(response.status, 200, query);
    assert.equal(response.body.start, '2026-12-28', query);
    assert.equal(response.body.end, '2027-01-03', query);
    assert.equal(response.body.income, 3.03, query);
    assert.equal(response.body.count, 2, query);
  }
});

test('weekly mode rejects conflicting weeks and reversed dates; custom ranges remain inclusive', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-10T04:00:00Z') });
  const app = createTestApp();
  for (const query of ['start=2026-12-30&end=2027-01-04',
    'start=2027-01-02&end=2026-12-29']) {
    const response = await request(app).get('/api/reports/period?period=week&' + query);
    assert.equal(response.status, 400, query);
  }
  await fixture(app, [
    { amount: 1.01, occurredAt: '2026-12-30T00:00:00+08:00' },
    { amount: 2.02, occurredAt: '2027-01-04T23:59:59+08:00' },
    { amount: 9, occurredAt: '2027-01-05T00:00:00+08:00' }
  ]);
  const custom = await request(app).get('/api/reports/period?period=custom&start=2026-12-30&end=2027-01-04');
  assert.equal(custom.status, 200);
  assert.equal(custom.body.start, '2026-12-30');
  assert.equal(custom.body.end, '2027-01-04');
  assert.equal(custom.body.income, 3.03);
});

for (const boundary of [
  { before: '2026-12-31T15:59:59.999Z', after: '2026-12-31T16:00:00Z',
    previous: '2026-12-31', current: '2027-01-01', monday: '2026-12-28', sunday: '2027-01-03' },
  { before: '2028-02-29T15:59:59.999Z', after: '2028-02-29T16:00:00Z',
    previous: '2028-02-29', current: '2028-03-01', monday: '2028-02-28', sunday: '2028-03-05' }
]) {
  test('daily, weekly, monthly and salary reports agree at Manila rollover ' + boundary.current, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(boundary.after) });
    const app = createTestApp();
    await fixture(app, [
      { amount: 1.01, occurredAt: boundary.before },
      { amount: 2.02, occurredAt: boundary.after },
      { amount: 0.01, type: 'expense', category: 'Food', occurredAt: boundary.after }
    ]);
    const today = await request(app).get('/api/reports/period?period=today');
    assert.equal(today.body.start, boundary.current);
    assert.equal(today.body.end, boundary.current);
    assert.equal(today.body.income, 2.02);
    assert.equal(today.body.expenses, 0.01);
    const week = await request(app).get('/api/reports/period?period=week');
    assert.equal(week.body.start, boundary.monday);
    assert.equal(week.body.end, boundary.sunday);
    assert.equal(week.body.income, 3.03);
    const month = await request(app).get('/api/reports/period?period=month');
    assert.equal(month.body.start, boundary.current);
    assert.equal(month.body.income, 2.02);
    const salary = await request(app).get('/api/reports/salary');
    assert.equal(salary.body.month, boundary.current.slice(0, 7));
    assert.equal(salary.body.totalIncome, 2.02);
    const previous = await request(app).get('/api/reports/salary?month=' + boundary.previous.slice(0, 7));
    assert.equal(previous.body.totalIncome, 1.01);
  });
}
