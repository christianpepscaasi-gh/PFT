// Test-only identity descriptions, not credentials, sessions, or an authorization bypass.
// Future authentication/ownership tests will seed these through the identity repository.
function createIdentityFixtures() {
  return {
    admin: { _id: 'fixture-admin', email: 'admin@example.test', name: 'Admin', role: 'admin', status: 'active' },
    userA: { _id: 'fixture-user-a', email: 'user-a@example.test', name: 'User A', role: 'user', status: 'active' },
    userB: { _id: 'fixture-user-b', email: 'user-b@example.test', name: 'User B', role: 'user', status: 'active' },
    pending: { _id: 'fixture-pending', email: 'pending@example.test', name: 'Pending User', role: 'user', status: 'pending' },
    disabled: { _id: 'fixture-disabled', email: 'disabled@example.test', name: 'Disabled User', role: 'user', status: 'disabled' }
  };
}

module.exports = { createIdentityFixtures };
