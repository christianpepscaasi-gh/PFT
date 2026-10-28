const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { createInMemoryPersistenceStore } = require('../src/persistence');
const { createMemoryIdentityRepository, createMemorySessionStore } = require('./auth-helper');
const { verifyManagementContract } = require('./management-contract');
const { createManagementService } = require('../src/auth/management');

test('account requests, audited Admin management, and activation are atomic and private', async () => {
  await verifyManagementContract({ root: createInMemoryPersistenceStore(), repository: createMemoryIdentityRepository(), sessionStore: createMemorySessionStore() });
});

test('request validation bounds input and blocks identity/role fields without creating Users', async () => {
  const repository = createMemoryIdentityRepository();
  const service = createManagementService(repository);
  const valid = { name: 'Applicant', email: 'applicant@example.test' };
  for (const input of [{ ...valid, name: ' ' }, { ...valid, name: 'x'.repeat(81) }, { ...valid, name: 'bad\u0001name' },
    { ...valid, email: { $ne: '' } }, { ...valid, reason: 'x'.repeat(1001) }, { ...valid, reason: [] },
    { ...valid, role: 'admin' }, { ...valid, userId: 'other' }, { ...valid, password: 'client-selected-password' }]) {
    await assert.rejects(service.submitRequest(input), { status: 400 });
  }
  assert.equal(repository.requests.size, 0);
  await service.submitRequest(valid);
  await service.submitRequest({ ...valid, email: 'APPLICANT@example.test' });
  assert.equal(repository.requests.size, 1);
  assert.equal(repository.users.size, 0);
});

test('a token referencing Admin cannot set a password, activate, or consume that invitation', async () => {
  const repository = createMemoryIdentityRepository();
  const token = randomBytes(32).toString('base64url');
  repository.users.set('admin', { _id: 'admin', role: 'admin', status: 'pending', passwordHash: null });
  repository.invitations.set('admin', { _id: 'admin', userId: 'admin', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000), consumedAt: null });
  await assert.rejects(createManagementService(repository).activate({ token, password: 'Synthetic-valid-password-28' }), { status: 400 });
  assert.equal(repository.users.get('admin').passwordHash, null);
  assert.equal(repository.invitations.get('admin').consumedAt, null);
});

test('unknown lifecycle states require review instead of silently granting or changing access', async () => {
  const repository = createMemoryIdentityRepository();
  repository.users.set('admin', { _id: 'admin', role: 'admin', status: 'active' });
  repository.users.set('invalid-user', { _id: 'invalid-user', role: 'user', status: 'unknown', passwordHash: null });
  repository.requests.set('invalid-request', { _id: 'invalid-request', email: 'invalid@example.test', name: 'Unknown', status: 'unknown' });
  const service = createManagementService(repository);
  await assert.rejects(service.approveRequest('admin', 'invalid-request', { confirm: true }), { status: 409 });
  await assert.rejects(service.rejectRequest('admin', 'invalid-request', { confirm: true }), { status: 409 });
  await assert.rejects(service.changeStatus('admin', 'invalid-user', { status: 'active', confirm: true }), { status: 409 });
  assert.equal(repository.users.get('invalid-user').status, 'unknown');
  assert.equal(repository.requests.get('invalid-request').status, 'unknown');
});
