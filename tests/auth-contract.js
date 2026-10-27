const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../server');
const { createAuthentication } = require('../src/auth/authentication');
const { bootstrapPair } = require('../src/auth/bootstrap');

const setup = () => ({
  admin: { email: ' ADMIN@example.test ', name: 'Owner Admin', password: 'Synthetic-admin-passphrase-27' },
  user: { email: 'owner@example.test', name: 'Personal User', password: 'Synthetic-user-passphrase-27' }
});
const secret = 'synthetic-session-secret-for-authentication-tests-only';

async function login(agent, email, password) {
  const csrf = await agent.get('/api/auth/csrf');
  assert.equal(csrf.status, 200);
  return agent.post('/api/auth/login').set('x-csrf-token', csrf.body.csrfToken).send({ email, password });
}

async function verifyAuthenticationContract({ root, repository, sessionStore }) {
  const input = setup();
  assert.equal((await bootstrapPair(repository, input)).dryRun, true);
  const provisioned = await bootstrapPair(repository, input, { apply: true });
  assert.equal(provisioned.created, true);
  const repeat = await bootstrapPair(repository, { ...input, user: { ...input.user, password: 'Different-setup-passphrase-27' } }, { apply: true });
  assert.equal(repeat.created, false);
  assert.equal(repeat.userId, provisioned.userId);
  const userRecord = await repository.findById(provisioned.userId);
  assert.match(userRecord.passwordHash, /^scrypt\$/);
  assert.notEqual(userRecord.passwordHash, input.user.password);
  const auth = createAuthentication({ repository, sessionStore, secret });
  const app = createApp({ persistenceStore: root, authentication: auth });
  const user = request.agent(app);
  assert.equal((await user.get('/api/accounts').set('x-user-id', provisioned.userId)).status, 401);
  assert.equal((await user.get('/api/auth/me')).status, 401);
  assert.equal((await user.post('/api/auth/login').send({ email: input.user.email, password: input.user.password })).status, 403);
  const anonymous = await user.get('/api/auth/csrf');
  assert.match(anonymous.headers['cache-control'], /no-store/);
  const oldCookie = anonymous.headers['set-cookie'][0].split(';')[0];
  const response = await user.post('/api/auth/login').set('x-csrf-token', anonymous.body.csrfToken).send({ email: 'OWNER@example.test', password: input.user.password });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, 'user');
  assert.equal(response.body.user._id, provisioned.userId);
  assert.equal(response.body.user.passwordHash, undefined);
  assert.equal(response.body.user.sessionVersion, undefined);
  assert.notEqual(response.headers['set-cookie'][0].split(';')[0], oldCookie);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
  const token = response.body.csrfToken;
  const cookie = response.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(token, anonymous.body.csrfToken);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status, 401);
  assert.equal((await user.get('/api/auth/me')).body.user._id, provisioned.userId);
  assert.equal((await user.post('/api/accounts').send({ name: 'No token', type: 'Cash' })).status, 403);
  assert.equal((await user.post('/api/accounts').set('x-csrf-token', 'é'.repeat(43)).send({ name: 'Bad token', type: 'Cash' })).status, 403);
  assert.equal((await user.post('/api/accounts').set('Origin', 'https://attacker.example').set('x-csrf-token', token).send({ name: 'Wrong origin', type: 'Cash' })).status, 403);
  const account = await user.post('/api/accounts').set('x-csrf-token', token).send({ name: 'Personal wallet', type: 'Cash', initialBalance: 100 });
  assert.equal(account.status, 201);
  assert.equal(account.body.userId, provisioned.userId);
  assert.equal((await user.get('/api/accounts')).body.length, 1);
  const admin = request.agent(app);
  const adminLogin = await login(admin, 'admin@example.test', input.admin.password);
  assert.equal(adminLogin.status, 200);
  assert.equal((await admin.get('/api/auth/me')).body.user.role, 'admin');
  for (const path of ['/api/accounts', '/api/overview', '/api/career/journal']) assert.equal((await admin.get(path)).status, 403);
  const wrong = await login(request.agent(app), input.user.email, 'Different-setup-passphrase-27');
  const missing = await login(request.agent(app), 'missing@example.test', input.user.password);
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, missing.body);
  await repository.setUserStatus(provisioned.userId, 'disabled');
  assert.equal((await user.get('/api/auth/me')).status, 401);
  const disabled = await login(request.agent(app), input.user.email, input.user.password);
  assert.deepEqual(disabled.body, missing.body);
  await repository.setUserStatus(provisioned.userId, 'active');
  assert.equal((await request(app).get('/api/accounts').set('Cookie', cookie)).status, 401);
  assert.equal((await root.forUser({ ...userRecord, status: 'active' }).listAccounts()).length, 1);
  const fresh = request.agent(app);
  const freshLogin = await login(fresh, input.user.email, input.user.password);
  assert.equal(freshLogin.status, 200);
  await repository.revokeSessions(provisioned.userId);
  assert.equal((await fresh.get('/api/accounts')).status, 401);
  const logoutAgent = request.agent(app);
  const loggedIn = await login(logoutAgent, input.user.email, input.user.password);
  assert.equal(loggedIn.status, 200);
  const logoutCookie = loggedIn.headers['set-cookie'][0].split(';')[0];
  assert.equal((await logoutAgent.post('/api/auth/logout')).status, 403);
  assert.equal((await logoutAgent.post('/api/auth/logout').set('x-csrf-token', loggedIn.body.csrfToken)).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', logoutCookie)).status, 401);
  const abusive = request.agent(app);
  const csrf = (await abusive.get('/api/auth/csrf')).body.csrfToken;
  for (let i = 0; i < 10; i++) assert.equal((await abusive.post('/api/auth/login').set('x-csrf-token', csrf).send({ email: 'throttle@example.test', password: '' })).status, 401);
  const blocked = await abusive.post('/api/auth/login').set('x-csrf-token', csrf).send({ email: 'throttle@example.test', password: '' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['retry-after'], '900');
  return { app, auth, provisioned, adminCookie: adminLogin.headers['set-cookie'][0].split(';')[0] };
}

module.exports = { verifyAuthenticationContract, setup, secret, login };
