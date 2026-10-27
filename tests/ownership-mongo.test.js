const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createPersistenceStore, mongoose } = require('../src/persistence');
const { createIdentityFixtures } = require('./fixtures/identities');
const { verifyOwnershipContract } = require('./ownership-contract');
const request = require('supertest');
const { createTestApp } = require('./app-helper');
const { createLegacyData } = require('./fixtures/legacy-data');
const { prepareTestOwnershipMigration, applyTestOwnershipMigration, rollbackTestOwnershipMigration } = require('../src/migrations/test-ownership');

const dedicated = process.env.MONGODB_URI_TEST || process.env.MONGODB_TEST_URI || process.env.MONGO_URI_TEST;

test('Mongo repositories enforce the same isolation contract and preserve owners after reconnect', { skip: !dedicated }, async () => {
  const uri = new URL(dedicated);
  assert.match(uri.pathname, /test/i);
  uri.pathname = '/pft_test_owner_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const root = createPersistenceStore({ mongoUri: uri.toString() });
  try {
    await verifyOwnershipContract(root);
    await root.close();
    const { userA, userB } = createIdentityFixtures();
    const a = root.forUser(userA);
    const b = root.forUser(userB);
    await a.connect();
    assert.equal((await a.getBudget('2000-01')).amount, 77700);
    assert.equal((await b.getBudget('2000-01')).amount, 62000);
    assert.equal((await a.listAccounts())[0].balance, 12000);
    assert.equal((await b.listAccounts())[0].balance, 23000);
    assert.equal((await a.getCareerProbation()).startDate, '2000-02-01');
    assert.equal((await b.getCareerProbation()).startDate, '2000-01-01');
    await assert.rejects(mongoose.connection.db.collection('budgets').insertOne({
      _id: 'duplicate-budget', userId: userA._id, month: '2000-01', amount: 1
    }), { code: 11000 });
    await assert.rejects(mongoose.connection.db.collection('daily_overrides').insertOne({
      _id: 'duplicate-override', userId: userA._id, date: '2000-01-01', targetAmount: 1
    }), { code: 11000 });
    await assert.rejects(mongoose.connection.db.collection('career_probation').insertOne({
      _id: 'duplicate-probation', userId: userA._id
    }), { code: 11000 });
    await mongoose.connection.db.collection('accounts').insertOne({ _id: 'ownerless', name: 'Hidden legacy', type: 'Cash', initialBalance: 999999 });
    assert.equal(await a.getAccount('ownerless'), null);
    assert.equal(await b.getAccount('ownerless'), null);
    assert.equal(await a.archiveAccount('ownerless'), null);
    assert.equal((await a.listAccounts()).length, 1);
  } finally {
    try {
      await root.connect();
      await mongoose.connection.dropDatabase();
    } finally { await root.close(); }
  }
});

test('real-Mongo migration rehearses dry run, preservation, index replacement, idempotence, rollback and drift refusal', { skip: !dedicated }, async () => {
  const uri = new URL(dedicated);
  assert.match(uri.pathname, /test/i);
  uri.pathname = '/pft_test_migrate_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const root = createPersistenceStore({ mongoUri: uri.toString() });
  const { userA, userB } = createIdentityFixtures();
  try {
    await root.connect();
    const connection = mongoose.connection;
    const fixture = createLegacyData();
    for (const [name, records] of Object.entries(fixture)) await connection.db.collection(name).insertMany(records);
    await connection.db.collection('budgets').createIndex({ month: 1 }, { unique: true });
    await connection.db.collection('daily_overrides').createIndex({ date: 1 }, { unique: true });
    await assert.rejects(root.forUser(userA).connect(), /legacy global indexes/i);
    const backup = await prepareTestOwnershipMigration(connection, userA);
    const dryAgain = await prepareTestOwnershipMigration(connection, userA);
    assert.deepEqual(dryAgain, backup, 'Dry run must not write records or indexes');
    await connection.db.collection('accounts').updateOne({ _id: 'legacy-account' }, { $set: { name: 'Concurrent change' } });
    await assert.rejects(applyTestOwnershipMigration(connection, backup), /drift/i);
    assert.equal((await connection.db.collection('accounts').findOne({ _id: 'legacy-account' })).userId, undefined);
    await connection.db.collection('accounts').updateOne({ _id: 'legacy-account' }, { $set: { name: 'Legacy wallet' } });
    const result = await applyTestOwnershipMigration(connection, backup);
    assert.equal(Object.values(result.counts).reduce((sum, item) => sum + item.assigned, 0), 11);
    const a = root.forUser(userA);
    await a.connect();
    assert.equal((await a.getAccount('legacy-account')).balance, 112.5 * 100);
    assert.deepEqual(await root.forUser(userB).listAccounts(), []);
    const app = createTestApp({ persistenceStore: root, identity: userA });
    const report = await request(app).get('/api/reports/period?period=custom&start=2000-01-01&end=2000-01-01');
    assert.equal(report.status, 200);
    assert.equal(report.body.income, 25);
    assert.equal(report.body.expenses, 12.5);
    assert.equal(report.body.accountBalances[0].balance, 112.5);
    const target = (await request(app).get('/api/planning/daily-target?date=2000-01-01')).body;
    assert.equal(target.monthlyBudget, 310);
    assert.equal(target.amount, 10);
    assert.equal(target.spending, 12.5);
    for (const type of ['probation', 'checkpoints', 'skills', 'tasks', 'journal']) {
      const data = (await request(app).get('/api/career/' + type)).body;
      assert.equal((Array.isArray(data) ? data[0] : data).userId, userA._id);
    }
    const after = await prepareTestOwnershipMigration(connection, userA);
    assert.deepEqual(after.before, backup.after, 'All timestamps and financial fields must be unchanged');
    const repeated = await applyTestOwnershipMigration(connection, backup);
    assert.equal(Object.values(repeated.counts).reduce((sum, item) => sum + item.assigned, 0), 0);
    await rollbackTestOwnershipMigration(connection, backup);
    const rolledBack = await prepareTestOwnershipMigration(connection, userA);
    assert.deepEqual(rolledBack.before, backup.before);
    assert.deepEqual(rolledBack.indexesBefore, backup.indexesBefore);
    await root.close();
    await root.connect();
    const second = await prepareTestOwnershipMigration(mongoose.connection, userA);
    await applyTestOwnershipMigration(mongoose.connection, second);
    const b = root.forUser(userB);
    await b.connect();
    await b.upsertBudget('2000-01', 62000);
    await b.upsertDailyOverride({ date: '2000-01-01', targetAmount: 2000 });
    await b.saveCareerProbation({ startDate: '2000-01-01', endDate: '2000-06-01', elapsedDays: 0, remainingDays: 0 });
    assert.equal((await root.forUser(userA).getBudget('2000-01')).amount, 31000);
    assert.equal((await b.getBudget('2000-01')).amount, 62000);
    await assert.rejects(rollbackTestOwnershipMigration(mongoose.connection, second), /drift/i);
  } finally {
    try {
      await root.connect();
      await mongoose.connection.dropDatabase();
    } finally { await root.close(); }
  }
});
