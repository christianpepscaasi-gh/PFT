const session = require('express-session');
const { randomBytes, createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { mongoose } = require('../persistence');
const { normalizeEmail } = require('./bootstrap');
const { hashPassword, verifyPassword } = require('./passwords');
const { createMongoIdentityRepository } = require('./repository');
const { createManagementService } = require('./management');
const { installManagementRoutes } = require('./management-routes');

const COOKIE_NAME = 'pft.sid';
const SESSION_MS = 8 * 60 * 60 * 1000;
let dummyHash;
const nonce = () => randomBytes(32).toString('base64url');
const publicUser = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role, status: user.status });
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sessionCall = (req, method) => promisify(req.session[method].bind(req.session))();

class LazyMongoSessionStore extends session.Store {
  constructor(repository) {
    super();
    this.repository = repository;
  }
  async ready() {
    await this.repository.connect();
    const client = mongoose.connection.getClient();
    if (!this.delegate || this.client !== client) {
      const { MongoStore } = require('connect-mongo');
      this.client = client;
      this.delegate = MongoStore.create({ client, dbName: mongoose.connection.name,
        collectionName: 'auth_sessions', autoRemove: 'disabled',
        transformId: (sid) => createHash('sha256').update(sid).digest('hex') });
      this.delegate.on('error', () => console.error('Authentication session storage reported an error.'));
    }
    return this.delegate;
  }
  get(sid, callback) { this.ready().then((store) => store.get(sid, callback), callback); }
  set(sid, value, callback) { this.ready().then((store) => store.set(sid, value, callback), callback); }
  destroy(sid, callback) { this.ready().then((store) => store.destroy(sid, callback), callback); }
  touch(sid, value, callback) { this.ready().then((store) => store.touch(sid, value, callback), callback); }
}

function createAuthentication({ repository, sessionStore, secret, origin = 'http://127.0.0.1:3000', secure = false, managementService }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.');
  let configuredOrigin;
  try { configuredOrigin = new URL(origin); }
  catch { throw new Error('APP_ORIGIN must be a valid application origin.'); }
  if (!['http:', 'https:'].includes(configuredOrigin.protocol) || (secure && configuredOrigin.protocol !== 'https:')
    || configuredOrigin.username || configuredOrigin.password || configuredOrigin.pathname !== '/' || configuredOrigin.search || configuredOrigin.hash) throw new Error('APP_ORIGIN must be the application origin; HTTPS is required for secure cookies.');
  if (!sessionStore) throw new Error('An explicit session store is required.');
  const cookie = { path: '/', httpOnly: true, sameSite: 'strict', secure };
  const sessions = session({ name: COOKIE_NAME, secret, store: sessionStore, resave: false, saveUninitialized: false,
    unset: 'destroy', cookie: { ...cookie, maxAge: 20 * 60 * 1000 } });
  const fingerprint = (...parts) => createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
  function checkOrigin(req) {
    return (!req.get('origin') || req.get('origin') === configuredOrigin.origin) && req.get('sec-fetch-site') !== 'cross-site';
  }
  function validCsrf(req) {
    const expected = req.session?.csrfToken;
    const supplied = req.get('x-csrf-token');
    return checkOrigin(req) && typeof expected === 'string' && /^[\w-]{43}$/.test(expected)
      && typeof supplied === 'string' && /^[\w-]{43}$/.test(supplied)
      && expected.length === supplied.length && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  }
  function verifyCsrf(req, res) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validCsrf(req)) {
      res.status(403).json({ error: 'Invalid request token or origin.' });
      return false;
    }
    return true;
  }
  async function resolveIdentity(req, res) {
    if (!req.session?.userId) return null;
    const user = await repository.findById(req.session.userId);
    if (!user || user.status !== 'active' || !['user', 'admin'].includes(user.role)
      || !Number.isSafeInteger(user.sessionVersion) || user.sessionVersion < 0
      || user.sessionVersion !== req.session.sessionVersion || user.role !== req.session.roleAtLogin
      || !Number.isFinite(req.session.authExpiresAt) || req.session.authExpiresAt <= Date.now()) {
      await sessionCall(req, 'destroy');
      res.clearCookie(COOKIE_NAME, cookie);
      return null;
    }
    return publicUser(user);
  }
  function install(app) {
    app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sessions);
    app.get('/api/auth/csrf', asyncRoute(async (req, res) => {
      if (!checkOrigin(req)) return res.status(403).json({ error: 'Invalid request token or origin.' });
      if (!req.session) return res.status(503).json({ error: 'Authentication is unavailable.' });
      if (!await repository.consumeAttempt(fingerprint('csrf', req.ip), 60, 15 * 60 * 1000)) {
        res.set('Retry-After', '900');
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }
      req.session.csrfToken ||= nonce();
      await sessionCall(req, 'save');
      res.json({ csrfToken: req.session.csrfToken });
    }));
    app.post('/api/auth/login', asyncRoute(async (req, res) => {
      if (!verifyCsrf(req, res)) return;
      let email = '';
      try { email = normalizeEmail(req.body.email); } catch { /* Same invalid-credentials response. */ }
      for (const [key, limit] of [[fingerprint('ip', req.ip), 30], [fingerprint('email', email), 20], [fingerprint('pair', req.ip, email), 10]]) {
        if (!await repository.consumeAttempt(key, limit, 15 * 60 * 1000)) {
          res.set('Retry-After', '900');
          return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
        }
      }
      if (Object.keys(req.body).some((key) => !['email', 'password'].includes(key))) return res.status(400).json({ error: 'Only email and password are accepted.' });
      const user = email ? await repository.findByEmail(email) : null;
      dummyHash ||= hashPassword(nonce());
      const fallback = await dummyHash;
      const valid = await verifyPassword(req.body.password, user?.passwordHash || fallback);
      if (!valid || !user || typeof user._id !== 'string' || !user._id || user.status !== 'active'
        || !Number.isSafeInteger(user.sessionVersion) || user.sessionVersion < 0 || !['admin', 'user'].includes(user.role)) {
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }
      await sessionCall(req, 'regenerate');
      req.session.userId = user._id;
      req.session.sessionVersion = user.sessionVersion;
      req.session.roleAtLogin = user.role;
      req.session.authExpiresAt = Date.now() + SESSION_MS;
      req.session.csrfToken = nonce();
      req.session.cookie.maxAge = SESSION_MS;
      await sessionCall(req, 'save');
      res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
    }));
    app.get('/api/auth/me', asyncRoute(async (req, res) => {
      const user = await resolveIdentity(req, res);
      if (!user) return res.status(401).json({ error: 'Authentication required.' });
      res.json({ user, csrfToken: req.session.csrfToken });
    }));
    app.post('/api/auth/logout', asyncRoute(async (req, res) => {
      if (!verifyCsrf(req, res)) return;
      await sessionCall(req, 'destroy');
      res.clearCookie(COOKIE_NAME, cookie);
      res.json({ loggedOut: true });
    }));
    installManagementRoutes(app, { repository, resolveIdentity, verifyCsrf, fingerprint,
      service: managementService || createManagementService(repository) });
  }
  return { install, resolveIdentity, verifyCsrf, repository };
}

function createMongoAuthentication(root, env = process.env) {
  const repository = createMongoIdentityRepository(root);
  return createAuthentication({ repository, sessionStore: new LazyMongoSessionStore(repository), secret: env.SESSION_SECRET,
    origin: env.APP_ORIGIN || `http://127.0.0.1:${env.PORT || 3000}`, secure: env.NODE_ENV === 'production' });
}

module.exports = { createAuthentication, createMongoAuthentication,
  createMongoSessionStore: (repository) => new LazyMongoSessionStore(repository) };
