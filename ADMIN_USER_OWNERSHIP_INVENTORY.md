# Admin/User ownership inventory

Inspected October 27, 2026. Source: `server.js`, `src/persistence.js`, and existing tests. This is the Phase 1 baseline, not an assertion that ownership is implemented.

Phase 2 update, October 27: the ownership changes in this inventory are now implemented and verified in Mongo and memory. The historical baseline below is retained for migration review. Business APIs now require an active User through a trusted server-side resolver and are locked with 401 by default until Phase 3 adds real sessions. See [OWNERSHIP_MIGRATION_RUNBOOK.md](OWNERSHIP_MIGRATION_RUNBOOK.md). No live records have been migrated.

Phase 3 update: the default resolver now uses Mongo-backed sessions and reloads current role/status/revocation version. `/api/auth/csrf`, `/login`, `/me`, and `/logout` are implemented as documented in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). The CSRF/login endpoints are public but origin/token/throttle protected; `/me` requires a valid session and logout requires its CSRF token. New management/request/activation routes remain Phase 4 work. No public registration or role/owner assignment route exists.

## Current boundary

There is no identity, session, authentication middleware, or owner field yet. `createApp` receives one persistence store; all business requests operate on global records. The `/api` middleware only connects/checks the database. The default app is constructed at module import; safe verification must replace live configuration before that import.

All 28 business method/path combinations below must require an active User session and reject Admin access in the later implementation. Never accept an owner/role from a request as authority. Scope persistence operations, not only response filtering.

## Route and repository coverage

| Existing route(s) | Current store operations | Required ownership behavior |
| --- | --- | --- |
| `GET /api/accounts` | `listAccounts` | Only owned accounts and owned transactions used for their balances. |
| `POST /api/accounts` | `createAccount` | Attach immutable session User ID; reject supplied ownership. |
| `POST /api/accounts/:id/archive` | `archiveAccount` | Match account ID and owner; preserve owned historical transactions. |
| `GET /api/transactions` | `listTransactions(accountId)` | Filter all results by owner, including unfiltered requests; account filter must not leak another owner's activity. |
| `POST /api/transactions` | `getAccount`, `createTransaction` | Resolve receiving account with the same owner; attach session User ID. |
| `PATCH /api/transactions/:id` | `getTransaction`, `getAccount`, `updateTransaction` | Scope initial read and write; reassignment requires an account with the same owner. Owner is immutable. |
| `DELETE /api/transactions/:id` | `deleteTransaction` | Delete only the matching owned transaction; no cross-user financial side effects. |
| `GET /api/reports/overview` | `listAccounts`, `listTransactions` | All totals and account summaries use only owned records. |
| `GET /api/overview` | `listAccounts`, `listTransactions` | Scope monthly totals and current balances before calculation. |
| `GET /api/reports/period` | `listAccounts`, `listTransactions` | Scope transaction detail, counts, period totals, and historical as-of balances. |
| `GET /api/reports/salary` | `listTransactions` | Scope salary totals, counts, and source details; preserve future-salary rules. |
| `GET /api/budgets` | `listBudgets` | Only owned budgets. |
| `POST /api/budgets` | `upsertBudget` | Lookup/upsert by owner + month, including the preliminary existence check and created response. |
| `POST /api/planning/reserves` | `createReserve` | Attach session User ID. There is no public reserve-list endpoint today. |
| `GET /api/daily-limits/override` | `listDailyOverrides`, `getDailyOverride` | Date-filtered and unfiltered reads must both be scoped. |
| `POST /api/daily-limits/override` | `upsertDailyOverride` | Upsert by owner + date. |
| `GET /api/planning/payday` | `listAccounts`, `listReserves` | Available funds and reserves use only owned data; expected payday does not create actual income. |
| `GET /api/planning/daily-target` | `getBudget`, `getDailyOverride`, `listTransactions` | Budget, override, spending, remaining amount, and warnings all use the same owner. |
| `GET /api/career/probation` | `getCareerProbation` | Retrieve this User's probation record, never a global first record. |
| `POST /api/career/probation` | `saveCareerProbation` | One record per owner; no global `{}` upsert. |
| `GET /api/career/checkpoints`, `/skills`, `/tasks`, `/journal` (4 routes) | `listCareerEntries(type)` | Each list is scoped by owner. |
| `POST /api/career/checkpoints`, `/skills`, `/tasks`, `/journal` (4 routes) | `createCareerEntry(type, payload)` | Attach session owner for all four record types. |

`getBudget`, `listReserves`, and `getDailyOverride` also serve internal calculations and need scoping even where there is no standalone endpoint.

Public shell/assets at `/` and static paths contain no personal data today; the later UI must defer private requests/rendering until authentication succeeds. `/health` and `/ready` remain non-private operational endpoints; expose no credentials, identity, or financial data. They do not grant API access. New account-request, activation, session, and Admin routes will be inventoried as introduced; none exist yet.

## Collections, indexes, and singleton changes

| Collection | Current identity/index assumption | Required later shape |
| --- | --- | --- |
| `accounts` | Global string `_id`; no owner index | Immutable required `userId`; owner-leading listing index; owner+ID predicates for reads/archive. |
| `transactions` | Global string `_id`; `accountId` index; `{ accountId, occurredAt }` index | Immutable `userId`, same-owner account invariant, owner-leading report/account-activity indexes. |
| `budgets` | Globally unique `{ month }` | Unique `{ userId, month }`; remove old global unique index as part of reviewed migration. |
| `reserves` | Global record list | Immutable `userId`; owner-leading list index. |
| `daily_overrides` | Globally unique `{ date }` | Unique `{ userId, date }`; remove old global unique index as part of reviewed migration. |
| `career_probation` | `findOne({})`/`findOneAndUpdate({})`; no singleton uniqueness index | Unique `{ userId }`; explicit owner on lookup/upsert. Detect unexpected multiple legacy records before migration. |
| `career_checkpoints`, `career_skills`, `career_tasks`, `career_journal` | Global list/create | Required immutable `userId`; owner-leading list indexes. |

All 10 collections must be covered by migration and preservation checks. Mongo `_id` remains globally unique; that uniqueness is not permission to read by ID alone. Preserve useful existing indexes unless the migration explicitly replaces them. Do not rely on Mongoose auto-index creation to remove old global uniqueness constraints.

The memory adapter has the same method surface but global arrays and a single `career.probation`. It must later implement identical owner scoping, owner/month and owner/date uniqueness, and per-owner probation semantics. Phase 1 fixtures do not change these behaviors or establish a security boundary.

## Call contracts and bypass audit

- Introduce a mandatory trusted owner context in the business repository/service interface. Missing identity must fail closed; no implicit default owner or all-records fallback.
- The current application has 21 business persistence methods, plus connection/readiness/close. Update every business method listed above in both adapters and all callers.
- Update `buildAccountSummaryAtDate` and `serializeAccount` callers to receive already-owned transactions; shared centavo and Philippine-date helpers remain financial utilities, not authorization checks.
- Audit model access in tests, migration scripts, restart workers, and future bootstrap commands separately. Controlled test/migration access must not become a web-accessible ownership bypass.
- Existing tests use unauthenticated `createTestApp()` and some direct stores. Later update them to supply explicit trusted test identities or real authenticated test sessions; do not add a production header that impersonates a fixture identity.
- Keep intentional legacy fixtures for migration rehearsal. Never treat ownerless records as belonging to the current caller on read.

## Test fixture contract

`tests/fixtures/identities.js` returns fresh descriptions for Admin, active User A, active User B, pending User, and disabled User. They contain synthetic `example.test` emails, roles, statuses, and stable fixture IDs, with no usable passwords or sessions. They are not inserted into Mongo or exposed through HTTP in Phase 1.

Later tests should seed identical months/dates for A and B, distinct financial balances/history, all five Career record types, forged owner fields, foreign account references, and sessions revoked after disable. Admin must fail finance routes even when given a real User resource ID. Exercise lists, aggregates, and upserts as well as direct-ID operations.

## Migration and release gates

Inventory, backup, and dry-run every collection; select the owner's personal User explicitly, compare counts/balances/reports, detect orphans/duplicates, migrate indexes deliberately, verify reruns, and document rollback. Live migration is not authorized by this inventory. Ownership and authentication are a combined release gate: do not expose incomplete multi-user changes.
