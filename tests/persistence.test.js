const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');
const { createTestApp } = require('./app-helper');
const { createIdentityFixtures } = require('./fixtures/identities');
const { createInMemoryPersistenceStore, createPersistenceStore, mongoose } = require('../src/persistence');

test('API returns unavailable rather than falling back when MongoDB is not configured', async () => {
  const app = createTestApp({ persistenceStore: createPersistenceStore({ mongoUri: null }) });

  const readyResponse = await request(app).get('/ready');
  assert.equal(readyResponse.status, 503);

  const apiResponse = await request(app).get('/api/accounts');
  assert.equal(apiResponse.status, 503);
  assert.equal(apiResponse.body.error, 'Database is unavailable.');
});

test('peso API amounts are persisted as integer centavos', async () => {
  const root = createInMemoryPersistenceStore();
  const store = root.forUser(createIdentityFixtures().userA);
  const app = createTestApp({ persistenceStore: root });

  const badAccount = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: 10.501 });
  assert.equal(badAccount.status, 400);

  const account = await request(app)
    .post('/api/accounts')
    .send({ name: 'Wallet', type: 'Cash', initialBalance: -2.5 });
  assert.equal(account.status, 201);
  assert.equal(account.body.initialBalance, -2.5);
  assert.equal(account.body.balance, -2.5);
  assert.equal((await store.getAccount(account.body._id)).initialBalance, -250);

  const transaction = await request(app)
    .post('/api/transactions')
    .send({
      accountId: account.body._id,
      type: 'expense',
      amount: 0.01,
      description: 'One centavo'
    });
  assert.equal(transaction.status, 201);
  assert.equal(transaction.body.amount, 0.01);
  assert.equal((await store.getTransaction(transaction.body._id)).amount, 1);

  const updatedTransaction = await request(app)
    .patch(`/api/transactions/${transaction.body._id}`)
    .send({ amount: 0.02 });
  assert.equal(updatedTransaction.status, 200);
  assert.equal(updatedTransaction.body.amount, 0.02);
  assert.equal((await store.getTransaction(transaction.body._id)).amount, 2);

  const overview = await request(app).get('/api/reports/overview');
  assert.equal(overview.body.expenses, 0.02);
  assert.equal(overview.body.accounts[0].balance, -2.52);

  const badTransaction = await request(app)
    .post('/api/transactions')
    .send({
      accountId: account.body._id,
      type: 'expense',
      amount: 10.501,
      description: 'Invalid fractional centavo'
    });
  assert.equal(badTransaction.status, 400);
});

test('malformed account and transaction IDs return not found', async () => {
  const app = createTestApp({ persistenceStore: createInMemoryPersistenceStore() });

  const account = await request(app)
    .post('/api/accounts/not-a-real-id/archive')
    .send({ confirm: true });
  const transaction = await request(app).patch('/api/transactions/not-a-real-id').send({ amount: 1 });

  assert.equal(account.status, 404);
  assert.equal(transaction.status, 404);
});

test('planning values preserve peso responses while calculations use centavos', async () => {
  const root = createInMemoryPersistenceStore();
  const store = root.forUser(createIdentityFixtures().userA);
  const app = createTestApp({ persistenceStore: root });

  const budget = await request(app)
    .post('/api/budgets')
    .send({ month: '2026-10', amount: 123.45 });
  assert.equal(budget.status, 201);
  assert.equal(budget.body.amount, 123.45);
  assert.equal((await store.getBudget('2026-10')).amount, 12345);

  const reserve = await request(app)
    .post('/api/planning/reserves')
    .send({ amount: 10.05, label: 'Emergency fund' });
  assert.equal(reserve.status, 201);
  assert.equal(reserve.body.amount, 10.05);
  assert.equal((await store.listReserves())[0].amount, 1005);

  const override = await request(app)
    .post('/api/daily-limits/override')
    .send({ date: '2026-10-07', targetAmount: 2.05 });
  assert.equal(override.status, 201);
  assert.equal(override.body.targetAmount, 2.05);
  assert.equal((await store.getDailyOverride('2026-10-07')).targetAmount, 205);

  const dailyTarget = await request(app)
    .get('/api/planning/daily-target')
    .query({ date: '2026-10-07', month: '2026-10' });
  assert.equal(dailyTarget.body.amount, 2.05);
  assert.equal(dailyTarget.body.monthlyBudget, 123.45);
  assert.equal(dailyTarget.body.override.targetAmount, 2.05);
});

const mongoTestUri = process.env.MONGODB_URI_TEST
  || process.env.MONGODB_TEST_URI
  || process.env.MONGO_URI_TEST;

function runMongoAppProcess(phase, uri, snapshot) {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'mongo-restart-worker.js'),
    phase,
    JSON.stringify(snapshot || {})
  ], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, MONGODB_URI: uri }
  });

  assert.equal(result.error, undefined, `${phase} application process could not start`);
  assert.equal(result.status, 0, `${phase} application process failed: ${result.stderr.trim() || result.error?.code || result.status}`);
  return JSON.parse(result.stdout.trim());
}

test('MongoDB records and calculations survive an application process restart', {
  skip: !mongoTestUri
}, async () => {
  const parsedUri = new URL(mongoTestUri);
  const sourceDatabase = parsedUri.pathname.slice(1) || 'pft_test_database';
  assert.match(sourceDatabase, /test/i, 'The MongoDB test URI must identify a test database');
  parsedUri.pathname = `/pft_test_${Date.now().toString(36)}_${process.pid.toString(36)}`;
  const isolatedUri = parsedUri.toString();

  try {
    const created = runMongoAppProcess('create', isolatedUri);
    const reopened = runMongoAppProcess('verify', isolatedUri, created);
    assert.deepEqual(reopened, created);
  } finally {
    const cleanupStore = createPersistenceStore({ mongoUri: isolatedUri });
    try {
      await cleanupStore.connect();
      await mongoose.connection.dropDatabase();
    } finally {
      await cleanupStore.close();
    }
  }
});
