# Admin and User implementation plan

Date: October 26, 2026 (Asia/Manila)

Status: Phases 1-6 implemented/locally verified through October 28, including Phase 5 browser workflows and Phase 6 API/Mongo/real-browser checks. Email delivery, real private setup, live migration, and deployment remain pending. This document tracks the scope agreed in the Q&A. It does not authorize a production migration, push, or deployment.

## 1. Agreed product decisions

| Topic | Decision |
| --- | --- |
| Audience | Invited people and potentially external clients. |
| Enrollment | Admin creates accounts, or applicants request an account for admin approval/rejection. No automatic public registration. |
| Request fields | Name, email, and optional reason. Password is chosen after approval. |
| Login | Email and password. Google sign-in is future work. |
| Roles | One Admin, owned by the product owner, and ordinary Users. |
| Admin workspace | Management only; no personal finance/Career workspace on the Admin identity. |
| Personal workspace | The product owner has a separate User identity that owns existing records. |
| Privacy | Users access only their own finance, planning, and Career records. Admin cannot inspect or edit those records. |
| Admin capabilities | List users, create/invite users, review requests, disable/enable users, and inspect management audit events. |
| Other administrators | No promotion UI or public role assignment. Only the product owner is Admin. |
| Disable | Immediately revoke sessions, block login, preserve records. Re-enabling does not restore revoked sessions. |
| Delete | No permanent user deletion in this version. |
| Password recovery | Deferred; document the limitation. No reset endpoints or admin-selected replacement passwords in this phase. |
| Delivery | Email invitations/activation links, implemented as the final feature. |
| Runtime | Localhost initially. Vercel deployment is future work. |
| Databases | `MONGODB_URI_TEST` for verification; `MONGODB_URI` is live and must not be used for development/tests. |

Use separate login emails for the Admin and personal User identities. Actual addresses and bootstrap credentials are supplied privately when provisioning; they do not belong in this document.

## 2. Documentation and scope alignment

- [PRD_v2.md](PRD_v2.md) currently describes a single-user product and excludes authentication. Before implementing authentication, add a scoped product addendum reflecting the decisions above and cross-link this plan. Preserve unrelated financial requirements.
- [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md) already outlines future authentication, ownership, and RBAC. Its suggested ability for admins to use personal finance features is superseded for this phase by the separate User identity decision.
- Existing stabilization work remains in scope for preservation, including account validation, Philippine dates, centavo arithmetic, and separate actual transactions/planning values.
- Keep Node/Express, MongoDB/Mongoose, and the vanilla browser UI. No framework migration or unrelated rewrite.

## 3. Permission boundaries

| Operation | Visitor | User | Admin |
| --- | --- | --- | --- |
| Request an account | Yes, subject to abuse controls | Not needed | Not needed |
| Activate an invited account | With a valid activation token | Not needed | Controlled bootstrap only |
| Log in/out | Login available | Yes | Yes |
| Finance, planning, reports, Career | No | Own records only | No |
| Review/create/manage users | No | No | Yes |
| View another person's private records | No | No | No |
| Change roles or delete users | No | No | No web capability |

Enforce permissions on the server. Hiding navigation is only presentation. Reject caller-supplied role and owner fields; derive the current identity from the session. Return a consistent not-found response for resources outside a User's ownership.

## 4. Planned records and lifecycle

### Identity and session

- Identity: normalized unique email, display name, role, pending/active/disabled status, password hash, timestamps, and a session-revocation marker/version.
- Never store plaintext passwords or expose hashes in API responses, audit events, or logs.
- Prefer server-managed sessions with a Mongo-backed store. Use HttpOnly cookies, suitable SameSite settings, and Secure cookies over HTTPS in deployment. Localhost cookie configuration must be deliberate.
- Rotate sessions on login, invalidate on logout, check account status/revocation on protected requests, and apply CSRF protection to state-changing browser operations.
- Add login/request throttling and generic public responses that do not disclose whether an email is registered or disabled.
- Verify maintained library choices and their current documentation during implementation; do not freeze package versions in this plan.

### Account requests

- Persist name, normalized email, optional reason, pending/approved/rejected status, timestamps, and reviewing Admin reference.
- Validate field types and lengths. Limit repeated pending requests and public submission rates without disclosing membership.
- Approval creates or resolves exactly one pending User and one activation workflow. Repeated/concurrent approvals must not create duplicate accounts or duplicate valid invitations.
- Rejection grants no access. No rejection email is required in this version.
- Escape applicant-provided text in the Admin UI.

### Activation invitations

- Admin-created and approved accounts start pending; they cannot log in or access private data before activation.
- Generate cryptographically random, expiring, single-use tokens; store only token hashes with intended User, purpose, expiry, and consumption state.
- The recipient chooses their password after presenting a valid token. Ignore/reject any submitted role or ownership assignment.
- Reissue invalidates prior tokens. Disabled accounts cannot activate. Consuming a token and enabling the User must be atomic or equivalently protected against concurrent replay.
- Email transport is added last. Until then, test activation through controlled test fixtures; do not publish temporary registration or password-setting shortcuts.

### Admin audit events

- Record actor, target identity/request, action, outcome, timestamp, and minimal management metadata for requests reviewed, invitations issued/reissued, account creation, and disable/enable actions.
- Record initial Admin provisioning; later role-changing mechanisms remain outside the web API.
- Exclude passwords, raw tokens, sessions, credentials, applicant reasons, and finance/Career content. Do not place secrets in log URLs.
- Users cannot read audit events. Admin can inspect management history without retrieving private business records.
- Coordinate management state and audit writes so failures do not silently leave successful access changes unaudited.

## 5. Implementation order

### Phase 1: scope alignment and safe test setup

- [x] Add the scoped PRD addendum and align future-integration documentation.
- [x] Inventory every API route, repository operation, report, resource, and singleton/unique index that needs ownership. See [ADMIN_USER_OWNERSHIP_INVENTORY.md](ADMIN_USER_OWNERSHIP_INVENTORY.md).
- [x] Add isolated multi-user test fixtures: Admin, User A, User B, pending User, disabled User. These are test descriptions only; identities are not yet persisted or authenticated.
- [x] Provide a deliberate localhost test-server configuration that selects only the test database without editing `.env` or falling back to live configuration. Commands: `npm run dev:test`, `npm test`, and explicit `npm run test:unit`.
- [x] Resolve the current test-cluster connectivity failure before declaring real-Mongo checks complete. October 27 final network-enabled validation passed all 57 tests, including restart persistence and temporary-database cleanup; no connection credentials or live configuration changed. The localhost test server passed readiness, health, and UI-shell HTTP checks and was stopped afterward.

### Phase 2: ownership and existing-data migration

- [x] Add immutable `userId` to accounts, transactions, budgets, reserves, daily overrides, and all Career record types.
- [x] Scope reads, writes, deletes, aggregates, report queries, upserts, and account balance calculations by trusted owner. The server resolver is fail-closed until Phase 3 implements authenticated sessions; tests inject explicit server-side identities.
- [x] Verify referenced accounts belong to the same User on transaction creation and reassignment.
- [x] Replace global uniqueness/singleton assumptions with owner-scoped indexes and behavior, including budget month, daily override date, and probation records. Legacy-index removal is an explicit migration step, never implicit startup cleanup.
- [x] Apply matching ownership behavior to Mongo and the memory test adapter.
- [x] Prepare an explicit-owner, idempotent test-only migration with dry run, counts, orphan-reference detection, index handling, snapshot backup, and rollback instructions. See [OWNERSHIP_MIGRATION_RUNBOOK.md](OWNERSHIP_MIGRATION_RUNBOOK.md); live execution and durable production backup remain a separate gate.
- [x] Rehearse on isolated representative test data; verify balances, important reports, history, planning, and Career records before/after. October 27 validation: 67 passed, zero failures/skips, including Mongo isolation/reconnect, index uniqueness, migration/rollback/drift checks, restart persistence, and temporary-database cleanup.

The live migration assigns legacy data to the owner's personal User identity, never the Admin. Do not expose ownerless records or enable multi-user access during a partially completed migration. Schedule migration with writes stopped. A live migration requires a separately reviewed concrete execution step; this plan does not run it.

### Phase 3: authentication and single-Admin provisioning

- [x] Implement and verify provisioning of exactly one Admin and a distinct personal User through a controlled, rerunnable test bootstrap command. Synthetic setup was tested in temporary databases; the owner's real private account setup has not been run.
- [x] Require explicit test target and identities via private stdin; no default password or automatic ownership guessing. Live bootstrap is not implemented/authorized by this command.
- [x] Implement scrypt password hashing, Mongo session storage, login, logout, and current-session identity lookup. See [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md).
- [x] Add CSRF/origin checks, session rotation/absolute expiry/revocation, and shared Mongo login/CSRF-issuance throttles.
- [x] Require authentication throughout private APIs; require the User role for finance/planning/Career APIs.
- [x] Enforce current status/role/version server-side, including on requests from existing sessions. Disabling/re-enabling does not revive old sessions; audited management endpoints come in Phase 4.

Phases 2 and 3 are a combined release gate: neither may be enabled for real users without the other. Avoid an intermediate release that adds login but leaves unscoped routes accessible.

### Phase 4: account management and activation core

- [x] Add public request submission and generic acknowledgments.
- [x] Add Admin request listing, approval/rejection, direct pending User creation, User listing, and management audit listing.
- [x] Build activation-token issuance, 24-hour expiry, reissue, atomic single-use consumption, and password setup without email transport. No raw token is returned through HTTP; controlled tests capture private service issuance bundles.
- [x] Implement disable/enable, session-version revocation, invitation invalidation, and audit writes coordinated transactionally with state changes.
- [x] Prevent Admin creation/promotion through requests, invitations, activation, or User management APIs.
- [x] Keep the sole Admin out of User lists/status controls and reject Admin targets at the service boundary.
- [x] Complete Phase 4 real-Mongo concurrency/atomicity/persistence verification and temporary-database cleanup. After the owner updated Atlas access, full validation passed all 78 tests with no failures or skips; see [ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md).

Reapplication decision confirmed October 28: allow another request after rejection, with rate limits and preserved review history. Implementation already matches. The owner updated Atlas access, and Mongo verification now passes.

### Phase 5: browser workflows

- [x] Add login, account request, and token-based password setup screens.
- [x] Show the finance workspace only for authenticated Users; show a separate management dashboard only for Admin.
- [x] Add request review, User creation, status management, and management audit history with filters/pagination and safe text rendering.
- [x] Confirm access-changing actions and display failure states without duplicate submissions or automatic write replay.
- [x] Clear private content when sessions end; handle expired/disabled sessions, cross-account switching, delayed responses, and back/forward caching.
- [x] State that password recovery and invitation delivery are unavailable; no functioning-looking reset/token-copy workaround. See [BROWSER_WORKFLOWS.md](BROWSER_WORKFLOWS.md).

### Phase 6: verification before email integration

- [x] Test no cross-user access through IDs, filters, account reassignment, reports, aggregates, and every Career endpoint.
- [x] Test visitors cannot access private routes and Users cannot access management routes.
- [x] Test Admin cannot access finance/Career APIs, even when given a valid User resource ID.
- [x] Test role/owner injection, rejected/pending access, disabled-session revocation, logout, and CSRF failures.
- [x] Test duplicate requests, concurrent approvals, unique normalized emails, token expiry/replay/reissue, and failed audit writes.
- [x] Verify migration reruns, ownership/index integrity, Mongo restart persistence, and financial/date regressions using the isolated test connection.
- [x] Run real browser journeys for both roles and two distinct Users: headless Edge with native Mongo, including privacy races, UI failure handling, and mobile layout checks.
- [x] Run lint and full validation: 78 passed, zero failures/skips; separate real-browser journey and cleanup passed. Production dependency audit is clear. No deployment approval is implied.

### Phase 7: email delivery — final feature

- [ ] Choose an email provider and sender after the core workflows pass. Provider, sender identity, cost limits, and delivery credentials are decisions to obtain at this stage.
- [ ] Email approved/admin-created Users their activation link; add an Admin reissue/retry action with rate limits and audit events.
- [ ] Build links from an explicit configured application origin, never an untrusted request Host header.
- [ ] Keep failed sends pending and visible to Admin. Email failure must not activate accounts or undo an approved decision.
- [ ] Treat delivery retries distinctly from token reissue: ordinary retries must not unexpectedly invalidate a delivered link.
- [ ] Use fake email delivery for automated tests and controlled recipient addresses for delivery smoke tests.
- [ ] Verify email delivery, expired/reissued links, activation, login, rejection, and disable/enable end to end.

Localhost links work only where that localhost app is reachable. External client onboarding waits for a reachable protected deployment; email delivery alone does not make the app remotely accessible.

## 6. Completion and release boundaries

This feature is complete locally when both roles work, all owned data is isolated, migration rehearsal preserves results, account requests/activation work, audit events are verified, final email delivery is tested, and real-Mongo plus browser checks pass.

Vercel hosting remains future deployment work. Before deploying, verify production session cookies and HTTPS, CSRF/origin rules, stable secrets, shared session/rate-limit state across instances, database connection behavior, email delivery, and persistence across redeployments. Do not rely on process memory for authorization, sessions, tokens, or abuse controls.

No production database access, migration, credential changes, push, or deployment is performed by writing this plan.

## 7. Deferred work and later decisions

- Google sign-in, including safe linking to existing email/password identities.
- Password recovery/reset and a reviewed sole-Admin recovery procedure. Until designed, loss of credentials has no self-service recovery path.
- Additional Admins, role delegation, shared workspaces, and support access to private records.
- Permanent deletion, retention policy, and request/audit-record retention periods. Decide retention before a public client launch.
- Vercel deployment and any production rollout.

Next: obtain Phase 7 email provider/sender/cost/credential decisions before implementing the final delivery feature. Real private setup and live migration remain separate; keep changes local until requested otherwise and do not deploy before the release gates pass.
