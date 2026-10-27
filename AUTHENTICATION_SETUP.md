# Authentication and private test setup

Phase 3 implementation, October 27, 2026. This is API/session infrastructure and a controlled test bootstrap. Browser login/dashboard, account requests, activation invitations, and email delivery are later phases. No real personal identities or live financial records have been provisioned/migrated by this work.

## Runtime configuration

- Use `npm run dev:test` for local verification. It selects the dedicated test connection and the fixed `pft_test_local` database before importing the app, binds to `127.0.0.1`, and leaves `.env` unchanged.
- Supply a private random `SESSION_SECRET` of at least 32 bytes through the local process environment or privately managed configuration. No runtime default secret is provided. Keep it stable across restarts to preserve sessions. Do not paste it into chat, source, issues, or logs.
- `APP_ORIGIN` must be the exact browser origin, including port, without a path, credentials, query, or fragment. Default for local startup is `http://127.0.0.1:<PORT>` (default port 3000). Use that origin consistently; `localhost` and `127.0.0.1` are distinct origins.
- `NODE_ENV=production` requires an HTTPS origin and Secure cookies. The app does not automatically trust forwarded headers. Vercel/proxy configuration, production rollout, and live provisioning remain separate reviewed work.
- Tests use a synthetic session secret and origin supplied by the test wrapper, never a production secret. The in-memory identity/session adapters live under `tests/` and are explicitly injected; runtime has no memory fallback.

Normal `node server.js` / `npm run dev` still select `MONGODB_URI`, which is live in this workspace. Do not use those commands for verification.

## Controlled test bootstrap

`npm run bootstrap:test -- --target test` reads setup JSON from stdin and validates it without database access. Add `--apply` to provision only on the dedicated test connection, database `pft_test_local`. Other targets, including `live`, are refused. This command does not assign existing financial records to anyone.

Input shape, with placeholders only:

```json
{
  "admin": {
    "email": "<your separate admin email>",
    "name": "<admin display name>",
    "password": "<private password, 12 to 128 characters>"
  },
  "user": {
    "email": "<your personal User email>",
    "name": "<personal display name>",
    "password": "<different private password, 12 to 128 characters>"
  }
}
```

Use a private file outside the repository with access restricted to your OS user. Feed the file through stdin, never inline in shell arguments/history. PowerShell example (replace the path):

```powershell
Get-Content -Raw -LiteralPath 'C:\private\pft.bootstrap.local.json' | npm.cmd run bootstrap:test -- --target test
Get-Content -Raw -LiteralPath 'C:\private\pft.bootstrap.local.json' | npm.cmd run bootstrap:test -- --target test --apply
```

The suffix `*.bootstrap.local.json` is ignored by Git as an additional precaution, but private setup files should stay outside the repo. Protect/remove the plaintext input after provisioning according to your local secret-handling practice. The command prints only success/state and the two identity IDs, never passwords, hashes, emails, session secrets, or connection URIs.

First apply transactionally creates one active Admin, one separate active personal User, a bootstrap marker, and one management audit event. Normalized emails are unique. A partial unique index enforces one Admin. Subsequent applies with the same email pair verify the established identities and preserve their IDs, passwords, roles, names, and disabled state. New input passwords do not reset existing passwords. Conflicting identities, missing markers with existing users, or changed Admin ownership stop bootstrap rather than promoting/replacing anyone.

The command is not password recovery. Password recovery and sole-Admin recovery remain deferred; there is no default/backdoor password or public registration endpoint. Actual private setup has not been performed: only synthetic identities in automatically cleaned temporary databases were created during validation.

If `pft_test_local` contains legacy ownerless records/global month/date indexes, provisioning does not migrate them or bypass the Phase 2 guard. Review the [ownership migration runbook](OWNERSHIP_MIGRATION_RUNBOOK.md) and explicit personal User mapping before enabling those records. Live mapping requires the real identity repository and a separate migration authorization.

## API handshake

| Endpoint | Behavior |
| --- | --- |
| `GET /api/auth/csrf` | Issues an anonymous session and synchronizer token; response is not cached. Keep its cookie. |
| `POST /api/auth/login` | Requires that cookie and `x-csrf-token`, plus email/password JSON. Rotates the session ID and CSRF token on success. |
| `GET /api/auth/me` | Returns the current public identity and token after loading current role/status/version from Mongo. No password hash or revocation metadata is returned. |
| `POST /api/auth/logout` | Requires the current token, destroys this session, and clears its cookie. |
| Business API writes | Require an active User session plus its current `x-csrf-token`. Admin has no finance/planning/Career access. |

Authentication endpoints and business responses use `Cache-Control: no-store`. No password, session ID, or authentication token is placed in localStorage. The browser workspace has not yet been wired to this handshake; Phase 5 supplies login/logout/navigation and token handling. Until then use API tests for end-to-end verification, not an unprotected browser shortcut.

## Session and abuse controls

- Passwords are hashed with Node `crypto.scrypt`, random 16-byte salts, 64-byte derived keys, and fixed `N=131072, r=8, p=1` with an explicit memory bound. Passwords are not trimmed or silently truncated. Verification uses constant-time derived-key comparison; malformed hash parameters are rejected.
- Express sessions are server-side in Mongo through `connect-mongo`, reusing the selected Mongoose client/database. Persisted session identifiers are SHA-256 transformed. Cookies are HttpOnly and SameSite=Strict; production additionally uses Secure. Anonymous sessions last 20 minutes; authenticated sessions have an eight-hour absolute lifetime even if storage expiry is touched.
- Authentication reloads the identity on every protected request. Disabled/deleted users, role changes, revocation-version changes, or absolute expiry invalidate and destroy the session. Re-enabling a User does not resurrect old sessions. Logout destroys only the current session; the internal revocation operation invalidates all that identity's sessions on their next request. Already-running business operations are not rolled back by a later disable.
- CSRF synchronizer tokens and origin/fetch-site checks protect login, logout, and business writes. Login rotation invalidates the anonymous token/session.
- Shared Mongo fixed-window counters limit login to 30 attempts/IP, 20/email, and 10/IP+email per 15-minute window. CSRF-session issuance is limited to 60/IP per 15 minutes. Counter keys are HMAC fingerprints, not raw emails/IPs. Counters and sessions have TTL indexes; expiry/status checks do not rely solely on asynchronous TTL cleanup. Throttled responses include Retry-After.
- Unknown, wrong-password, pending, and disabled logins use the same credential-error response. Infrastructure failures remain generic and do not expose connection details.
- Internal status/revocation helpers are not public management endpoints. Phase 4 must provide audited Admin authorization around management actions before making them available through the UI/API.

## Verification and dependencies

`npm run validate` covers memory and real Mongo authentication, password verification, cookie/session rotation, CSRF/origin denial, private business access, Admin denial, disable/re-enable/revocation/logout, shared counters, atomic/idempotent bootstrap, unique emails/sole Admin, and session persistence across closing/reopening the DB and recreating the app. Additional focused tests cover pending identities, absolute expiry, secure-cookie/proxy behavior, malformed setup, test-only CLI safety, scalar identity filters, and refreshing the session store's client after a DB reconnect.

Dependencies added: `express-session` and `connect-mongo`. The body-parser transitive dependency was updated within its compatible range to address the advisory reported during installation. Production deployment and interactive browser verification remain outstanding.

Implementation references: [Express session middleware](https://expressjs.com/en/resources/middleware/session/) for session rotation, cookies, and server-side stores; [connect-mongo](https://github.com/jdesboeufs/connect-mongo) for shared Mongo session storage; [Node crypto](https://nodejs.org/api/crypto.html) for scrypt and constant-time comparison.
