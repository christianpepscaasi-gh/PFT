const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const { ACCOUNT_TYPES } = require('./utils/accounts');
const { getAccountBalance, getPhilippineDateKey } = require('./utils/finance');

const moneyField = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: 'Money values must be integer centavos.'
  }
};

const signedMoneyField = {
  type: Number,
  required: true,
  validate: {
    validator: Number.isSafeInteger,
    message: 'Money values must be integer centavos.'
  }
};

const timestampOptions = { timestamps: true, versionKey: false, autoIndex: false };
const ownerField = { type: String, required: true, immutable: true, index: true };

const accountSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  userId: ownerField,
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ACCOUNT_TYPES },
  initialBalance: { ...signedMoneyField, default: 0 },
  archived: { type: Boolean, default: false }
}, { ...timestampOptions, _id: false });

const transactionSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  userId: ownerField,
  accountId: { type: String, required: true, index: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { ...moneyField, min: 1 },
  description: { type: String, required: true },
  category: { type: String, default: null },
  notes: { type: String, default: '' },
  occurredAt: { type: Date, required: true }
}, { ...timestampOptions, _id: false });
transactionSchema.index({ userId: 1, accountId: 1, occurredAt: 1 });
transactionSchema.index({ userId: 1, occurredAt: 1 });

const budgetSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  userId: ownerField,
  month: { type: String, required: true },
  amount: { ...moneyField, min: 1 }
}, { ...timestampOptions, _id: false });
budgetSchema.index({ userId: 1, month: 1 }, { unique: true });

const reserveSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  userId: ownerField,
  label: { type: String, default: 'Reserve' },
  amount: moneyField
}, { ...timestampOptions, _id: false });

const dailyOverrideSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  userId: ownerField,
  date: { type: String, required: true },
  targetAmount: moneyField,
  reason: { type: String, default: '' }
}, { ...timestampOptions, _id: false });
dailyOverrideSchema.index({ userId: 1, date: 1 }, { unique: true });

function createCareerSchema(fields) {
  return new mongoose.Schema({
    _id: { type: String, default: () => randomUUID() },
    userId: ownerField,
    ...fields
  }, { ...timestampOptions, _id: false });
}

const probationSchema = createCareerSchema({
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  elapsedDays: { type: Number, required: true },
  remainingDays: { type: Number, required: true }
});
probationSchema.path('userId').index({ unique: true });

const careerModels = {
  probation: mongoose.models.CareerProbation || mongoose.model('CareerProbation', probationSchema, 'career_probation'),
  checkpoints: mongoose.models.CareerCheckpoint || mongoose.model('CareerCheckpoint', createCareerSchema({
    date: { type: String, required: true },
    title: { type: String, required: true },
    notes: { type: String, default: '' },
    status: { type: String, required: true }
  }), 'career_checkpoints'),
  skills: mongoose.models.CareerSkill || mongoose.model('CareerSkill', createCareerSchema({
    name: { type: String, required: true },
    status: { type: String, required: true }
  }), 'career_skills'),
  tasks: mongoose.models.CareerTask || mongoose.model('CareerTask', createCareerSchema({
    title: { type: String, required: true },
    status: { type: String, required: true },
    dueDate: { type: String, default: null },
    notes: { type: String, default: '' }
  }), 'career_tasks'),
  journal: mongoose.models.CareerJournal || mongoose.model('CareerJournal', createCareerSchema({
    date: { type: String, required: true },
    entry: { type: String, required: true }
  }), 'career_journal')
};

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema, 'accounts');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema, 'transactions');
const Budget = mongoose.models.Budget || mongoose.model('Budget', budgetSchema, 'budgets');
const Reserve = mongoose.models.Reserve || mongoose.model('Reserve', reserveSchema, 'reserves');
const DailyOverride = mongoose.models.DailyOverride || mongoose.model('DailyOverride', dailyOverrideSchema, 'daily_overrides');

let connectionPromise = null;
let connectionUri = null;
let indexPromise = null;

async function ensureOwnedIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      // Legacy global uniqueness must be removed by the reviewed migration, not startup.
      for (const model of [Budget, DailyOverride]) {
        let indexes = [];
        try { indexes = await model.collection.indexes(); } catch (error) { if (error.code !== 26) throw error; }
        if (indexes.some((index) => index.unique && !index.key.userId && !index.key._id)) {
          throw new Error('Legacy global indexes require the ownership migration.');
        }
      }
      await Promise.all([Account, Transaction, Budget, Reserve, DailyOverride, ...Object.values(careerModels)]
        .map((model) => model.createIndexes()));
    })().catch((error) => { indexPromise = null; throw error; });
  }
  await indexPromise;
}

function serializeRecord(record) {
  if (!record) {
    return null;
  }

  const plain = typeof record.toObject === 'function' ? record.toObject() : { ...record };
  for (const key of ['occurredAt', 'createdAt', 'updatedAt']) {
    if (plain[key] instanceof Date) {
      plain[key] = plain[key].toISOString();
    }
  }
  return plain;
}

function serializeAccount(account, transactions = []) {
  const plain = serializeRecord(account);
  const accountTransactions = transactions.filter((transaction) => transaction.accountId === plain._id);
  return {
    ...plain,
    balance: getAccountBalance(plain.initialBalance, accountTransactions, getPhilippineDateKey(new Date()))
  };
}

function assertMongoReady() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected.');
  }
}

function accessError(message, status = 403) {
  return Object.assign(new Error(message), { name: 'AccessError', status });
}

function activeUserId(identity) {
  if (!identity || identity.role !== 'user' || identity.status !== 'active'
    || typeof identity._id !== 'string' || !identity._id.trim()) {
    throw accessError('A trusted active user identity is required.');
  }
  return identity._id;
}

function guardStore(store, userId) {
  if (userId && store.mode === 'mongo') {
    const connect = store.connect;
    store.connect = async () => { await connect(); await ensureOwnedIndexes(); return true; };
  }
  const lifecycle = new Set(['connect', 'close', 'isReady', 'forUser']);
  for (const [name, method] of Object.entries(store)) {
    if (typeof method !== 'function' || lifecycle.has(name)) continue;
    store[name] = async (...args) => {
      if (!userId) throw accessError('A trusted active user identity is required.');
      if (store.mode === 'mongo') { assertMongoReady(); await ensureOwnedIndexes(); }
      const payload = args.find((arg) => arg && typeof arg === 'object');
      if (payload && ['userId', '_id', 'role'].some((key) => Object.hasOwn(payload, key))) {
        throw accessError('Identity and ownership fields cannot be supplied.', 400);
      }
      const writeFields = {
        createAccount: ['name', 'type', 'initialBalance'],
        createTransaction: ['accountId', 'type', 'amount', 'description', 'category', 'notes', 'occurredAt'],
        updateTransaction: ['accountId', 'type', 'amount', 'description', 'category', 'notes', 'occurredAt'],
        createReserve: ['label', 'amount'],
        upsertDailyOverride: ['date', 'targetAmount', 'reason'],
        saveCareerProbation: ['startDate', 'endDate', 'elapsedDays', 'remainingDays', 'updatedAt'],
        createCareerEntry: ['date', 'title', 'notes', 'status', 'name', 'dueDate', 'entry']
      };
      if (payload && writeFields[name] && Object.keys(payload).some((key) => !writeFields[name].includes(key))) {
        throw accessError('Unsupported record fields.', 400);
      }
      if (['getAccount', 'archiveAccount', 'getTransaction', 'updateTransaction', 'deleteTransaction'].includes(name)
        && (typeof args[0] !== 'string' || !args[0].trim())) throw accessError('Resource ID must be a non-empty string.', 400);
      if (name === 'listTransactions' && args[0] != null && (typeof args[0] !== 'string' || !args[0].trim())) {
        throw accessError('Account ID must be a non-empty string.', 400);
      }
      if (['getBudget', 'upsertBudget', 'getDailyOverride'].includes(name) && typeof args[0] !== 'string') {
        throw accessError('Planning key must be a string.', 400);
      }
      if (['listCareerEntries', 'createCareerEntry'].includes(name) && !['checkpoints', 'skills', 'tasks', 'journal'].includes(args[0])) {
        throw accessError('Invalid Career record type.', 400);
      }
      if (name === 'updateTransaction' && !await store.getTransaction(args[0])) return null;
      if (name === 'createTransaction' || (name === 'updateTransaction' && args[1].accountId !== undefined)) {
        const accountId = name === 'createTransaction' ? args[0].accountId : args[1].accountId;
        if (!await store.getAccount(accountId)) throw accessError('Account not found.', 404);
      }
      return method(...args);
    };
  }
  return store;
}

function createMongoPersistenceStore(mongoUri, userId = null) {
  return guardStore({
    ...(userId ? {} : { forUser: (identity) => createMongoPersistenceStore(mongoUri, activeUserId(identity)) }),
    mode: 'mongo',
    async connect() {
      if (!mongoUri) {
        throw new Error('MONGODB_URI is required.');
      }
      if (mongoose.connection.readyState === 1 && connectionUri === mongoUri) {
        return true;
      }
      if (connectionPromise && connectionUri === mongoUri) {
        await connectionPromise;
        return true;
      }

      connectionUri = mongoUri;
      connectionPromise = mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
      try {
        await connectionPromise;
      } finally {
        connectionPromise = null;
      }
      return true;
    },
    isReady() {
      return Boolean(mongoUri) && mongoose.connection.readyState === 1;
    },
    async close() {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      connectionUri = null;
      connectionPromise = null;
      indexPromise = null;
    },
    async listAccounts() {
      assertMongoReady();
      const [accounts, transactions] = await Promise.all([
        Account.find({ userId }).sort({ createdAt: 1 }).lean().exec(),
        Transaction.find({ userId }).lean().exec()
      ]);
      return accounts.map((account) => serializeAccount(account, transactions));
    },
    async getAccount(id) {
      assertMongoReady();
      const account = await Account.findOne({ _id: id, userId }).lean().exec();
      if (!account) {
        return null;
      }
      const transactions = await Transaction.find({ accountId: id, userId }).lean().exec();
      return serializeAccount(account, transactions);
    },
    async createAccount(payload) {
      assertMongoReady();
      const record = await Account.create({
        _id: randomUUID(),
        userId,
        name: payload.name,
        type: payload.type,
        initialBalance: payload.initialBalance,
        archived: false
      });
      return serializeAccount(record);
    },
    async archiveAccount(id) {
      assertMongoReady();
      const record = await Account.findOneAndUpdate({ _id: id, userId }, { archived: true }, { new: true, runValidators: true }).lean().exec();
      return record ? serializeAccount(record, await Transaction.find({ accountId: id, userId }).lean().exec()) : null;
    },
    async listTransactions(accountId) {
      assertMongoReady();
      const query = accountId ? { accountId, userId } : { userId };
      const records = await Transaction.find(query).sort({ occurredAt: 1, createdAt: 1 }).lean().exec();
      return records.map(serializeRecord);
    },
    async getTransaction(id) {
      assertMongoReady();
      return serializeRecord(await Transaction.findOne({ _id: id, userId }).lean().exec());
    },
    async createTransaction(payload) {
      assertMongoReady();
      const record = await Transaction.create({ _id: randomUUID(), ...payload, userId });
      return serializeRecord(record);
    },
    async updateTransaction(id, patch) {
      assertMongoReady();
      const record = await Transaction.findOneAndUpdate({ _id: id, userId }, { ...patch, updatedAt: new Date() }, {
        new: true,
        runValidators: true
      }).lean().exec();
      return serializeRecord(record);
    },
    async deleteTransaction(id) {
      assertMongoReady();
      const record = await Transaction.findOneAndDelete({ _id: id, userId }).lean().exec();
      return record ? { deleted: true, transaction: serializeRecord(record) } : null;
    },
    async listBudgets() {
      assertMongoReady();
      return (await Budget.find({ userId }).sort({ month: 1 }).lean().exec()).map(serializeRecord);
    },
    async getBudget(month) {
      assertMongoReady();
      return serializeRecord(await Budget.findOne({ month, userId }).lean().exec());
    },
    async upsertBudget(month, amount) {
      assertMongoReady();
      const existing = await Budget.findOne({ month, userId }).lean().exec();
      const record = await Budget.findOneAndUpdate({ month, userId }, {
        $set: { amount },
        $setOnInsert: { _id: randomUUID(), month, userId }
      }, { new: true, upsert: true, runValidators: true }).lean().exec();
      return { record: serializeRecord(record), created: !existing };
    },
    async listReserves() {
      assertMongoReady();
      return (await Reserve.find({ userId }).sort({ createdAt: 1 }).lean().exec()).map(serializeRecord);
    },
    async createReserve(payload) {
      assertMongoReady();
      return serializeRecord(await Reserve.create({ _id: randomUUID(), ...payload, userId }));
    },
    async listDailyOverrides() {
      assertMongoReady();
      return (await DailyOverride.find({ userId }).sort({ date: 1 }).lean().exec()).map(serializeRecord);
    },
    async getDailyOverride(date) {
      assertMongoReady();
      return serializeRecord(await DailyOverride.findOne({ date, userId }).lean().exec());
    },
    async upsertDailyOverride(payload) {
      assertMongoReady();
      return serializeRecord(await DailyOverride.findOneAndUpdate({ date: payload.date, userId }, {
        $set: { targetAmount: payload.targetAmount, reason: payload.reason },
        $setOnInsert: { _id: randomUUID(), date: payload.date, userId }
      }, { new: true, upsert: true, runValidators: true }).lean().exec());
    },
    async getCareerProbation() {
      assertMongoReady();
      return serializeRecord(await careerModels.probation.findOne({ userId }).lean().exec());
    },
    async saveCareerProbation(payload) {
      assertMongoReady();
      return serializeRecord(await careerModels.probation.findOneAndUpdate({ userId }, {
        $set: payload,
        $setOnInsert: { _id: randomUUID(), userId }
      }, { new: true, upsert: true, runValidators: true }).lean().exec());
    },
    async listCareerEntries(type) {
      assertMongoReady();
      return (await careerModels[type].find({ userId }).sort({ createdAt: 1 }).lean().exec()).map(serializeRecord);
    },
    async createCareerEntry(type, payload) {
      assertMongoReady();
      return serializeRecord(await careerModels[type].create({ _id: randomUUID(), ...payload, userId }));
    }
  }, userId);
}

function createMemoryStore(userId = null, sharedState = null) {
  const state = sharedState || {
    accounts: [],
    transactions: [],
    budgets: [],
    reserves: [],
    dailyOverrides: [],
    career: { probation: [], checkpoints: [], skills: [], tasks: [], journal: [] }
  };
  const now = () => new Date().toISOString();

  return guardStore({
    ...(userId ? {} : { forUser: (identity) => createMemoryStore(activeUserId(identity), state) }),
    mode: 'memory-test',
    async connect() {
      return true;
    },
    isReady() {
      return true;
    },
    async close() {},
    async listAccounts() {
      return state.accounts.filter((account) => account.userId === userId).map((account) => serializeAccount(account, state.transactions.filter((item) => item.userId === userId)));
    },
    async getAccount(id) {
      const account = state.accounts.find((item) => item._id === id && item.userId === userId);
      return account ? serializeAccount(account, state.transactions.filter((item) => item.userId === userId)) : null;
    },
    async createAccount(payload) {
      const validated = new Account({ userId, name: payload.name, type: payload.type, initialBalance: payload.initialBalance });
      await validated.validate();
      const account = {
        _id: randomUUID(),
        userId,
        name: validated.name,
        type: validated.type,
        initialBalance: validated.initialBalance,
        archived: false,
        createdAt: now(),
        updatedAt: now()
      };
      state.accounts.push(account);
      return serializeAccount(account, state.transactions.filter((item) => item.userId === userId));
    },
    async archiveAccount(id) {
      const account = state.accounts.find((item) => item._id === id && item.userId === userId);
      if (!account) {
        return null;
      }
      account.archived = true;
      account.updatedAt = now();
      return serializeAccount(account, state.transactions.filter((item) => item.userId === userId));
    },
    async listTransactions(accountId) {
      return state.transactions
        .filter((item) => item.userId === userId && (!accountId || item.accountId === accountId))
        .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
        .map(serializeRecord);
    },
    async getTransaction(id) {
      return serializeRecord(state.transactions.find((item) => item._id === id && item.userId === userId));
    },
    async createTransaction(payload) {
      const record = { _id: randomUUID(), ...payload, userId, createdAt: now(), updatedAt: now() };
      state.transactions.push(record);
      return serializeRecord(record);
    },
    async updateTransaction(id, patch) {
      const record = state.transactions.find((item) => item._id === id && item.userId === userId);
      if (!record) {
        return null;
      }
      Object.assign(record, patch, { updatedAt: now() });
      return serializeRecord(record);
    },
    async deleteTransaction(id) {
      const index = state.transactions.findIndex((item) => item._id === id && item.userId === userId);
      if (index < 0) {
        return null;
      }
      const [record] = state.transactions.splice(index, 1);
      return { deleted: true, transaction: serializeRecord(record) };
    },
    async listBudgets() {
      return state.budgets.filter((item) => item.userId === userId).map(serializeRecord);
    },
    async getBudget(month) {
      return serializeRecord(state.budgets.find((item) => item.month === month && item.userId === userId));
    },
    async upsertBudget(month, amount) {
      let record = state.budgets.find((item) => item.month === month && item.userId === userId);
      const created = !record;
      if (!record) {
        record = { _id: randomUUID(), month, userId, createdAt: now() };
        state.budgets.push(record);
      }
      record.amount = amount;
      record.updatedAt = now();
      return { record: serializeRecord(record), created };
    },
    async listReserves() {
      return state.reserves.filter((item) => item.userId === userId).map(serializeRecord);
    },
    async createReserve(payload) {
      const record = { _id: randomUUID(), ...payload, userId, createdAt: now(), updatedAt: now() };
      state.reserves.push(record);
      return serializeRecord(record);
    },
    async listDailyOverrides() {
      return state.dailyOverrides.filter((item) => item.userId === userId).map(serializeRecord);
    },
    async getDailyOverride(date) {
      return serializeRecord(state.dailyOverrides.find((item) => item.date === date && item.userId === userId));
    },
    async upsertDailyOverride(payload) {
      let record = state.dailyOverrides.find((item) => item.date === payload.date && item.userId === userId);
      if (!record) {
        record = { _id: randomUUID(), date: payload.date, userId, createdAt: now() };
        state.dailyOverrides.push(record);
      }
      Object.assign(record, payload, { updatedAt: now() });
      return serializeRecord(record);
    },
    async getCareerProbation() {
      return serializeRecord(state.career.probation.find((item) => item.userId === userId));
    },
    async saveCareerProbation(payload) {
      let record = state.career.probation.find((item) => item.userId === userId);
      if (!record) {
        record = { _id: randomUUID(), userId, createdAt: now() };
        state.career.probation.push(record);
      }
      Object.assign(record, payload, { updatedAt: now() });
      return serializeRecord(record);
    },
    async listCareerEntries(type) {
      return state.career[type].filter((item) => item.userId === userId).map(serializeRecord);
    },
    async createCareerEntry(type, payload) {
      const record = { _id: randomUUID(), ...payload, userId, createdAt: now(), updatedAt: now() };
      state.career[type].push(record);
      return serializeRecord(record);
    }
  }, userId);
}

function createPersistenceStore(options = {}) {
  const mongoUri = Object.hasOwn(options, 'mongoUri') ? options.mongoUri : process.env.MONGODB_URI;
  return createMongoPersistenceStore(mongoUri);
}

function createInMemoryPersistenceStore() {
  return createMemoryStore();
}

module.exports = {
  createPersistenceStore,
  createInMemoryPersistenceStore,
  mongoose,
  models: { Account, Transaction, Budget, Reserve, DailyOverride, career: careerModels }
};
