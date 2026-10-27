const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');
const { createIdentityFixtures } = require('./fixtures/identities');
const { getPhilippineDateKey } = require('../src/utils/finance');

async function verifyOwnershipContract(root) {
  const { userA, userB } = createIdentityFixtures();
  const a = root.forUser(userA);
  const b = root.forUser(userB);
  await a.connect();
  await b.connect();
  const cases = [
    { identity: userA, store: a, initial: 10000, income: 3000, expense: 1000, budget: 31000, reserve: 300, balance: 120 },
    { identity: userB, store: b, initial: 20000, income: 5000, expense: 2000, budget: 62000, reserve: 600, balance: 230 }
  ];
  for (const item of cases) {
    const { store, identity } = item;
    item.account = await store.createAccount({ name: identity.name, type: 'Cash', initialBalance: item.initial });
    item.expenseRecord = await store.createTransaction({ accountId: item.account._id, type: 'expense', amount: item.expense, description: identity.name, occurredAt: new Date('2000-01-01T04:00:00Z') });
    await store.createTransaction({ accountId: item.account._id, type: 'income', amount: item.income, description: identity.name, category: 'Salary', occurredAt: new Date('2000-01-01T05:00:00Z') });
    await store.upsertBudget('2000-01', item.budget);
    await store.createReserve({ label: identity.name, amount: item.reserve });
    await store.upsertDailyOverride({ date: '2000-01-01', targetAmount: item.expense, reason: identity.name });
    await store.saveCareerProbation({ startDate: '2000-01-01', endDate: '2000-06-01', elapsedDays: 0, remainingDays: 0 });
    for (const [type, payload] of Object.entries({
      checkpoints: { date: '2000-01-01', title: identity.name, status: 'upcoming' },
      skills: { name: identity.name, status: 'learning' },
      tasks: { title: identity.name, status: 'todo' },
      journal: { date: '2000-01-01', entry: identity.name }
    })) await store.createCareerEntry(type, payload);
  }
  for (const item of cases) {
    const { store, identity } = item;
    const foreign = cases.find((other) => other !== item);
    assert.equal(await store.getAccount(foreign.account._id), null);
    assert.equal(await store.archiveAccount(foreign.account._id), null);
    assert.equal(await store.getTransaction(foreign.expenseRecord._id), null);
    assert.equal(await store.updateTransaction(foreign.expenseRecord._id, { amount: 999 }), null);
    assert.equal(await store.deleteTransaction(foreign.expenseRecord._id), null);
    await assert.rejects(store.updateTransaction(item.expenseRecord._id, { accountId: foreign.account._id }), /not found/i);
    await assert.rejects(store.updateTransaction(item.expenseRecord._id, { userId: foreign.identity._id }), /ownership/i);
    await assert.rejects(store.updateTransaction(item.expenseRecord._id, { $set: { accountId: foreign.account._id } }), /unsupported/i);
    await assert.rejects(store.createReserve({ userId: foreign.identity._id, amount: 1 }), /ownership/i);
    await assert.rejects(store.listTransactions({ $ne: '' }), /string/i);
    assert.deepEqual(await store.listTransactions(foreign.account._id), []);
    assert.equal((await store.listBudgets()).length, 1);
    assert.equal((await store.getBudget('2000-01')).amount, item.budget);
    assert.equal((await store.listDailyOverrides()).length, 1);
    assert.equal((await store.getDailyOverride('2000-01-01')).targetAmount, item.expense);
    assert.equal((await store.listReserves()).length, 1);
    assert.equal((await store.getCareerProbation()).userId, identity._id);
    for (const type of ['checkpoints', 'skills', 'tasks', 'journal']) {
      const records = await store.listCareerEntries(type);
      assert.equal(records.length, 1);
      assert.equal(records[0].userId, identity._id);
    }
    const app = createTestApp({ persistenceStore: root, identity });
    for (const path of ['/api/reports/overview', '/api/overview?month=2000-01', '/api/reports/period?period=custom&start=2000-01-01&end=2000-01-01']) {
      const response = await request(app).get(path);
      assert.equal(response.status, 200);
      const data = response.body;
      assert.equal(data.income ?? data.monthlyIncome, item.income / 100);
      assert.equal(data.expenses ?? data.monthlyExpenses, item.expense / 100);
      assert.equal(data.netCashFlow, (item.income - item.expense) / 100);
      assert.equal((data.accounts || data.accountBalances).length, 1);
      assert.equal((data.accounts || data.accountBalances)[0].balance, item.balance);
    }
    const salary = (await request(app).get('/api/reports/salary?month=2000-01')).body;
    assert.equal(salary.totalIncome, item.income / 100);
    assert.equal(salary.count, 1);
    const target = (await request(app).get('/api/planning/daily-target?date=2000-01-01')).body;
    assert.equal(target.monthlyBudget, item.budget / 100);
    assert.equal(target.amount, item.expense / 100);
    assert.equal(target.spending, item.expense / 100);
    assert.equal(target.remaining, 0);
    const next = getPhilippineDateKey(new Date(Date.now() + 7 * 86400000));
    const payday = (await request(app).get('/api/planning/payday?nextExpectedPayday=' + next)).body;
    assert.equal(payday.inputs.availableBalance, item.balance);
    assert.equal(payday.inputs.reserves, item.reserve / 100);
    for (const type of ['probation', 'checkpoints', 'skills', 'tasks', 'journal']) {
      const response = await request(app).get('/api/career/' + type);
      assert.equal(response.status, 200);
      const records = Array.isArray(response.body) ? response.body : [response.body];
      assert.equal(records.length, 1);
      assert.equal(records[0].userId, identity._id);
    }
  }
  // Identical owner/month and owner/date upserts update in place, independently.
  await a.upsertBudget('2000-01', 77700);
  await a.upsertDailyOverride({ date: '2000-01-01', targetAmount: 500, reason: 'Changed A' });
  const probationId = (await a.getCareerProbation())._id;
  await a.saveCareerProbation({ startDate: '2000-02-01', endDate: '2000-07-01', elapsedDays: 0, remainingDays: 0 });
  assert.equal((await a.getCareerProbation())._id, probationId);
  assert.equal((await b.getCareerProbation()).startDate, '2000-01-01');
  assert.equal((await b.getBudget('2000-01')).amount, 62000);
  assert.equal((await b.getDailyOverride('2000-01-01')).targetAmount, 2000);
  await a.archiveAccount(cases[0].account._id);
  assert.equal((await b.getAccount(cases[1].account._id)).archived, false);
  assert.equal((await a.listTransactions()).length, 2);
}

module.exports = { verifyOwnershipContract };
