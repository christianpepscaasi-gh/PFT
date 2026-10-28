const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createTestEnvironment } = require('../src/config/test-environment');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
try {
  const result = spawnSync(process.execPath, ['--test', 'tests/browser/session.test.js'], {
    cwd: path.join(__dirname, '..'), env: createTestEnvironment(process.env), stdio: 'inherit'
  });
  if (result.error) console.error('Browser verification could not start.');
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
