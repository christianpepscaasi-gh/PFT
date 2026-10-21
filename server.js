const express = require('express');
const path = require('node:path');
const dotenv = require('dotenv');
const { createPersistenceStore, mongoose } = require('./src/persistence');
const { getAccountBalance, getPhilippineDateKey, getWeekWindow, parsePhilippineDate } = require('./src/utils/finance');

dotenv.config();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function logFailure(operation, error) {
  // Stack frames locate failures without logging request bodies or database URLs.
  console.error(`${operation}: ${error.name || 'Error'}`);
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    console.error(error.stack.split('\n').filter((line) => /^\s+at\s/.test(line))
      .map((line) => line.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted database URI]')).join('\n'));
  }
}

function parseMoneyInCentavos(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) {
    return null;
  }

  const normalized = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(normalized);
  if (!match) {
    return null;
  }

  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    return null;
  }

  let digits = `${match[2]}${match[3] || ''}`.replace(/^0+(?=\d)/, '');
  const decimalPlaces = (match[3] || '').length - exponent;
  const scale = 2 - decimalPlaces;
  if (scale >= 0) {
    digits += '0'.repeat(scale);
  } else {
    const discardedDigits = -scale;
    if (!/^0*$/.test(digits.slice(-discardedDigits))) {
      return null;
    }
    digits = digits.slice(0, -discardedDigits) || '0';
  }

  const centavos = BigInt(`${match[1] === '-' ? '-' : ''}${digits}`);
  if (centavos < BigInt(Number.MIN_SAFE_INTEGER) || centavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(centavos);
}

function toPesos(centavos) {
  return centavos == null ? centavos : Number(centavos) / 100;
}

function serializeMoneyFields(record, fields) {
  if (!record) {
    return record;
  }
  return Object.fromEntries([
    ...Object.entries(record).map(([key, value]) => [key, fields.includes(key) ? toPesos(value) : value])
  ]);
}

function serializeAccount(account) {
  return serializeMoneyFields(account, ['initialBalance', 'balance']);
}

function serializeTransaction(transaction) {
  return serializeMoneyFields(transaction, ['amount']);
}

function serializeDailyOverride(override) {
  return serializeMoneyFields(override, ['targetAmount']);
}

function serializeDailyTarget(target) {
  return {
    ...serializeMoneyFields(target, ['amount', 'monthlyBudget']),
    ...(target.override ? { override: serializeDailyOverride(target.override) } : {})
  };
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getDateKeyForTransaction(dateString) {
  return getPhilippineDateKey(parsePhilippineDate(dateString));
}

function normalizePeriodRange(period, start, end) {
  const currentKey = getPhilippineDateKey(new Date());

  if (period === 'today') {
    return { start: currentKey, end: currentKey };
  }
  if (period === 'week') {
    return getWeekWindow(parsePhilippineDate(start || end || currentKey));
  }
  if (period === 'month') {
    const monthPrefix = (start || end || currentKey).slice(0, 7);
    const [year, month] = monthPrefix.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: start || `${monthPrefix}-01`, end: end || monthEnd };
  }
  return { start: start || currentKey, end: end || currentKey };
}

function filterTransactionsByRange(transactions, start, end) {
  return transactions.filter((transaction) => {
    const dateKey = getDateKeyForTransaction(transaction.occurredAt);
    return dateKey >= start && dateKey <= end;
  });
}

function excludeFutureSalary(transactions) {
  // Match the existing balance convention: effectiveness follows Manila calendar dates.
  // Retain source records and leave other transaction types' reporting policy unchanged.
  const today = getPhilippineDateKey(new Date());
  return transactions.filter((transaction) => {
    return transaction.type !== 'income' || transaction.category !== 'Salary'
      || getDateKeyForTransaction(transaction.occurredAt) <= today;
  });
}

function buildAccountSummaryAtDate(account, endDateKey, transactionList) {
  const relevantTransactions = transactionList.filter((transaction) => {
    return transaction.accountId === account._id && getDateKeyForTransaction(transaction.occurredAt) <= endDateKey;
  });

  return {
    ...account,
    balance: getAccountBalance(account.initialBalance, relevantTransactions)
  };
}

function getDailyTargetForDate(monthBudget, date, month) {
  if (!monthBudget) {
    return {
      kind: 'suggestion',
      amount: null,
      monthlyBudget: null,
      month,
      date,
      reason: 'No monthly budget set.'
    };
  }

  const safeDate = new Date(`${date}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(safeDate.getUTCFullYear(), safeDate.getUTCMonth() + 1, 0));
  const dayOfMonth = safeDate.getUTCDate();
  const remainingDays = Math.max(1, monthEnd.getUTCDate() - dayOfMonth + 1);

  return {
    kind: 'suggestion',
    amount: Math.floor(monthBudget.amount / remainingDays),
    monthlyBudget: monthBudget.amount,
    month,
    date,
    remainingDays
  };
}

function getPaydayRecommendation({ nextExpectedPayday, reserves = 0, accountsTotal = 0 }) {
  const availableBalance = accountsTotal - Number(reserves || 0);

  if (!nextExpectedPayday || !Number.isFinite(availableBalance)) {
    return {
      status: 'unavailable',
      amount: null,
      reason: 'Missing required planning inputs.'
    };
  }

  const targetDate = new Date(`${nextExpectedPayday}T00:00:00+08:00`);
  const now = new Date();
  const today = getPhilippineDateKey(now);
  const diffMs = targetDate.getTime() - parsePhilippineDate(today).getTime();
  const days = diffMs / 86400000;

  if (availableBalance <= 0 || diffMs <= 0) {
    return {
      status: 'unavailable',
      amount: null,
      reason: 'No valid planning window is available.'
    };
  }

  return {
    status: 'estimate',
    amount: Math.max(0, Math.floor(availableBalance / days)),
    inputs: {
      availableBalance: Number(accountsTotal),
      reserves: Number(reserves || 0),
      nextExpectedPayday
    },
    days,
    window: {
      start: getPhilippineDateKey(now),
      end: getPhilippineDateKey(targetDate)
    }
  };
}

function serializeProbation(record) {
  if (!record) return { status: 'not-configured' };
  const today = parsePhilippineDate(getPhilippineDateKey(new Date())).getTime();
  const start = parsePhilippineDate(record.startDate).getTime();
  const end = parsePhilippineDate(record.endDate).getTime();
  return {
    ...record,
    elapsedDays: Math.max(0, Math.min((end - start) / 86400000, (today - start) / 86400000)),
    remainingDays: Math.max(0, (end - Math.max(start, today)) / 86400000)
  };
}

function createApp({ persistenceStore } = {}) {
  const store = persistenceStore || createPersistenceStore({ mongoUri: process.env.MONGODB_URI });
  const app = express();
  app.locals.persistenceStore = store;

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      message: 'Pocket Ledger server is running.',
      database: store.mode,
      ready: store.isReady()
    });
  });

  app.get('/ready', asyncRoute(async (req, res) => {
    try {
      await store.connect();
    } catch {
      return res.status(503).json({ ok: false, ready: false, message: 'Database not ready.' });
    }
    if (!store.isReady()) {
      return res.status(503).json({ ok: false, ready: false, message: 'Database not ready.' });
    }
    return res.json({ ok: true, ready: true, database: store.mode });
  }));

  app.use('/api', asyncRoute(async (req, res, next) => {
    await store.connect();
    if (!store.isReady()) {
      return res.status(503).json({ error: 'Database is unavailable.' });
    }
    return next();
  }));

  app.get('/api/accounts', asyncRoute(async (req, res) => {
    res.json((await store.listAccounts()).map(serializeAccount));
  }));

  app.post('/api/accounts', asyncRoute(async (req, res) => {
    const { name, type, initialBalance = 0 } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Account name and type are required.' });
    }
    const initialBalanceCentavos = parseMoneyInCentavos(initialBalance);
    if (initialBalanceCentavos === null) {
      return res.status(400).json({ error: 'Initial balance must be a valid amount with no more than two decimal places.' });
    }

    const account = await store.createAccount({ name, type, initialBalance: initialBalanceCentavos });
    return res.status(201).json(serializeAccount(account));
  }));

  app.get('/api/transactions', asyncRoute(async (req, res) => {
    res.json((await store.listTransactions(req.query.accountId || null)).map(serializeTransaction));
  }));

  app.post('/api/transactions', asyncRoute(async (req, res) => {
    const { accountId, type, amount, description, category, occurredAt, notes } = req.body;
    if (!accountId || !type || !description || amount == null) {
      return res.status(400).json({ error: 'Account, type, description, and amount are required.' });
    }
    if (!await store.getAccount(accountId)) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Transaction type must be income or expense.' });
    }
    const amountCentavos = parseMoneyInCentavos(amount);
    if (amountCentavos === null || amountCentavos <= 0) {
      return res.status(400).json({ error: 'Amount must be positive and have no more than two decimal places.' });
    }
    const date = occurredAt ? parsePhilippineDate(occurredAt) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Transaction date must be valid.' });
    }

    const transaction = await store.createTransaction({
      accountId,
      type,
      amount: amountCentavos,
      description,
      category: category || null,
      occurredAt: date,
      notes: notes || ''
    });
    return res.status(201).json(serializeTransaction(transaction));
  }));

  app.patch('/api/transactions/:id', asyncRoute(async (req, res) => {
    const transaction = await store.getTransaction(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const { amount, description, category, notes, type, accountId, occurredAt } = req.body;
    const patch = {};
    if (amount !== undefined) {
      const amountCentavos = parseMoneyInCentavos(amount);
      if (amountCentavos === null || amountCentavos <= 0) {
        return res.status(400).json({ error: 'Amount must be positive and have no more than two decimal places.' });
      }
      patch.amount = amountCentavos;
    }
    if (description !== undefined) patch.description = description;
    if (category !== undefined) patch.category = category;
    if (notes !== undefined) patch.notes = notes;
    if (type !== undefined) {
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'Transaction type must be income or expense.' });
      }
      patch.type = type;
    }
    if (accountId !== undefined) {
      if (!await store.getAccount(accountId)) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      patch.accountId = accountId;
    }
    if (occurredAt !== undefined) {
      const date = parsePhilippineDate(occurredAt);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Transaction date must be valid.' });
      }
      patch.occurredAt = date;
    }

    return res.json(serializeTransaction(await store.updateTransaction(req.params.id, patch)));
  }));

  app.delete('/api/transactions/:id', asyncRoute(async (req, res) => {
    const deleted = await store.deleteTransaction(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    return res.json({ ...deleted, transaction: serializeTransaction(deleted.transaction) });
  }));

  app.get('/api/reports/overview', asyncRoute(async (req, res) => {
    const accounts = (await store.listAccounts()).filter((account) => !account.archived);
    const transactions = excludeFutureSalary(await store.listTransactions());
    const income = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

    res.json({
      income: toPesos(income),
      expenses: toPesos(expenses),
      netCashFlow: toPesos(income - expenses),
      accounts: accounts.map(serializeAccount)
    });
  }));

  app.get('/api/overview', asyncRoute(async (req, res) => {
    const month = String(req.query.month || getPhilippineDateKey(new Date()).slice(0, 7)).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Month must use YYYY-MM format.' });
    }
    const accounts = (await store.listAccounts()).filter((account) => !account.archived);
    const monthlyTransactions = excludeFutureSalary(await store.listTransactions()).filter((transaction) => {
      return getDateKeyForTransaction(transaction.occurredAt).startsWith(month);
    });
    const monthlyIncome = monthlyTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const monthlyExpenses = monthlyTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const currentBalance = accounts.reduce((total, account) => total + Number(account.balance || 0), 0);

    res.json({
      month,
      salaryMonth: month,
      queryMonth: month,
      currentBalance: toPesos(currentBalance),
      monthlyIncome: toPesos(monthlyIncome),
      monthlyExpenses: toPesos(monthlyExpenses),
      netCashFlow: toPesos(monthlyIncome - monthlyExpenses),
      accounts: accounts.map(serializeAccount)
    });
  }));

  app.get('/api/reports/period', asyncRoute(async (req, res) => {
    const period = req.query.period || 'custom';
    if (!['today', 'week', 'month', 'custom'].includes(period)) {
      return res.status(400).json({ error: 'Report period must be today, week, month, or custom.' });
    }
    const start = String(req.query.start || '').trim() || null;
    const end = String(req.query.end || '').trim() || null;
    if ((start && !isDateKey(start)) || (end && !isDateKey(end))) {
      return res.status(400).json({ error: 'Report dates must be valid ISO dates.' });
    }
    if (period === 'week' && start && end) {
      if (start > end) {
        return res.status(400).json({ error: 'Report start must not be after end.' });
      }
      const startWeek = getWeekWindow(parsePhilippineDate(start));
      const endWeek = getWeekWindow(parsePhilippineDate(end));
      if (startWeek.start !== endWeek.start) {
        return res.status(400).json({ error: 'Weekly report dates must belong to the same Monday-Sunday week. Use custom mode for multiple weeks.' });
      }
    }
    const range = normalizePeriodRange(period, start, end);
    if (range.start > range.end) {
      return res.status(400).json({ error: 'Report start must not be after end.' });
    }
    const transactions = await store.listTransactions();
    const relevantTransactions = filterTransactionsByRange(excludeFutureSalary(transactions), range.start, range.end);
    const income = relevantTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const expenses = relevantTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const accountBalances = (await store.listAccounts()).map((account) => {
      return buildAccountSummaryAtDate(account, range.end, transactions);
    });

    res.json({
      period,
      start: range.start,
      end: range.end,
      income: toPesos(income),
      expenses: toPesos(expenses),
      netCashFlow: toPesos(income - expenses),
      count: relevantTransactions.length,
      transactions: relevantTransactions.map(serializeTransaction),
      accountBalances: accountBalances.map(serializeAccount)
    });
  }));

  app.get('/api/reports/salary', asyncRoute(async (req, res) => {
    const month = String(req.query.month || '').trim();
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Month must use YYYY-MM format.' });
    }
    const monthPrefix = month || getPhilippineDateKey(new Date()).slice(0, 7);
    const monthTransactions = excludeFutureSalary(await store.listTransactions()).filter((transaction) => {
      return transaction.type === 'income'
        && transaction.category === 'Salary'
        && getDateKeyForTransaction(transaction.occurredAt).startsWith(monthPrefix);
    });
    const totalIncome = monthTransactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

    res.json({
      month: monthPrefix,
      totalIncome: toPesos(totalIncome),
      count: monthTransactions.length,
      transactions: monthTransactions.map(serializeTransaction)
    });
  }));

  app.post('/api/career/probation', asyncRoute(async (req, res) => {
    const { startDate, endDate } = req.body;
    if (!isDateKey(startDate) || !isDateKey(endDate)) {
      return res.status(400).json({ error: 'Probation start and end dates must be valid ISO dates.' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'Probation end must not be before start.' });
    }
    const start = new Date(`${startDate}T00:00:00+08:00`);
    const end = new Date(`${endDate}T00:00:00+08:00`);
    const now = new Date();
    const probation = await store.saveCareerProbation({
      startDate,
      endDate,
      elapsedDays: Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000)),
      remainingDays: Math.max(0, Math.floor((end.getTime() - now.getTime()) / 86400000)),
      updatedAt: new Date().toISOString()
    });
    return res.status(201).json(serializeProbation(probation));
  }));

  app.get('/api/career/probation', asyncRoute(async (req, res) => {
    res.json(serializeProbation(await store.getCareerProbation()));
  }));

  const careerRoutes = [
    {
      path: 'checkpoints',
      required: ['date', 'title', 'status'],
      error: 'Checkpoint date, title, and status are required.',
      fields: ({ date, title, notes, status }) => ({ date, title, notes: notes || '', status })
    },
    {
      path: 'skills',
      required: ['name', 'status'],
      error: 'Skill name and status are required.',
      fields: ({ name, status }) => ({ name, status })
    },
    {
      path: 'tasks',
      required: ['title', 'status'],
      error: 'Task title and status are required.',
      fields: ({ title, status, dueDate, notes }) => ({ title, status, dueDate: dueDate || null, notes: notes || '' })
    },
    {
      path: 'journal',
      required: ['date', 'entry'],
      error: 'Journal date and entry are required.',
      fields: ({ date, entry }) => ({ date, entry })
    }
  ];

  for (const route of careerRoutes) {
    app.post(`/api/career/${route.path}`, asyncRoute(async (req, res) => {
      if (route.required.some((field) => !req.body[field])) {
        return res.status(400).json({ error: route.error });
      }
      if (['checkpoints', 'journal'].includes(route.path) && !isDateKey(req.body.date)) {
        return res.status(400).json({ error: 'Date must be a valid ISO date.' });
      }
      const statuses = {
        checkpoints: ['upcoming', 'completed', 'passed', 'needs improvement', 'unknown'],
        skills: ['not started', 'learning', 'practicing', 'comfortable', 'mastered'],
        tasks: ['todo', 'in-progress', 'completed']
      };
      if (statuses[route.path] && !statuses[route.path].includes(req.body.status)) {
        return res.status(400).json({ error: 'Career status is invalid.' });
      }
      if (route.path === 'tasks' && req.body.dueDate && !isDateKey(req.body.dueDate)) {
        return res.status(400).json({ error: 'Task date must be a valid ISO date.' });
      }
      const record = await store.createCareerEntry(route.path, route.fields(req.body));
      return res.status(201).json(record);
    }));
    app.get(`/api/career/${route.path}`, asyncRoute(async (req, res) => {
      res.json(await store.listCareerEntries(route.path));
    }));
  }

  app.get('/api/budgets', asyncRoute(async (req, res) => {
    res.json((await store.listBudgets()).map((budget) => serializeMoneyFields(budget, ['amount'])));
  }));

  app.post('/api/budgets', asyncRoute(async (req, res) => {
    const { month, amount } = req.body;
    if (!month || amount == null) {
      return res.status(400).json({ error: 'Month and budget amount are required.' });
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Month must use YYYY-MM format.' });
    }
    const amountCentavos = parseMoneyInCentavos(amount);
    if (amountCentavos === null || amountCentavos <= 0) {
      return res.status(400).json({ error: 'Budget amount must be positive and have no more than two decimal places.' });
    }

    const result = await store.upsertBudget(month, amountCentavos);
    return res.status(result.created ? 201 : 200).json(serializeMoneyFields(result.record, ['amount']));
  }));

  app.post('/api/planning/reserves', asyncRoute(async (req, res) => {
    const { amount, label = 'Reserve' } = req.body;
    const amountCentavos = parseMoneyInCentavos(amount);
    if (amountCentavos === null || amountCentavos < 0) {
      return res.status(400).json({ error: 'Reserve amount must be non-negative and have no more than two decimal places.' });
    }
    const reserve = await store.createReserve({ amount: amountCentavos, label });
    return res.status(201).json(serializeMoneyFields(reserve, ['amount']));
  }));

  app.post('/api/accounts/:id/archive', asyncRoute(async (req, res) => {
    if (req.body.confirm !== true) {
      return res.status(400).json({ error: 'Account archive requires explicit confirmation.' });
    }
    const account = await store.archiveAccount(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    return res.json(serializeAccount(account));
  }));

  app.post('/api/daily-limits/override', asyncRoute(async (req, res) => {
    const { date, targetAmount, reason } = req.body;
    if (!date || targetAmount == null) {
      return res.status(400).json({ error: 'Date and override target are required.' });
    }
    if (!isDateKey(date)) {
      return res.status(400).json({ error: 'Date must be a valid ISO date.' });
    }
    const targetAmountCentavos = parseMoneyInCentavos(targetAmount);
    if (targetAmountCentavos === null || targetAmountCentavos < 0) {
      return res.status(400).json({ error: 'Override target must be non-negative and have no more than two decimal places.' });
    }
    const override = await store.upsertDailyOverride({
      date,
      targetAmount: targetAmountCentavos,
      reason: reason || ''
    });
    return res.status(201).json(serializeDailyOverride(override));
  }));

  app.get('/api/daily-limits/override', asyncRoute(async (req, res) => {
    if (!req.query.date) {
      return res.json((await store.listDailyOverrides()).map(serializeDailyOverride));
    }
    if (!isDateKey(req.query.date)) {
      return res.status(400).json({ error: 'Date must be a valid ISO date.' });
    }
    return res.json(serializeDailyOverride(await store.getDailyOverride(req.query.date)));
  }));

  app.get('/api/planning/payday', asyncRoute(async (req, res) => {
    if (req.query.nextExpectedPayday && !isDateKey(req.query.nextExpectedPayday)) {
      return res.status(400).json({ error: 'Next expected payday must be a valid ISO date.' });
    }
    const [accounts, reserves] = await Promise.all([store.listAccounts(), store.listReserves()]);
    const accountsTotal = accounts.filter((account) => !account.archived)
      .reduce((total, account) => total + Number(account.balance || 0), 0);
    const reserveTotal = reserves.reduce((total, reserve) => total + Number(reserve.amount || 0), 0);
    const recommendation = getPaydayRecommendation({
      nextExpectedPayday: req.query.nextExpectedPayday || null,
      reserves: reserveTotal,
      accountsTotal
    });
    if (recommendation.amount != null) {
      recommendation.amount = toPesos(recommendation.amount);
    }
    if (recommendation.inputs) {
      recommendation.inputs.availableBalance = toPesos(recommendation.inputs.availableBalance);
      recommendation.inputs.reserves = toPesos(recommendation.inputs.reserves);
    }
    res.json(recommendation);
  }));

  app.get('/api/planning/daily-target', asyncRoute(async (req, res) => {
    const targetDate = req.query.date || getPhilippineDateKey(new Date());
    const targetMonth = req.query.month || targetDate.slice(0, 7);
    if (!isDateKey(targetDate) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      return res.status(400).json({ error: 'Date and month must be valid ISO date values.' });
    }
    const budget = await store.getBudget(targetMonth);
    const result = getDailyTargetForDate(budget, targetDate, targetMonth);
    const override = await store.getDailyOverride(targetDate);
    const spending = (await store.listTransactions())
      .filter((transaction) => transaction.type === 'expense' && getDateKeyForTransaction(transaction.occurredAt) === targetDate)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const amount = override ? override.targetAmount : result.amount;
    const progress = {
      spending: toPesos(spending),
      remaining: amount == null ? null : toPesos(amount - spending),
      spendingState: amount == null ? 'unavailable' : spending > amount ? 'over-limit'
        : spending >= amount * 0.8 ? 'approaching-limit' : 'below-limit'
    };
    if (override) {
      return res.json(serializeDailyTarget({
        ...result,
        ...progress,
        kind: 'suggestion',
        override: {
          date: override.date,
          targetAmount: override.targetAmount,
          reason: override.reason
        },
        amount: override.targetAmount,
        monthlyBudget: result.monthlyBudget,
        date: targetDate,
        month: targetMonth
      }));
    }
    return res.json(serializeDailyTarget({ ...result, ...progress }));
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ error: 'Request contains invalid data.' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A record with those values already exists.' });
    }
    if (!store.isReady()) {
      logFailure(`${req.method} ${req.route?.path || '/api'} database unavailable`, error);
      return res.status(503).json({ error: 'Database is unavailable.' });
    }
    logFailure(`${req.method} ${req.route?.path || '/api'} request failed`, error);
    return res.status(500).json({ error: 'The request could not be completed.' });
  });

  return app;
}

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Database startup failed: configure MONGODB_URI in the server environment.');
    throw new Error('MONGODB_URI must be configured before starting the application.');
  }

  const app = createApp();
  const persistenceStore = app.locals.persistenceStore;
  try {
    await persistenceStore.connect();
  } catch (error) {
    console.error('MongoDB connection failed. Verify MONGODB_URI and database network access.');
    logFailure('Database startup failed', error);
    throw error;
  }

  const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening on port ${process.env.PORT || 3000}`);
  });
  const shutdown = async () => {
    server.close(async () => {
      await persistenceStore.close();
      process.exitCode = 0;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return app;
}

if (require.main === module) {
  startServer().catch(() => {
    process.exitCode = 1;
  });
}

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
module.exports.startServer = startServer;
module.exports.mongoose = mongoose;
