const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const request = require('supertest');
const { promisify } = require('node:util');
const { createApp } = require('../server');
const { hashPassword, verifyPassword } = require('../src/auth/passwords');
const { validateBootstrap, bootstrapPair } = require('../src/auth/bootstrap');
const { createAuthentication } = require('../src/auth/authentication');
const { createInMemoryPersistenceStore } = require('../src/persistence');
const { createMemoryIdentityRepository, createMemorySessionStore } = require('./auth-helper');
const { verifyAuthenticationContract, setup, secret, login } = require('./auth-contract');

test('session authentication enforces login, CSRF, rotation, roles, disable/re-enable, revocation, logout, and throttling', async () => {
  const repository = createMemoryIdentityRepository();
  const sessionStore = createMemorySessionStore();
  const { app, provisioned } = await verifyAuthenticationContract({ root: createInMemoryPersistenceStore(), repository, sessionStore });
  assert.equal(repository.audit.length, 1);
  assert.doesNotMatch(JSON.stringify(repository.audit), /password|passphrase|scrypt/i);
  const pending = { ...await repository.findById(provisioned.userId), _id: 'pending', email: 'pending@example.test', status: 'pending' };
  repository.users.set(pending._id, pending);
  assert.equal((await login(request.agent(app), pending.email, setup().user.password)).status, 401);
  const expiring = request.agent(app);
  assert.equal((await login(expiring, setup().user.email, setup().user.password)).status, 200);
  const sessions = await promisify(sessionStore.all.bind(sessionStore))();
  const [sid, value] = Object.entries(sessions).find(([, current]) => current.userId === provisioned.userId);
  value.authExpiresAt = Date.now() - 1;
  await promisify(sessionStore.set.bind(sessionStore))(sid, value);
  assert.equal((await expiring.get('/api/auth/me')).status, 401);
  await assert.rejects(bootstrapPair(repository, { ...setup(), user: { ...setup().user, email: 'other@example.test' } }, { apply: true }), /conflict/i);
});

test('HTTPS configuration issues Secure cookies only behind an explicitly trusted proxy', async () => {
  const authentication = createAuthentication({ repository: createMemoryIdentityRepository(), sessionStore: createMemorySessionStore(),
    secret, origin: 'https://pft.example.test', secure: true });
  const app = createApp({ persistenceStore: createInMemoryPersistenceStore(), authentication, runtimeEnv: {} });
  const untrusted = await request(app).get('/api/auth/csrf').set('X-Forwarded-Proto', 'https');
  assert.equal(untrusted.headers['set-cookie'], undefined);
  const hosted = createApp({ persistenceStore: createInMemoryPersistenceStore(), authentication,
    runtimeEnv: { PROXY_MODE: 'vercel', VERCEL: '1', NODE_ENV: 'production' } });
  const trusted = await request(hosted).get('/api/auth/csrf').set('X-Forwarded-Proto', 'https');
  assert.match(trusted.headers['set-cookie'][0], /; Secure/);
  assert.match(trusted.headers['set-cookie'][0], /; HttpOnly/);
  assert.match(trusted.headers['set-cookie'][0], /; SameSite=Strict/);
  assert.equal((await request(hosted).get('/api/auth/csrf')).headers['set-cookie'], undefined);
  assert.equal((await request(hosted).get('/api/auth/csrf').set('X-Forwarded-Proto', 'http')).headers['set-cookie'], undefined);
  assert.equal((await request(hosted).get('/api/auth/csrf').set('X-Forwarded-Proto', 'https').set('Origin', 'https://attacker.example')).status, 403);
});

test('proxy policy requires explicit platform configuration and trusts only the nearest hop', async () => {
  const { proxyTrust } = require('../src/config/proxy');
  assert.equal(proxyTrust({}), false);
  assert.equal(proxyTrust({ VERCEL: '1', NODE_ENV: 'production' }), false);
  for (const env of [{ PROXY_MODE: 'true' }, { PROXY_MODE: '1' }, { PROXY_MODE: 'vercel' },
    { PROXY_MODE: 'vercel', VERCEL: '1', NODE_ENV: 'test' }, { PROXY_MODE: 'vercel', NODE_ENV: 'production' }]) {
    assert.throws(() => proxyTrust(env), /PROXY_MODE/);
  }
  const app = createApp({ persistenceStore: createInMemoryPersistenceStore(),
    runtimeEnv: { PROXY_MODE: 'vercel', VERCEL: '1', NODE_ENV: 'production' } });
  // Test-only observation route; no diagnostic endpoint is installed in the product.
  app.get('/proxy-test', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
  const result = await request(app).get('/proxy-test').set('X-Forwarded-For', '198.51.100.99, 203.0.113.7').set('X-Forwarded-Proto', 'https');
  assert.deepEqual(result.body, { ip: '203.0.113.7', secure: true });
  const direct = createApp({ persistenceStore: createInMemoryPersistenceStore(), runtimeEnv: {} });
  direct.get('/proxy-test', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
  const local = await request(direct).get('/proxy-test').set('X-Forwarded-For', '198.51.100.99').set('X-Forwarded-Proto', 'https');
  assert.notEqual(local.body.ip, '198.51.100.99');
  assert.equal(local.body.secure, false);
});

test('proxied HTTPS login rotates a secure cookie and supports authenticated requests and logout', async () => {
  const repository = createMemoryIdentityRepository();
  await bootstrapPair(repository, setup(), { apply: true });
  const origin = 'https://pft.example.test';
  const authentication = createAuthentication({ repository, sessionStore: createMemorySessionStore(), secret, origin, secure: true });
  const app = createApp({ persistenceStore: createInMemoryPersistenceStore(), authentication,
    runtimeEnv: { PROXY_MODE: 'vercel', VERCEL: '1', NODE_ENV: 'production' } });
  const send = (method, route, cookie) => {
    const call = request(app)[method](route).set('X-Forwarded-Proto', 'https').set('Origin', origin);
    return cookie ? call.set('Cookie', cookie) : call;
  };
  const initial = await send('get', '/api/auth/csrf');
  const initialCookie = initial.headers['set-cookie'][0].split(';')[0];
  const loggedIn = await send('post', '/api/auth/login', initialCookie).set('x-csrf-token', initial.body.csrfToken)
    .send({ email: setup().user.email, password: setup().user.password });
  assert.equal(loggedIn.status, 200);
  assert.match(loggedIn.headers['set-cookie'][0], /; Secure/);
  const cookie = loggedIn.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(cookie, initialCookie);
  assert.equal((await send('get', '/api/auth/me', cookie)).body.user.role, 'user');
  assert.equal((await send('post', '/api/auth/logout', cookie).set('x-csrf-token', initial.body.csrfToken)).status, 403);
  const logout = await send('post', '/api/auth/logout', cookie).set('x-csrf-token', loggedIn.body.csrfToken);
  assert.equal(logout.status, 200);
  assert.match(logout.headers['set-cookie'][0], /; Secure/);
  assert.equal((await send('get', '/api/auth/me', cookie)).status, 401);
});

test('passwords use independent salts and reject invalid or malformed credentials', async () => {
  const password = 'A synthetic passphrase for tests';
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('Different long password', a), false);
  assert.equal(await verifyPassword(password, 'scrypt$999999999$8$1$invalid$invalid'), false);
  await assert.rejects(hashPassword('short'));
});

test('bootstrap input requires separate identities, strong passwords and no caller-selected roles', async () => {
  for (const input of [null, { ...setup(), role: 'admin' }, { ...setup(), user: { ...setup().user, role: 'admin' } },
    { ...setup(), user: { ...setup().user, email: setup().admin.email } }, { ...setup(), user: { ...setup().user, password: 'short' } }]) {
    assert.throws(() => validateBootstrap(input));
  }
  let touched = false;
  const dry = await bootstrapPair({ bootstrapPair() { touched = true; } }, setup());
  assert.equal(dry.dryRun, true);
  assert.equal(touched, false);
  assert.throws(() => createAuthentication({ secret: 'short', sessionStore: createMemorySessionStore() }), /SESSION_SECRET/);
  assert.throws(() => createAuthentication({ secret, secure: true, origin: 'http://example.test', sessionStore: createMemorySessionStore() }), /HTTPS/);
});

test('bootstrap CLI refuses live targets and dry-runs without touching database configuration or printing input', () => {
  const script = path.join(__dirname, '..', 'scripts', 'bootstrap-test.js');
  for (const args of [['--target', 'live', '--apply'], ['--target', 'test']]) {
    const result = spawnSync(process.execPath, [script, ...args], { input: JSON.stringify(setup()), encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, args[1] === 'live' ? 1 : 0);
    assert.doesNotMatch(result.stdout + result.stderr, /Synthetic-admin-passphrase|Synthetic-user-passphrase|admin@example/);
  }
});
