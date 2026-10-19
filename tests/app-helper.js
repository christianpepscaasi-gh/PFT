const { createApp } = require('../server');
const { createInMemoryPersistenceStore } = require('../src/persistence');

function createTestApp() {
  return createApp({ persistenceStore: createInMemoryPersistenceStore() });
}

module.exports = { createTestApp };
