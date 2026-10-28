const { normalizeEmail } = require('./bootstrap');
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function installManagementRoutes(app, { repository, resolveIdentity, verifyCsrf, fingerprint, service }) {
  async function throttle(req, res, namespace, value, limit, duration) {
    if (await repository.consumeAttempt(fingerprint(namespace, value), limit, duration)) return true;
    res.set('Retry-After', String(Math.ceil(duration / 1000)));
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return false;
  }
  app.post('/api/account-requests', asyncRoute(async (req, res) => {
    if (!verifyCsrf(req, res)) return;
    if (!await throttle(req, res, 'request-ip', req.ip, 10, 15 * 60 * 1000)) return;
    let email = '';
    try { email = normalizeEmail(req.body.email); } catch { /* Validation uses a stable response. */ }
    if (!await throttle(req, res, 'request-email', email, 3, 24 * 60 * 60 * 1000)) return;
    res.status(202).json(await service.submitRequest(req.body));
  }));
  app.post('/api/auth/activate', asyncRoute(async (req, res) => {
    if (!verifyCsrf(req, res)) return;
    if (!await throttle(req, res, 'activation-ip', req.ip, 20, 15 * 60 * 1000)) return;
    const token = typeof req.body.token === 'string' && req.body.token.length <= 128 ? req.body.token : '';
    if (!await throttle(req, res, 'activation-token', token, 10, 15 * 60 * 1000)) return;
    res.json(await service.activate(req.body));
  }));
  app.use('/api/admin', asyncRoute(async (req, res, next) => {
    const actor = await resolveIdentity(req, res);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role !== 'admin' || actor.status !== 'active') return res.status(403).json({ error: 'Admin access is required.' });
    if (!verifyCsrf(req, res)) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && !await throttle(req, res, 'management-actor', actor._id, 60, 15 * 60 * 1000)) return;
    req.managementActor = actor._id;
    next();
  }));
  app.get('/api/admin/requests', asyncRoute(async (req, res) => res.json(await service.listRequests(req.managementActor, req.query))));
  app.get('/api/admin/users', asyncRoute(async (req, res) => res.json(await service.listUsers(req.managementActor, req.query))));
  app.get('/api/admin/audit', asyncRoute(async (req, res) => res.json(await service.listAudit(req.managementActor, req.query))));
  app.post('/api/admin/requests/:id/approve', asyncRoute(async (req, res) => {
    const outcome = await service.approveRequest(req.managementActor, req.params.id, req.body);
    res.json(outcome.result);
  }));
  app.post('/api/admin/requests/:id/reject', asyncRoute(async (req, res) => res.json((await service.rejectRequest(req.managementActor, req.params.id, req.body)).result)));
  app.post('/api/admin/users', asyncRoute(async (req, res) => {
    const outcome = await service.createUser(req.managementActor, req.body);
    res.status(201).json(outcome.result);
  }));
  app.post('/api/admin/users/:id/invitation', asyncRoute(async (req, res) => {
    if (!await throttle(req, res, 'invitation-user', req.params.id, 5, 60 * 60 * 1000)) return;
    const outcome = await service.reissueInvitation(req.managementActor, req.params.id, req.body);
    res.json(outcome.result);
  }));
  app.patch('/api/admin/users/:id/status', asyncRoute(async (req, res) => res.json((await service.changeStatus(req.managementActor, req.params.id, req.body)).result)));
  app.use('/api/admin', (req, res) => res.status(404).json({ error: 'Management endpoint not found.' }));
}

module.exports = { installManagementRoutes };
