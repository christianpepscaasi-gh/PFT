(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let identity = null;
  let csrfToken = null;
  let csrfPending = null;
  let generation = 0;
  let activationToken = null;
  let activationRoute = false;
  const controllers = new Set();
  const references = new Map();
  let adminView = 'requests';
  let adminPage = 0;
  let adminCursors = [null];
  let adminNext = null;
  let adminLoad = 0;

  const aborted = () => new DOMException('Session changed.', 'AbortError');
  function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
  function error(id, failure) { if (failure.name !== 'AbortError') message(id, failure.message || 'Something went wrong. Try again.'); }
  async function raw(url, options = {}) {
    const epoch = generation;
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (epoch !== generation) throw aborted();
      const json = response.json.bind(response);
      response.json = async () => { const data = await json(); if (epoch !== generation) throw aborted(); return data; };
      return response;
    } catch (failure) {
      if (failure.name === 'AbortError') throw failure;
      throw new Error('Unable to reach the server. Check your connection and try again.');
    } finally { controllers.delete(controller); }
  }
  async function requireOk(response) {
    if (response.ok) return response;
    let detail = 'The request could not be completed. Try again.';
    try { detail = (await response.json()).error || detail; } catch (failure) { if (failure.name === 'AbortError') throw failure; }
    throw Object.assign(new Error(detail), { status: response.status });
  }
  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    if (!csrfPending) {
      const pending = (async () => { const response = await requireOk(await raw('/api/auth/csrf')); csrfToken = (await response.json()).csrfToken; return csrfToken; })();
      csrfPending = pending;
    }
    const pending = csrfPending;
    try { return await pending; } finally { if (csrfPending === pending) csrfPending = null; }
  }
  function clearPrivate() {
    generation++;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    csrfToken = null;
    csrfPending = null;
    identity = null;
    references.clear();
    adminLoad++;
    $('user-workspace').hidden = true;
    $('admin-workspace').hidden = true;
    $('user-navigation').hidden = true;
    $('logout-button').hidden = true;
    $('session-label').textContent = 'Signed out';
    for (const form of document.querySelectorAll('form')) form.reset();
    $('admin-list').replaceChildren();
    for (const id of ['admin-message', 'admin-error', 'app-message', 'auth-error']) message(id, '');
    $('quick-entry-modal').close();
    window.dispatchEvent(new Event('pft:session-cleared'));
  }
  function showAuth(view = 'login', notice = '') {
    $('auth-view').hidden = false;
    $('user-workspace').hidden = true;
    $('admin-workspace').hidden = true;
    $('user-navigation').hidden = true;
    $('login-form').hidden = view !== 'login';
    $('request-account-form').hidden = view !== 'request';
    $('activation-form').hidden = view !== 'activate' || !activationToken;
    $('auth-heading').textContent = view === 'request' ? 'Request an account' : view === 'activate' ? 'Activate your account' : 'Welcome to Pocket Ledger';
    message('auth-notice', notice || (view === 'request' ? 'An administrator will review your request.'
      : view === 'activate' ? (activationToken ? 'Choose a password with 12 to 128 characters.' : 'This invitation link is invalid. Ask the administrator for a new one.')
        : 'Sign in to your private workspace.'));
    if (view === 'activate') {
      const mustSignOut = Boolean(identity);
      for (const control of $('activation-form').querySelectorAll('input, button[type="submit"]')) control.disabled = mustSignOut;
      if (mustSignOut) message('auth-notice', 'Sign out of the current account before activating this invitation.');
    }
  }
  function signedOut(notice) { clearPrivate(); showAuth(activationRoute ? 'activate' : 'login', notice); }
  async function transport(url, options = {}) {
    if (typeof url !== 'string' || !url.startsWith('/api/') || url.includes('://')) throw new Error('Only same-origin API requests are supported.');
    const epoch = generation;
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', await ensureCsrf());
    if (epoch !== generation) throw aborted();
    const response = await raw(url, { ...options, method, headers });
    if (response.status === 401 && !['/api/auth/login', '/api/auth/me'].includes(url)) {
      signedOut('Your session ended. Sign in again.');
      throw aborted();
    }
    if (response.status === 403) {
      csrfToken = null;
      if (url.startsWith('/api/auth/') || url === '/api/account-requests') void ensureCsrf().catch(() => {});
      else void recheck().catch(() => {});
    }
    return response;
  }
  async function api(url, options) { return (await requireOk(await transport(url, options))).json(); }
  const body = (value, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  async function perform(control, handler, errorId) {
    if (control.disabled) return;
    control.disabled = true;
    message(errorId, '');
    try { await handler(); }
    catch (failure) { error(errorId, failure); }
    finally { control.disabled = false; }
  }
  function bind(formId, handler, errorId = 'auth-error') {
    const form = $(formId);
    form.addEventListener('submit', (event) => { event.preventDefault(); void perform(form.querySelector('button[type="submit"]'), () => handler(form), errorId); });
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  const time = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
  function resetPages() { adminPage = 0; adminCursors = [null]; adminNext = null; }
  function rowAction(container, label, confirmation, operation, successText) {
    const button = node('button', label, 'secondary-button');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (!window.confirm(confirmation)) return;
      void perform(button, async () => {
        const result = await operation();
        if (result.user) references.set(result.user._id, `${result.user.name} (${result.user.email})`);
        message('admin-message', successText ? successText(result) : result.user ? `Account status: ${result.user.status}.` : 'Request rejected.');
        resetPages();
        await loadAdmin();
      }, 'admin-error');
    });
    container.append(button);
  }
  function renderRecord(record) {
    const article = node(adminView === 'users' ? 'tr' : 'article', undefined, 'admin-record');
    if (adminView === 'audit') {
      const labels = { 'owner.bootstrap': 'Owner setup', 'user.created': 'User created', 'request.approved': 'Request approved',
        'request.rejected': 'Request rejected', 'invitation.issued': 'Invitation prepared', 'invitation.reissued': 'Invitation reissued',
        'user.disabled': 'User disabled', 'user.enabled': 'User enabled', 'user.activated': 'User activated' };
      const actor = record.actorId === identity?._id ? 'You' : references.get(record.actorId) || record.actorId;
      article.append(node('strong', Object.hasOwn(labels, record.action) ? labels[record.action] : record.action),
        node('p', `${time(record.createdAt)} • ${record.outcome}`, 'helper-text'),
        node('p', `By: ${actor}`), node('p', `Reference: ${references.get(record.targetId) || record.targetId}`));
      return article;
    }
    references.set(record._id, `${record.name} (${record.email})`);
    const heading = node('div');
    heading.append(node('strong', record.name), node('span', record.status, 'status-badge'));
    if (adminView === 'users') {
      const status = node('td');
      const badge = node('span', record.status, 'status-badge');
      badge.dataset.status = record.status;
      status.append(badge);
      article.append(node('td', record.name), node('td', record.email), node('td', time(record.createdAt)), status);
    } else article.append(heading, node('p', record.email), node('p', `Created: ${time(record.createdAt)}`, 'helper-text'));
    if (adminView === 'requests' && record.reason) article.append(node('p', record.reason));
    const actions = node('div', undefined, 'admin-record-actions');
    const resource = encodeURIComponent(record._id);
    if (adminView === 'requests' && record.status === 'pending') {
      rowAction(actions, 'Approve', `Approve the account request from ${record.email}? Invitation delivery isn't available yet.`,
        () => api(`/api/admin/requests/${resource}/approve`, body({ confirm: true })));
      rowAction(actions, 'Reject', `Reject the request from ${record.email}? They may request again with rate limits.`,
        () => api(`/api/admin/requests/${resource}/reject`, body({ confirm: true })));
    }
    if (adminView === 'users') {
      if (record.status === 'pending') rowAction(actions, 'Reissue invitation', `Replace the previous invitation for ${record.email}? Delivery isn't available yet.`,
        () => api(`/api/admin/users/${resource}/invitation`, body({ confirm: true })),
        (result) => `New invitation prepared until ${time(result.invitation.expiresAt)} (Philippine time). Delivery isn't available yet.`);
      const enable = record.status === 'disabled';
      rowAction(actions, enable ? 'Enable' : 'Disable', `${enable ? 'Enable' : 'Disable'} ${record.email}? ${enable ? 'An unactivated account will still need an invitation.' : 'Existing sessions and invitations will stop working. Records are preserved.'}`,
        () => api(`/api/admin/users/${resource}/status`, body({ status: enable ? 'active' : 'disabled', confirm: true }, 'PATCH')));
    }
    if (adminView === 'users') { const cell = node('td'); cell.append(actions); article.append(cell); }
    else article.append(actions);
    return article;
  }
  function usersTable(records) {
    const container = node('div', undefined, 'users-table-container');
    container.tabIndex = 0;
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'User accounts; scroll horizontally to see all columns');
    const table = node('table', undefined, 'users-table');
    table.append(node('caption', 'User accounts'));
    const head = node('thead'); const row = node('tr');
    const [sort, order] = $('admin-sort').value.split(':');
    for (const [field, label] of [['name', 'Name'], ['email', 'Email'], ['createdAt', 'Created'], ['status', 'Status'], ['', 'Actions']]) {
      const cell = node('th', label); cell.scope = 'col';
      if (field === sort) cell.setAttribute('aria-sort', order === 'asc' ? 'ascending' : 'descending');
      row.append(cell);
    }
    head.append(row); table.append(head);
    const body = node('tbody'); body.append(...records.map(renderRecord));
    if (!records.length) { const row = node('tr'); const cell = node('td', 'No accounts to show.', 'empty-state'); cell.colSpan = 5; row.append(cell); body.append(row); }
    table.append(body); container.append(table); return container;
  }
  async function loadAdmin() {
    if (identity?.role !== 'admin') return;
    const sequence = ++adminLoad;
    const query = new URLSearchParams({ limit: '25' });
    if (adminView === 'users') { const [sort, order] = $('admin-sort').value.split(':'); query.set('sort', sort); query.set('order', order); }
    if (adminCursors[adminPage]) query.set('after', adminCursors[adminPage]);
    if (adminView !== 'audit' && $('admin-filter').value) query.set('status', $('admin-filter').value);
    $('admin-list').replaceChildren();
    $('admin-list').setAttribute('aria-busy', 'true');
    $('admin-next').disabled = true;
    $('admin-previous').disabled = true;
    try {
      const data = await api(`/api/admin/${adminView}?${query}`);
      if (sequence !== adminLoad || identity?.role !== 'admin') return;
      $('admin-list').replaceChildren(...(adminView === 'users' ? [usersTable(data.items)] : data.items.map(renderRecord)));
      if (!data.items.length && adminView !== 'users') $('admin-list').append(node('p', 'No entries to show.', 'empty-state'));
      adminNext = data.next;
      $('admin-page-label').textContent = `Page ${adminPage + 1}`;
      $('admin-previous').disabled = adminPage === 0;
      $('admin-next').disabled = !adminNext;
    } finally { if (sequence === adminLoad) $('admin-list').setAttribute('aria-busy', 'false'); }
  }
  function selectAdminView(view) {
    adminView = view;
    resetPages();
    $('admin-create-form').hidden = view !== 'users';
    $('admin-filter-label').hidden = view === 'audit';
    $('admin-sort-label').hidden = view !== 'users';
    const statuses = view === 'requests' ? ['pending', 'approved', 'rejected'] : ['pending', 'active', 'disabled'];
    $('admin-filter').replaceChildren(...['', ...statuses].map((status) => {
      const option = node('option', status ? status[0].toUpperCase() + status.slice(1) : 'All statuses'); option.value = status; return option;
    }));
    for (const button of document.querySelectorAll('[data-admin-view]')) {
      if (button.dataset.adminView === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
  }
  async function acceptIdentity(data) {
    clearPrivate();
    identity = data.user;
    csrfToken = data.csrfToken;
    $('session-label').textContent = `${identity.name} • ${identity.role === 'admin' ? 'Admin' : 'User'}`;
    $('logout-button').hidden = false;
    if (activationRoute) { showAuth('activate'); return; }
    $('auth-view').hidden = true;
    if (identity.role === 'user') {
      $('user-workspace').hidden = false;
      $('user-navigation').hidden = false;
      window.dispatchEvent(new Event('pft:user-ready'));
    } else if (identity.role === 'admin') {
      $('admin-workspace').hidden = false;
      selectAdminView('requests');
      try { await loadAdmin(); } catch (failure) { error('admin-error', failure); }
    } else signedOut('This account cannot access a workspace.');
  }
  async function recheck() {
    const response = await transport('/api/auth/me');
    if (response.status === 401) { signedOut(identity ? 'Your session ended. Sign in again.' : ''); return; }
    const data = await (await requireOk(response)).json();
    if (identity?._id !== data.user._id || identity?.role !== data.user.role) await acceptIdentity(data);
    else csrfToken = data.csrfToken;
  }
  async function start() {
    try { await recheck(); }
    catch (failure) { if (failure.name !== 'AbortError') { signedOut(); error('auth-error', failure); } }
  }
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); }
    catch (failure) {
      if (failure.status === 403) { await recheck(); if (!identity) return; }
      throw failure;
    }
    signedOut('Signed out.');
  }

  window.PftSession = { fetch: transport, recheck,
    userGuard() { const epoch = generation; return () => epoch === generation && identity?.role === 'user'; } };
  window.addEventListener('DOMContentLoaded', () => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    activationRoute = fragment.has('activate');
    if (activationRoute) {
      const candidate = fragment.get('activate');
      activationToken = /^[\w-]{43}$/.test(candidate || '') ? candidate : null;
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    bind('login-form', async () => {
      try {
        const data = await api('/api/auth/login', body({ email: $('login-email').value, password: $('login-password').value }));
        await acceptIdentity(data);
      } finally { $('login-password').value = ''; }
    });
    bind('request-account-form', async (form) => {
      const result = await api('/api/account-requests', body({ name: $('request-name').value, email: $('request-email').value, reason: $('request-reason').value }));
      form.reset();
      showAuth('request', result.message);
    });
    bind('activation-form', async () => {
      if (!activationToken) throw new Error('Reopen a valid invitation link.');
      if ($('activation-password').value !== $('activation-confirm').value) throw new Error('Passwords must match.');
      await api('/api/auth/activate', body({ token: activationToken, password: $('activation-password').value }));
      activationToken = null;
      activationRoute = false;
      $('activation-form').reset();
      showAuth('login', 'Account activated. Sign in with your email and new password.');
    });
    bind('admin-create-form', async (form) => {
      const email = $('admin-user-email').value;
      if (!window.confirm(`Create a pending User for ${email}? Invitation delivery isn't available yet.`)) return;
      await api('/api/admin/users', body({ name: $('admin-user-name').value, email, confirm: true }));
      form.reset();
      message('admin-message', 'Pending User created. Invitation delivery is not available yet.');
      resetPages();
      await loadAdmin();
    }, 'admin-error');
    $('logout-button').addEventListener('click', () => { void perform($('logout-button'), logout, identity?.role === 'admin' ? 'admin-error' : 'app-message'); });
    $('show-request-button').addEventListener('click', () => { message('auth-error', ''); showAuth('request'); });
    for (const button of document.querySelectorAll('[data-sign-in]')) button.addEventListener('click', () => {
      activationRoute = false; activationToken = null; $('activation-form').reset(); message('auth-error', '');
      if (identity) void acceptIdentity({ user: identity, csrfToken }); else showAuth();
    });
    for (const button of document.querySelectorAll('[data-admin-view]')) button.addEventListener('click', () => {
      selectAdminView(button.dataset.adminView); message('admin-error', ''); message('admin-message', ''); void loadAdmin().catch((failure) => error('admin-error', failure));
    });
    $('admin-filter').addEventListener('change', () => { resetPages(); void loadAdmin().catch((failure) => error('admin-error', failure)); });
    $('admin-sort').addEventListener('change', () => { resetPages(); void loadAdmin().catch((failure) => error('admin-error', failure)); });
    $('admin-refresh').addEventListener('click', () => { void perform($('admin-refresh'), loadAdmin, 'admin-error'); });
    $('admin-next').addEventListener('click', () => { if (adminNext) { adminCursors[++adminPage] = adminNext; void loadAdmin().catch((failure) => error('admin-error', failure)); } });
    $('admin-previous').addEventListener('click', () => { if (adminPage > 0) { adminPage--; void loadAdmin().catch((failure) => error('admin-error', failure)); } });
    void start();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && identity) void recheck().catch((failure) => error('app-message', failure)); });
  window.addEventListener('pagehide', () => { clearPrivate(); $('auth-view').hidden = true; activationToken = null; });
  window.addEventListener('pageshow', (event) => { if (event.persisted) void start(); });
  window.setInterval(() => { if (identity && document.visibilityState === 'visible') void recheck().catch((failure) => error('app-message', failure)); }, 60000);
})();
