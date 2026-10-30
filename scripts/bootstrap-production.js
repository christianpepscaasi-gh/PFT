const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { bootstrapPair } = require('../src/auth/bootstrap');
const { accountSetup, productionTarget, productionArguments } = require('../src/auth/production-bootstrap');

async function main() {
  const options = productionArguments(process.argv.slice(2));
  const workspace = path.join(__dirname, '..');
  const setup = accountSetup(dotenv.parse(fs.readFileSync(path.join(workspace, '.env.account'))));
  const local = fs.existsSync(path.join(workspace, '.env')) ? dotenv.parse(fs.readFileSync(path.join(workspace, '.env'))) : {};
  const target = productionTarget(process.env.MONGODB_URI || local.MONGODB_URI);
  if (options.apply && options.database !== target.database) throw new Error('Explicit database confirmation does not match the configured target.');
  if (!options.apply) {
    await bootstrapPair(null, setup);
    console.log(`Production bootstrap dry run passed. Database: ${target.database}.`);
    console.log('Two distinct identities validated. No database connection, writes, or credential values printed.');
    console.log('Apply creates identities, bootstrap marker, auth indexes, and setup audit only. Business records and ownership remain untouched.');
    return;
  }
  // Import persistence only after explicit target confirmation. Never import the server.
  const { createPersistenceStore } = require('../src/persistence');
  const { createMongoIdentityRepository } = require('../src/auth/repository');
  const root = createPersistenceStore({ mongoUri: target.uri });
  try {
    const result = await bootstrapPair(createMongoIdentityRepository(root), setup, { apply: true });
    console.log(result.created ? 'Production Admin and personal User provisioned.' : 'Existing identities matched; passwords and roles unchanged.');
    console.log(`Database: ${target.database}. No business-data migration or email performed.`);
  } finally { await root.close(); }
}

main().catch((error) => {
  // Driver errors can contain credentials/hostnames. Only print allowlisted validation messages.
  const safe = /^(Missing account fields:|Use --target|Explicit database confirmation|Production target requires|Supply only|Supply a valid|Each password|Admin and personal User)/;
  console.error(safe.test(error.message) ? error.message : `Production bootstrap stopped (${error.name || 'Error'}). Check private setup, target, database access, and existing identities. No credentials are printed.`);
  process.exitCode = 1;
});
