const assert = require('node:assert/strict');
const { once } = require('node:events');
const { getPhilippineDateKey } = require('../src/utils/finance');
const { createApp } = require('../server');
const { createPersistenceStore } = require('../src/persistence');
const { createIdentityFixtures } = require('./fixtures/identities');
const identity = createIdentityFixtures().userA;
const root = createPersistenceStore();
const app = createApp({ persistenceStore: root, resolveIdentity: async () => identity });

async function main() {
  const phase = process.argv[2];
  const snapshot = JSON.parse(process.argv[3] || '{}');
  const store = root.forUser(identity);
  let server;

  try {
    await store.connect();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    async function api(path, method = 'GET', body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
      });
      const result = await response.json();
      assert.equal(response.ok, true, `${method} ${path} returned ${response.status}`);
      return result;
    }

    if (phase === 'create') {
      const account = await api('/api/accounts', 'POST', {
        name: `Mongo restart ${process.pid}`,
        type: 'Other',
        initialBalance: 1000.25
      });
      const expense = await api('/api/transactions', 'POST', {
        accountId: account._id,
        type: 'expense',
        amount: 12.34,
        description: 'Restart test expense',
        category: 'Test',
        occurredAt: '2026-10-19T12:00:00+08:00'
      });
      const income = await api('/api/transactions', 'POST', {
        accountId: account._id,
        type: 'income',
        amount: 25.10,
        description: 'Restart test income',
        category: 'Salary',
        occurredAt: '2026-10-19T13:00:00+08:00'
      });
      const futureSalaryDate = getPhilippineDateKey(new Date(Date.now() + 7 * 86400000));
      const futureSalary = await api('/api/transactions', 'POST', {
        accountId: account._id,
        type: 'income',
        amount: 999.99,
        description: 'Future salary restart regression',
        category: 'Salary',
        occurredAt: `${futureSalaryDate}T00:00:00+08:00`
      });
      assert.equal((await store.getTransaction(futureSalary._id)).amount, 99999);
      const budget = await api('/api/budgets', 'POST', { month: '2026-10', amount: 2000.05 });
      const reserve = await api('/api/planning/reserves', 'POST', { label: 'Restart test reserve', amount: 15.25 });
      const override = await api('/api/daily-limits/override', 'POST', {
        date: '2026-10-19',
        targetAmount: 4.50,
        reason: 'Restart test override'
      });

      assert.equal(account.balance, 1000.25);
      assert.equal(expense.amount, 12.34);
      assert.equal(income.amount, 25.10);
      assert.equal(budget.amount, 2000.05);
      assert.equal(reserve.amount, 15.25);
      assert.equal(override.targetAmount, 4.50);

      const created = {
        accountId: account._id,
        expenseId: expense._id,
        incomeId: income._id,
        futureSalaryId: futureSalary._id,
        futureSalaryDate
      };
      await verifyPersistedData(api, created);
      process.stdout.write(`${JSON.stringify(created)}\n`);
    } else if (phase === 'verify') {
      await verifyPersistedData(api, snapshot);
      process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    } else {
      throw new Error('Unknown worker phase.');
    }
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await store.close();
  }
}

async function verifyPersistedData(api, snapshot) {
  const accounts = await api('/api/accounts');
  const account = accounts.find((record) => record._id === snapshot.accountId);
  assert.ok(account, 'Persisted account was not found.');
  assert.equal(account.initialBalance, 1000.25);
  assert.equal(account.balance, 1013.01);

  const transactions = await api(`/api/transactions?accountId=${encodeURIComponent(snapshot.accountId)}`);
  assert.deepEqual(
    transactions.map((transaction) => transaction._id).sort(),
    [snapshot.expenseId, snapshot.incomeId, snapshot.futureSalaryId].sort()
  );
  assert.equal(transactions.find((transaction) => transaction._id === snapshot.expenseId).amount, 12.34);
  assert.equal(transactions.find((transaction) => transaction._id === snapshot.incomeId).amount, 25.10);
  assert.equal(transactions.find((transaction) => transaction._id === snapshot.futureSalaryId).amount, 999.99);

  const budgets = await api('/api/budgets');
  assert.equal(budgets.find((budget) => budget.month === '2026-10')?.amount, 2000.05);

  const override = await api('/api/daily-limits/override?date=2026-10-19');
  assert.equal(override.targetAmount, 4.50);

  const nextDay = getPhilippineDateKey(new Date(Date.now() + 36 * 60 * 60 * 1000));
  const payday = await api(`/api/planning/payday?nextExpectedPayday=${nextDay}`);
  assert.equal(payday.inputs.availableBalance, 1013.01);
  assert.equal(payday.inputs.reserves, 15.25);

  const overview = await api('/api/overview?month=2026-10');
  assert.equal(overview.currentBalance, 1013.01);
  assert.equal(overview.monthlyIncome, 25.10);
  assert.equal(overview.monthlyExpenses, 12.34);
  assert.equal(overview.netCashFlow, 12.76);

  const allTime = await api('/api/reports/overview');
  assert.equal(allTime.income, 25.10);
  const salary = await api(`/api/reports/salary?month=${snapshot.futureSalaryDate.slice(0, 7)}`);
  assert.equal(salary.totalIncome, snapshot.futureSalaryDate.startsWith('2026-10') ? 25.10 : 0);
  assert.ok(salary.transactions.every((transaction) => transaction._id !== snapshot.futureSalaryId));
  const futurePeriod = await api(`/api/reports/period?period=custom&start=${snapshot.futureSalaryDate}&end=${snapshot.futureSalaryDate}`);
  assert.equal(futurePeriod.income, 0);
  assert.equal(futurePeriod.count, 0);
  const week = await api('/api/reports/period?period=week&start=2026-10-21');
  assert.equal(week.start, '2026-10-19');
  assert.equal(week.end, '2026-10-25');
  assert.equal(week.income, 25.10);
  assert.equal(week.expenses, 12.34);

  const report = await api('/api/reports/period?period=custom&start=2026-10-19&end=2026-10-19');
  assert.equal(report.income, 25.10);
  assert.equal(report.expenses, 12.34);
  assert.equal(report.netCashFlow, 12.76);
  assert.equal(report.accountBalances.find((record) => record._id === snapshot.accountId)?.balance, 1013.01);
}

main().catch((error) => {
  const detail = error.name === 'AssertionError' ? `: ${error.message}` : '';
  process.stderr.write(`Mongo restart worker failed (${error.name || 'Error'})${detail}.\n`);
  process.exitCode = 1;
});
