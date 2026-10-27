const { mongoose } = require('../persistence');

function createMongoIdentityRepository(root) {
  function requireId(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Identity ID must be a single non-empty string.');
  }
  let ready = null;
  async function connect() {
    await root.connect();
    if (!ready) ready = (async () => {
      const db = mongoose.connection.db;
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' }, name: 'single_admin' });
      await db.collection('auth_attempts').createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
      await db.collection('auth_sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
    })().catch((error) => { ready = null; throw error; });
    await ready;
  }
  async function users() { await connect(); return mongoose.connection.db.collection('users'); }
  return {
    connect,
    async findByEmail(email) { return typeof email === 'string' ? (await users()).findOne({ email }) : null; },
    async findById(id) { return typeof id === 'string' ? (await users()).findOne({ _id: id }) : null; },
    async consumeAttempt(key, limit, windowMs) {
      await connect();
      const bucket = Math.floor(Date.now() / windowMs);
      const collection = mongoose.connection.db.collection('auth_attempts');
      const filter = { _id: `${bucket}:${key}` };
      const update = { $inc: { count: 1 }, $setOnInsert: { expires: new Date((bucket + 1) * windowMs) } };
      let record;
      try { record = await collection.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after', includeResultMetadata: false }); }
      catch (error) {
        if (error.code !== 11000) throw error;
        record = await collection.findOneAndUpdate(filter, { $inc: { count: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
      }
      return record.count <= limit;
    },
    // Trusted internal operations. Phase 4 must wrap management changes with audited Admin authorization.
    async setUserStatus(id, status) {
      requireId(id);
      if (!['active', 'disabled'].includes(status)) throw new Error('Unsupported account status.');
      return (await users()).findOneAndUpdate({ _id: id, role: 'user' }, { $set: { status, updatedAt: new Date() }, $inc: { sessionVersion: 1 } }, { returnDocument: 'after', includeResultMetadata: false });
    },
    async revokeSessions(id) {
      requireId(id);
      return (await users()).updateOne({ _id: id }, { $inc: { sessionVersion: 1 }, $set: { updatedAt: new Date() } });
    },
    async bootstrapPair(admin, user) {
      await connect();
      const session = await mongoose.connection.startSession();
      let result;
      try {
        await session.withTransaction(async () => {
          const db = mongoose.connection.db;
          const marker = await db.collection('auth_bootstrap').findOne({ _id: 'owner' }, { session });
          if (marker) {
            const currentAdmin = await db.collection('users').findOne({ _id: marker.adminId }, { session });
            const currentUser = await db.collection('users').findOne({ _id: marker.userId }, { session });
            if (!currentAdmin || !currentUser || currentAdmin.email !== admin.email || currentUser.email !== user.email
              || currentAdmin.role !== 'admin' || currentUser.role !== 'user' || currentAdmin.status !== 'active') throw new Error('Bootstrap identities conflict with the existing setup.');
            result = { created: false, adminId: currentAdmin._id, userId: currentUser._id };
            return;
          }
          if (await db.collection('users').countDocuments({}, { session })) throw new Error('Bootstrap requires a clean identity collection or its existing bootstrap marker.');
          await db.collection('users').insertMany([admin, user], { session });
          await db.collection('auth_bootstrap').insertOne({ _id: 'owner', adminId: admin._id, userId: user._id, createdAt: new Date() }, { session });
          await db.collection('admin_audit').insertOne({ _id: 'owner-bootstrap', actorId: admin._id, targetId: user._id, action: 'owner.bootstrap', outcome: 'success', createdAt: new Date() }, { session });
          result = { created: true, adminId: admin._id, userId: user._id };
        });
      } finally { await session.endSession(); }
      return result;
    }
  };
}

module.exports = { createMongoIdentityRepository };
