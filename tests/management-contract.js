const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, createHash } = require('node:crypto');
const { createApp } = require('../server');
const { createAuthentication } = require('../src/auth/authentication');
const { createManagementService } = require('../src/auth/management');
const { bootstrapPair } = require('../src/auth/bootstrap');
const { setup, secret, login } = require('./auth-contract');

async function verifyManagementContract({ root, repository, sessionStore }) {
  const provisioned = await bootstrapPair(repository, setup(), { apply: true });
  let failAudit = false;
  let timeOffset = 0;
  const transaction = repository.managementTransaction.bind(repository);
  const decorated = { ...repository, managementTransaction: (operation) => transaction((tx) => operation({ ...tx,
    insert: async (name, record) => {
      if (name === 'audit' && failAudit) throw new Error('Simulated audit outage.');
      return tx.insert(name, record);
    }
  })) };
  const service = createManagementService(decorated, { now: () => new Date(Date.now() + timeOffset) });
  const issued = [];
  const captured = Object.fromEntries(Object.entries(service).map(([name, method]) => [name, async (...args) => {
    const outcome = await method(...args);
    if (outcome.issued) issued.push(outcome.issued);
    return outcome;
  }]));
  const auth = createAuthentication({ repository: decorated, sessionStore, secret, managementService: captured });
  const app = createApp({ persistenceStore: root, authentication: auth });
  const admin = request.agent(app);
  const adminLogin = await login(admin, 'admin@example.test', setup().admin.password);
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.csrfToken;
  const visitor = request.agent(app);
  const visitorToken = (await visitor.get('/api/auth/csrf')).body.csrfToken;
  const post = (path, body) => admin.post(path).set('x-csrf-token', adminToken).send(body);
  const activate = (token, extra = {}) => visitor.post('/api/auth/activate').set('x-csrf-token', visitorToken).send({ token, password: 'Synthetic-activation-password-28', ...extra });
  const latest = (userId) => issued.filter((item) => item.userId === userId).at(-1).token;

  assert.equal((await request(app).get('/api/admin/users')).status, 401);
  const owner = request.agent(app);
  const ownerLogin = await login(owner, 'owner@example.test', setup().user.password);
  assert.equal((await owner.get('/api/admin/requests')).status, 403);
  assert.equal((await admin.get('/api/accounts')).status, 403);
  const ownerAccount = await owner.post('/api/accounts').set('x-csrf-token', ownerLogin.body.csrfToken).send({ name: 'Owner private wallet', type: 'Cash', initialBalance: 100 });
  assert.equal(ownerAccount.status, 201);

  const applicant = { name: 'Applicant', email: 'new-client@example.test', reason: '<b>Plain request text</b>' };
  assert.equal((await visitor.post('/api/account-requests').send(applicant)).status, 403);
  const duplicates = await Promise.all([0, 1].map(() => visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send(applicant)));
  assert.equal(duplicates[0].status, 202);
  assert.deepEqual(duplicates[0].body, duplicates[1].body);
  const known = await visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send({ ...applicant, email: 'owner@example.test' });
  assert.deepEqual(known.body, duplicates[0].body);
  let requests = (await admin.get('/api/admin/requests')).body.items;
  assert.equal(requests.filter((item) => item.email === applicant.email).length, 1);
  assert.equal(requests.some((item) => item.email === 'owner@example.test'), false);
  const requestId = requests.find((item) => item.email === applicant.email)._id;
  assert.equal((await post('/api/admin/users', { name: 'Direct', email: applicant.email, confirm: true })).status, 409);
  assert.equal((await post('/api/admin/requests/' + requestId + '/approve', {})).status, 400);
  failAudit = true;
  assert.equal((await post('/api/admin/requests/' + requestId + '/approve', { confirm: true })).status, 500);
  failAudit = false;
  assert.equal(await repository.findByEmail(applicant.email), null);
  assert.equal((await service.listRequests(provisioned.adminId, { status: 'pending' })).items.some((item) => item._id === requestId), true);
  const approvals = await Promise.all([0, 1].map(() => post('/api/admin/requests/' + requestId + '/approve', { confirm: true })));
  assert.equal(approvals[0].status, 200);
  assert.equal(approvals[1].status, 200);
  assert.equal(approvals[0].body.user._id, approvals[1].body.user._id);
  const userId = approvals[0].body.user._id;
  assert.equal(approvals[0].body.user.status, 'pending');
  assert.equal(issued.filter((item) => item.userId === userId).length, 1);
  const firstToken = latest(userId);
  assert.equal(JSON.stringify(approvals.map((item) => item.body)).includes(firstToken), false);
  assert.equal((await login(request.agent(app), applicant.email, 'Synthetic-activation-password-28')).status, 401);
  assert.equal((await post('/api/admin/requests/' + requestId + '/reject', { confirm: true })).status, 409);
  assert.equal((await activate(randomBytes(32).toString('base64url'))).status, 400);
  assert.equal((await activate(firstToken, { password: 'short' })).status, 400);
  failAudit = true;
  assert.equal((await post('/api/admin/users/' + userId + '/invitation', { confirm: true })).status, 500);
  failAudit = false;
  assert.ok(await repository.lookupInvitation(createHash('sha256').update(firstToken).digest('hex'), new Date()), 'Failed audit must preserve the previous invitation');
  const reissued = await post('/api/admin/users/' + userId + '/invitation', { confirm: true });
  assert.equal(reissued.status, 200);
  assert.equal((await activate(firstToken)).status, 400);
  const current = latest(userId);
  timeOffset = 25 * 60 * 60 * 1000;
  assert.equal((await activate(current)).status, 400);
  timeOffset = 0;
  const activations = await Promise.all([0, 1].map(() => activate(current)));
  assert.deepEqual(activations.map((item) => item.status).sort(), [200, 400]);
  assert.equal((await visitor.get('/api/auth/me')).status, 401, 'Activation must not silently log in');
  assert.equal((await activate(current)).status, 400);
  assert.equal((await post('/api/admin/users/' + userId + '/invitation', { confirm: true })).status, 409, 'Activation is not password recovery');
  const user = request.agent(app);
  const userLogin = await login(user, applicant.email, 'Synthetic-activation-password-28');
  assert.equal(userLogin.status, 200);
  assert.deepEqual((await user.get('/api/accounts')).body, []);
  assert.equal((await user.get('/api/admin/audit')).status, 403);
  assert.equal((await user.post('/api/transactions').set('x-csrf-token', userLogin.body.csrfToken).send({ accountId: ownerAccount.body._id, type: 'expense', amount: 1, description: 'Forbidden' })).status, 404);
  const userWallet = await user.post('/api/accounts').set('x-csrf-token', userLogin.body.csrfToken).send({ name: 'Client wallet', type: 'Cash', initialBalance: 40 });
  assert.equal(userWallet.status, 201);
  const statusPath = '/api/admin/users/' + userId + '/status';
  failAudit = true;
  assert.equal((await admin.patch(statusPath).set('x-csrf-token', adminToken).send({ status: 'disabled', confirm: true })).status, 500);
  failAudit = false;
  assert.equal((await user.get('/api/auth/me')).status, 200, 'Failed audit must roll back disable/revocation');
  const oldCookie = userLogin.headers['set-cookie'][0].split(';')[0];
  assert.equal((await admin.patch(statusPath).set('x-csrf-token', adminToken).send({ status: 'disabled', confirm: true })).status, 200);
  assert.equal((await user.get('/api/auth/me')).status, 401);
  assert.equal((await admin.patch(statusPath).set('x-csrf-token', adminToken).send({ status: 'active', confirm: true })).body.user.status, 'active');
  assert.equal((await request(app).get('/api/accounts').set('Cookie', oldCookie)).status, 401);
  const savedUser = await repository.findById(userId);
  assert.equal((await root.forUser(savedUser).listAccounts())[0].balance, 4000);
  assert.equal((await admin.patch('/api/admin/users/' + provisioned.adminId + '/status').set('x-csrf-token', adminToken).send({ status: 'disabled', confirm: true })).status, 409);
  assert.equal((await admin.patch('/api/admin/users/' + userId + '/role').set('x-csrf-token', adminToken).send({ role: 'admin' })).status, 404);
  assert.equal((await admin.delete('/api/admin/users/' + userId).set('x-csrf-token', adminToken)).status, 404);
  assert.equal((await post('/api/admin/users', { name: 'Forged', email: 'forged@example.test', role: 'admin', confirm: true })).status, 400);
  assert.equal((await visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send({ ...applicant, userId })).status, 400);
  assert.equal((await activate(current, { role: 'admin' })).status, 400);
  assert.equal((await admin.get('/api/admin/users?status[$ne]=disabled')).status, 400);
  assert.equal((await admin.get('/api/admin/users?limit=101')).status, 400);

  const rejectEmail = 'reapply@example.test';
  const submitted = await visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send({ ...applicant, email: rejectEmail });
  assert.equal(submitted.status, 202);
  requests = (await admin.get('/api/admin/requests')).body.items;
  const rejectedId = requests.find((item) => item.email === rejectEmail)._id;
  assert.equal((await post('/api/admin/requests/' + rejectedId + '/reject', { confirm: true })).status, 200);
  assert.equal((await post('/api/admin/requests/' + rejectedId + '/approve', { confirm: true })).status, 409);
  assert.equal((await visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send({ ...applicant, email: rejectEmail })).status, 202);
  requests = (await admin.get('/api/admin/requests')).body.items;
  assert.equal(requests.filter((item) => item.email === rejectEmail && item.status === 'pending').length, 1);

  const direct = await post('/api/admin/users', { name: 'Direct invite', email: 'direct@example.test', confirm: true });
  assert.equal(direct.status, 201);
  const directId = direct.body.user._id;
  const directPath = '/api/admin/users/' + directId;
  await repository.managementTransaction((tx) => tx.remove('invitations', { _id: directId }));
  const issuedBeforeRepeat = issued.length;
  const repeatedCreate = await post('/api/admin/users', { name: 'Direct invite', email: 'direct@example.test', confirm: true });
  assert.equal(repeatedCreate.body.invitation.state, 'not-issued');
  assert.equal(issued.length, issuedBeforeRepeat, 'Repeated creation must not bypass explicit invitation reissue');
  await post(directPath + '/invitation', { confirm: true });
  const directToken = latest(directId);
  await admin.patch(directPath + '/status').set('x-csrf-token', adminToken).send({ status: 'disabled', confirm: true });
  assert.equal((await activate(directToken)).status, 400);
  assert.equal((await admin.patch(directPath + '/status').set('x-csrf-token', adminToken).send({ status: 'active', confirm: true })).body.user.status, 'pending');
  assert.equal((await activate(directToken)).status, 400);
  await post(directPath + '/invitation', { confirm: true });
  const freshToken = latest(directId);
  failAudit = true;
  assert.equal((await activate(freshToken)).status, 500);
  failAudit = false;
  assert.equal((await repository.findById(directId)).status, 'pending');
  assert.equal((await activate(freshToken)).status, 200, 'Audit failure must not consume the token');

  const failedCount = (await service.listUsers(provisioned.adminId)).items.length;
  failAudit = true;
  assert.equal((await post('/api/admin/users', { name: 'Rollback', email: 'rollback@example.test', confirm: true })).status, 500);
  failAudit = false;
  assert.equal((await service.listUsers(provisioned.adminId)).items.length, failedCount);
  assert.equal(await repository.findByEmail('rollback@example.test'), null);
  const userPage = (await admin.get('/api/admin/users?limit=1')).body;
  assert.equal(userPage.items.length, 1);
  assert.ok(userPage.next);
  assert.equal((await admin.get('/api/admin/users?limit=1&after=' + userPage.next)).body.items.length, 1);
  const allUsers = (await admin.get('/api/admin/users')).body.items;
  for (const sort of ['name', 'email', 'createdAt', 'status']) {
    for (const order of ['asc', 'desc']) {
      const seen = []; let after = null;
      do {
        const response = await admin.get('/api/admin/users').query({ sort, order, limit: 1, ...(after ? { after } : {}) });
        assert.equal(response.status, 200);
        seen.push(...response.body.items.map((item) => item._id)); after = response.body.next;
        assert.ok(seen.length <= allUsers.length, 'Sorted pagination must advance');
      } while (after);
      const expected = [...allUsers].sort((a, b) => {
        const comparison = a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : a._id > b._id ? 1 : -1;
        return order === 'asc' ? comparison : -comparison;
      });
      assert.deepEqual(seen, expected.map((item) => item._id));
    }
  }
  const sortedPage = (await admin.get('/api/admin/users').query({ sort: 'name', limit: 1 })).body;
  assert.equal((await admin.get('/api/admin/users').query({ sort: 'email', after: sortedPage.next })).status, 400);
  assert.equal((await admin.get('/api/admin/users').query({ sort: 'name', status: 'active', after: sortedPage.next })).status, 400);
  assert.equal((await admin.get('/api/admin/users').query({ sort: '$where' })).status, 400);
  const audit = (await admin.get('/api/admin/audit?limit=100')).body.items;
  const publicData = JSON.stringify({ allUsers, audit });
  for (const bundle of issued) assert.equal(publicData.includes(bundle.token), false);
  assert.doesNotMatch(publicData, /passwordHash|sessionVersion|tokenHash|Plain request text|Owner private wallet|scrypt\$/);
  assert.equal(audit.filter((event) => event.action === 'request.approved' && event.targetId === requestId).length, 1);
  assert.equal(audit.filter((event) => event.action === 'user.activated' && event.targetId === userId).length, 1);
  await assert.rejects(service.listUsers(userId), /Admin access/);
  // Every public submission, including duplicate/known emails, shares the same rate gates.
  const rates = [];
  for (let i = 0; i < 6; i++) rates.push((await visitor.post('/api/account-requests').set('x-csrf-token', visitorToken).send({ ...applicant, email: 'limit@example.test' })).status);
  assert.ok(rates.includes(429));
  return { userId, directId, app, issued, provisioned, adminCookie: adminLogin.headers['set-cookie'][0].split(';')[0] };
}

module.exports = { verifyManagementContract };
