const { randomUUID } = require('node:crypto');

const URI_KEYS = ['MONGODB_URI', 'MONGODB_URI_TEST', 'MONGODB_TEST_URI', 'MONGO_URI_TEST'];

function createTestEnvironment(source, { unit = false, server = false } = {}) {
  const env = { ...source, NODE_ENV: 'test' };
  if (!server) {
    env.SESSION_SECRET = 'synthetic-isolated-test-session-secret-not-for-real-use';
    env.APP_ORIGIN = 'http://127.0.0.1:3000';
  }
  if (unit) {
    for (const key of URI_KEYS) env[key] = '';
    return env;
  }
  const dedicated = source.MONGODB_URI_TEST || source.MONGODB_TEST_URI || source.MONGO_URI_TEST;
  if (!dedicated) throw new Error('Configure a dedicated test connection with MONGODB_URI_TEST. Live fallback is forbidden.');

  let uri;
  try {
    uri = new URL(dedicated);
    const database = decodeURIComponent(uri.pathname.slice(1));
    if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || !uri.hostname
      || (database && !/test/i.test(database)) || database.includes('/')
      || [...uri.searchParams.keys()].some((key) => key.toLowerCase() === 'dbname')) throw new Error();
  } catch {
    throw new Error('Invalid dedicated test connection: use a MongoDB URI with no database name or a test database, without a database override.');
  }
  uri.pathname = server ? '/pft_test_local' : `/pft_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  for (const key of URI_KEYS) env[key] = uri.toString();
  return env;
}

module.exports = { createTestEnvironment };
