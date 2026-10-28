const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright-core');
const { createApp } = require('../../server');
const { createPersistenceStore, mongoose } = require('../../src/persistence');
const { createMongoIdentityRepository } = require('../../src/auth/repository');
const { createAuthentication, createMongoSessionStore } = require('../../src/auth/authentication');
const { bootstrapPair } = require('../../src/auth/bootstrap');
const { createManagementService } = require('../../src/auth/management');
const { setup, secret } = require('../auth-contract');

test('real browser: private User flows, Admin review, activation, safe rendering, CSRF and session cleanup', { timeout: 300000 }, async () => {
  const uri = process.env.MONGODB_URI_TEST;
  assert.ok(uri, 'Use npm run test:browser with a dedicated test connection');
  assert.match(new URL(uri).pathname, /^\/pft_test_/);
  const root = createPersistenceStore({ mongoUri: uri });
  const server = http.createServer();
  let browser;
  const errors = [];
  try {
    const repository = createMongoIdentityRepository(root);
    const pair = await bootstrapPair(repository, setup(), { apply: true });
    const ownerStore = root.forUser(await repository.findById(pair.userId));
    await ownerStore.connect();
    await ownerStore.createAccount({ name: 'OWNER PRIVATE WALLET', type: 'Cash', initialBalance: 10000 });
    await ownerStore.createCareerEntry('journal', { date: '2000-01-01', entry: 'OWNER PRIVATE JOURNAL' });
    const management = createManagementService(repository);
    const invitation = await management.createUser(pair.adminId, { name: 'Invited client', email: 'activation@example.test', confirm: true });
    await management.submitRequest({ name: 'Reject candidate', email: 'reject-ui@example.test', reason: 'Test rejection' });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const authentication = createAuthentication({ repository, sessionStore: createMongoSessionStore(repository), secret, origin });
    server.on('request', createApp({ persistenceStore: root, authentication }));
    browser = await chromium.launch(process.env.PFT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PFT_BROWSER_EXECUTABLE, headless: true } : { channel: 'msedge', headless: true });
    async function page(width = 1280) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const current = await context.newPage();
      current.setDefaultTimeout(20000);
      current.on('pageerror', (error) => errors.push(error.message));
      return current;
    }
    async function signIn(current, email, password, role = 'user') {
      await current.locator('#login-form').waitFor({ state: 'visible' });
      await current.locator('#login-email').fill(email);
      await current.locator('#login-password').fill(password);
      await current.locator('#login-form button[type=submit]').click();
      await current.locator(role === 'admin' ? '#admin-workspace' : '#user-workspace').waitFor({ state: 'visible' });
    }
    async function confirmed(current, locator, accept = true) {
      current.once('dialog', (dialog) => accept ? dialog.accept() : dialog.dismiss());
      await locator.click();
    }
    const owner = await page();
    const anonymousRequests = [];
    owner.on('request', (request) => { if (request.url().includes('/api/')) anonymousRequests.push(new URL(request.url()).pathname); });
    await owner.goto(origin);
    await owner.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal(await owner.locator('#user-workspace').isVisible(), false);
    assert.equal(await owner.locator('#admin-workspace').isVisible(), false);
    assert.equal(anonymousRequests.some((path) => path === '/api/overview' || path === '/api/accounts'), false);
    await signIn(owner, 'owner@example.test', setup().user.password);
    await owner.locator('#account-list').getByText('OWNER PRIVATE WALLET', { exact: true }).waitFor();
    assert.equal(await owner.locator('#career-view').isVisible(), false);
    assert.equal(await owner.locator('#reports-view').isVisible(), false);
    await owner.locator('#account-toggle-button').click();
    await owner.locator('#account-name').fill('Browser wallet');
    await owner.locator('#account-initial-balance').fill('50');
    await owner.locator('#account-form button[type=submit]').click();
    await owner.getByText('Browser wallet', { exact: true }).first().waitFor();
    await owner.locator('#account-toggle-button').click();
    await owner.locator('#account-name').fill('Keep failed input');
    await owner.route('**/api/accounts', async (route) => {
      if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic save failure.' }) });
      else await route.continue();
    });
    await owner.locator('#account-form button[type=submit]').click();
    await owner.getByText('Synthetic save failure.', { exact: true }).first().waitFor();
    assert.equal(await owner.locator('#account-name').inputValue(), 'Keep failed input');
    assert.equal(await owner.locator('#account-form button[type=submit]').isEnabled(), true);
    await owner.unroute('**/api/accounts');
    await owner.locator('#account-cancel-button').click();
    await owner.locator('#quick-entry-button').click();
    await owner.locator('#entry-account').selectOption({ label: 'Browser wallet' });
    await owner.locator('#entry-type').selectOption('expense');
    await owner.locator('#entry-amount').fill('5');
    await owner.locator('#entry-description').fill('Browser lunch');
    await owner.locator('#quick-entry-form button[type=submit]').click();
    const transaction = owner.locator('#transaction-list .transaction-item').filter({ hasText: 'Browser lunch' });
    await transaction.waitFor();
    await transaction.getByRole('button', { name: 'Edit', exact: true }).click();
    await owner.locator('#entry-description').fill('Edited browser lunch');
    await owner.locator('#entry-amount').fill('6');
    await owner.locator('#quick-entry-form button[type=submit]').click();
    const edited = owner.locator('#transaction-list .transaction-item').filter({ hasText: 'Edited browser lunch' });
    await edited.waitFor();
    await confirmed(owner, edited.getByRole('button', { name: 'Delete', exact: true }));
    await edited.waitFor({ state: 'hidden' });
    assert.equal((await ownerStore.listTransactions()).length, 0);
    let archiveConfirmations = 0;
    const acceptArchive = async (dialog) => { archiveConfirmations++; await dialog.accept(); };
    owner.on('dialog', acceptArchive);
    const archiveRow = owner.locator('#account-list .account-item').filter({ hasText: 'Browser wallet' });
    await archiveRow.getByRole('button', { name: 'Archive', exact: true }).click();
    await archiveRow.waitFor({ state: 'hidden' });
    owner.off('dialog', acceptArchive);
    assert.equal(archiveConfirmations, 2);
    assert.equal((await ownerStore.listAccounts()).find((account) => account.name === 'Browser wallet').archived, true);
    await owner.locator('[data-view=career]').click();
    await owner.getByText('OWNER PRIVATE JOURNAL', { exact: true }).waitFor();
    assert.ok(await owner.locator('#journal-date').inputValue());
    await owner.locator('#journal-entry').fill('Browser learning note');
    await owner.locator('#journal-form button[type=submit]').click();
    await owner.getByText('Browser learning note', { exact: true }).waitFor();
    mkdirSync('artifacts/browser', { recursive: true });
    await owner.screenshot({ path: 'artifacts/browser/user-desktop.png', fullPage: true });
    await owner.locator('#logout-button').click();
    await owner.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal((await owner.locator('body').textContent()).includes('OWNER PRIVATE'), false);

    const applicant = await page(390);
    await applicant.goto(origin);
    await applicant.locator('#show-request-button').waitFor({ state: 'visible' });
    await applicant.locator('#show-request-button').click();
    const malicious = '<img src=x onerror="window.XSS=1">';
    await applicant.locator('#request-name').fill(malicious);
    await applicant.locator('#request-email').fill('requesting@example.test');
    await applicant.locator('#request-reason').fill('<script>window.XSS=1</script>');
    await applicant.locator('#request-account-form button[type=submit]').click();
    await applicant.getByText('If eligible, your request will be reviewed.', { exact: true }).waitFor();
    assert.equal(await applicant.locator('#request-name').inputValue(), '');
    assert.equal(await applicant.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await applicant.screenshot({ path: 'artifacts/browser/request-mobile.png', fullPage: true });

    const client = await page();
    await client.goto(`${origin}/#activate=${invitation.issued.token}`);
    await client.locator('#activation-form').waitFor({ state: 'visible' });
    assert.equal(new URL(client.url()).hash, '');
    const clientPassword = 'Synthetic-browser-client-password-28';
    await client.locator('#activation-password').fill(clientPassword);
    await client.locator('#activation-confirm').fill('A mismatching passphrase');
    await client.locator('#activate-button').click();
    await client.getByText('Passwords must match.', { exact: true }).waitFor();
    await client.locator('#activation-confirm').fill(clientPassword);
    await client.locator('#activate-button').click();
    await client.getByText('Account activated. Sign in with your email and new password.', { exact: true }).waitFor();
    await signIn(client, 'activation@example.test', clientPassword);
    assert.equal((await client.locator('body').textContent()).includes('OWNER PRIVATE'), false);
    await client.locator('#account-toggle-button').click();
    await client.locator('#account-name').fill('CLIENT PRIVATE WALLET');
    await client.locator('#account-initial-balance').fill('20');
    await client.locator('#account-form button[type=submit]').click();
    await client.getByText('CLIENT PRIVATE WALLET', { exact: true }).first().waitFor();
    await signIn(owner, 'activation@example.test', clientPassword);
    await owner.getByText('CLIENT PRIVATE WALLET', { exact: true }).first().waitFor();
    assert.equal((await owner.locator('body').textContent()).includes('OWNER PRIVATE'), false);
    assert.equal(await owner.locator('#career-view').isVisible(), false);

    const admin = await page();
    const adminCalls = [];
    admin.on('request', (request) => { if (request.url().includes('/api/')) adminCalls.push(new URL(request.url()).pathname); });
    await admin.goto(origin);
    await signIn(admin, 'admin@example.test', setup().admin.password, 'admin');
    const requestRow = admin.locator('.admin-record').filter({ hasText: 'requesting@example.test' });
    await requestRow.waitFor();
    assert.equal(await admin.locator('#user-navigation').isVisible(), false);
    assert.equal(adminCalls.some((path) => ['/api/overview', '/api/accounts', '/api/career/journal'].includes(path)), false);
    assert.equal(await admin.locator('#admin-list img, #admin-list script').count(), 0);
    assert.equal(await admin.evaluate(() => window.XSS), undefined);
    await confirmed(admin, requestRow.getByRole('button', { name: 'Approve', exact: true }), false);
    assert.equal(await requestRow.getByRole('button', { name: 'Approve', exact: true }).isVisible(), true);
    await confirmed(admin, requestRow.getByRole('button', { name: 'Approve', exact: true }));
    await requestRow.locator('.status-badge').filter({ hasText: 'approved' }).waitFor();
    const rejectRow = admin.locator('.admin-record').filter({ hasText: 'reject-ui@example.test' });
    await confirmed(admin, rejectRow.getByRole('button', { name: 'Reject', exact: true }));
    await rejectRow.locator('.status-badge').filter({ hasText: 'rejected' }).waitFor();
    await admin.locator('[data-admin-view=users]').click();
    const clientRow = admin.locator('.admin-record').filter({ hasText: 'activation@example.test' });
    await clientRow.waitFor();
    await admin.route('**/api/admin/users/*/status', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic management outage.' }) }));
    await confirmed(admin, clientRow.getByRole('button', { name: 'Disable', exact: true }));
    await admin.getByText('Synthetic management outage.', { exact: true }).waitFor();
    assert.equal(await clientRow.getByRole('button', { name: 'Disable', exact: true }).isEnabled(), true);
    await admin.unroute('**/api/admin/users/*/status');
    await confirmed(admin, clientRow.getByRole('button', { name: 'Disable', exact: true }));
    await clientRow.locator('.status-badge').filter({ hasText: 'disabled' }).waitFor();
    await client.evaluate(() => window.PftSession.recheck());
    await client.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal((await client.locator('body').textContent()).includes('CLIENT PRIVATE'), false);
    await confirmed(admin, clientRow.getByRole('button', { name: 'Enable', exact: true }));
    await clientRow.locator('.status-badge').filter({ hasText: 'active' }).waitFor();
    await signIn(client, 'activation@example.test', clientPassword);
    await client.getByText('CLIENT PRIVATE WALLET', { exact: true }).first().waitFor();
    // Simulate a session removed/expired on the server while its cookie is still
    // in the browser. Either a session probe or an explicit sign-out must clear
    // the UI. A probe may finish before the next automation action is delivered.
    for (const saved of await mongoose.connection.db.collection('auth_sessions').find({}).toArray()) {
      if (JSON.parse(saved.session).userId === invitation.result.user._id) await mongoose.connection.db.collection('auth_sessions').deleteOne({ _id: saved._id });
    }
    await client.evaluate(() => { const button = document.getElementById('logout-button'); if (!button.hidden) button.click(); });
    await client.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal((await client.locator('body').textContent()).includes('CLIENT PRIVATE'), false);
    await admin.locator('#admin-user-name').fill('Admin-created User');
    await admin.locator('#admin-user-email').fill('created-ui@example.test');
    await confirmed(admin, admin.locator('#admin-create-form button[type=submit]'));
    await admin.locator('.admin-record').filter({ hasText: 'created-ui@example.test' }).waitFor();
    const pending = admin.locator('.admin-record').filter({ hasText: 'requesting@example.test' });
    await confirmed(admin, pending.getByRole('button', { name: 'Reissue invitation', exact: true }));
    await admin.locator('#admin-message').filter({ hasText: 'New invitation prepared until' }).waitFor();
    await pending.getByRole('button', { name: 'Reissue invitation', exact: true }).waitFor();
    assert.equal((await admin.locator('body').textContent()).includes('OWNER PRIVATE'), false);
    assert.equal((await admin.locator('body').textContent()).includes('CLIENT PRIVATE'), false);
    assert.equal(await admin.locator('.users-table th').allTextContents().then((items) => items.join('|')), 'Name|Email|Created|Status|Actions');
    await admin.locator('#admin-sort').selectOption('name:asc');
    await admin.locator('.users-table th[aria-sort=ascending]').filter({ hasText: 'Name' }).waitFor();
    const names = await admin.locator('.users-table tbody tr td:first-child').allTextContents();
    assert.deepEqual(names, [...names].sort());
    await admin.screenshot({ path: 'artifacts/browser/admin-desktop.png', fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await admin.locator('.users-table-container').evaluate((element) => element.scrollWidth > element.clientWidth), true);
    await admin.screenshot({ path: 'artifacts/browser/users-mobile.png', fullPage: true });
    await admin.setViewportSize({ width: 1440, height: 1000 });

    for (let batch = 0; batch < 6; batch++) await Promise.all(Array.from({ length: 5 }, (_, index) => management.submitRequest({ name: `Page candidate ${batch}-${index}`, email: `page-${batch}-${index}@example.test` })));
    await admin.locator('[data-admin-view=requests]').click();
    await admin.locator('#admin-next:not([disabled])').waitFor();
    await admin.locator('#admin-next').click();
    await admin.getByText('Page 2', { exact: true }).waitFor();
    await admin.locator('#admin-filter').selectOption('approved');
    await admin.getByText('Page 1', { exact: true }).waitFor();
    assert.equal(await admin.locator('#admin-next').isDisabled(), true);
    await admin.locator('[data-admin-view=audit]').click();
    await admin.locator('#admin-list .admin-record').first().waitFor();
    assert.equal(await admin.locator('#admin-filter-label').isVisible(), false);
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await admin.screenshot({ path: 'artifacts/browser/admin-mobile.png', fullPage: true });
    await admin.locator('#logout-button').click();
    await admin.locator('#login-form').waitFor({ state: 'visible' });
    assert.equal(await admin.locator('#admin-list .admin-record').count(), 0);
    // A response containing the previous User's data must not render after logout
    // or after a different User signs in, even if it was already read by the server.
    const race = await page();
    await race.goto(origin);
    let release;
    let captured;
    const hold = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { captured = resolve; });
    await race.route('**/api/overview?*', async (route) => {
      const response = await route.fetch();
      captured();
      await hold;
      try { await route.fulfill({ response }); } catch { /* Logout deliberately cancels this request. */ }
    }, { times: 1 });
    try {
      await signIn(race, 'owner@example.test', setup().user.password);
      await ready;
      await race.locator('#logout-button').click();
      await race.locator('#login-form').waitFor({ state: 'visible' });
    } finally { release(); }
    await signIn(race, 'activation@example.test', clientPassword);
    await race.locator('#account-list').getByText('CLIENT PRIVATE WALLET', { exact: true }).waitFor();
    assert.equal((await race.locator('body').textContent()).includes('OWNER PRIVATE'), false);
    assert.equal(await race.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, [], 'No uncaught browser JavaScript errors');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    try { await root.connect(); await mongoose.connection.dropDatabase(); }
    finally { await root.close(); }
  }
});
