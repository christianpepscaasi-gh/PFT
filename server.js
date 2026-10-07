const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { getAccountBalance, getPhilippineDateKey } = require('./src/utils/finance');

dotenv.config();

const inMemoryStore = {
  accounts: [],
  transactions: [],
  budgets: [],
  reserves: [],
  dailyOverrides: [],
  career: {
    probation: null,
    checkpoints: [],
    skills: [],
    tasks: [],
    journal: []
  }
};

function parsePhilippineDate(dateString) {
  if (!dateString) {
    return new Date();
  }

  const hasTime = /T|\s/.test(dateString);
  const normalized = hasTime ? dateString : `${dateString}T00:00:00`;
  const asDate = new Date(normalized);
  if (Number.isNaN(asDate.getTime())) {
    return new Date();
  }
  return asDate;
}

function getDateKeyForTransaction(dateString) {
  return getPhilippineDateKey(parsePhilippineDate(dateString));
}

function normalizePeriodRange(period, start, end) {
  const today = new Date();
  const currentKey = getPhilippineDateKey(today);

  if (period === 'today') {
    return {
      start: currentKey,
      end: currentKey
    };
  }

  if (period === 'week') {
    const weekStart = start || currentKey;
    const weekEnd = end || currentKey;
    return {
      start: weekStart,
      end: weekEnd
    };
  }

  if (period === 'month') {
    const monthPrefix = start || currentKey.slice(0, 7);
    const monthEnd = end || `${monthPrefix}-31`;
    return {
      start: `${monthPrefix}-01`,
      end: monthEnd
    };
  }

  return {
    start: start || currentKey,
    end: end || currentKey
  };
}

function filterTransactionsByRange(transactions, start, end) {
  return transactions.filter((transaction) => {
    const dateKey = getDateKeyForTransaction(transaction.occurredAt);
    return dateKey >= start && dateKey <= end;
  });
}

function buildAccountSummaryAtDate(account, endDateKey) {
  const relevantTransactions = inMemoryStore.transactions.filter((transaction) => {
    if (transaction.accountId !== account._id) {
      return false;
    }
    const dateKey = getDateKeyForTransaction(transaction.occurredAt);
    return dateKey <= endDateKey;
  });

  return {
    ...account,
    balance: getAccountBalance(account.initialBalance, relevantTransactions)
  };
}

function resetInMemoryStore() {
  inMemoryStore.accounts = [];
  inMemoryStore.transactions = [];
  inMemoryStore.budgets = [];
  inMemoryStore.reserves = [];
  inMemoryStore.dailyOverrides = [];
  inMemoryStore.career = {
    probation: null,
    checkpoints: [],
    skills: [],
    tasks: [],
    journal: []
  };
}

function buildAccountSummary(account) {
  const balance = getAccountBalance(account.initialBalance, inMemoryStore.transactions.filter((transaction) => transaction.accountId === account._id));

  return {
    ...account,
    balance
  };
}

function getAvailableAccountBalance() {
  return inMemoryStore.accounts.reduce((total, account) => total + buildAccountSummary(account).balance, 0);
}

function getBudgetForMonth(month) {
  return inMemoryStore.budgets.find((budget) => budget.month === month) || null;
}

function getDailyTargetForDate(date, month) {
  const monthBudget = getBudgetForMonth(month);
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

  const safeDate = new Date(date);
  const monthEnd = new Date(Date.UTC(safeDate.getUTCFullYear(), safeDate.getUTCMonth() + 1, 0));
  const dayOfMonth = safeDate.getUTCDate();
  const remainingDays = Math.max(1, monthEnd.getUTCDate() - dayOfMonth + 1);
  const amount = Math.floor(monthBudget.amount / remainingDays);

  return {
    kind: 'suggestion',
    amount,
    monthlyBudget: monthBudget.amount,
    month,
    date,
    remainingDays
  };
}

function getPaydayRecommendation({ nextExpectedPayday, reserves = 0 }) {
  const accountsTotal = getAvailableAccountBalance();
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
  const diffMs = targetDate.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(diffMs / 86400000));

  if (availableBalance <= 0 || days <= 0) {
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

function ensureAccountExists(accountId) {
  const account = inMemoryStore.accounts.find((item) => item._id === accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  return account;
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, message: 'Pocket Ledger server is running.' });
  });

  app.get('/api/accounts', (req, res) => {
    const accounts = inMemoryStore.accounts.map(buildAccountSummary);
    res.json(accounts);
  });

  app.post('/api/accounts', (req, res) => {
    const { name, type, initialBalance = 0 } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Account name and type are required.' });
    }

    const account = {
      _id: randomUUID(),
      name,
      type,
      initialBalance: Number(initialBalance) || 0,
      archived: false,
      createdAt: new Date().toISOString()
    };

    inMemoryStore.accounts.push(account);
    return res.status(201).json(buildAccountSummary(account));
  });

  app.get('/api/transactions', (req, res) => {
    const { accountId } = req.query;
    let transactions = [...inMemoryStore.transactions];

    if (accountId) {
      transactions = transactions.filter((transaction) => transaction.accountId === accountId);
    }

    res.json(transactions);
  });

  app.post('/api/transactions', (req, res) => {
    const { accountId, type, amount, description, category, occurredAt, notes } = req.body;

    if (!accountId || !type || !description || !amount) {
      return res.status(400).json({ error: 'Account, type, description, and amount are required.' });
    }

    try {
      ensureAccountExists(accountId);
    } catch (error) {
      return res.status(404).json({ error: error.message });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Transaction type must be income or expense.' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const transaction = {
      _id: randomUUID(),
      accountId,
      type,
      amount: parsedAmount,
      description,
      category: category || null,
      occurredAt: occurredAt || new Date().toISOString(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    inMemoryStore.transactions.push(transaction);
    return res.status(201).json(transaction);
  });

  app.patch('/api/transactions/:id', (req, res) => {
    const transaction = inMemoryStore.transactions.find((item) => item._id === req.params.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const { amount, description, category, notes, type, accountId, occurredAt } = req.body;

    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number.' });
      }
      transaction.amount = parsedAmount;
    }

    if (description !== undefined) transaction.description = description;
    if (category !== undefined) transaction.category = category;
    if (notes !== undefined) transaction.notes = notes;
    if (type !== undefined) transaction.type = type;
    if (accountId !== undefined) {
      try {
        ensureAccountExists(accountId);
        transaction.accountId = accountId;
      } catch (error) {
        return res.status(404).json({ error: error.message });
      }
    }
    if (occurredAt !== undefined) transaction.occurredAt = occurredAt;

    return res.json(transaction);
  });

  app.delete('/api/transactions/:id', (req, res) => {
    const index = inMemoryStore.transactions.findIndex((item) => item._id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const [removed] = inMemoryStore.transactions.splice(index, 1);
    return res.json({ deleted: true, transaction: removed });
  });

  app.get('/api/reports/overview', (req, res) => {
    const accounts = inMemoryStore.accounts
      .filter((account) => !account.archived)
      .map(buildAccountSummary);
    const income = inMemoryStore.transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + transaction.amount, 0);
    const expenses = inMemoryStore.transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + transaction.amount, 0);

    res.json({
      income,
      expenses,
      netCashFlow: income - expenses,
      accounts
    });
  });

  app.get('/api/overview', (req, res) => {
    const month = String(req.query.month || getPhilippineDateKey(new Date()).slice(0, 7)).trim();
    const activeAccounts = inMemoryStore.accounts
      .filter((account) => !account.archived)
      .map(buildAccountSummary);
    const monthlyTransactions = inMemoryStore.transactions.filter((transaction) => {
      const dateKey = getDateKeyForTransaction(transaction.occurredAt);
      return dateKey.startsWith(month);
    });
    const monthlyIncome = monthlyTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const monthlyExpenses = monthlyTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const currentBalance = activeAccounts.reduce((total, account) => total + Number(account.balance || 0), 0);

    res.json({
      month,
      salaryMonth: month,
      queryMonth: month,
      currentBalance,
      monthlyIncome,
      monthlyExpenses,
      netCashFlow: monthlyIncome - monthlyExpenses,
      accounts: activeAccounts
    });
  });

  app.get('/api/reports/period', (req, res) => {
    const period = req.query.period || 'custom';
    const start = String(req.query.start || '').trim() || null;
    const end = String(req.query.end || '').trim() || null;
    const range = normalizePeriodRange(period, start, end);
    const relevantTransactions = filterTransactionsByRange(inMemoryStore.transactions, range.start, range.end);
    const income = relevantTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const expenses = relevantTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

    const accountBalances = inMemoryStore.accounts.map((account) => buildAccountSummaryAtDate(account, range.end));

    res.json({
      period,
      start: range.start,
      end: range.end,
      income,
      expenses,
      netCashFlow: income - expenses,
      count: relevantTransactions.length,
      transactions: relevantTransactions,
      accountBalances
    });
  });

  app.get('/api/reports/salary', (req, res) => {
    const month = String(req.query.month || '').trim();
    const monthPrefix = month || getPhilippineDateKey(new Date()).slice(0, 7);
    const monthTransactions = inMemoryStore.transactions.filter((transaction) => {
      if (transaction.type !== 'income') {
        return false;
      }
      if (transaction.category !== 'Salary') {
        return false;
      }
      return getDateKeyForTransaction(transaction.occurredAt).startsWith(monthPrefix);
    });

    const totalIncome = monthTransactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

    res.json({
      month: monthPrefix,
      totalIncome,
      count: monthTransactions.length,
      transactions: monthTransactions
    });
  });

  app.post('/api/career/probation', (req, res) => {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Probation start and end dates are required.' });
    }

    const start = new Date(`${startDate}T00:00:00+08:00`);
    const end = new Date(`${endDate}T00:00:00+08:00`);
    const now = new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Probation dates must be valid ISO dates.' });
    }

    const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
    const remainingDays = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 86400000));

    const probation = {
      _id: randomUUID(),
      startDate,
      endDate,
      elapsedDays,
      remainingDays,
      updatedAt: new Date().toISOString()
    };

    inMemoryStore.career.probation = probation;
    return res.status(201).json(probation);
  });

  app.get('/api/career/probation', (req, res) => {
    res.json(inMemoryStore.career.probation || { status: 'not-configured' });
  });

  app.post('/api/career/checkpoints', (req, res) => {
    const { date, title, notes, status } = req.body;

    if (!date || !title || !status) {
      return res.status(400).json({ error: 'Checkpoint date, title, and status are required.' });
    }

    const checkpoint = {
      _id: randomUUID(),
      date,
      title,
      notes: notes || '',
      status,
      createdAt: new Date().toISOString()
    };

    inMemoryStore.career.checkpoints.push(checkpoint);
    return res.status(201).json(checkpoint);
  });

  app.get('/api/career/checkpoints', (req, res) => {
    res.json(inMemoryStore.career.checkpoints);
  });

  app.post('/api/career/skills', (req, res) => {
    const { name, status } = req.body;

    if (!name || !status) {
      return res.status(400).json({ error: 'Skill name and status are required.' });
    }

    const skill = {
      _id: randomUUID(),
      name,
      status,
      createdAt: new Date().toISOString()
    };

    inMemoryStore.career.skills.push(skill);
    return res.status(201).json(skill);
  });

  app.get('/api/career/skills', (req, res) => {
    res.json(inMemoryStore.career.skills);
  });

  app.post('/api/career/tasks', (req, res) => {
    const { title, status, dueDate, notes } = req.body;

    if (!title || !status) {
      return res.status(400).json({ error: 'Task title and status are required.' });
    }

    const task = {
      _id: randomUUID(),
      title,
      status,
      dueDate: dueDate || null,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    inMemoryStore.career.tasks.push(task);
    return res.status(201).json(task);
  });

  app.get('/api/career/tasks', (req, res) => {
    res.json(inMemoryStore.career.tasks);
  });

  app.post('/api/career/journal', (req, res) => {
    const { date, entry } = req.body;

    if (!date || !entry) {
      return res.status(400).json({ error: 'Journal date and entry are required.' });
    }

    const journalEntry = {
      _id: randomUUID(),
      date,
      entry,
      createdAt: new Date().toISOString()
    };

    inMemoryStore.career.journal.push(journalEntry);
    return res.status(201).json(journalEntry);
  });

  app.get('/api/career/journal', (req, res) => {
    res.json(inMemoryStore.career.journal);
  });

  app.get('/api/budgets', (req, res) => {
    res.json(inMemoryStore.budgets);
  });

  app.post('/api/budgets', (req, res) => {
    const { month, amount } = req.body;

    if (!month || amount == null) {
      return res.status(400).json({ error: 'Month and budget amount are required.' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Budget amount must be a positive number.' });
    }

    const existingBudget = inMemoryStore.budgets.find((budget) => budget.month === month);
    if (existingBudget) {
      existingBudget.amount = numericAmount;
      return res.json(existingBudget);
    }

    const budget = {
      _id: randomUUID(),
      month,
      amount: numericAmount,
      createdAt: new Date().toISOString()
    };
    inMemoryStore.budgets.push(budget);
    return res.status(201).json(budget);
  });

  app.post('/api/planning/reserves', (req, res) => {
    const { amount, label = 'Reserve' } = req.body;
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: 'Reserve amount must be zero or greater.' });
    }

    const reserve = {
      _id: randomUUID(),
      amount: numericAmount,
      label,
      createdAt: new Date().toISOString()
    };

    inMemoryStore.reserves.push(reserve);
    return res.status(201).json(reserve);
  });

  app.post('/api/accounts/:id/archive', (req, res) => {
    const account = inMemoryStore.accounts.find((item) => item._id === req.params.id);

    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (req.body.confirm !== true) {
      return res.status(400).json({ error: 'Account archive requires explicit confirmation.' });
    }

    account.archived = true;
    return res.json(account);
  });

  app.post('/api/daily-limits/override', (req, res) => {
    const { date, targetAmount, reason } = req.body;

    if (!date || targetAmount == null) {
      return res.status(400).json({ error: 'Date and override target are required.' });
    }

    const parsedAmount = Number(targetAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'Override target amount must be zero or greater.' });
    }

    const override = {
      _id: randomUUID(),
      date,
      targetAmount: parsedAmount,
      reason: reason || '',
      createdAt: new Date().toISOString()
    };

    inMemoryStore.dailyOverrides = inMemoryStore.dailyOverrides.filter((item) => item.date !== date);
    inMemoryStore.dailyOverrides.push(override);
    return res.status(201).json(override);
  });

  app.get('/api/daily-limits/override', (req, res) => {
    const { date } = req.query;
    if (!date) {
      return res.json(inMemoryStore.dailyOverrides);
    }

    const override = inMemoryStore.dailyOverrides.find((item) => item.date === date);
    return res.json(override || null);
  });

  app.get('/api/planning/payday', (req, res) => {
    const nextExpectedPayday = req.query.nextExpectedPayday || null;
    const reserves = inMemoryStore.reserves.reduce((total, reserve) => total + Number(reserve.amount || 0), 0);
    const recommendation = getPaydayRecommendation({ nextExpectedPayday, reserves });
    res.json(recommendation);
  });

  app.get('/api/planning/daily-target', (req, res) => {
    const { date, month } = req.query;
    const targetDate = date || getPhilippineDateKey(new Date());
    const targetMonth = month || targetDate.slice(0, 7);
    const baseData = getDailyTargetForDate(targetDate, targetMonth);
    const override = inMemoryStore.dailyOverrides.find((item) => item.date === targetDate);

    if (override) {
      return res.json({
        ...baseData,
        kind: 'suggestion',
        override: {
          date: override.date,
          targetAmount: override.targetAmount,
          reason: override.reason
        },
        amount: override.targetAmount,
        monthlyBudget: baseData.monthlyBudget,
        date: targetDate,
        month: targetMonth
      });
    }

    res.json(baseData);
  });

  return app;
}

async function startServer() {
  const app = createApp();

  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      console.log('MongoDB connected');
    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
      process.exit(1);
    }
  } else {
    console.warn('No MONGODB_URI configured. Starting in in-memory mode for local development.');
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  return app;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer, resetInMemoryStore };
