const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
});

const state = {
  month: '',
  accounts: [],
  transactions: []
};

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function renderSummary(data) {
  document.getElementById('current-balance').textContent = formatCurrency(data.currentBalance || 0);
  document.getElementById('monthly-income').textContent = formatCurrency(data.monthlyIncome || 0);
  document.getElementById('monthly-expenses').textContent = formatCurrency(data.monthlyExpenses || 0);
  document.getElementById('net-cash-flow').textContent = formatCurrency(data.netCashFlow || 0);
  document.getElementById('salary-month').value = data.salaryMonth || state.month || new Date().toISOString().slice(0, 7);
  state.month = data.salaryMonth || state.month;
}

function renderAccounts(accounts) {
  const container = document.getElementById('account-list');
  container.innerHTML = '';

  if (!accounts.length) {
    container.innerHTML = '<div class="empty-state">No accounts yet. Create one to start tracking your money.</div>';
    return;
  }

  accounts.forEach((account) => {
    const item = document.createElement('div');
    item.className = 'account-item';

    const meta = document.createElement('div');
    meta.className = 'account-meta';
    meta.innerHTML = `
      <strong>${account.name}</strong>
      <span class="balance-label">${account.type}</span>
    `;

    const amount = document.createElement('div');
    const balance = Number(account.balance || 0);
    amount.className = `amount ${balance >= 0 ? 'positive' : 'negative'}`;
    amount.textContent = formatCurrency(balance);

    item.append(meta, amount);
    container.appendChild(item);
  });
}

function renderTransactions(transactions, containerId = 'transaction-list') {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!transactions.length) {
    container.innerHTML = '<div class="empty-state">No transactions yet. Add your first income or expense with Quick Entry.</div>';
    return;
  }

  transactions.slice().sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).forEach((transaction) => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const amount = Number(transaction.amount || 0);
    const direction = transaction.type === 'income' ? 'positive' : 'negative';

    item.innerHTML = `
      <div><strong>${transaction.description}</strong></div>
      <div class="balance-label">${transaction.category || 'General'} • ${new Date(transaction.occurredAt).toLocaleString()}</div>
      <div class="amount ${direction}">${transaction.type === 'income' ? '+' : '-'}${formatCurrency(amount)}</div>
    `;

    container.appendChild(item);
  });
}

function renderReports(report) {
  document.getElementById('report-income').textContent = formatCurrency(report.income || 0);
  document.getElementById('report-expenses').textContent = formatCurrency(report.expenses || 0);
  document.getElementById('report-net').textContent = formatCurrency(report.netCashFlow || 0);
  document.getElementById('report-count').textContent = String(report.count || 0);
  renderTransactions(report.transactions || [], 'report-transaction-list');
}

async function loadOverview() {
  const currentMonth = state.month || new Date().toISOString().slice(0, 7);
  const response = await fetch(`/api/overview?month=${encodeURIComponent(currentMonth)}`);
  const data = await response.json();

  renderSummary(data);
  renderAccounts(data.accounts || []);
  state.accounts = data.accounts || [];

  const accountSelect = document.getElementById('entry-account');
  accountSelect.innerHTML = state.accounts.length
    ? state.accounts.map((account) => `<option value="${account._id}">${account.name}</option>`).join('')
    : '<option value="">Create an account first</option>';
}

async function loadTransactions() {
  const response = await fetch('/api/transactions');
  const data = await response.json();
  state.transactions = data;
  renderTransactions(data);
}

async function loadReports() {
  const end = new Date();
  const endDate = end.toISOString().slice(0, 10);
  const response = await fetch(`/api/reports/period?period=month&end=${encodeURIComponent(endDate)}`);
  const data = await response.json();
  renderReports(data);
}

async function updatePlanningSummary() {
  const month = document.getElementById('budget-month').value || state.month || new Date().toISOString().slice(0, 7);
  const date = new Date().toISOString().slice(0, 10);
  const summary = document.getElementById('planning-summary');

  const [budgetResponse, dailyResponse] = await Promise.all([
    fetch('/api/budgets').then((response) => response.json()),
    fetch(`/api/planning/daily-target?date=${encodeURIComponent(date)}&month=${encodeURIComponent(month)}`)
      .then((response) => response.json())
  ]);

  const budget = Array.isArray(budgetResponse) ? budgetResponse.find((item) => item.month === month) : null;
  const target = dailyResponse && dailyResponse.amount != null ? dailyResponse : null;
  const currentBudget = budget ? formatCurrency(budget.amount) : 'No monthly budget set';

  summary.textContent = target
    ? `Monthly budget: ${currentBudget} • Daily target: ${formatCurrency(target.amount)} • ${target.kind}`
    : `Monthly budget: ${currentBudget} • Daily target: unavailable`;
}

function renderCareerProbation(probation) {
  const summary = document.getElementById('probation-summary');

  if (!probation || probation.status === 'not-configured') {
    summary.textContent = 'Not configured yet.';
    return;
  }

  const elapsed = Number(probation.elapsedDays || 0);
  const remaining = Number(probation.remainingDays || 0);
  summary.textContent = `Start ${probation.startDate} • End ${probation.endDate} • Elapsed ${elapsed} days • Remaining ${remaining} days.`;
}

function renderList(items, containerId, formatter) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items || !items.length) {
    container.innerHTML = '<div class="mini-item">No entries yet.</div>';
    return;
  }

  items.forEach((item) => {
    const entry = document.createElement('div');
    entry.className = 'mini-item';
    entry.innerHTML = formatter(item);
    container.appendChild(entry);
  });
}

function renderCareerData(data) {
  renderCareerProbation(data.probation);
  renderList(data.checkpoints || [], 'checkpoint-list', (checkpoint) => `
    <strong>${checkpoint.title}</strong>
    <div class="balance-label">${checkpoint.date} • ${checkpoint.status}</div>
    ${checkpoint.notes ? `<div class="balance-label">${checkpoint.notes}</div>` : ''}
  `);
  renderList(data.skills || [], 'skill-list', (skill) => `
    <strong>${skill.name}</strong>
    <div class="balance-label">${skill.status}</div>
  `);
  renderList(data.tasks || [], 'task-list', (task) => `
    <strong>${task.title}</strong>
    <div class="balance-label">${task.status}${task.dueDate ? ` • ${task.dueDate}` : ''}</div>
    ${task.notes ? `<div class="balance-label">${task.notes}</div>` : ''}
  `);
  renderList(data.journal || [], 'journal-list', (entry) => `
    <strong>${entry.date}</strong>
    <div class="balance-label">${entry.entry}</div>
  `);
}

async function loadCareerData() {
  const [probation, checkpoints, skills, tasks, journal] = await Promise.all([
    fetch('/api/career/probation').then((response) => response.json()),
    fetch('/api/career/checkpoints').then((response) => response.json()),
    fetch('/api/career/skills').then((response) => response.json()),
    fetch('/api/career/tasks').then((response) => response.json()),
    fetch('/api/career/journal').then((response) => response.json())
  ]);

  renderCareerData({ probation, checkpoints, skills, tasks, journal });
}

async function loadAll() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  document.getElementById('budget-month').value = currentMonth;
  await loadOverview();
  await loadTransactions();
  await loadReports();
  await loadCareerData();
  await updatePlanningSummary();
}

async function handleQuickEntry(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = {
    accountId: document.getElementById('entry-account').value,
    type: document.getElementById('entry-type').value,
    amount: Number(document.getElementById('entry-amount').value),
    category: document.getElementById('entry-category').value || null,
    description: document.getElementById('entry-description').value,
    notes: document.getElementById('entry-notes').value,
    occurredAt: `${document.getElementById('entry-date').value}T${document.getElementById('entry-time').value}:00`
  };

  await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  form.reset();
  document.getElementById('quick-entry-modal').close();
  await loadAll();
}

async function handleAccountCreate(event) {
  event.preventDefault();

  const payload = {
    name: document.getElementById('account-name').value.trim(),
    type: document.getElementById('account-type').value,
    initialBalance: Number(document.getElementById('account-initial-balance').value || 0)
  };

  if (!payload.name) {
    return;
  }

  await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  document.getElementById('account-form').reset();
  document.getElementById('account-form').classList.add('hidden');
  await loadAll();
}

function setDefaultEntryDateTime() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  document.getElementById('entry-date').value = date;
  document.getElementById('entry-time').value = time;
}

function setDefaultCareerDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('checkpoint-date').value = today;
  document.getElementById('journal-date').value = today;
  document.getElementById('task-date').value = today;
}

document.getElementById('budget-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    month: document.getElementById('budget-month').value,
    amount: Number(document.getElementById('budget-amount').value)
  };

  await fetch('/api/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await updatePlanningSummary();
});

document.getElementById('reserve-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    label: document.getElementById('reserve-label').value || 'Reserve',
    amount: Number(document.getElementById('reserve-amount').value)
  };

  await fetch('/api/planning/reserves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await updatePlanningSummary();
});

document.getElementById('payday-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const date = document.getElementById('payday-date').value;
  const summary = document.getElementById('planning-summary');

  if (!date) {
    summary.textContent = 'Enter a next expected payday to forecast.';
    return;
  }

  const response = await fetch(`/api/planning/payday?nextExpectedPayday=${encodeURIComponent(date)}`);
  const data = await response.json();

  if (data.status === 'unavailable') {
    summary.textContent = 'Payday estimate is unavailable with the current inputs.';
    return;
  }

  summary.textContent = `Estimated payday amount: ${formatCurrency(data.amount)} • available balance ${formatCurrency(data.inputs.availableBalance)} • reserves ${formatCurrency(data.inputs.reserves)}`;
});

document.getElementById('quick-entry-button').addEventListener('click', () => {
  document.getElementById('quick-entry-modal').showModal();
});

document.getElementById('probation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    startDate: document.getElementById('probation-start').value,
    endDate: document.getElementById('probation-end').value
  };

  await fetch('/api/career/probation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  await loadCareerData();
});

document.getElementById('checkpoint-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    date: document.getElementById('checkpoint-date').value,
    title: document.getElementById('checkpoint-title').value,
    notes: document.getElementById('checkpoint-notes').value,
    status: document.getElementById('checkpoint-status').value
  };

  await fetch('/api/career/checkpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await loadCareerData();
});

document.getElementById('skill-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById('skill-name').value.trim(),
    status: document.getElementById('skill-status').value
  };

  await fetch('/api/career/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await loadCareerData();
});

document.getElementById('task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById('task-title').value.trim(),
    status: document.getElementById('task-status').value,
    dueDate: document.getElementById('task-date').value || null,
    notes: document.getElementById('task-notes').value
  };

  await fetch('/api/career/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await loadCareerData();
});

document.getElementById('journal-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    date: document.getElementById('journal-date').value,
    entry: document.getElementById('journal-entry').value.trim()
  };

  await fetch('/api/career/journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await loadCareerData();
});

document.getElementById('account-toggle-button').addEventListener('click', () => {
  const form = document.getElementById('account-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('account-name').focus();
  }
});

document.getElementById('account-cancel-button').addEventListener('click', () => {
  document.getElementById('account-form').reset();
  document.getElementById('account-form').classList.add('hidden');
});

document.getElementById('account-form').addEventListener('submit', handleAccountCreate);

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    document.querySelectorAll('.tab-button').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      if (active) {
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.removeAttribute('aria-current');
      }
    });
    document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${view}-view`));
    document.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
  });
});

document.querySelectorAll('[data-close-modal]').forEach((element) => {
  element.addEventListener('click', () => {
    document.getElementById('quick-entry-modal').close();
  });
});

document.getElementById('quick-entry-form').addEventListener('submit', handleQuickEntry);
document.getElementById('salary-month').addEventListener('change', async (event) => {
  state.month = event.target.value;
  await loadOverview();
  await loadTransactions();
  await loadReports();
  await updatePlanningSummary();
});

setDefaultEntryDateTime();
setDefaultCareerDates();
window.addEventListener('DOMContentLoaded', () => {
  loadAll();
});
