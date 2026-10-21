const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function browser(fetch) {
  const elements = new Map();
  const values = { 'entry-account': 'account-1', 'entry-type': 'expense', 'entry-amount': '12.50',
    'entry-category': 'Food', 'entry-description': 'Lunch', 'entry-notes': 'Keep me',
    'entry-date': '2026-10-21', 'entry-time': '12:30' };
  for (const [id, value] of Object.entries(values)) elements.set(id, { value });
  elements.set('app-message', { hidden: true, textContent: '' });
  elements.set('entry-error', { hidden: true, textContent: '' });
  const modal = { closed: false, close() { this.closed = true; } };
  elements.set('quick-entry-modal', modal);
  const context = vm.createContext({ Intl, Date, fetch, document: { getElementById: (id) => elements.get(id) } });
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8').split("registerSubmit(document.getElementById('budget-form')")[0];
  vm.runInContext(source, context);
  return { context, elements, modal };
}

test('failed quick entry retains input, keeps modal open, and shows the API error', async () => {
  const { context, elements, modal } = browser(async () => ({ ok: false, json: async () => ({ error: 'Database is unavailable.' }) }));
  const button = { disabled: false };
  let reset = false;
  let submit;
  const form = { querySelector: () => button, reset() { reset = true; }, addEventListener(name, handler) { submit = handler; } };
  context.form = form;
  vm.runInContext('registerSubmit(form, handleQuickEntry)', context);
  await submit({ preventDefault() {} });
  assert.equal(reset, false);
  assert.equal(modal.closed, false);
  assert.equal(elements.get('entry-description').value, 'Lunch');
  assert.equal(elements.get('entry-error').textContent, 'Database is unavailable.');
  assert.equal(button.disabled, false);
});

test('submit guard prevents duplicate writes and restores the button after a network error', async () => {
  let reject;
  let calls = 0;
  const { context, elements } = browser(() => { calls++; return new Promise((resolve, fail) => { reject = fail; }); });
  const button = { disabled: false };
  let submit;
  context.form = { querySelector: () => button, addEventListener(name, handler) { submit = handler; } };
  vm.runInContext('registerSubmit(form, () => checkedFetch("/api/accounts"))', context);
  const pending = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  reject(new Error('Network'));
  await pending;
  assert.equal(button.disabled, false);
  assert.match(elements.get('app-message').textContent, /Unable to reach/);
});

test('editing uses PATCH and preserves an unchanged timestamp including seconds', async () => {
  let sent;
  const { context } = browser(async (url, options) => { sent = { url, options }; return { ok: false, json: async () => ({ error: 'Stop after write inspection' }) }; });
  vm.runInContext("state.editingTransaction = 'transaction-1'; state.originalOccurredAt = '2026-10-21T12:30:45+08:00'", context);
  await assert.rejects(context.handleQuickEntry({ preventDefault() {}, currentTarget: {} }));
  assert.equal(sent.url, '/api/transactions/transaction-1');
  assert.equal(sent.options.method, 'PATCH');
  assert.equal(JSON.parse(sent.options.body).occurredAt, '2026-10-21T12:30:45+08:00');
});
