const session = require('express-session');

// Explicitly test-only. Runtime authentication has no memory-store fallback.
function createMemoryIdentityRepository() {
  const users = new Map();
  const attempts = new Map();
  const audit = [];
  const requests = new Map();
  const invitations = new Map();
  let transactionQueue = Promise.resolve();
  const matches = (record, filter) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((part) => matches(record, part));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if (Object.hasOwn(expected, '$gt')) return record[key] > expected.$gt;
      if (Object.hasOwn(expected, '$lt')) return record[key] < expected.$lt;
    }
    if (expected instanceof Date) return record[key] instanceof Date && record[key].getTime() === expected.getTime();
    return expected === null ? record[key] == null : record[key] === expected;
  });
  let marker;
  return {
    users, audit, requests, invitations,
    async lookupInvitation(hash, now) {
      return structuredClone([...invitations.values()].find((record) => record.tokenHash === hash && record.consumedAt == null && record.expiresAt > now) || null);
    },
    managementTransaction(operation) {
      const run = transactionQueue.then(async () => {
        const state = {
          users: structuredClone(users), requests: structuredClone(requests), invitations: structuredClone(invitations),
          audit: new Map(audit.map((event) => [event._id, structuredClone(event)]))
        };
        const tx = {
          async get(name, filter) { return structuredClone([...state[name].values()].find((record) => matches(record, filter)) || null); },
          async list(name, filter, limit, order = { _id: 1 }) {
            return structuredClone([...state[name].values()].filter((record) => matches(record, filter)).sort((a, b) => {
              for (const [field, direction] of Object.entries(order)) {
                if (a[field] > b[field]) return direction;
                if (a[field] < b[field]) return -direction;
              }
              return 0;
            }).slice(0, limit));
          },
          async insert(name, record) {
            if (state[name].has(record._id)) throw new Error('Duplicate record.');
            state[name].set(record._id, structuredClone(record));
          },
          async update(name, filter, update) {
            const record = [...state[name].values()].find((item) => matches(item, filter));
            if (!record) return { matchedCount: 0 };
            Object.assign(record, structuredClone(update.$set || {}));
            for (const [key, amount] of Object.entries(update.$inc || {})) record[key] += amount;
            return { matchedCount: 1 };
          },
          async remove(name, filter) {
            const record = [...state[name].values()].find((item) => matches(item, filter));
            if (record) state[name].delete(record._id);
          }
        };
        const result = await operation(tx);
        for (const [name, destination] of [['users', users], ['requests', requests], ['invitations', invitations]]) {
          destination.clear();
          for (const [key, value] of state[name]) destination.set(key, value);
        }
        audit.splice(0, audit.length, ...state.audit.values());
        return result;
      });
      transactionQueue = run.catch(() => {});
      return run;
    },
    async connect() {},
    async findByEmail(email) { return structuredClone([...users.values()].find((user) => user.email === email) || null); },
    async findById(id) { return structuredClone(users.get(id) || null); },
    async consumeAttempt(key, limit, windowMs) {
      const bucket = Math.floor(Date.now() / windowMs) + ':' + key;
      const count = (attempts.get(bucket) || 0) + 1;
      attempts.set(bucket, count);
      return count <= limit;
    },
    async setUserStatus(id, status) {
      const user = users.get(id);
      if (!user || user.role !== 'user') return null;
      user.status = status;
      user.sessionVersion++;
      return structuredClone(user);
    },
    async revokeSessions(id) { users.get(id).sessionVersion++; },
    async bootstrapPair(admin, user) {
      if (marker) {
        const a = users.get(marker.adminId);
        const u = users.get(marker.userId);
        if (a.email !== admin.email || u.email !== user.email || a.role !== 'admin' || u.role !== 'user' || a.status !== 'active') throw new Error('Bootstrap conflict.');
        return { ...marker, created: false };
      }
      if (users.size) throw new Error('Bootstrap requires a clean identity collection.');
      users.set(admin._id, structuredClone(admin));
      users.set(user._id, structuredClone(user));
      audit.push({ _id: 'owner-bootstrap', action: 'owner.bootstrap', actorId: admin._id, targetId: user._id, outcome: 'success', createdAt: new Date() });
      marker = { adminId: admin._id, userId: user._id };
      return { ...marker, created: true };
    }
  };
}

module.exports = { createMemoryIdentityRepository, createMemorySessionStore: () => new session.MemoryStore() };
