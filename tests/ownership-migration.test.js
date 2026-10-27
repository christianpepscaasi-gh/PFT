const test = require('node:test');
const assert = require('node:assert/strict');
const { createLegacyData } = require('./fixtures/legacy-data');
const { createIdentityFixtures } = require('./fixtures/identities');
const { planOwnershipMigration, prepareTestOwnershipMigration } = require('../src/migrations/test-ownership');

test('migration planning preserves every field, assigns only ownerless records, and is idempotent', () => {
  const before = createLegacyData();
  const { userA, userB } = createIdentityFixtures();
  before.accounts.push({ _id: 'already-owned', userId: userB._id, initialBalance: 999 });
  const copy = structuredClone(before);
  const plan = planOwnershipMigration(before, userA);
  assert.deepEqual(before, copy);
  for (const [collection, records] of Object.entries(before)) {
    assert.equal(plan.counts[collection].total, records.length);
    for (const [index, record] of records.entries()) {
      const migrated = plan.after[collection][index];
      assert.equal(migrated.userId, record.userId || userA._id);
      const withoutOwner = { ...migrated };
      delete withoutOwner.userId;
      const original = { ...record };
      delete original.userId;
      assert.deepEqual(withoutOwner, original);
    }
  }
  const rerun = planOwnershipMigration(plan.after, userA);
  assert.deepEqual(rerun.after, plan.after);
  assert.equal(Object.values(rerun.counts).reduce((sum, item) => sum + item.assigned, 0), 0);
});

test('migration rejects guessed owners, Admin, orphans, cross-owner references and uniqueness conflicts', () => {
  const { userA, userB, admin } = createIdentityFixtures();
  for (const target of [undefined, admin, { ...userA, status: 'disabled' }]) assert.throws(() => planOwnershipMigration(createLegacyData(), target), /personal User/i);
  const cases = [
    (data) => { data.transactions[0].accountId = 'missing'; },
    (data) => { data.transactions[0].userId = userB._id; },
    (data) => { data.budgets.push({ ...data.budgets[0], _id: 'duplicate-month' }); },
    (data) => { data.daily_overrides.push({ ...data.daily_overrides[0], _id: 'duplicate-date' }); },
    (data) => { data.career_probation.push({ ...data.career_probation[0], _id: 'second-probation' }); }
  ];
  for (const change of cases) {
    const data = createLegacyData();
    change(data);
    assert.throws(() => planOwnershipMigration(data, userA), /reference|uniqueness/i);
  }
});

test('migration rehearsal refuses non-test databases before touching collections', async () => {
  for (const name of ['production', 'pft', 'ledger_test', '', undefined]) {
    await assert.rejects(prepareTestOwnershipMigration({ name }, createIdentityFixtures().userA), /isolated pft_test_/);
  }
});
