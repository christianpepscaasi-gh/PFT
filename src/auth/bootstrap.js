const { randomUUID } = require('node:crypto');
const { hashPassword, validPassword } = require('./passwords');

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('A valid email is required.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  return email;
}

function validateBootstrap(input) {
  if (!input || Object.keys(input).some((key) => !['admin', 'user'].includes(key))) throw new Error('Supply only admin and user setup fields.');
  const result = {};
  for (const role of ['admin', 'user']) {
    const value = input[role];
    if (!value || Object.keys(value).some((key) => !['email', 'name', 'password'].includes(key))
      || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) throw new Error('Supply a valid name, email and password for each identity.');
    if (!validPassword(value.password)) throw new Error('Each password must contain 12 to 128 characters.');
    result[role] = { email: normalizeEmail(value.email), name: value.name.trim(), password: value.password };
  }
  if (result.admin.email === result.user.email) throw new Error('Admin and personal User need separate email addresses.');
  return result;
}

async function bootstrapPair(repository, input, { apply = false } = {}) {
  const setup = validateBootstrap(input);
  if (!apply) return { dryRun: true, identities: 2 };
  const now = new Date();
  const records = {};
  for (const role of ['admin', 'user']) records[role] = {
    _id: randomUUID(), email: setup[role].email, name: setup[role].name,
    role, status: 'active', sessionVersion: 0, passwordHash: await hashPassword(setup[role].password), createdAt: now, updatedAt: now
  };
  return repository.bootstrapPair(records.admin, records.user);
}

module.exports = { normalizeEmail, validateBootstrap, bootstrapPair };
