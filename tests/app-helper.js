const { createApp } = require('../server');
const { createInMemoryPersistenceStore } = require('../src/persistence');
const { createIdentityFixtures } = require('./fixtures/identities');

function createTestApp({ persistenceStore = createInMemoryPersistenceStore(), identity = createIdentityFixtures().userA } = {}) {
  return createApp({ persistenceStore, resolveIdentity: async () => identity });
}

module.exports = { createTestApp };
