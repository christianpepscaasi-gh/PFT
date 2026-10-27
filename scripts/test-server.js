const path = require('node:path');
const { createTestEnvironment } = require('../src/config/test-environment');

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  // Select the test connection before importing server.js, which creates an app on import.
  const env = createTestEnvironment(process.env, { server: true });
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32) throw new Error('Configure a private SESSION_SECRET of at least 32 bytes.');
  Object.assign(process.env, env);
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const { createApp } = require('../server');
  const { createPersistenceStore } = require('../src/persistence');
  const store = createPersistenceStore({ mongoUri: env.MONGODB_URI });
  let server;
  try {
    await store.connect();
    const app = createApp({ persistenceStore: store });
    server = app.listen(port, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    await store.close();
    throw error;
  }
  console.log(`Test server: http://127.0.0.1:${port}; database pft_test_local. Session authentication enabled; use the auth API until browser login is built. Test data is retained after shutdown.`);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
  process.once('SIGINT', () => shutdown().catch(() => { process.exitCode = 1; }));
  process.once('SIGTERM', () => shutdown().catch(() => { process.exitCode = 1; }));
}

main().catch((error) => {
  // Database errors may include connection details. Keep output free of credentials.
  console.error(`Test server could not start (${error.name || 'Error'}). Check SESSION_SECRET, APP_ORIGIN, dedicated test configuration, PORT, and database connectivity.`);
  process.exitCode = 1;
});
