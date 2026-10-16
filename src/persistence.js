const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const { getAccountBalance, getPhilippineDateKey } = require('./utils/finance');

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

const accountSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
  type: { type: String, required: true },
  initialBalance: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const transactionSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  accountId: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, default: null },
  notes: { type: String, default: '' },
  occurredAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema, 'accounts');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema, 'transactions');

function serializeAccount(account, transactionList = []) {
  const plain = account && typeof account.toObject === 'function' ? account.toObject() : { ...account };
  const accountTransactions = (transactionList || []).filter((transaction) => transaction.accountId === plain._id);

  return {
    ...plain,
    balance: getAccountBalance(Number(plain.initialBalance || 0), accountTransactions)
  };
}

function serializeTransaction(transaction) {
  if (!transaction) {
    return null;
  }

  const plain = transaction && typeof transaction.toObject === 'function' ? transaction.toObject() : { ...transaction };
  return {
    ...plain,
    occurredAt: plain.occurredAt instanceof Date ? plain.occurredAt.toISOString() : plain.occurredAt,
    createdAt: plain.createdAt instanceof Date ? plain.createdAt.toISOString() : plain.createdAt,
    updatedAt: plain.updatedAt instanceof Date ? plain.updatedAt.toISOString() : plain.updatedAt
  };
}

function buildAccountSummary(account) {
  const balance = getAccountBalance(account.initialBalance, inMemoryStore.transactions.filter((transaction) => transaction.accountId === account._id));
  return {
    ...account,
    balance
  };
}

async function listMongoAccounts() {
  const [accounts, transactions] = await Promise.all([
    Account.find({}).lean().sort({ createdAt: 1 }).exec(),
    Transaction.find({}).lean().exec()
  ]);

  return accounts.map((account) => serializeAccount(account, transactions));
}

async function listMongoTransactions(accountId) {
  const query = accountId ? { accountId } : {};
  const transactions = await Transaction.find(query).lean().sort({ occurredAt: 1, createdAt: 1 }).exec();
  return transactions.map((transaction) => serializeTransaction(transaction));
}

async function createMongoAccount(payload) {
  const account = await Account.create({
    _id: randomUUID(),
    name: payload.name,
    type: payload.type,
    initialBalance: Number(payload.initialBalance) || 0,
    archived: Boolean(payload.archived),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const allTransactions = await Transaction.find({}).lean().exec();
  return serializeAccount(account, allTransactions);
}

async function createMongoTransaction(payload) {
  const record = await Transaction.create({
    _id: randomUUID(),
    accountId: payload.accountId,
    type: payload.type,
    amount: Number(payload.amount),
    description: payload.description,
    category: payload.category || null,
    notes: payload.notes || '',
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return serializeTransaction(record);
}

async function updateMongoTransaction(id, patch) {
  const record = await Transaction.findById(id);
  if (!record) {
    return null;
  }

  if (patch.amount !== undefined) {
    record.amount = Number(patch.amount);
  }
  if (patch.description !== undefined) {
    record.description = patch.description;
  }
  if (patch.category !== undefined) {
    record.category = patch.category;
  }
  if (patch.notes !== undefined) {
    record.notes = patch.notes;
  }
  if (patch.type !== undefined) {
    record.type = patch.type;
  }
  if (patch.accountId !== undefined) {
    record.accountId = patch.accountId;
  }
  if (patch.occurredAt !== undefined) {
    record.occurredAt = new Date(patch.occurredAt);
  }
  record.updatedAt = new Date();

  await record.save();
  return serializeTransaction(record);
}

async function deleteMongoTransaction(id) {
  const record = await Transaction.findById(id);
  if (!record) {
    return null;
  }

  await record.deleteOne();
  return { deleted: true, transaction: serializeTransaction(record) };
}

function createPersistenceStore({ mongoUri } = {}) {
  const configuredMongoUri = mongoUri || process.env.MONGODB_URI;
  const isMongoEnabled = Boolean(configuredMongoUri);

  const store = {
    mode: isMongoEnabled ? 'mongo' : 'memory',
    async connect() {
      if (!isMongoEnabled) {
        return false;
      }

      const connectionState = mongoose.connection.readyState;
      if (connectionState === 1) {
        return true;
      }

      await mongoose.connect(configuredMongoUri);
      return true;
    },
    isReady() {
      return isMongoEnabled ? mongoose.connection.readyState === 1 : true;
    },
    async listAccounts() {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return listMongoAccounts();
      }
      return inMemoryStore.accounts.map(buildAccountSummary);
    },
    async createAccount(payload) {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return createMongoAccount(payload);
      }

      const account = {
        _id: randomUUID(),
        name: payload.name,
        type: payload.type,
        initialBalance: Number(payload.initialBalance) || 0,
        archived: Boolean(payload.archived),
        createdAt: new Date().toISOString()
      };

      inMemoryStore.accounts.push(account);
      return buildAccountSummary(account);
    },
    async listTransactions(accountId) {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return listMongoTransactions(accountId);
      }

      let transactions = [...inMemoryStore.transactions];
      if (accountId) {
        transactions = transactions.filter((transaction) => transaction.accountId === accountId);
      }
      return transactions;
    },
    async createTransaction(payload) {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return createMongoTransaction(payload);
      }

      const transaction = {
        _id: randomUUID(),
        accountId: payload.accountId,
        type: payload.type,
        amount: Number(payload.amount),
        description: payload.description,
        category: payload.category || null,
        notes: payload.notes || '',
        occurredAt: payload.occurredAt || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      inMemoryStore.transactions.push(transaction);
      return transaction;
    },
    async updateTransaction(id, patch) {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return updateMongoTransaction(id, patch);
      }

      const transaction = inMemoryStore.transactions.find((item) => item._id === id);
      if (!transaction) {
        return null;
      }

      const next = { ...transaction, ...patch };
      if (patch.amount !== undefined) {
        next.amount = Number(patch.amount);
      }
      if (patch.occurredAt !== undefined) {
        next.occurredAt = patch.occurredAt;
      }
      const index = inMemoryStore.transactions.findIndex((item) => item._id === id);
      inMemoryStore.transactions[index] = next;
      return next;
    },
    async deleteTransaction(id) {
      if (isMongoEnabled && mongoose.connection.readyState === 1) {
        return deleteMongoTransaction(id);
      }

      const index = inMemoryStore.transactions.findIndex((item) => item._id === id);
      if (index === -1) {
        return null;
      }

      const [removed] = inMemoryStore.transactions.splice(index, 1);
      return { deleted: true, transaction: removed };
    }
  };

  return store;
}

module.exports = {
  createPersistenceStore,
  resetInMemoryStore,
  inMemoryStore,
  mongoose
};
