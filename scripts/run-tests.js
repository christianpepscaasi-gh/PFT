const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { readdirSync } = require('node:fs');
const { createTestEnvironment } = require('../src/config/test-environment');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--unit') || args.length > 1) throw new Error('Usage: node scripts/run-tests.js [--unit]');
  const unit = args.includes('--unit');
  const env = createTestEnvironment(process.env, { unit });
  console.log(unit ? 'Unit-only mode: live Mongo verification is explicitly disabled.' : 'Isolated test mode: dedicated test connection selected; live configuration replaced in the child process.');
  const root = path.join(__dirname, '..');
  const files = readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.js')).sort()
    .map((name) => path.join('tests', name));
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, env, stdio: 'inherit' });
  if (result.error) console.error('The test runner could not start.');
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
