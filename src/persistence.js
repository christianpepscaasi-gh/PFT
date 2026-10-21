const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
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

const timestampOptions = { timestamps: true, versionKey: false };

const accountSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
  type: { type: String, required: true },
  initialBalance: { ...signedMoneyField, default: 0 },
  archived: { type: Boolean, default: false }
}, { ...timestampOptions, _id: false });

const transactionSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  accountId: { type: String, required: true, index: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { ...moneyField, min: 1 },
  description: { type: String, required: true },
  category: { type: String, default: null },
  notes: { type: String, default: '' },
  occurredAt: { type: Date, required: true }
}, { ...timestampOptions, _id: false });
transactionSchema.index({ accountId: 1, occurredAt: 1 });

const budgetSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  month: { type: String, required: true },
  amount: { ...moneyField, min: 1 }
}, { ...timestampOptions, _id: false });
budgetSchema.index({ month: 1 }, { unique: true });

const reserveSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  label: { type: String, default: 'Reserve' },
  amount: moneyField
}, { ...timestampOptions, _id: false });

const dailyOverrideSchema = new mongoose.Schema({
  _id: { type: String, default: () => randomUUID() },
  date: { type: String, required: true },
  targetAmount: moneyField,
  reason: { type: String, default: '' }
}, { ...timestampOptions, _id: false });
dailyOverrideSchema.index({ date: 1 }, { unique: true });

function createCareerSchema(fields) {
  return new mongoose.Schema({
    _id: { type: String, default: () => randomUUID() },
    ...fields
  }, { ...timestampOptions, _id: false });
}

const careerModels = {
  probation: mongoose.models.CareerProbation || mongoose.model('CareerProbation', createCareerSchema({
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    elapsedDays: { type: Number, required: true },
    remainingDays: { type: Number, required: true }
  }), 'career_probation'),
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

function createMongoPersistenceStore(mongoUri) {
  return {
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
    },
    async listAccounts() {
      assertMongoReady();
      const [accounts, transactions] = await Promise.all([
        Account.find({}).sort({ createdAt: 1 }).lean().exec(),
        Transaction.find({}).lean().exec()
      ]);
      return accounts.map((account) => serializeAccount(account, transactions));
    },
    async getAccount(id) {
      assertMongoReady();
      const account = await Account.findById(id).lean().exec();
      if (!account) {
        return null;
      }
      const transactions = await Transaction.find({ accountId: id }).lean().exec();
      return serializeAccount(account, transactions);
    },
    async createAccount(payload) {
      assertMongoReady();
      const record = await Account.create({
        _id: randomUUID(),
        name: payload.name,
        type: payload.type,
        initialBalance: payload.initialBalance,
        archived: false
      });
      return serializeAccount(record);
    },
    async archiveAccount(id) {
      assertMongoReady();
      const record = await Account.findByIdAndUpdate(id, { archived: true }, { new: true, runValidators: true }).lean().exec();
      return record ? serializeAccount(record, await Transaction.find({ accountId: id }).lean().exec()) : null;
    },
    async listTransactions(accountId) {
      assertMongoReady();
      const query = accountId ? { accountId } : {};
      const records = await Transaction.find(query).sort({ occurredAt: 1, createdAt: 1 }).lean().exec();
      return records.map(serializeRecord);
    },
    async getTransaction(id) {
      assertMongoReady();
      return serializeRecord(await Transaction.findById(id).lean().exec());
    },
    async createTransaction(payload) {
      assertMongoReady();
      const record = await Transaction.create({ _id: randomUUID(), ...payload });
      return serializeRecord(record);
    },
    async updateTransaction(id, patch) {
      assertMongoReady();
      const record = await Transaction.findByIdAndUpdate(id, { ...patch, updatedAt: new Date() }, {
        new: true,
        runValidators: true
      }).lean().exec();
      return serializeRecord(record);
    },
    async deleteTransaction(id) {
      assertMongoReady();
      const record = await Transaction.findByIdAndDelete(id).lean().exec();
      return record ? { deleted: true, transaction: serializeRecord(record) } : null;
    },
    async listBudgets() {
      assertMongoReady();
      return (await Budget.find({}).sort({ month: 1 }).lean().exec()).map(serializeRecord);
    },
    async getBudget(month) {
      assertMongoReady();
      return serializeRecord(await Budget.findOne({ month }).lean().exec());
    },
    async upsertBudget(month, amount) {
      assertMongoReady();
      const existing = await Budget.findOne({ month }).lean().exec();
      const record = await Budget.findOneAndUpdate({ month }, {
        $set: { amount },
        $setOnInsert: { _id: randomUUID(), month }
      }, { new: true, upsert: true, runValidators: true }).lean().exec();
      return { record: serializeRecord(record), created: !existing };
    },
    async listReserves() {
      assertMongoReady();
      return (await Reserve.find({}).sort({ createdAt: 1 }).lean().exec()).map(serializeRecord);
    },
    async createReserve(payload) {
      assertMongoReady();
      return serializeRecord(await Reserve.create({ _id: randomUUID(), ...payload }));
    },
    async listDailyOverrides() {
      assertMongoReady();
      return (await DailyOverride.find({}).sort({ date: 1 }).lean().exec()).map(serializeRecord);
    },
    async getDailyOverride(date) {
      assertMongoReady();
      return serializeRecord(await DailyOverride.findOne({ date }).lean().exec());
    },
    async upsertDailyOverride(payload) {
      assertMongoReady();
      return serializeRecord(await DailyOverride.findOneAndUpdate({ date: payload.date }, {
        $set: { targetAmount: payload.targetAmount, reason: payload.reason },
        $setOnInsert: { _id: randomUUID(), date: payload.date }
      }, { new: true, upsert: true, runValidators: true }).lean().exec());
    },
    async getCareerProbation() {
      assertMongoReady();
      return serializeRecord(await careerModels.probation.findOne({}).lean().exec());
    },
    async saveCareerProbation(payload) {
      assertMongoReady();
      return serializeRecord(await careerModels.probation.findOneAndUpdate({}, {
        $set: payload,
        $setOnInsert: { _id: randomUUID() }
      }, { new: true, upsert: true, runValidators: true }).lean().exec());
    },
    async listCareerEntries(type) {
      assertMongoReady();
      return (await careerModels[type].find({}).sort({ createdAt: 1 }).lean().exec()).map(serializeRecord);
    },
    async createCareerEntry(type, payload) {
      assertMongoReady();
      return serializeRecord(await careerModels[type].create({ _id: randomUUID(), ...payload }));
    }
  };
}

function createInMemoryPersistenceStore() {
  const state = {
    accounts: [],
    transactions: [],
    budgets: [],
    reserves: [],
    dailyOverrides: [],
    career: { probation: null, checkpoints: [], skills: [], tasks: [], journal: [] }
  };
  const now = () => new Date().toISOString();

  return {
    mode: 'memory-test',
    async connect() {
      return true;
    },
    isReady() {
      return true;
    },
    async close() {},
    async listAccounts() {
      return state.accounts.map((account) => serializeAccount(account, state.transactions));
    },
    async getAccount(id) {
      const account = state.accounts.find((item) => item._id === id);
      return account ? serializeAccount(account, state.transactions) : null;
    },
    async createAccount(payload) {
      const account = {
        _id: randomUUID(),
        ...payload,
        archived: false,
        createdAt: now(),
        updatedAt: now()
      };
      state.accounts.push(account);
      return serializeAccount(account, state.transactions);
    },
    async archiveAccount(id) {
      const account = state.accounts.find((item) => item._id === id);
      if (!account) {
        return null;
      }
      account.archived = true;
      account.updatedAt = now();
      return serializeAccount(account, state.transactions);
    },
    async listTransactions(accountId) {
      return state.transactions
        .filter((item) => !accountId || item.accountId === accountId)
        .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
        .map(serializeRecord);
    },
    async getTransaction(id) {
      return serializeRecord(state.transactions.find((item) => item._id === id));
    },
    async createTransaction(payload) {
      const record = { _id: randomUUID(), ...payload, createdAt: now(), updatedAt: now() };
      state.transactions.push(record);
      return serializeRecord(record);
    },
    async updateTransaction(id, patch) {
      const record = state.transactions.find((item) => item._id === id);
      if (!record) {
        return null;
      }
      Object.assign(record, patch, { updatedAt: now() });
      return serializeRecord(record);
    },
    async deleteTransaction(id) {
      const index = state.transactions.findIndex((item) => item._id === id);
      if (index < 0) {
        return null;
      }
      const [record] = state.transactions.splice(index, 1);
      return { deleted: true, transaction: serializeRecord(record) };
    },
    async listBudgets() {
      return state.budgets.map(serializeRecord);
    },
    async getBudget(month) {
      return serializeRecord(state.budgets.find((item) => item.month === month));
    },
    async upsertBudget(month, amount) {
      let record = state.budgets.find((item) => item.month === month);
      const created = !record;
      if (!record) {
        record = { _id: randomUUID(), month, createdAt: now() };
        state.budgets.push(record);
      }
      record.amount = amount;
      record.updatedAt = now();
      return { record: serializeRecord(record), created };
    },
    async listReserves() {
      return state.reserves.map(serializeRecord);
    },
    async createReserve(payload) {
      const record = { _id: randomUUID(), ...payload, createdAt: now(), updatedAt: now() };
      state.reserves.push(record);
      return serializeRecord(record);
    },
    async listDailyOverrides() {
      return state.dailyOverrides.map(serializeRecord);
    },
    async getDailyOverride(date) {
      return serializeRecord(state.dailyOverrides.find((item) => item.date === date));
    },
    async upsertDailyOverride(payload) {
      let record = state.dailyOverrides.find((item) => item.date === payload.date);
      if (!record) {
        record = { _id: randomUUID(), date: payload.date, createdAt: now() };
        state.dailyOverrides.push(record);
      }
      Object.assign(record, payload, { updatedAt: now() });
      return serializeRecord(record);
    },
    async getCareerProbation() {
      return serializeRecord(state.career.probation);
    },
    async saveCareerProbation(payload) {
      state.career.probation = {
        _id: state.career.probation?._id || randomUUID(),
        ...payload,
        createdAt: state.career.probation?.createdAt || now(),
        updatedAt: now()
      };
      return serializeRecord(state.career.probation);
    },
    async listCareerEntries(type) {
      return state.career[type].map(serializeRecord);
    },
    async createCareerEntry(type, payload) {
      const record = { _id: randomUUID(), ...payload, createdAt: now(), updatedAt: now() };
      state.career[type].push(record);
      return serializeRecord(record);
    }
  };
}

function createPersistenceStore(options = {}) {
  const mongoUri = Object.hasOwn(options, 'mongoUri') ? options.mongoUri : process.env.MONGODB_URI;
  return createMongoPersistenceStore(mongoUri);
}

module.exports = {
  createPersistenceStore,
  createInMemoryPersistenceStore,
  mongoose,
  models: { Account, Transaction, Budget, Reserve, DailyOverride, career: careerModels }
};
