const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { createPersistenceStore, mongoose } = require('../src/persistence');
const { createMongoIdentityRepository } = require('../src/auth/repository');
const { createMongoSessionStore } = require('../src/auth/authentication');
const { verifyManagementContract } = require('./management-contract');

const dedicated = process.env.MONGODB_URI_TEST || process.env.MONGODB_TEST_URI || process.env.MONGO_URI_TEST;

test('Mongo management handles concurrent approval/activation, atomic audit failure, private tokens and reconnect', { skip: !dedicated }, async () => {
  const uri = new URL(dedicated);
  assert.match(uri.pathname, /test/i);
  uri.pathname = '/pft_test_mgmt_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const root = createPersistenceStore({ mongoUri: uri.toString() });
  try {
    const repository = createMongoIdentityRepository(root);
    const { userId, directId, app, issued, adminCookie } = await verifyManagementContract({ root, repository, sessionStore: createMongoSessionStore(repository) });
    const db = mongoose.connection.db;
    assert.equal(await db.collection('users').countDocuments({ role: 'admin' }), 1);
    assert.equal(await db.collection('users').countDocuments({ email: 'new-client@example.test' }), 1);
    await assert.rejects(db.collection('account_requests').insertOne({ _id: 'duplicate-pending', email: 'reapply@example.test', status: 'pending' }), { code: 11000 });
    const invitations = await db.collection('activation_invitations').find({}).toArray();
    assert.ok(invitations.length);
    for (const item of invitations) assert.match(item.tokenHash, /^[a-f0-9]{64}$/);
    await assert.rejects(db.collection('activation_invitations').insertOne({ _id: 'duplicate-token', tokenHash: invitations[0].tokenHash }), { code: 11000 });
    const saved = JSON.stringify({ users: await db.collection('users').find({}).toArray(), requests: await db.collection('account_requests').find({}).toArray(),
      audit: await db.collection('admin_audit').find({}).toArray(), invitations });
    for (const item of issued) assert.equal(saved.includes(item.token), false);
    assert.equal(saved.includes('Synthetic-activation-password-28'), false);
    await root.close();
    const response = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.items.find((item) => item._id === userId).status, 'active');
    assert.equal(response.body.items.find((item) => item._id === directId).status, 'active');
  } finally {
    try {
      await root.connect();
      await mongoose.connection.dropDatabase();
    } finally { await root.close(); }
  }
});
