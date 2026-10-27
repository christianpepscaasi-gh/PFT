const session = require('express-session');

// Explicitly test-only. Runtime authentication has no memory-store fallback.
function createMemoryIdentityRepository() {
  const users = new Map();
  const attempts = new Map();
  const audit = [];
  let marker;
  return {
    users, audit,
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
      audit.push({ action: 'owner.bootstrap', actorId: admin._id, targetId: user._id, outcome: 'success' });
      marker = { adminId: admin._id, userId: user._id };
      return { ...marker, created: true };
    }
  };
}

module.exports = { createMemoryIdentityRepository, createMemorySessionStore: () => new session.MemoryStore() };
