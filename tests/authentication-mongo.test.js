const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { createPersistenceStore, mongoose } = require('../src/persistence');
const { createMongoIdentityRepository } = require('../src/auth/repository');
const { createAuthentication, createMongoSessionStore } = require('../src/auth/authentication');
const { bootstrapPair } = require('../src/auth/bootstrap');
const { createApp } = require('../server');
const { verifyAuthenticationContract, setup, secret } = require('./auth-contract');

const dedicated = process.env.MONGODB_URI_TEST || process.env.MONGODB_TEST_URI || process.env.MONGO_URI_TEST;

test('Mongo identities, sessions and throttles enforce the authentication contract and survive app recreation', { skip: !dedicated }, async () => {
  const uri = new URL(dedicated);
  assert.match(uri.pathname, /test/i);
  uri.pathname = '/pft_test_auth_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const root = createPersistenceStore({ mongoUri: uri.toString() });
  try {
    const repository = createMongoIdentityRepository(root);
    const { app: originalApp, provisioned, adminCookie } = await verifyAuthenticationContract({ root, repository, sessionStore: createMongoSessionStore(repository) });
    const db = mongoose.connection.db;
    assert.equal(await repository.findByEmail({ $ne: '' }), null);
    assert.equal(await repository.findById({ $ne: '' }), null);
    await assert.rejects(repository.setUserStatus({ $ne: '' }, 'disabled'), /single non-empty string/);
    await assert.rejects(repository.revokeSessions({ $ne: '' }), /single non-empty string/);
    assert.equal(await db.collection('users').countDocuments({ role: 'admin' }), 1);
    assert.equal(await db.collection('users').countDocuments({}), 2);
    assert.equal(await db.collection('admin_audit').countDocuments({ action: 'owner.bootstrap' }), 1);
    assert.doesNotMatch(JSON.stringify(await db.collection('admin_audit').find({}).toArray()), /password|scrypt|passphrase/i);
    await assert.rejects(db.collection('users').insertOne({ _id: 'second-admin', email: 'second@example.test', role: 'admin' }), { code: 11000 });
    await assert.rejects(db.collection('users').insertOne({ _id: 'duplicate-email', email: 'owner@example.test', role: 'user' }), { code: 11000 });
    for (const record of await db.collection('auth_sessions').find({}).toArray()) assert.match(record._id, /^[a-f0-9]{64}$/);
    const sharedRepository = createMongoIdentityRepository(root);
    const shared = createApp({ persistenceStore: root,
      authentication: createAuthentication({ repository: sharedRepository, sessionStore: createMongoSessionStore(sharedRepository), secret }) });
    const abusive = request.agent(shared);
    const token = (await abusive.get('/api/auth/csrf')).body.csrfToken;
    assert.equal((await abusive.post('/api/auth/login').set('x-csrf-token', token).send({ email: 'throttle@example.test', password: '' })).status, 429);
    await root.close();
    assert.equal((await request(originalApp).get('/api/auth/me').set('Cookie', adminCookie)).status, 200);
    const newRepository = createMongoIdentityRepository(root);
    const auth = createAuthentication({ repository: newRepository, sessionStore: createMongoSessionStore(newRepository), secret });
    const restartedApp = createApp({ persistenceStore: root, authentication: auth });
    const restored = await request(restartedApp).get('/api/auth/me').set('Cookie', adminCookie);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.user._id, provisioned.adminId);
    const rerun = await bootstrapPair(newRepository, setup(), { apply: true });
    assert.equal(rerun.created, false);
    assert.equal(rerun.userId, provisioned.userId);
    await mongoose.connection.db.collection('users').updateOne({ _id: provisioned.adminId }, { $set: { role: 'user' } });
    assert.equal((await request(restartedApp).get('/api/auth/me').set('Cookie', adminCookie)).status, 401);
    assert.equal(await mongoose.connection.db.collection('accounts').countDocuments({ userId: provisioned.userId }), 1);
  } finally {
    try {
      await root.connect();
      await mongoose.connection.dropDatabase();
    } finally { await root.close(); }
  }
});
