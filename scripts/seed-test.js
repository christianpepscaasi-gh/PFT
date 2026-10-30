const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('../src/config/test-environment');

async function main() {
  if (process.argv.slice(2).join(' ') !== '--target test --apply') {
    throw new Error('Use npm run seed:test -- --target test --apply.');
  }
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  Object.assign(process.env, createTestEnvironment(process.env, { server: true }));
  const { createPersistenceStore } = require('../src/persistence');
  const { createMongoIdentityRepository } = require('../src/auth/repository');
  const { bootstrapPair } = require('../src/auth/bootstrap');
  const { verifyPassword } = require('../src/auth/passwords');
  const { createAuthentication, createMongoSessionStore } = require('../src/auth/authentication');
  const { createApp } = require('../server');
  const request = require('supertest');
  const credentialPath = path.join(__dirname, '..', 'test-seed.bootstrap.local.json');
  const root = createPersistenceStore({ mongoUri: process.env.MONGODB_URI });
  try {
    await root.connect();
    const repository = createMongoIdentityRepository(root);
    let credentials;
    if (fs.existsSync(credentialPath)) credentials = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    else {
      // Never replace an existing Admin or reset anyone's password.
      const { mongoose } = require('../src/persistence');
      if (await mongoose.connection.db.collection('users').countDocuments({})) {
        throw new Error('Existing identities require their original private setup file.');
      }
      credentials = {
        admin: { name: 'Demo Admin', email: 'seed.admin@example.test', password: randomBytes(24).toString('base64url') },
        user: { name: 'Demo User', email: 'seed.user@example.test', password: randomBytes(24).toString('base64url') }
      };
      fs.writeFileSync(credentialPath, JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    await bootstrapPair(repository, credentials, { apply: true });
    for (const role of ['admin', 'user']) {
      const record = await repository.findByEmail(credentials[role].email);
      assert.ok(record && record.status === 'active' && await verifyPassword(credentials[role].password, record.passwordHash));
    }
    const origin = 'http://127.0.0.1:3000';
    const authentication = createAuthentication({ repository, sessionStore: createMongoSessionStore(repository),
      secret: randomBytes(48).toString('base64url'), origin });
    const app = createApp({ persistenceStore: root, authentication });
    async function signIn(role) {
      const agent = request.agent(app);
      const csrf = await agent.get('/api/auth/csrf');
      const response = await agent.post('/api/auth/login').set('x-csrf-token', csrf.body.csrfToken)
        .send({ email: credentials[role].email, password: credentials[role].password });
      assert.equal(response.status, 200);
      return { agent, token: response.body.csrfToken };
    }
    const user = await signIn('user');
    const admin = await signIn('admin');
    const write = (method, route, payload) => user.agent[method](route).set('x-csrf-token', user.token).send(payload);
    const accounts = await user.agent.get('/api/accounts');
    assert.equal(accounts.status, 200);
    let wallet = accounts.body.find((item) => item.name === 'Demo wallet (synthetic)');
    if (!wallet) {
      const created = await write('post', '/api/accounts', { name: 'Demo wallet (synthetic)', type: 'Cash', initialBalance: 5000 });
      assert.equal(created.status, 201); wallet = created.body;
    }
    const transactions = await user.agent.get('/api/transactions');
    assert.equal(transactions.status, 200);
    if (!transactions.body.some((item) => item.accountId === wallet._id && item.description === 'Demo lunch (synthetic)')) {
      const created = await write('post', '/api/transactions', { accountId: wallet._id, type: 'expense', amount: 150,
        description: 'Demo lunch (synthetic)', occurredAt: new Date().toISOString() });
      assert.equal(created.status, 201);
    }
    const journal = await user.agent.get('/api/career/journal');
    assert.equal(journal.status, 200);
    if (!journal.body.some((item) => item.entry === 'Demo private journal (synthetic)')) {
      const created = await write('post', '/api/career/journal', { date: new Date().toISOString().slice(0, 10), entry: 'Demo private journal (synthetic)' });
      assert.equal(created.status, 201);
    }
    // Exercise edit/delete on a disposable record, preserving the visible samples.
    const temporary = await write('post', '/api/transactions', { accountId: wallet._id, type: 'expense', amount: 1,
      description: 'Seed verification temporary', occurredAt: new Date().toISOString() });
    assert.equal(temporary.status, 201);
    assert.equal((await write('patch', `/api/transactions/${temporary.body._id}`, { amount: 2 })).status, 200);
    assert.equal((await write('delete', `/api/transactions/${temporary.body._id}`)).status, 200);
    const users = await admin.agent.get('/api/admin/users?sort=name');
    assert.equal(users.status, 200);
    assert.ok(users.body.items.some((item) => item.email === credentials.user.email && item.status === 'active'));
    assert.doesNotMatch(JSON.stringify(users.body), /passwordHash|Demo lunch|Demo private journal/);
    for (const route of ['/api/accounts', '/api/transactions', '/api/career/journal']) {
      assert.equal((await admin.agent.get(route)).status, 403);
    }
    assert.equal((await user.agent.get('/api/admin/users')).status, 403);
    for (const session of [user, admin]) {
      assert.equal((await session.agent.post('/api/auth/logout').set('x-csrf-token', session.token)).status, 200);
    }
    console.log('Seed retained in pft_test_local: synthetic Admin/User, wallet, expense, and Career journal.');
    console.log('PASS: User create/read/edit/delete; Admin sees account status, cannot access finance/Career; User cannot access Admin.');
    console.log('Private login details: test-seed.bootstrap.local.json (gitignored). Existing passwords/data were not reset.');
  } finally { await root.close(); }
}

main().catch((error) => {
  console.error(`Test seed stopped (${error.name || 'Error'}). Check dedicated test access, existing setup, and private seed file. No credentials are printed.`);
  process.exitCode = 1;
});
