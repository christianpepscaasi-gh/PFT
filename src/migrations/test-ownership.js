// Rehearsal only. There is deliberately no live migration CLI in this phase.
const { isDeepStrictEqual } = require('node:util');
const { models } = require('../persistence');

const ownedModels = [models.Account, models.Transaction, models.Budget, models.Reserve, models.DailyOverride, ...Object.values(models.career)];
const collections = ownedModels.map((model) => model.collection.name);

function assertTestDatabase(connection) {
  if (!/^pft_test_[a-z0-9_]+$/.test(connection.name || '')) {
    throw new Error('Ownership rehearsal requires an explicitly isolated pft_test_ database.');
  }
}

function planOwnershipMigration(documents, targetUser) {
  if (!targetUser || targetUser.role !== 'user' || targetUser.status !== 'active'
    || typeof targetUser._id !== 'string' || !targetUser._id.trim()) {
    throw new Error('An explicit active personal User identity is required; never assign legacy data to Admin.');
  }
  const after = {};
  const counts = {};
  for (const name of collections) {
    if (!Array.isArray(documents[name])) throw new Error('A complete ten-collection inventory is required.');
    const ids = new Set();
    let assigned = 0;
    after[name] = documents[name].map((record) => {
      if (typeof record._id !== 'string' || !record._id || ids.has(record._id)) throw new Error(`Invalid or duplicate record ID in ${name}.`);
      ids.add(record._id);
      if (record.userId == null) {
        assigned++;
        return { ...record, userId: targetUser._id };
      }
      if (typeof record.userId !== 'string' || !record.userId.trim()) throw new Error(`Invalid existing ownership in ${name}.`);
      return { ...record };
    });
    counts[name] = { total: documents[name].length, assigned };
  }
  const accountOwners = new Map(after.accounts.map((record) => [record._id, record.userId]));
  for (const transaction of after.transactions) {
    if (!accountOwners.has(transaction.accountId) || accountOwners.get(transaction.accountId) !== transaction.userId) {
      throw new Error('Orphan or cross-owner transaction reference; resolve explicitly before migrating.');
    }
  }
  for (const [name, field] of [['budgets', 'month'], ['daily_overrides', 'date'], ['career_probation', null]]) {
    const seen = new Set();
    for (const record of after[name]) {
      if (field && typeof record[field] !== 'string') throw new Error(`Invalid uniqueness key in ${name}.`);
      const key = JSON.stringify([record.userId, field ? record[field] : null]);
      if (seen.has(key)) throw new Error(`Owner-scoped uniqueness conflict in ${name}.`);
      seen.add(key);
    }
  }
  return { after, counts };
}

async function readDocuments(connection, session) {
  if (session) {
    // Operations sharing a transaction/session must run sequentially.
    const documents = {};
    for (const name of collections) documents[name] = await connection.db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray();
    return documents;
  }
  const entries = await Promise.all(collections.map(async (name) => [name,
    await connection.db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray()]));
  return Object.fromEntries(entries);
}

async function readIndexes(connection) {
  const entries = await Promise.all(collections.map(async (name) => {
    try { return [name, await connection.db.collection(name).indexes()]; }
    catch (error) { if (error.code === 26) return [name, []]; throw error; }
  }));
  return Object.fromEntries(entries);
}

async function prepareTestOwnershipMigration(connection, targetUser) {
  assertTestDatabase(connection);
  const before = await readDocuments(connection);
  const planned = planOwnershipMigration(before, targetUser);
  const indexesBefore = await readIndexes(connection);
  // This returned backup contains records. Retain privately; never log/return it over HTTP.
  return { before, indexesBefore, targetUser: { _id: targetUser._id, role: targetUser.role, status: targetUser.status }, ...planned };
}

function assertUnchanged(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Database drift detected; stop writes and prepare a fresh migration/rollback review.');
}

async function replaceOwnedIndexes(connection) {
  for (const model of ownedModels) {
    const collection = connection.db.collection(model.collection.name);
    // Create owner-scoped uniqueness before dropping any old global constraint.
    for (const [key, options] of model.schema.indexes()) {
      const driverOptions = Object.fromEntries(Object.entries(options).filter(([name]) => !name.startsWith('_')));
      await collection.createIndex(key, driverOptions);
    }
  }
  for (const [name, field] of [['budgets', 'month'], ['daily_overrides', 'date']]) {
    const collection = connection.db.collection(name);
    for (const index of await collection.indexes()) {
      if (index.unique && Object.keys(index.key).length === 1 && index.key[field] === 1) await collection.dropIndex(index.name);
    }
  }
}

async function applyTestOwnershipMigration(connection, backup) {
  assertTestDatabase(connection);
  const planned = planOwnershipMigration(backup.before, backup.targetUser);
  assertUnchanged(planned.after, backup.after);
  if (isDeepStrictEqual(await readDocuments(connection), backup.after)) {
    try { await replaceOwnedIndexes(connection); }
    finally { backup.indexesAfter = await readIndexes(connection); }
    return { counts: planOwnershipMigration(backup.after, backup.targetUser).counts };
  }
  assertUnchanged(await readIndexes(connection), backup.indexesBefore);
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      assertUnchanged(await readDocuments(connection, session), backup.before);
      for (const name of collections) {
        const operations = backup.before[name].filter((record) => record.userId == null).map((record) => ({ updateOne: {
          filter: { _id: record._id, userId: Object.hasOwn(record, 'userId') ? record.userId : { $exists: false } },
          update: { $set: { userId: backup.targetUser._id } }
        } }));
        if (operations.length) {
          const result = await connection.db.collection(name).bulkWrite(operations, { session });
          if (result.matchedCount !== operations.length) throw new Error('Ownership backfill did not match its inventory.');
        }
      }
    });
  } finally { await session.endSession(); }
  // Index DDL is separate from the document transaction. Keep the backup if DDL fails.
  try { await replaceOwnedIndexes(connection); }
  finally { backup.indexesAfter = await readIndexes(connection); }
  assertUnchanged(await readDocuments(connection), backup.after);
  return { counts: backup.counts };
}

async function rollbackTestOwnershipMigration(connection, backup) {
  assertTestDatabase(connection);
  assertUnchanged(planOwnershipMigration(backup.before, backup.targetUser).after, backup.after);
  // A rollback must never overwrite transactions or changes made since the migration.
  assertUnchanged(await readDocuments(connection), backup.after);
  assertUnchanged(await readIndexes(connection), backup.indexesAfter);
  for (const name of collections) {
    const collection = connection.db.collection(name);
    const originals = backup.indexesBefore[name];
    if (!originals.length) {
      await collection.drop();
      continue;
    }
    for (const index of await collection.indexes()) {
      if (index.name !== '_id_' && !originals.some((old) => old.name === index.name)) await collection.dropIndex(index.name);
    }
    for (const index of originals) {
      const { key, v, ns, ...options } = index;
      void v; void ns;
      if (index.name !== '_id_') await collection.createIndex(key, options);
    }
  }
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      assertUnchanged(await readDocuments(connection, session), backup.after);
      for (const name of collections) {
        const operations = backup.before[name].filter((record) => record.userId == null).map((record) => ({ updateOne: {
          filter: { _id: record._id, userId: backup.targetUser._id },
          update: Object.hasOwn(record, 'userId') ? { $set: { userId: null } } : { $unset: { userId: '' } }
        } }));
        if (operations.length) {
          const result = await connection.db.collection(name).bulkWrite(operations, { session });
          if (result.matchedCount !== operations.length) throw new Error('Ownership rollback did not match its backup.');
        }
      }
    });
  } finally { await session.endSession(); }
  assertUnchanged(await readDocuments(connection), backup.before);
  return { restored: true };
}

module.exports = { collections, planOwnershipMigration, prepareTestOwnershipMigration, applyTestOwnershipMigration, rollbackTestOwnershipMigration };
