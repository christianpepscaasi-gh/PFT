const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { normalizeEmail } = require('./bootstrap');
const { hashPassword, validPassword } = require('./passwords');

const INVITATION_MS = 24 * 60 * 60 * 1000;
const fail = (status, message) => { throw Object.assign(new Error(message), { name: 'AccessError', status }); };
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const userView = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt });
const hasControl = (text) => [...text].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127);

function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) fail(400, 'Request contains unsupported fields.');
}
function identityInput(input, request = false) {
  fields(input, request ? ['name', 'email', 'reason'] : ['name', 'email', 'confirm']);
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80 || hasControl(input.name)) fail(400, 'Name must contain 1 to 80 characters.');
  let email;
  try { email = normalizeEmail(input.email); } catch { fail(400, 'A valid email is required.'); }
  if (hasControl(email)) fail(400, 'A valid email is required.');
  const reason = input.reason === undefined ? '' : input.reason;
  if (request && (typeof reason !== 'string' || reason.length > 1000 || reason.includes('\0'))) fail(400, 'Reason must be text of at most 1000 characters.');
  return { name: input.name.trim(), email, ...(request ? { reason: reason.trim() } : {}) };
}
function confirm(input) { fields(input, ['confirm']); if (input.confirm !== true) fail(400, 'Explicit confirmation is required.'); }
function id(value) { if (typeof value !== 'string' || !value.trim() || value.length > 128) fail(400, 'A single resource ID is required.'); return value; }
function page(input, statuses) {
  fields(input, ['after', 'limit', 'status']);
  if (input.after !== undefined) id(input.after);
  if (input.limit !== undefined && (typeof input.limit !== 'string' || !/^\d+$/.test(input.limit))) fail(400, 'Page limit must be between 1 and 100.');
  const limit = input.limit === undefined ? 25 : Number(input.limit);
  if (limit < 1 || limit > 100) fail(400, 'Page limit must be between 1 and 100.');
  if (input.status !== undefined && (!statuses || !statuses.includes(input.status))) fail(400, 'Invalid status filter.');
  return { limit, filter: { ...(input.after ? { _id: { $gt: input.after } } : {}), ...(input.status ? { status: input.status } : {}) } };
}

function createManagementService(repository, { now = () => new Date(), allowReapply = true } = {}) {
  async function admin(tx, actorId) {
    const actor = await tx.get('users', { _id: id(actorId) });
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') fail(403, 'Admin access is required.');
  }
  async function audit(tx, actorId, targetId, action, outcome = 'success') {
    await tx.insert('audit', { _id: randomUUID(), actorId, targetId, action, outcome, createdAt: now() });
  }
  function invitationView(invitation) {
    if (!invitation) return { state: 'not-issued' };
    return { state: invitation.consumedAt ? 'consumed' : invitation.expiresAt <= now() ? 'expired' : 'delivery-not-configured', expiresAt: invitation.expiresAt };
  }
  async function issue(tx, user, actorId, reissue = false) {
    const existing = await tx.get('invitations', { _id: user._id });
    if (existing && !reissue) return { invitation: invitationView(existing) };
    const token = randomBytes(32).toString('base64url');
    const invitation = { _id: user._id, userId: user._id, tokenHash: tokenHash(token), issuedAt: now(), expiresAt: new Date(now().getTime() + INVITATION_MS), consumedAt: null };
    if (existing) {
      const { _id, ...updates } = invitation;
      await tx.update('invitations', { _id }, { $set: updates });
    }
    else await tx.insert('invitations', invitation);
    await audit(tx, actorId, user._id, reissue ? 'invitation.reissued' : 'invitation.issued');
    // Trusted caller only. HTTP routes serialize result, never this issuance bundle.
    return { invitation: invitationView(invitation), issued: { token, userId: user._id, expiresAt: invitation.expiresAt } };
  }
  async function pendingUser(tx, value, actorId) {
    let user = await tx.get('users', { email: value.email });
    if (user) {
      if (user.role !== 'user' || user.status !== 'pending' || user.passwordHash) fail(409, 'An account already exists for that email.');
      return { user, created: false };
    }
    user = { _id: randomUUID(), email: value.email, name: value.name, role: 'user', status: 'pending', passwordHash: null, sessionVersion: 0, createdAt: now(), updatedAt: now() };
    await tx.insert('users', user);
    await audit(tx, actorId, user._id, 'user.created');
    return { user, created: true };
  }
  async function list(actorId, collection, query, statuses, projection, extra = {}) {
    const paging = page(query, statuses);
    return repository.managementTransaction(async (tx) => {
      await admin(tx, actorId);
      const records = await tx.list(collection, { ...paging.filter, ...extra }, paging.limit + 1);
      const items = records.slice(0, paging.limit).map(projection);
      return { items, next: records.length > paging.limit ? items.at(-1)._id : null };
    });
  }
  async function sortedUsers(actorId, query) {
    fields(query, ['after', 'limit', 'status', 'sort', 'order']);
    const { after, sort, order = 'asc', ...base } = query;
    if (!['name', 'email', 'createdAt', 'status'].includes(sort) || !['asc', 'desc'].includes(order)) fail(400, 'Invalid User sort order.');
    const paging = page(base, ['active', 'pending', 'disabled']);
    const filter = { ...paging.filter, role: 'user' };
    const direction = order === 'asc' ? 1 : -1;
    if (after !== undefined) {
      let cursor;
      try {
        if (typeof after !== 'string' || after.length > 1024 || !/^[\w-]+$/.test(after)) throw new Error();
        cursor = JSON.parse(Buffer.from(after, 'base64url').toString('utf8'));
        if (cursor.sort !== sort || cursor.order !== order || cursor.status !== (base.status || '')
          || typeof cursor.value !== 'string' || cursor.value.length > 254) throw new Error();
        id(cursor.id);
        if (sort === 'createdAt' && new Date(cursor.value).toISOString() !== cursor.value) throw new Error();
      } catch { fail(400, 'Page cursor does not match the current sort and filter.'); }
      const value = sort === 'createdAt' ? new Date(cursor.value) : cursor.value;
      const comparison = direction === 1 ? '$gt' : '$lt';
      filter.$or = [{ [sort]: { [comparison]: value } }, { [sort]: value, _id: { [comparison]: cursor.id } }];
    }
    return repository.managementTransaction(async (tx) => {
      await admin(tx, actorId);
      const records = await tx.list('users', filter, paging.limit + 1, { [sort]: direction, _id: direction });
      const items = records.slice(0, paging.limit).map(userView);
      const last = items.at(-1);
      const next = records.length > paging.limit ? Buffer.from(JSON.stringify({ sort, order, status: base.status || '',
        value: sort === 'createdAt' ? new Date(last.createdAt).toISOString() : last[sort], id: last._id })).toString('base64url') : null;
      return { items, next };
    });
  }
  return {
    async submitRequest(input) {
      const value = identityInput(input, true);
      await repository.managementTransaction(async (tx) => {
        if (await tx.get('users', { email: value.email }) || await tx.get('requests', { email: value.email, status: 'pending' })) return;
        if (!allowReapply && await tx.get('requests', { email: value.email, status: 'rejected' })) return;
        await tx.insert('requests', { _id: randomUUID(), ...value, status: 'pending', createdAt: now() });
      });
      return { accepted: true, message: 'If eligible, your request will be reviewed.' };
    },
    listRequests: (actorId, query = {}) => list(actorId, 'requests', query, ['pending', 'approved', 'rejected'],
      (record) => ({ _id: record._id, name: record.name, email: record.email, reason: record.reason, status: record.status, createdAt: record.createdAt, reviewedAt: record.reviewedAt, reviewedBy: record.reviewedBy, userId: record.userId })),
    listUsers: (actorId, query = {}) => query.sort !== undefined || query.order !== undefined ? sortedUsers(actorId, query)
      : list(actorId, 'users', query, ['active', 'pending', 'disabled'], userView, { role: 'user' }),
    listAudit: (actorId, query = {}) => list(actorId, 'audit', query, null,
      (record) => ({ _id: record._id, actorId: record.actorId, targetId: record.targetId, action: record.action, outcome: record.outcome, createdAt: record.createdAt })),
    async approveRequest(actorId, requestId, input) {
      id(requestId); confirm(input);
      return repository.managementTransaction(async (tx) => {
        await admin(tx, actorId);
        const request = await tx.get('requests', { _id: requestId });
        if (!request) fail(404, 'Account request not found.');
        if (request.status === 'rejected') fail(409, 'This request has already been rejected.');
        if (request.status === 'approved') {
          const user = await tx.get('users', { _id: request.userId, role: 'user' });
          if (!user) fail(409, 'Approved account needs review.');
          return { result: { requestId, user: userView(user), invitation: invitationView(await tx.get('invitations', { _id: user._id })) } };
        }
        if (request.status !== 'pending') fail(409, 'This request cannot be approved.');
        const { user } = await pendingUser(tx, request, actorId);
        const { issued, invitation } = await issue(tx, user, actorId);
        const updated = await tx.update('requests', { _id: requestId, status: 'pending' }, { $set: { status: 'approved', userId: user._id, reviewedBy: actorId, reviewedAt: now() } });
        if (updated.matchedCount !== 1) fail(409, 'This request needs a fresh review.');
        await audit(tx, actorId, requestId, 'request.approved');
        return { result: { requestId, user: userView(user), invitation }, issued };
      });
    },
    async rejectRequest(actorId, requestId, input) {
      id(requestId); confirm(input);
      return repository.managementTransaction(async (tx) => {
        await admin(tx, actorId);
        const request = await tx.get('requests', { _id: requestId });
        if (!request) fail(404, 'Account request not found.');
        if (request.status === 'approved') fail(409, 'This request has already been approved.');
        if (!['pending', 'rejected'].includes(request.status)) fail(409, 'This request cannot be rejected.');
        if (request.status !== 'rejected') {
          await tx.update('requests', { _id: requestId }, { $set: { status: 'rejected', reviewedBy: actorId, reviewedAt: now() } });
          await audit(tx, actorId, requestId, 'request.rejected');
        }
        return { result: { requestId, status: 'rejected' } };
      });
    },
    async createUser(actorId, input) {
      const value = identityInput(input);
      if (input.confirm !== true) fail(400, 'Explicit confirmation is required.');
      return repository.managementTransaction(async (tx) => {
        await admin(tx, actorId);
        if (await tx.get('requests', { email: value.email, status: 'pending' })) fail(409, 'Review the pending account request instead.');
        const { user, created } = await pendingUser(tx, value, actorId);
        const { issued, invitation } = created ? await issue(tx, user, actorId)
          : { invitation: invitationView(await tx.get('invitations', { _id: user._id })) };
        return { result: { user: userView(user), invitation }, issued };
      });
    },
    async reissueInvitation(actorId, userId, input) {
      id(userId); confirm(input);
      return repository.managementTransaction(async (tx) => {
        await admin(tx, actorId);
        const user = await tx.get('users', { _id: userId, role: 'user', status: 'pending' });
        if (!user || user.passwordHash) fail(409, 'Only an unactivated pending User can receive an invitation.');
        const { issued, invitation } = await issue(tx, user, actorId, true);
        return { result: { user: userView(user), invitation }, issued };
      });
    },
    async changeStatus(actorId, userId, input) {
      id(userId); fields(input, ['status', 'confirm']);
      if (input.confirm !== true || !['active', 'disabled'].includes(input.status)) fail(400, 'Confirm an active or disabled status change.');
      return repository.managementTransaction(async (tx) => {
        await admin(tx, actorId);
        const user = await tx.get('users', { _id: userId });
        if (!user) fail(404, 'User not found.');
        if (user.role !== 'user') fail(409, 'Admin access cannot be changed here.');
        if (!['active', 'pending', 'disabled'].includes(user.status)) fail(409, 'User status needs review.');
        const status = input.status === 'disabled' ? 'disabled' : user.passwordHash ? 'active' : 'pending';
        const changed = status !== user.status;
        if (changed) {
          await tx.update('users', { _id: userId, role: 'user' }, { $set: { status, updatedAt: now() }, $inc: { sessionVersion: 1 } });
          if (status === 'disabled') await tx.remove('invitations', { _id: userId });
        }
        await audit(tx, actorId, userId, input.status === 'disabled' ? 'user.disabled' : 'user.enabled', changed ? 'success' : 'unchanged');
        return { result: { user: userView(await tx.get('users', { _id: userId })) } };
      });
    },
    async activate(input) {
      fields(input, ['token', 'password']);
      if (typeof input.token !== 'string' || !/^[\w-]{43}$/.test(input.token)) fail(400, 'Activation link is invalid or expired.');
      if (!validPassword(input.password)) fail(400, 'Password must contain 12 to 128 characters.');
      const hash = tokenHash(input.token);
      if (!await repository.lookupInvitation(hash, now())) fail(400, 'Activation link is invalid or expired.');
      const passwordHash = await hashPassword(input.password);
      return repository.managementTransaction(async (tx) => {
        const invitation = await tx.get('invitations', { tokenHash: hash, consumedAt: null, expiresAt: { $gt: now() } });
        if (!invitation) fail(400, 'Activation link is invalid or expired.');
        const user = await tx.get('users', { _id: invitation.userId, role: 'user', status: 'pending' });
        if (!user || user.passwordHash) fail(400, 'Activation link is invalid or expired.');
        const consumed = await tx.update('invitations', { _id: invitation._id, tokenHash: hash, consumedAt: null }, { $set: { consumedAt: now() } });
        if (consumed.matchedCount !== 1) fail(400, 'Activation link is invalid or expired.');
        const updated = await tx.update('users', { _id: user._id, role: 'user', status: 'pending' }, { $set: { passwordHash, status: 'active', updatedAt: now() }, $inc: { sessionVersion: 1 } });
        if (updated.matchedCount !== 1) fail(400, 'Activation link is invalid or expired.');
        await audit(tx, user._id, user._id, 'user.activated');
        return { activated: true };
      });
    }
  };
}

module.exports = { createManagementService };
