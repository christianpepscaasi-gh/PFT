const path = require('node:path');
const { bootstrapPair } = require('../src/auth/bootstrap');
const { createTestEnvironment } = require('../src/config/test-environment');

async function main() {
  const args = process.argv.slice(2);
  if (!['--target test', '--target test --apply'].includes(args.join(' '))) throw new Error('Usage: bootstrap:test -- --target test [--apply]; setup JSON is read privately from stdin.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 8192) throw new Error('Setup input is too large.');
  }
  const setup = JSON.parse(input);
  if (!args.includes('--apply')) {
    await bootstrapPair(null, setup);
    console.log('Bootstrap dry run passed: two distinct identities; no database writes.');
    return;
  }
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  Object.assign(process.env, createTestEnvironment(process.env, { server: true }));
  const { createPersistenceStore } = require('../src/persistence');
  const { createMongoIdentityRepository } = require('../src/auth/repository');
  const root = createPersistenceStore({ mongoUri: process.env.MONGODB_URI });
  try {
    const result = await bootstrapPair(createMongoIdentityRepository(root), setup, { apply: true });
    console.log(result.created ? 'Test identities provisioned.' : 'Existing test identities verified; passwords and roles unchanged.');
    console.log(`Admin ID: ${result.adminId}; personal User ID: ${result.userId}. Database: pft_test_local.`);
  } finally { await root.close(); }
}

main().catch((error) => {
  console.error(`Bootstrap stopped (${error.name || 'Error'}). Check input, explicit test target, dedicated database access, and existing setup. No credentials are printed.`);
  process.exitCode = 1;
});
