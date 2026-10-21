const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const vm = require('node:vm');
const fs = require('node:fs');
const { createTestApp } = require('./app-helper');
const { parsePhilippineDate } = require('../src/utils/finance');

function freeze(t, iso) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
}

test('weekly reports calculate Monday-Sunday across year and month boundaries', async (t) => {
  freeze(t, '2027-01-01T02:00:00Z');
  const app = createTestApp();
  const account = await request(app).post('/api/accounts').send({ name: 'Cash', type: 'Cash' });
  for (const occurredAt of ['2026-12-27T23:59:59+08:00', '2026-12-28T00:00:00+08:00', '2027-01-03T23:59:59+08:00', '2027-01-04T00:00:00+08:00']) {
    await request(app).post('/api/transactions').send({ accountId: account.body._id, type: 'expense', amount: 1, description: 'Boundary', occurredAt });
  }
  const response = await request(app).get('/api/reports/period?period=week');
  assert.equal(response.status, 200);
  assert.equal(response.body.start, '2026-12-28');
  assert.equal(response.body.end, '2027-01-03');
  assert.equal(response.body.expenses, 2);
  const monthBoundary = await request(app).get('/api/reports/period?period=week&start=2026-09-28');
  assert.equal(monthBoundary.body.end, '2026-10-04');
});

test('monthly reports handle date inputs, leap years, and invalid ranges', async () => {
  const app = createTestApp();
  const response = await request(app).get('/api/reports/period?period=month&start=2028-02-01');
  assert.equal(response.status, 200);
  assert.equal(response.body.start, '2028-02-01');
  assert.equal(response.body.end, '2028-02-29');
  for (const query of ['period=custom&start=2026-10-22&end=2026-10-01', 'period=month&start=2026-02-30', 'period=invalid']) {
    assert.equal((await request(app).get('/api/reports/period?' + query)).status, 400);
  }
});

test('offset-free transaction timestamps represent Philippine time on create and update', async () => {
  const app = createTestApp();
  const account = await request(app).post('/api/accounts').send({ name: 'Cash', type: 'Cash' });
  const created = await request(app).post('/api/transactions').send({ accountId: account.body._id, type: 'expense', amount: 1, description: 'Midnight', occurredAt: '2026-10-01T00:30:00' });
  assert.equal(new Date(created.body.occurredAt).toISOString(), '2026-09-30T16:30:00.000Z');
  const updated = await request(app).patch('/api/transactions/' + created.body._id).send({ occurredAt: '2026-10-02T02:00:00' });
  assert.equal(new Date(updated.body.occurredAt).toISOString(), '2026-10-01T18:00:00.000Z');
  assert.equal(parsePhilippineDate('2026-10-01').toISOString(), '2026-09-30T16:00:00.000Z');
});

test('current balances exclude future records while historical reports use the selected end date', async (t) => {
  freeze(t, '2026-10-21T06:00:00Z');
  const app = createTestApp();
  const account = await request(app).post('/api/accounts').send({ name: 'Cash', type: 'Cash', initialBalance: 100 });
  await request(app).post('/api/transactions').send({ accountId: account.body._id, type: 'income', amount: 50, description: 'Future', occurredAt: '2026-10-22T00:00:00+08:00' });
  assert.equal((await request(app).get('/api/accounts')).body[0].balance, 100);
  assert.equal((await request(app).get('/api/overview')).body.currentBalance, 100);
  const report = await request(app).get('/api/reports/period?period=custom&start=2026-10-21&end=2026-10-22');
  assert.equal(report.body.accountBalances[0].balance, 150);
});

test('payday recommendations validate dates and exclude archived balances', async (t) => {
  freeze(t, '2026-10-21T15:59:00Z');
  const app = createTestApp();
  await request(app).post('/api/accounts').send({ name: 'Cash', type: 'Cash', initialBalance: 100 });
  const old = await request(app).post('/api/accounts').send({ name: 'Archived', type: 'Cash', initialBalance: 999 });
  await request(app).post('/api/accounts/' + old.body._id + '/archive').send({ confirm: true });
  const response = await request(app).get('/api/planning/payday?nextExpectedPayday=2026-10-23');
  assert.equal(response.body.inputs.availableBalance, 100);
  assert.equal(response.body.days, 2);
  assert.equal(response.body.amount, 50);
  assert.equal((await request(app).get('/api/planning/payday?nextExpectedPayday=garbage')).status, 400);
  assert.equal((await request(app).get('/api/planning/payday?nextExpectedPayday=2026-02-30')).status, 400);
  assert.equal((await request(app).get('/api/planning/payday?nextExpectedPayday=2026-10-21')).body.status, 'unavailable');
});

test('browser defaults use Philippine dates and times at midnight and month rollover', () => {
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8').split('const currencyFormatter')[0];
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(source, context);
  const result = vm.runInContext("getManilaDateTime(new Date('2026-09-30T16:01:00Z'))", context);
  assert.equal(result.date, '2026-10-01');
  assert.equal(result.time, '00:01');
});
