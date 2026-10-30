# PFT working memory

Last updated: **October 30, 2026, Asia/Manila**.

## October 30: Production seed authorized; distinct emails still needed

- User explicitly requested: seed the main production database and commit our changes. This authorizes the paired Admin/personal User bootstrap once credentials/target validate; no deployment or GitHub push was requested. User confirmed both identities and Admin visibility of accounts/statuses only.
- After user saved corrected passwords, the latest dry run passed password checks but refused identical normalized Admin/User email addresses. Asked user to save distinct emails and retry, or seed later. No database connection or production writes occurred; no credential values were printed. Never weaken validation or change chosen credentials automatically.
- Final full dedicated-Mongo validation: **85 passed, zero failures/skips**, including proxy/session, bootstrap safeguards, retained-seed CLI guards, and all native Mongo checks. Prior real Edge and retained test-seed rerun passed. All private credential files are ignored and untracked. Authorized code/documentation commits proceed while production provisioning remains pending.
- Implementation committed locally as `8046416`; documentation handoff is a separate commit. No GitHub push requested or performed.
- Next when user updates credentials: rerun production dry run, inspect its named database/scope, use the exact `--database NAME --apply` target for the already-authorized bootstrap, verify only identity/bootstrap/audit results, and leave business ownership migration/deployment untouched. Do not mistake a failed dry run for production seeding.

## October 30: Production identity bootstrap prepared, not applied

- User requested seeding the main database using `.env.account` fields `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Added explicit `.env.account` Git ignore protection before accessing configuration; file was untracked, not committed. Added safe `.env.account.example` with Admin and separate personal User fields and optional display names. Actual credential file was not edited or printed.
- Asked user to confirm adding `USER_EMAIL` and `USER_PASSWORD` for the previously agreed separate personal User identity. Production command requires both identities; do not silently change the sole-Admin/private-User design while awaiting this answer.
- Added `bootstrap:production` script and pure validation helpers. Default `--target production` is a no-connection/no-write dry run; apply requires `--target production --database NAME --apply` with exact match to the named non-test/non-system Mongo target. Reads only private account-file values and server-side main connection configuration; never imports the web server. Uses existing atomic bootstrap, auth indexes, hashed passwords, single Admin, and setup audit; no resets, business data, ownership migration, or email.
- Ran actual dry run: **stopped safely before Mongo connection**, reporting empty/missing `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD` by field names only. No live database read/write occurred. Next: user fills private credentials/answers paired-identity question; rerun configuration dry run and review the exact database/scope before live apply. No current production provisioning has happened.
- Lint plus four focused tests passed: secret-free validation, explicit target/CLI safety, hashed identities, dry-run/no-write behavior, preserved passwords/roles on rerun, and conflicting identity refusal. Existing native Mongo bootstrap contract was verified in the earlier 80/80 full run; these four new tests were run separately. Documented command and release boundaries in authentication setup. No commit/push/deployment.

## October 30: Retained test seed and role verification

- User authorized creating test-database seed data and checking User actions/Admin visibility. Asked whether Admin visibility means accounts/statuses; preserved the previously agreed privacy policy while checking independent work. No expanded Admin finance/Career access was implemented.
- Added `npm run seed:test -- --target test --apply` (`scripts/seed-test.js`). Uses dedicated safe test wrapper and retains records only in `pft_test_local`; refuses unsupported/live/reset CLI targets, conflicting existing identities, and password resets. Generates random Admin/User credentials in gitignored `test-seed.bootstrap.local.json`; never prints passwords, secrets, or connection strings.
- Initial apply passed: Demo Admin/User, User-owned PHP 5,000 Cash wallet, PHP 150 expense, and private Career journal retained. Real authenticated API checks passed for User create/read/edit/delete, Admin visibility of active User, Admin finance/Career 403, and User Admin-route 403. Temporary CRUD verification record deleted; both check sessions logged out.
- Repeated apply also passed, reusing the saved credentials and existing named sample records without resets.
- Latest real Edge journey passed against its separate disposable Mongo database; cleanup passed. Lint and six configuration/seed CLI safety checks passed. Prior full suite this session: 80/80; newly added CLI test was verified separately.
- Usage documented in `TEST_SEED.md` and README. `dev:test` startup message now points to browser sign-in. No real `.env` edits, live data access, email, deployment, commit, or push. Use local private file for manual logins; never expose those credentials in chat or source.

## October 30: Atlas access restored; full proxy validation passed

- User added the development IP and requested a retry. `npm.cmd run validate` now **PASS: 80 tests, zero failures/skips**, including the new proxy/HTTPS session tests and all native Mongo auth, management, isolation/migration, and restart checks. Temporary test databases cleaned up successfully.
- Earlier October 30 Atlas connection failure below is historical; it is no longer the current blocker. Only the dedicated test connection was used. No live access, deployment, commit, or push.
- Next: prepare the protected synthetic-data Vercel Preview configuration and obtain concrete deployment authorization before publishing; hosted HTTPS/proxy/runtime/persistence evidence is still pending.

## October 30: Explicit Vercel proxy/session configuration

- User authorized implementing the production session/proxy preparation. Added `src/config/proxy.js`: `PROXY_MODE=direct` by default; explicit `vercel` mode requires platform `VERCEL=1` and Node production mode and trusts only the immediate proxy hop. Unknown/unsupported modes fail startup. Policy is selected from server configuration, never request headers.
- `createApp` accepts an injected runtime environment and uses it consistently for proxy policy, default database selection, and Mongo authentication. Test wrappers force direct mode, including local test-server runs.
- Expanded HTTPS tests: default mode ignores spoofed forwarded protocol/IP; configured mode issues Secure/HttpOnly/SameSite cookies, respects nearest-hop IP, retains origin/CSRF denial, rotates the session on login, supports authenticated requests, and invalidates it on logout. Added inherited proxy-mode isolation assertions.
- Verification: lint and whitespace checks passed. Unit-only suite: **75 passed, zero failed, 5 explicit Mongo skips (80 total)**. Full validation was attempted, but dedicated Atlas cluster connection/server selection failed; new proxy/session tests passed within that run. Asked user to check cluster status/current development IP allowlist. Do not claim current full Mongo validation passed or weaken TLS/network controls. Prior October 28 all-green results remain historical.
- Removed our ignored temporary `artifacts/browser/table-preview.cjs` leftover, which lint picked up; screenshots remain. Updated `.env.example`, authentication setup, Vercel checklist/current gate; actual `.env` unchanged. Consulted official Vercel request-header and Express proxy documentation.
- Hosting assumption: direct Vercel ingress with platform-managed headers; additional upstream/custom Enterprise proxies require review. Local simulation is not actual hosted verification. Next: restore test-cluster access, rerun full validation, then prepare the protected synthetic-data Preview and verify HTTPS cookies, client IP throttles, runtime/connection behavior, and redeploy persistence. No deploy, live provisioning/migration, commit or push authorized this turn.

## October 28: End-of-session handoff

- User explicitly authorized grouping today's work into task-based commits and pushing to `main`. This authorizes the current wrap-up, not a deployment or future pushes.
- Prepared four groups: account-management/activation APIs and tests; session-aware User/Admin UI including compact sorted Users table; Edge browser verification tooling and compatible dependency patch; documentation and Vercel readiness notes.
- Created task commits `379401a` (management APIs), `f41e40d` (User/Admin UI), and `65812bd` (browser verification). The final documentation commit contains this handoff; the wrap-up targets `origin/main` with a normal, non-force push.
- Latest code verification remains 78/78 tests plus the real Edge journey, including Mongo sorting/pagination and mobile table behavior. Documentation edits passed whitespace review. `.env`, generated screenshots, and local preview fixtures remain excluded.
- Resume after work or tomorrow with `VERCEL_READINESS.md`: Vercel runtime/proxy/session preparation, then a protected synthetic-data Preview after explicit deployment authorization. Email stays the last onboarding feature; no production deployment, real provisioning, or live migration has occurred.

## October 28: Vercel readiness assessment

- User requested readiness advice and notes, not deployment. Verdict: no production with real data yet; prepare a protected synthetic-data Preview next. Added `VERCEL_READINESS.md` with ordered runtime/proxy/session, isolated Preview, hosted verification, email, real provisioning/migration, and release steps.
- Confirmed exported Express entry and public assets; no Express trusted-proxy setting exists. Secure production cookies and exact HTTPS origin need hosted validation. No Vercel deployment evidence exists.
- Corrected outdated section 63 claims that authentication/ownership were absent. Current local 78-test and Edge evidence remains valid; no tests rerun for documentation-only edits. Consulted official Vercel Express/pool guidance. No deploy, credential changes, provisioning, live access, commit or push.

## October 28: Compact Admin Users table

- Replaced User cards with compact table rows inside a separate scrollable container: Name, Email, Created, Status, Actions. Added sort-by controls, status colors, and confirmed reissue/disable/enable actions. Mobile scrolling stays inside the table.
- User API sorting applies across pages using validated field/direction and stable ID tie breakers. Opaque sorted cursors bind to sort/direction/status; existing unsorted ID pagination remains compatible.
- Expanded shared memory/Mongo management checks for all sort fields/directions, complete pagination, and mismatched cursor rejection. Browser checks cover table headers, name sorting, and mobile overflow.
- Final `npm.cmd run validate`: 78 passed, zero failures/skips. Final `npm.cmd run test:browser`: one real Edge journey passed; test database cleanup passed. Initial restricted-network attempts hit DNS timeouts; network-enabled checks passed. Updated `artifacts/browser/admin-desktop.png` and added `users-mobile.png` (ignored synthetic fixtures). An additional local memory-fixture Edge preview also passed.
- Documentation updated; changes remain local. Email delivery still deferred.

## October 28: Phase 5 browser workflows and Phase 6 local verification complete

- User requested proceeding with the browser UI. Added `public/session-ui.js`, sign-in/request/activation forms, separate Admin dashboard, private initial HTML visibility, and styling consistent with the existing app. No frontend framework or bitmap assets added.
- User identity alone triggers ledger/Career loading; Admin loads only management. Existing financial writes now share automatic CSRF transport. Admin has request review, pending creation, disable/enable/reissue, safe applicant text rendering, status filters, cursor pagination, and audit history. Access changes confirm first; failures retain inputs/restore controls without automatic write replay.
- Activation enters through `/#activate=<token>`, removes the fragment into private memory, requires matching passwords, and returns to login after success. Existing signed-in people must sign out first. No token-copy shortcut, email transport, password reset, or public bypass was introduced.
- Session handling clears forms, lists, balances, selectors, editing caches, warning state, Admin data, and dialogs on logout/loss/change. It checks visibility/60-second active-page intervals, cancels pending fetches, guards parsed responses and financial renders by generation, and clears before BFCache restoration. Logout handles already-removed server sessions without a stale-CSRF loop. No Web Storage is used for authentication/private state.
- Added dev-only `playwright-core`, safe `scripts/run-browser-tests.js`, `npm run test:browser`, and `tests/browser/session.test.js`. It uses installed headless Edge (or explicit `PFT_BROWSER_EXECUTABLE`), synthetic identities, an isolated random test database, and cleanup. It does not use the real browser profile or modify `.env`.
- Final `npm.cmd run validate`: **PASS, 78 tests, zero failures/skips**. Final `npm.cmd run test:browser`: **PASS**, one real end-to-end journey spanning both roles/two Users, finance create/edit/delete/archive with confirmations, Career writes, failed saves/actions, requests/approval/rejection, password setup, XSS text rendering, User management, pagination/filter reset, disable/re-enable, logout/expiry, delayed-response/account-switch privacy, and mobile overflow checks. No uncaught browser JS errors; test DB cleanup passed.
- A timing-sensitive expiry assertion initially attempted to click an already-hidden Sign out button after automatic expiry cleanup. Corrected the test to accept either valid cleanup path while still asserting login visibility and no private DOM content. No product checks were skipped or weakened.
- Inspected synthetic desktop/mobile screenshots under ignored `artifacts/browser/`. [BROWSER_WORKFLOWS.md](BROWSER_WORKFLOWS.md) records usage/evidence. The default API suite remains portable; real-browser verification is an explicit command requiring installed Edge/Chromium and the dedicated test connection.
- Installation surfaced a transitive `qs` advisory; applied its compatible patch. Final `npm.cmd audit --omit=dev --json`: **zero known vulnerabilities**.
- No real private account setup, production access/migration, email sends, commit, push, or deployment. Phase 4-6 changes remain local and uncommitted; no standing push permission exists.
- Next: Phase 7 email provider/sender/domain/cost/credential decisions before implementing delivery. Google sign-in/password recovery stay deferred. Do not send real test email without recipient authorization or treat local verification as production rollout approval.

## October 28: Atlas access restored; Phase 4 verified

- User reported adding the development IP to Atlas access and requested another database check.
- Reran `npm.cmd run validate` with network access using the existing safe dedicated-test wrapper. **PASS: 78 tests, zero failures or skips**, including Mongo authentication/sessions, Phase 4 concurrent requests/approvals/activation, atomic audit rollback, token privacy/indexes, reconnect, ownership/migration, restart persistence, and successful temporary-database cleanup.
- Earlier TLS failures below are historical and are no longer the current blocker. Updated the plan, management guide, and related status docs accordingly. No code fixes were needed during this retry.
- No assistant changes to network/TLS settings, credentials, `.env`, production data, real provisioning, commits, pushes, or deployment.
- Next: Phase 5 browser login/request/activation forms and separate Admin dashboard with CSRF handling and session-aware navigation. Email stays last; Google sign-in/password recovery remain deferred.

## October 28: Phase 4 APIs implemented; Mongo verification blocked

- User requested implementing Phase 4. Added `src/auth/management.js`, `management-repository.js`, and `management-routes.js`, wired through the existing session middleware before the User-only business boundary. See [ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md) for ten new request/activation/Admin routes and their contracts.
- Implemented generic public account requests, one pending request per normalized email, Admin lists/review, direct pending User creation, private invitation issuance/reissue, single-use password setup, confirmed enable/disable, and management audit listing. Admin authority is checked inside transactions; no finance/Career collections are queried by management.
- Tokens use 32 random bytes, hash-only persistence, 24-hour expiry, consumption guards, and per-User invitation slots. HTTP never returns tokens/hashes. Controlled test wrappers capture committed private service issuance bundles; runtime discards them until the later delivery adapter exists. No public/manual token bypass or email transport was added.
- State changes and required audit writes share Mongo transactions. Tests simulate audit failure during approval, User creation, invitation rotation, activation, and disable; the in-memory transaction contract proves rollback. Re-enabling an unactivated User returns pending; old sessions/tokens do not revive. Repeated creation cannot silently replace a missing invitation; explicit reissue is required. Unknown lifecycle states fail closed for review.
- Added shared `tests/management-contract.js`, focused unit tests, a real-Mongo contract with unique-index/hash-persistence/reconnect checks, and a serialized snapshot/rollback adapter under `tests/auth-helper.js`. All use synthetic identities/data.
- Reapplication decision subsequently confirmed by the user on October 28: allow another request after rejection, with rate limits. Implementation already matches and preserves review history; isolated as `allowReapply` in the service.
- Current unit-only result: **73 passed, zero failures, five explicitly skipped Mongo checks (78 total)**. Final focused management result: four passed after the invitation-idempotence refinement. Lint and `git diff --check` passed.
- Full `npm.cmd run validate` failed five Mongo checks, including existing auth/ownership/migration/restart checks, on test-cluster server selection. A separate network-enabled read-only driver ping reported `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` on all three test nodes. Mongo correctness/concurrency/persistence and temporary-database cleanup are **not verified for Phase 4**. Do not mark this a full pass or bypass TLS/network controls.
- User replied that they will check the test cluster's Atlas access. This is not confirmation that access is fixed: wait for an update before retrying the unchanged failing connection. Credentials, network/TLS settings, actual `.env`, and production data were not changed. No real users provisioned, messages sent, browser UI work, commit, push, or deployment.
- Next: after test access is restored, rerun `npm.cmd run validate` and fix any actual Mongo contract failures; then proceed to Phase 5 browser login/request/activation and separate Admin dashboard/CSRF handling. Email remains last; Google sign-in/password recovery remain deferred.

## October 27: end-of-day commit/push handoff

- User explicitly authorized documenting, committing, and pushing today's Admin/User work to GitHub. This permission is for this operation only; no deployment or standing future push authorization.
- Included scope: Phases 1-3 documentation, isolated test tooling, owner-scoped persistence, test-only migration rehearsal/runbook, authentication/session infrastructure, private test bootstrap, regressions, and the compatible dependency security patch.
- Validation: full suite 73 passed with no failures/skips; focused Mongo authentication/filter/reconnect checks, lint, configuration checks, and whitespace checks subsequently passed. Production dependency audit reported zero known vulnerabilities.
- Resume with **Phase 4 account requests, approval/rejection, pending Users, activation-token core, and audited management endpoints**. Browser login/dashboard remains Phase 5; email delivery remains last. Real personal provisioning, live migration, browser verification, and deployment have not occurred.
- The commit/push is being finalized for this handoff; verify its resulting hash and remote status in Git. Earlier sections' uncommitted-status statements describe their original checkpoints.

## October 27: Admin/User Phase 3 implementation complete

- User requested continuing. Added `src/auth/` password hashing, bootstrap validation/service, Mongo identity repository, and session/authentication middleware. Added `express-session` and `connect-mongo`; Node scrypt uses independent salts and fixed bounded parameters. Auth sessions reuse the selected Mongo client, refresh their delegate after client replacement, and store transformed session IDs.
- Added `/api/auth/csrf`, `/login`, `/me`, `/logout`. Real session identity resolution is now the default when `SESSION_SECRET` is configured. Business routes continue requiring an active User, reject Admin finance access, and require CSRF on writes. Explicit trusted identity injection remains a test factory capability, not a network impersonation mechanism.
- Login rotates session ID/token, uses generic credential errors, checks current status/role/version, and applies shared Mongo throttles. Expiry, deletion, disable/re-enable, role changes, revocation, and logout invalidate sessions as tested. Cookies are HttpOnly/SameSite=Strict; production additionally requires Secure/HTTPS. Trusting proxy headers is not automatic and remains a deployment decision.
- Added `scripts/bootstrap-test.js` / `npm run bootstrap:test -- --target test [--apply]`. Private JSON arrives via stdin; default is offline input-only dry run. Apply selects only the dedicated test connection and `pft_test_local`, transactionally creates the sole Admin and separate personal User, bootstrap marker, and audit event. Reruns preserve IDs/passwords/roles/names/status; live targets are refused. No finance ownership migration is triggered.
- Added `.gitignore` protection for `*.bootstrap.local.json`, configuration comments in `.env.example`, and [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). Actual `.env` values were not read out, printed, or modified. Server startup requires a private session secret; tests inject a synthetic one. Browser login/dashboard/CSRF wiring remains Phase 5; do not claim interactive browser login works yet.
- **No real personal identities were provisioned.** Synthetic bootstrap/login/session tests used temporary test databases and cleaned them up. The owner's email/password setup should be supplied privately at actual setup time, outside source/history/chat; there is no default password or password-recovery bypass.
- `npm.cmd run validate`: PASS, **73 tests, zero failures/skips**, including real Mongo auth/session/bootstrap/throttling, ownership/migration, and restart checks. Subsequent focused Mongo authentication rechecks passed after scalar identity-filter hardening and session-client reconnect recovery changes. Final lint, five configuration checks, and `git diff --check` passed.
- Dependency installation reported a body-parser advisory. Applied its compatible transitive patch; final `npm.cmd audit --omit=dev --json` reports **zero known vulnerabilities**. No broad dependency upgrade or unrelated architectural change was performed.
- Internal status/revocation helpers are trusted services with scalar-ID validation, not public management endpoints. Phase 4 must add audited Admin authorization around status changes; no requests/approval/activation/Admin-management UI is implemented yet.
- No interactive browser verification, live database access/migration/provisioning, commit, push, or deployment. Phases 1-3 remain local/uncommitted. Next: Phase 4 account requests, pending User creation, approval/rejection, single-use activation tokens, and audited management operations. Email stays last; Google sign-in/password recovery remain deferred.

## October 27: Admin/User Phase 2 complete locally

- User requested continuing the plan. Implemented immutable required `userId` across all ten business schemas and owner-scoped Mongo/memory repositories, account-reference checks, per-owner budgets/overrides/probation, report/planning source isolation, and owner-leading indexes.
- Root stores now expose business methods only through `forUser(trustedActiveUserIdentity)`; unscoped operations, Admin/pending/disabled identities, ownership/role/primary-key payloads, update operators, and foreign account references fail closed. Legacy ownerless records are not implicitly assigned on read.
- Every business API uses a per-request scoped store. `createApp` accepts a trusted server-side `resolveIdentity` callback, defaulting to no identity. There is no impersonation header, public fixture route, or default owner. **Normal browser business APIs now return 401 until Phase 3 supplies real session authentication.** Health/readiness/static shell remain available. Admin finance access is denied.
- Existing HTTP tests explicitly inject trusted fixture identities; direct repository assertions and the real restart worker use matching scoped stores. This does not implement login, identity persistence, session revocation, or a user-facing Admin panel.
- Added `src/migrations/test-ownership.js`, synthetic legacy fixtures, shared Mongo/memory ownership contracts, and migration/HTTP regressions. The migration module only accepts isolated `pft_test_*` database names. Dry run snapshots all ten collections; explicit personal User mapping preserves existing owners, rejects orphans/cross-owner references/uniqueness conflicts, transactionally backfills missing/null owners, builds new indexes before dropping old global month/date uniqueness, and supports idempotent reruns plus drift-checked rollback of records/indexes.
- [OWNERSHIP_MIGRATION_RUNBOOK.md](OWNERSHIP_MIGRATION_RUNBOOK.md) documents the rehearsal, in-memory test-backup limitation, separate index DDL failure handling, stopped-writer requirement, and future durable backup/live-migration gate. No live migration command was added. Real target identity validation/provisioning and a durable production backup remain future steps.
- Four ownership tests reproduced the previously permissive behavior before implementation. Final `npm.cmd run validate`: **PASS, 67 tests, zero failures/skips**. Real Mongo checks passed isolation/reconnect, ownerless-record hiding, owner-scoped unique constraints, dry run, migration preservation, pre-apply drift refusal, index replacement, rerun, rollback, rollback drift refusal, restart persistence, and temporary-database cleanup.
- Fixed a centavo-versus-peso expectation in the new reconnect test and shortened generated test database names to fit the tested Atlas limit. Five focused configuration checks and final lint/`git diff --check` also passed after the documentation/test-server log update.
- No interactive browser smoke test, production access, `.env` change, real account provisioning, commit, push, or deployment performed. Phase 1 and Phase 2 changes are local and uncommitted; the previous push authorization applied only to that earlier operation.
- Next: Phase 3 controlled sole-Admin + separate personal User provisioning, password hashing, Mongo-backed sessions, CSRF/throttling, logout/revocation, and real identity resolution. Obtain private bootstrap identities/credentials only when needed; do not put them in documentation or logs. Keep email delivery last; Google sign-in and password recovery deferred.

## October 27: Admin/User Phase 1 complete

- User requested starting the Admin/User plan. Completed Phase 1: scoped PRD v2.2 addendum, future-integration scope alignment, and [ADMIN_USER_OWNERSHIP_INVENTORY.md](ADMIN_USER_OWNERSHIP_INVENTORY.md) covering 28 business endpoints, 21 business persistence methods, 10 collections, indexes, and singleton changes.
- Added test-only identity descriptions in `tests/fixtures/identities.js` for Admin, User A, User B, pending User, and disabled User. They are not persisted identities, usable credentials, or an authentication bypass.
- Added `src/config/test-environment.js`, `scripts/run-tests.js`, and `scripts/test-server.js`. `npm test`/`npm run validate` now require a dedicated test connection, replace all Mongo URI variables before child app imports, and refuse live fallback. `npm run test:unit` explicitly disables all Mongo URIs and skips only the real-Mongo restart check.
- `npm run dev:test` binds to `127.0.0.1`, selects `pft_test_local` on the dedicated test connection before importing the app, and preserves synthetic browser data across shutdown. It never edits `.env`; it does not seed identities or migrate live data.
- Corrected the restart worker's stale account fixture from unsupported type `Test` to supported `Other` so account validation and real-Mongo verification agree.
- Final `npm.cmd run validate`: PASS, 57 tests, zero failures/skips, including real-Mongo restart and successful temporary-database cleanup. Network-enabled test connectivity worked today; earlier connectivity failures below are historical.
- `npm.cmd run test:unit`: PASS, 56 passed and one explicitly skipped Mongo test. Five targeted configuration checks passed, including both entrypoints refusing missing test configuration even with a live URI present.
- Localhost test server smoke: readiness, health, and UI shell passed via HTTP against the dedicated test connection; server stopped afterward. This was not an interactive browser smoke test.
- `git diff --check` passed. No production access, live migration, credential changes, commit, push, or deployment performed.
- Next: Phase 2 owner-scoped persistence and isolated migration rehearsal. Ownership/authentication remain a combined release gate; login and RBAC are not implemented yet. Email remains last; Google login and password recovery remain deferred.

## October 26: commit/push handoff

- User explicitly authorized committing the current stabilization work and planning documents and pushing to `main` for this operation only. This is not standing permission for later pushes or deployment.
- The pending commit includes the daily-target month fix, account API validation, regression tests, Admin/User plan, and this working memory. `.env` remains ignored and excluded.
- Validation immediately before this handoff: lint and 51 automated tests passed; live Mongo restart verification failed on Atlas connectivity as documented below. No deployment performed.
- Use Git history and remote tracking to verify the resulting commit and push status; earlier statements about uncommitted work below describe their original checkpoints.

## October 26: Admin/User Q&A and plan

- Product owner answered the Admin/User scope questions. Decisions and implementation sequence are recorded in [ADMIN_USER_PLAN.md](ADMIN_USER_PLAN.md).
- Sole Admin manages access without a finance workspace or access to Users' private records. A separate personal User owns existing data.
- Public account requests require Admin approval; Admin can also create accounts. Email/password activation follows approval. Email delivery is the final feature; Google login and password recovery are deferred.
- Localhost first; Vercel later. Test/live database separation remains mandatory.
- Planning only: authentication, ownership, RBAC, migration, and email are not implemented. The next implementation starts with the scoped PRD addendum and ownership inventory; no live migration or deployment has been authorized.

## October 26: account API validation

- Reproduced five failing regression tests before implementation in `tests/account-validation.test.js`.
- Transaction account filters and create/update references now require a single non-empty string. Operator objects, arrays, repeated query parameters, whitespace-only IDs, and non-string body references return 400. Unknown scalar IDs retain existing behavior.
- Account creation requires a nonblank string name, trims names, and accepts only the PRD account types or existing browser aliases: Cash/cash, Bank/bank, E-wallet/wallet, Credit Card/credit, Other/other. Existing stored type values are not migrated.
- Shared allowed types are in `src/utils/accounts.js`. Mongo account schemas trim names and enforce types; memory account creation validates through that same Mongoose schema without connecting to a database.
- Added Other to the account dropdown and clarified E-wallet/Credit Card labels while retaining existing option values.
- `npm.cmd run check` and `git diff --check` passed. With all Mongo URI variables explicitly disabled in the test process, `node --test` passed 51 tests, failed zero, and skipped only the real-Mongo restart check. The five focused account-validation tests also passed.
- Network-enabled isolated Mongo persistence verification failed on Atlas server selection (`ReplicaSetNoPrimary`); four other persistence tests passed. Live persistence and temporary-database cleanup remain unverified. Production was not used.
- Previous daily-target changes preserved. No interactive browser smoke test, commit, push, or deployment performed. Local `.env` values unchanged.

The account validation work supersedes remaining stabilization priority 2 below; historical verification counts remain historical.

## October 25: daily-target month consistency

- Reproduced two failures before implementation: conflicting date/month API inputs returned 200, and the browser combined today's date with the budget-editing month.
- Daily-target requests now return 400 when the budget month differs from the target date's month, including when a date override exists. Date validation runs before deriving the month.
- The planning summary uses today's Philippine date and its matching budget month. The budget editor can still select another month independently.
- Added API and mocked-browser regression coverage, including Philippine midnight/month rollover. All 10 focused checks pass under `TZ=America/New_York`.
- ESLint passed. The full suite passed 46 tests; the Mongo restart test failed on test-cluster DNS timeout. A separate run with database configuration explicitly disabled passed 46 tests and skipped only the Mongo restart test.
- Network-enabled persistence retry also failed: Atlas server selection could not reach a primary. Live persistence and temporary-database cleanup could not be verified; no database configuration was changed to work around this.
- No real browser smoke test, commit, push, or deployment performed. Production configuration and local `.env` values unchanged.

The October 21 results below are historical; the completed daily-target fix supersedes remaining stabilization priority 1.

This is a repository handoff for future GPT/Codex sessions. Read it alongside the source files; verify the current checkout before treating recorded results as current. This file does not provide automatic cross-session memory.

## Start here next session

1. Read this file, [PRD_v2.md](PRD_v2.md), and the relevant parts of [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md).
2. Check `git status --short` and recent commits before editing.
3. Preserve unrelated working changes. Select the next task explicitly; the remaining backlog is not authorization to implement everything at once.
4. Demonstrate defects with meaningful regression tests before fixing them.
5. Validate against the isolated test database, then report changes, results, assumptions, and limitations.

## Product and scope

- Product: Pocket Ledger / Personal Finance Tracker (PFT), currently a single-user application.
- Stack: Node.js, Express, MongoDB/Mongoose, vanilla HTML/CSS/JavaScript.
- `PRD_v2.md` is the product source of truth, now version 2.2 with the approved Admin/User addendum.
- Admin/User implementation is approved under `ADMIN_USER_PLAN.md`. Phases 1-6 are implemented/locally verified with synthetic identities: 78 API/unit/Mongo tests and real Edge workflows passed October 28. Next is Phase 7 email-provider/sender decisions. Actual private provisioning, email delivery, and live rollout are not complete.
- Do not introduce allocation automation, transfers, a frontend framework, or unrelated architectural rewrites during stabilization.
- Keep actual transactions separate from budgets, reserves, daily targets, and expected income.

## Database and secret rules

- **`MONGODB_URI` in `.env` is production. Do not connect to it for development verification, audits, browser smoke tests, or automated tests.**
- The user explicitly authorized the dedicated **`MONGODB_URI_TEST`** connection for testing.
- Never print, copy into documentation, commit, or expose actual connection strings or credentials.
- Leave local `.env` values unchanged. `.env` is ignored and was not committed.
- Tests accept `MONGODB_URI_TEST` first, with `MONGODB_TEST_URI` and `MONGO_URI_TEST` as compatibility aliases.
- The verified test URI has no database name. The integration harness assigns a unique `pft_test_*` database and drops that database afterward.
- An explicit source test database name must contain `test`, as enforced by the existing integration test.
- During verified full-suite runs, a process-local wrapper loaded the test URI, assigned a test database path, and replaced the child process's `MONGODB_URI` and test aliases with that test connection. This prevented application imports from selecting production.
- Apply the same process-local separation before starting a server for browser tests. Do not run the normal `.env` configuration against production by accident.
- Sandboxed Atlas DNS lookups timed out. Network-enabled validation succeeded. A sandbox connection failure does not prove the test database is unavailable.

## Completed today

### Initial stabilization

- Centralized server interpretation of offset-free timestamps as Philippine wall-clock time.
- Corrected browser date/time defaults and transaction display to use `Asia/Manila`; new browser transaction timestamps include `+08:00`.
- Corrected month-end calculation, including leap years, and report range validation.
- Excluded later Philippine dates from current account balances while preserving historical balances through an explicitly requested end date.
- Validated payday dates, used Philippine calendar days for recommendations, excluded archived balances, and clarified daily-estimate labels and date windows.
- Added checked API responses, visible errors, failed-save input retention, and duplicate-submit protection.
- Added browser transaction editing/deletion, account archiving with warning and confirmation, daily override controls, and nonblocking spending warnings.
- Refreshed probation counts on read; validated Career statuses, task dates, and probation date order.
- Added safer startup/request diagnostics and isolated-test configuration documentation.

### Latest task: salary and weekly-report stabilization

- First added tests demonstrating **four failures** before changing the implementation.
- Added a shared report filter excluding future-dated income in category **`Salary`** from actual-income summaries.
- Applied it to monthly Overview, aggregate Overview, period reports, and salary reports. Source transactions remain stored and visible in transaction history.
- Salary becomes effective when its Philippine calendar date begins; reaching that date requires no new database write.
- Weekly mode now returns the full Monday-Sunday week containing an explicit `start` or `end` date.
- When both weekly dates are supplied, they must be ordered and belong to the same week. Conflicting weeks return HTTP 400 with guidance to use custom mode.
- Custom ranges retain exact inclusive endpoints.
- Added year-boundary, leap-day, Philippine-midnight, and centavo regression coverage.
- Extended the real-Mongo restart worker to verify that future salary stays persisted but excluded from actual-income reports after restart.

## Financial/date decisions to preserve

- Store and calculate money in integer centavos. The existing public API uses pesos for compatibility.
- Business/calendar timezone is `Asia/Manila`, independent of the host timezone.
- Salary effectiveness currently follows **calendar dates**, not the timestamp within the same day. A later time on today's Philippine date retains existing same-day behavior.
- The new salary exclusion uses the existing exact category `Salary`. Other income categories and future expense policy were not changed by the latest task.
- Report account balances through an explicitly selected future end date retain their existing as-of behavior. Do not confuse those balances with today's available funds.
- No automatic payday transaction, salary amount, allocation, or employment outcome is generated.
- Explain unresolved financial-policy ambiguities rather than inventing a rule.

## Verification evidence

- Latest `npm run validate`: **PASS, 44 tests passed, zero failures or skips**. This ran ESLint and Node's test runner against isolated test configuration.
- Focused report checks: **15 tests passed** after the implementation.
- Report/date regressions with `TZ=America/New_York`: **13 tests passed**.
- Real-Mongo restart checks passed and cleaned up their temporary database.
- Additional audit probes verified real-Mongo transaction reassignment/update/delete, archive history, planning independence, and all five Career record types after reconnecting.
- The last production dependency audit (`npm audit --omit=dev --json`) reported zero known vulnerabilities; development dependencies were not included in that check.
- Browser handler tests use a mocked DOM. **No actual interactive browser smoke test has been completed.**
- No Preview or production deployment was performed.
- Earlier notes in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) record a 37-test checkpoint. The 44-test result above supersedes that count.

## Commits created and pushed

Repository: <https://github.com/christianpepscaasi-gh/PFT>

Branch: `main`. Last verified pushed HEAD: **`dbafc307617a5468d4bd6160fead1eda8f89b887`**.

| Commit | Change |
| --- | --- |
| `382c7dc` | Philippine dates, report ranges, and current balances |
| `552f433` | Career progress and input validation |
| `1ff7794` | Failed-save handling and transaction/daily-limit controls |
| `eb2123d` | Safe startup and request diagnostics |
| `86042a0` | Future salary exclusion and complete weekly periods |
| `dbafc30` | Isolated Mongo test setup and implementation documentation |

The user authorized that push directly to `main` **for that operation only**. Do not infer standing permission for future pushes, force pushes, or deployments.

At the end of the push, the working tree was clean and local/remote `main` matched. This newly requested memory file has not itself been committed or pushed.

## Remaining stabilization priorities

These are audit findings/backlog items, not completed work. Reproduce and scope them before implementation.

1. **Daily-target month consistency:** the API and browser can combine one month's budget with another month's remaining days. Decide whether mismatches should be rejected or the date selection corrected; add regression coverage.
2. **API validation:** account filters accept Mongo query operators instead of requiring scalar IDs. Whitespace account names and unsupported types are accepted. Validate at the boundary and align the memory adapter with Mongo validation.
3. **Monetary and error boundaries:** individual monetary fields are safe integers, but aggregates can exceed the safe range. Oversized bodies currently become generic 500 responses rather than 413.
4. **Required v2 workflows:** default expected paydays on the 6th/21st, default categories, the Other account type, complete Overview planning information, and daily/weekly/custom browser report controls remain incomplete.
5. **Reporting and record management:** salary-specific browser summaries, detailed report metrics, reserve inspection/correction, account summaries/settings, and existing Career status-update workflows need further work or explicit behavior decisions.
6. **Browser smoke tests:** verify initial tab visibility, create/edit/delete, account selection, archive confirmations, failed saves, daily warnings/overrides, and Career flows against test data. Initial non-Overview panels currently lack consistent hidden state before a tab click.
7. **Diagnostics/security hardening:** error logs omit the underlying message/cause; an unused salary-recommendation helper has different date logic. Appropriate response security headers and deployment protections remain outstanding.

Still ambiguous: whether new historical transactions should be allowed on archived accounts, and whether the daily-budget suggestion should subtract spending already incurred. Do not silently resolve these as financial policy.

## Later v2 and future work

- P2 v2 enhancements: charts, up to six-month daily comparisons, account comparisons/grouping, salary-display preferences, and Career explanations.
- P3/future: fund allocations, financial runway, recurring transactions, savings goals, transfers, bank integrations, and imports.
- The proposed percentage allocation totals 90%; the remaining 10% and money-movement semantics require product decisions.
- Night differential and ExtraMoney have no established authoritative requirement in the current checked-in plans; do not treat them as approved work.
- Future multi-user implementation must explicitly migrate ownership and scope queries/indexes; RBAC does not replace ownership checks.

## Release gates

- Local development: use a deliberately selected development/test database.
- Isolated database validation: verified for the committed implementation, but rerun after relevant changes.
- Protected Preview: not deployed or verified. Needs separate database configuration, access protection, asset/API checks, cold/warm behavior, outage checks, and persistence across redeployment.
- Public production with real financial data: **NO-GO**. APIs currently lack authentication/ownership. The approved plan requires a verified private-access boundary or separately approved authentication/ownership work before public exposure.
- Follow [FUTURE_INTEGRATION.md section 63](FUTURE_INTEGRATION.md#63-vercel-deployment-readiness-gate); a green test suite alone is not production approval.

## Maintaining this memory

After each meaningful task, record the date, actual changes, commands/results, remaining blockers, and commit/push status. Keep historical results distinct from fresh verification. Never add secrets. Do not mark browser behavior, deployment protection, or a requirement complete based solely on code existing or API tests passing.
