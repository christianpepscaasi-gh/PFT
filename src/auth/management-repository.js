const { mongoose } = require('../persistence');

const names = Object.freeze({ users: 'users', requests: 'account_requests', invitations: 'activation_invitations', audit: 'admin_audit' });

async function createManagementIndexes(db) {
  await db.collection(names.requests).createIndex({ email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_request' });
  await db.collection(names.invitations).createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection(names.invitations).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

function createManagementRepository(connect) {
  return {
    async lookupInvitation(tokenHash, now) {
      if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
      await connect();
      return mongoose.connection.db.collection(names.invitations).findOne({ tokenHash, consumedAt: null, expiresAt: { $gt: now } });
    },
    async managementTransaction(operation) {
      await connect();
      // A concurrent first request can collide with the partial unique index. Retry
      // from a fresh snapshot so the service sees the request that won the race.
      for (let attempt = 0; attempt < 3; attempt++) {
        const session = await mongoose.connection.startSession();
        let result;
        try {
          await session.withTransaction(async () => {
            const collection = (name) => {
              if (!Object.hasOwn(names, name)) throw new Error('Unsupported identity collection.');
              return mongoose.connection.db.collection(names[name]);
            };
            const tx = {
              get: (name, filter) => collection(name).findOne(filter, { session }),
              insert: (name, record) => collection(name).insertOne(record, { session }),
              update: (name, filter, update) => collection(name).updateOne(filter, update, { session }),
              remove: (name, filter) => collection(name).deleteOne(filter, { session }),
              list: (name, filter, limit, sort = { _id: 1 }) => collection(name).find(filter, { session }).sort(sort).limit(limit).toArray()
            };
            result = await operation(tx);
          });
          return result;
        } catch (error) {
          if (error.code !== 11000 || attempt === 2) throw error;
        } finally { await session.endSession(); }
      }
    }
  };
}

module.exports = { createManagementIndexes, createManagementRepository };
