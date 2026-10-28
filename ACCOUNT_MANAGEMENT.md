# Account requests and activation core

Phase 4 implementation, October 28, 2026. API/service code, in-memory contracts, and real-Mongo integration are verified. After the owner updated Atlas access, full validation passed all 78 tests with no failures or skips. This is not deployment approval.

## Scope and current limitations

- Visitors can request an account. The sole active Admin reviews requests or creates a pending User directly.
- Approval never logs in or activates the recipient. The recipient chooses a password only through a valid activation token.
- Browser forms/dashboard are implemented in Phase 5; see [BROWSER_WORKFLOWS.md](BROWSER_WORKFLOWS.md). Email transport remains the final feature. No real accounts, messages, production data changes, pushes, or deployments were performed during this implementation.
- Activation tokens are not returned by HTTP, included in lists/audit events, or stored as plaintext. Service issuance bundles are private; controlled tests capture them to exercise activation. Normal runtime discards the raw bundle until an approved delivery adapter exists. The API reports `delivery-not-configured`; this does not mean an email was sent. Phase 7 must explicitly reissue pending invitations for delivery.
- There is no manual public token endpoint, automatic registration, password-reset workaround, role-promotion route, or user-deletion route.

## API contract

All routes run behind the existing session middleware and use no-store responses. Obtain the anonymous/current CSRF token as described in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). Every write below requires the correct session cookie, `x-csrf-token`, and origin checks. Admin routes reload the current identity and require active Admin access; ordinary Users cannot call them.

| Method/path | Input / behavior |
| --- | --- |
| `POST /api/account-requests` | Public: `name`, `email`, optional `reason`. Generic HTTP 202 acknowledgment for new, duplicate, and already-registered addresses. No request/User ID or account status is revealed. |
| `POST /api/auth/activate` | Public: `token`, `password` only. Success is `{ activated: true }`; the recipient must log in separately. |
| `GET /api/admin/requests` | Bounded request list; optional `status=pending/approved/rejected`, `limit`, `after`. Includes applicant reason for review. |
| `POST /api/admin/requests/:id/approve` | `{ confirm: true }`. Creates/resolves one pending User and an invitation; returns public profile and invitation metadata, never the token. Repeated approvals are idempotent. |
| `POST /api/admin/requests/:id/reject` | `{ confirm: true }`. Rejects a pending request without creating a User. Approved requests cannot be rejected afterward. |
| `GET /api/admin/users` | User profiles only, excluding Admin from account-status controls. Optional `status=active/pending/disabled`, `limit`, `after`. No financial data, hashes, or session versions. |
| `POST /api/admin/users` | `name`, `email`, `confirm: true`. Creates/invites only a pending User. A pending request for that email must be reviewed instead. An existing pending User is reused without silently rotating its token; active/disabled/Admin email conflicts are rejected. |
| `POST /api/admin/users/:id/invitation` | `{ confirm: true }`. Reissues only for an unactivated pending User. Invalidates the old token; never resets an activated User's password. |
| `PATCH /api/admin/users/:id/status` | `{ status: "active" or "disabled", confirm: true }`. Changes only User access. Unactivated disabled accounts return to `pending` on enable, requiring a fresh invitation. |
| `GET /api/admin/audit` | Bounded management history containing actor/target IDs, action, outcome, and timestamp only. |

Lists return `{ items, next }` with a default page size of 25, maximum 100, and stable ascending ID order. Pass `next` as `after` for the next page. These are not chronological cursors. Unsupported fields, operator objects, invalid filters, caller-selected roles/owners/passwords on management creation, and missing confirmation are rejected.

User lists also accept `sort=name|email|createdAt|status` and `order=asc|desc` (ascending by default). Sorting applies across pages, with ID as the stable tie breaker. Sorted cursors are opaque and bound to the selected sort, direction, and status filter; reset pagination when these change. The browser defaults to newest accounts and provides a compact table with Name, Email, Created, Status, and Actions columns in a horizontally scrollable container.

Names are trimmed, nonblank, at most 80 characters, and reject ASCII control characters. Emails reuse normalized unique identity emails and reject control characters. Optional reasons are bounded to 1,000 characters and stored as plain text. The Phase 5 browser UI renders applicant-controlled text using safe text APIs; real-browser malicious-text checks passed.

## Decisions and defaults

The product owner confirmed on October 28: rejected applicants may submit another request, with rate limits. The implemented rule matches that decision and preserves the rejected record and review history. `createManagementService` isolates the rule through `allowReapply`.

Other technical defaults:

- One pending request per normalized email; duplicate submissions do not overwrite the original reason/name or create duplicate Users.
- Invitations use 32 random bytes, SHA-256 hashes at rest, a 24-hour expiry, and one slot per User. Server-side time/consumption checks apply even before TTL cleanup runs.
- Repeated approval/create calls do not silently reissue. Explicit reissue is required for an expired/lost invitation.
- Disabling revokes sessions by incrementing the existing version and removes any invitation. Re-enabling increments the version again; old sessions/tokens remain invalid. A pending account is not made active without password setup.
- Status no-ops preserve version/state and are audited as unchanged. Admin cannot disable itself or another Admin via these controls.
- Request rejection cannot be reversed by approving the same record; use a new eligible request or a deliberate direct invitation.

## Atomicity, privacy, and abuse controls

The service performs management work through a restricted transaction interface covering only identities, requests, invitations, and management audit events. Mongo runs the state change and audit write in the same transaction. An audit failure aborts approval, creation, status changes, invitation rotation, or password setup; it must not leave a successful unaudited access change.

Approval rechecks active Admin authority in the transaction. Unique normalized emails, a partial unique pending-request index, and transaction retries prevent concurrent first submissions/approvals from creating duplicate accounts. Tokens are generated inside the transaction callback and handed to trusted code only after commit. Single-use activation rechecks the token, expiry, User role/status, and consumption in the transaction after password hashing; concurrent consumption has one winner.

Audit events include creation, request approval/rejection, invitation issue/reissue, enable/disable, and activation. They exclude email addresses, applicant reasons, private finance/Career content, raw tokens, token hashes, passwords/hashes, session IDs, and credentials. Failed transactions produce no successful audit entry; unauthorized/invalid attempts are rejected without changing access. Public clients cannot choose audit fields.

Shared Mongo throttles additionally limit requests to 10/IP per 15 minutes and 3/email per day; activation to 20/IP and 10/token per 15 minutes; management writes to 60/Admin per 15 minutes; invitation reissue to 5/User per hour. Keys use the existing HMAC fingerprints. Limits apply to duplicate/known addresses too; 429 responses include Retry-After. Existing CSRF-issuance and login limits still apply.

## Verification and next work

`tests/management-contract.js` is shared between the in-memory transaction adapter and Mongo integration test. It covers request privacy/deduplication, concurrent approval and activation, expired/reissued/replayed tokens, pending/disabled access, preserved finance records, Admin/User separation, input injection, pagination, explicit confirmation, reapplication, throttling, secret-free responses/audits, and simulated audit failures with rollback. Focused tests cover bounded input and a forged invitation referencing Admin. The Mongo test also verifies unique indexes, hash-only persistence, and reconnect behavior.

Initially, test-cluster TLS alerts blocked Mongo checks; a unit-only run passed 73 tests and explicitly skipped five Mongo checks. The owner then updated Atlas access. The subsequent `npm.cmd run validate` passed all 78 tests with zero failures/skips, including management concurrency, audit rollback, hash-only token persistence, reconnect, ownership/migration, restart persistence, and temporary-database cleanup. Lint passed. The assistant did not change credentials, TLS/network settings, actual `.env`, or production data.

Phase 5 browser workflows and local Phase 6 verification are now complete; see [BROWSER_WORKFLOWS.md](BROWSER_WORKFLOWS.md). Next is the Phase 7 email-provider/sender decision; Google sign-in, password recovery, additional Admins, permanent deletion, live migration, and deployment remain outside this phase.
