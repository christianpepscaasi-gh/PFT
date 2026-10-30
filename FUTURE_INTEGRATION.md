# Pocket Ledger — Future Integration & Migration PRD

**Document:** Future Integration Guide / Migration PRD
**Version:** 2.2
**Date:** October 7, 2026
**Status:** Ready for implementation of Phase 1 only
**Product:** Pocket Ledger (PFT)

## October 27 scope update

The product owner has activated the Admin/User work described in [ADMIN_USER_PLAN.md](ADMIN_USER_PLAN.md), with the scoped addendum in [PRD_v2.md](PRD_v2.md). The original persistence-only scope and statements that authentication is entirely future work below are historical and are superseded only for this approved work. Implementation begins with the Admin/User plan's Phase 1 (documentation, ownership inventory, identity fixtures, and isolated test setup); these phase numbers differ from this guide's original persistence/authentication/RBAC phases.

The new decision also supersedes the old permission table allowing Admins their own financial workspace: the sole Admin has management access only and no finance/planning/Career access. A separate personal User owns the product owner's records. Other Users' private records are never available to Admin. Email delivery is last; Google sign-in and password recovery remain deferred. Account requests require Admin approval, and there is no open automatic registration.

See [ADMIN_USER_OWNERSHIP_INVENTORY.md](ADMIN_USER_OWNERSHIP_INVENTORY.md) for the original route/repository/index baseline and the status update below for implemented scope. Existing production migration and deployment gates continue to apply.

Phase 2 status update: owner-scoped persistence and the isolated migration rehearsal are now implemented locally. Authentication/session handling is still pending; default business APIs deny unauthenticated access. The [migration runbook](OWNERSHIP_MIGRATION_RUNBOOK.md) documents the tested boundary and the separate live-migration gate.

Phase 3 status update: email/password authentication APIs, Mongo sessions, CSRF/origin checks, revocation/expiry, shared throttles, and a controlled test-only bootstrap are now implemented. See [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). Only synthetic provisioning was tested; private personal setup, account management, activation/email, browser workflows, and live rollout are not complete.

October 28 Phase 4 update: request/review, pending User creation, invitation-token core, audited status changes, and Admin lists are implemented locally. See [ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md). After the owner updated Atlas access, full validation passed all 78 tests with zero failures/skips, including real-Mongo management checks. Browser/email/private setup/live rollout remain pending.

October 28 Phase 5/6 update: browser login/request/activation, separate User/Admin workspaces, CSRF transport, and privacy cleanup are implemented and verified in real headless Edge using synthetic Mongo data. Full API/Mongo validation and browser cleanup passed; see [BROWSER_WORKFLOWS.md](BROWSER_WORKFLOWS.md). Email-provider/sender decisions, private setup, live migration, and deployment remain separate pending work.

---

# 0. Implementation Agent Instructions

## 0.1 Source of Truth

The existing Pocket Ledger product PRD remains the source of truth for:

* financial behavior
* date and time behavior
* account balance calculations
* transaction semantics
* expected versus actual income
* budgets
* savings plans
* daily spending limits
* reports
* charts
* career features
* existing API behavior
* existing frontend behavior

This document defines how to evolve the application's storage architecture and, later, how authentication and multi-user access may be introduced.

Do not use this document as permission to change existing financial behavior.

---

## 0.2 Current Implementation Scope

**The current implementation task is Phase 1: MongoDB persistence.**

Implement:

* MongoDB persistence
* Mongoose models
* persistence repositories/services where useful
* replacement of the normal in-memory storage path
* database startup requirements
* persistence validation
* MongoDB integration tests
* graceful database shutdown
* readiness checks
* preservation of existing API behavior and financial rules

Do **not** currently implement:

* login
* registration
* password authentication
* sessions
* multi-user accounts
* user ownership
* Admin/User RBAC
* admin dashboards
* user-management UI
* password reset
* role management

Phases 2 and 3 in this document are **future architecture and planning only**.

They must not expand the current implementation scope unless a later task explicitly activates them and the product PRD is updated accordingly.

---

## 0.3 Preserve the Existing Application

The current application is already functional.

Do not rewrite working functionality simply because a different architecture appears cleaner.

Do not:

* replace Express
* replace MongoDB/Mongoose with another database technology
* introduce a frontend framework
* introduce a new state-management framework
* redesign the API
* rewrite the application from scratch
* reorganize the entire repository unnecessarily
* create abstractions merely for architectural purity
* remove working features without a documented requirement

Prefer the **smallest safe change** that satisfies the requirement.

---

## 0.4 Implementation Style

Work in coherent implementation batches rather than artificially splitting independent work into tiny tasks.

For example, when migrating transactions:

1. create/update the Mongoose model
2. implement persistence/repository logic
3. update the affected API handlers
4. preserve validation and financial calculations
5. update affected frontend behavior if necessary
6. add/update tests
7. run validation

Treat that as one coherent feature rather than stopping after every file.

Do not repeatedly ask for confirmation after every small implementation step.

Pause only when an unresolved decision could materially affect:

* financial correctness
* persisted data
* security
* API compatibility
* migration safety
* product scope

Otherwise make the safest reasonable implementation decision and document the assumption.

---

## 0.5 Do Not Artificially Expand the Architecture

The suggested repository/service structure in this document is an architectural guideline, not a requirement to reorganize every existing file.

Keep the current structure where practical.

Refactor into repositories/services only where doing so materially improves:

* database isolation
* testability
* ownership boundaries
* maintainability
* correctness

Do not create dozens of new abstraction layers simply to match a diagram.

---

## 0.6 API Compatibility Rule

The MongoDB migration is primarily a **storage-layer migration**.

Preserve existing:

* API routes
* request shapes
* response shapes
* status codes
* field names
* frontend expectations
* validation behavior
* financial semantics

unless a change is explicitly required.

If an API contract change becomes unavoidable:

1. identify it before implementing it
2. explain why it is required
3. update all affected callers together
4. update tests
5. document the compatibility change

Do not silently redesign the API during the database migration.

---

# 1. Product Summary

Pocket Ledger is a personal finance application designed to help a user understand:

* current money
* actual income
* actual expenses
* account balances
* monthly spending
* budgets
* savings planning
* daily spending targets
* expected upcoming income
* financial reports
* career/progress information

The application currently operates as a single-user prototype.

The next architectural step is to replace process-local storage with durable MongoDB persistence.

Authentication and multi-user support are future product-scope changes and must remain separate from the initial persistence migration.

---

# 2. Migration Principle

The central migration rule is:

> **Preserve the existing Pocket Ledger application behavior while replacing the storage implementation behind it.**

The migration must not change:

* date interpretation
* Philippine timezone behavior
* actual-versus-expected income semantics
* account balance calculations
* report boundaries
* budget behavior
* savings behavior
* daily spending calculations
* transaction semantics

MongoDB should become the durable source of application records without changing what those records mean.

---

# 3. Original Application Baseline

The current application includes:

* Node.js
* Express
* MongoDB/Mongoose dependency
* vanilla HTML/CSS/JavaScript frontend
* Chart.js
* existing financial API routes
* existing browser-side API calls
* a process-local in-memory store

The current server behavior includes a MongoDB connection path, but successful MongoDB connection does not by itself mean that existing API handlers are using MongoDB.

At the original planning baseline, API handlers relied on the process-local `inMemoryStore`. The current implementation uses MongoDB for all normal resource operations; the memory adapter is explicitly injected by tests. Live restart persistence must still be verified against a reachable dedicated test database.

Therefore:

> **A successful MongoDB connection is not considered MongoDB integration complete.**

MongoDB integration is complete only when normal application data operations actually persist through MongoDB.

---

# 4. Current Storage Limitation

The process-local store has several limitations:

* data disappears when the process restarts
* multiple application instances do not share state
* deployment instances cannot reliably share data
* database-backed persistence is not guaranteed
* future user ownership cannot be implemented safely on top of process-local state

MongoDB will become the durable persistence layer.

Tests may continue using a controlled fake repository/store or dedicated test database where appropriate.

---

# 5. Target Architecture

The desired flow is:

```text
Browser
   ↓
Express API
   ↓
Validation / Finance Logic
   ↓
Repository / Service Layer
   ↓
Mongoose
   ↓
MongoDB
```

The browser must never connect directly to MongoDB.

Future authenticated architecture:

```text
Browser
   ↓
Authentication Middleware
   ↓
Authorization Middleware
   ↓
Express API
   ↓
Validation / Finance Logic
   ↓
Repository / Service Layer
   ↓
Mongoose
   ↓
MongoDB
```

---

# 6. Suggested Project Structure

A possible future structure is:

```text
src/
  middleware/
    require-auth.js
    require-role.js

  models/
    user.js
    account.js
    transaction.js
    budget.js
    reserve.js
    daily-override.js
    career.js

  repositories/
    accounts.js
    transactions.js
    planning.js
    reports.js
    career.js

  services/
    finance.js
    reports.js
    career.js

  utils/
    finance.js
    dates.js
```

This is guidance only.

Do not reorganize the entire existing application solely to match this structure.

Use the existing project organization where it is already reasonable.

---

# 7. Financial Data Rules

All existing financial rules remain authoritative.

## 7.1 Money Representation

Persist and calculate monetary values using:

> **integer centavos**

Examples:

```text
₱100.00 → 10000
₱1.50   → 150
₱0.01   → 1
```

Do not use JavaScript floating-point values for persisted monetary totals.

Do not introduce mixed representations such as:

```text
100
"100.00"
10000
"₱100.00"
```

for the same monetary concept.

Unless the existing API contract explicitly requires another representation, backend API monetary values should use integer centavos consistently.

Do not silently switch between pesos and centavos.

The existing API and frontend use PHP pesos at the public boundary: the UI accepts hundredths of a peso, sends the entered number unchanged, and formats returned values directly as PHP currency. Preserve that public representation for compatibility. Convert peso inputs to integer centavos before persistence and calculation, and convert centavos back to pesos in API responses. The legacy API also accepted more than two decimal places; because centavos cannot represent those values exactly, the migration must reject sub-centavo amounts instead of silently rounding them.

Do not introduce MongoDB Decimal128 or another monetary representation unless the financial PRD is explicitly revised to approve it.

---

# 8. Financial Invariants

The following invariants must survive the migration.

## 8.1 Actual Income

Expected income must never automatically become actual income.

Expected salary dates are planning information only.

An expected payday must not:

* create a transaction
* increase account balance
* become actual income automatically
* fabricate a salary amount

Actual income exists only when represented by an actual recorded income transaction.

---

## 8.2 Budgets

Budgets do not create transactions.

Changing a budget must not:

* create income
* create expenses
* modify account balances
* modify transaction history

---

## 8.3 Savings Plans

Savings plans and reserves do not automatically create financial transactions.

They must not silently modify account balances.

---

## 8.4 Daily Spending Limits

Daily spending targets are planning/recommendation values.

Changing a daily target must not change:

* monthly budget
* transaction history
* account balance
* recorded expenses

Overspending should be presented as a warning or visual state rather than silently modifying financial data.

---

## 8.5 Account-Specific Transactions

A transaction affects the account to which it is assigned.

A transaction must not silently affect another account.

---

## 8.6 Account Balance

Account balance is calculated as:

```text
Initial Balance
+ Recorded Actual Income
- Recorded Actual Expenses
```

through the requested as-of date.

Do not create a separately mutable balance field unless a future performance optimization explicitly requires it and the implementation maintains and reconciles it safely.

Prefer deriving balances from source records.

---

## 8.7 Archived Accounts

Archiving an account must not destroy its historical transactions.

Archived accounts:

* remain available for historical reporting
* remain available for transaction history
* are excluded from current active-account visualizations where required
* must not be silently deleted

---

## 8.8 Missing Information

If the information required to calculate something is missing, return or display:

* unavailable
* unknown
* not configured

as appropriate.

Do not fabricate:

* salary
* employment
* account balances
* user activity
* payday amounts
* financial checkpoints

---

## 8.9 Career Data

Career information is user-entered planning/progress data.

Career records must never:

* create transactions
* modify balances
* fabricate employment
* fabricate salary
* infer employment status

---

# 9. Phase 1 — MongoDB Persistence

## 9.1 Startup Behavior

Normal application startup must require:

```text
MONGODB_URI
```

If the application cannot connect to MongoDB during normal startup:

* log a clear diagnostic message
* do not pretend the application is fully operational
* exit with a non-zero status if the application cannot function without MongoDB

Do not silently fall back to the in-memory store for normal application operation.

Tests may explicitly inject a fake store or use a dedicated test database.

---

# 10. Database Connection Lifecycle

Connect to MongoDB before accepting normal HTTP requests.

Do not start the application in a falsely “ready” state before required database initialization succeeds.

Do not log:

* MongoDB credentials
* full connection strings containing credentials
* secrets

Add graceful shutdown handling for:

```text
SIGINT
SIGTERM
```

Shutdown should:

1. stop accepting new requests
2. close the MongoDB/Mongoose connection
3. exit cleanly

---

# 11. Liveness and Readiness

Keep liveness and readiness conceptually separate.

A liveness endpoint may indicate:

```text
the Node.js process is alive
```

A readiness endpoint should indicate:

```text
the application can actually serve normal database-backed requests
```

If MongoDB is unavailable, readiness must fail appropriately.

Do not report the application as ready when its required database is unavailable.

---

# 12. Mongoose Models

Create Mongoose schemas that accurately reflect the existing API and financial model.

Initial model coverage:

## Account

Fields should include the equivalent of:

* name
* type
* initial balance
* archived state
* timestamps

---

## Transaction

Fields should include:

* account reference
* transaction type
* amount
* category
* description
* notes
* `occurredAt`
* timestamps

Amounts must follow the integer-centavo rule.

---

## Budget

Fields:

* month key
* amount
* timestamps where useful

A budget should eventually be unique per owner and month.

---

## Reserve

Fields:

* label
* amount
* timestamps where useful

---

## Daily Override

Fields:

* Philippine local date key
* target amount
* reason
* timestamps where useful

Date keys must follow the application's `Asia/Manila` calendar convention.

---

## Career

Career records may include:

* probation configuration
* user-entered checkpoints
* skills
* tasks
* journal entries

Career information must remain separate from financial records.

---

# 13. Database Indexes

Add indexes for common queries and uniqueness constraints.

Examples:

```text
Budget:
(userId, month)

Transactions:
(userId, occurredAt)

Transactions:
(accountId, occurredAt)
```

During Phase 1, ownership fields may not yet exist.

Do not add multi-user ownership merely because the future index design mentions it.

The Phase 1 model should remain compatible with the current single-user product unless the PRD is separately revised.

---

# 14. Philippine Date and Time Rules

The application uses:

```text
Asia/Manila
```

as its financial/business timezone.

Do not depend on:

* MongoDB server timezone
* host operating system timezone
* Vercel runtime timezone
* developer machine timezone

Centralize date/time utilities where practical.

All financial date calculations must preserve existing behavior.

---

# 15. Date Boundaries

The migration must preserve existing report behavior.

Reports must correctly handle:

* Today
* Week
* Month
* Custom ranges
* Monday-Sunday weeks
* month boundaries
* year boundaries
* leap years
* midnight transitions

A date boundary must be interpreted using Philippine local calendar dates, not whatever timezone the server happens to use.

---

# 16. Salary and Payday Behavior

Expected salary dates remain:

```text
6th
21st
```

in:

```text
Asia/Manila
```

These dates are planning information.

They do not automatically:

* create transactions
* increase balances
* create salary records
* invent salary amounts

Salary reports must use actual recorded income.

Expected income may be displayed separately as future planning information.

---

# 17. Shift / Late-Night Date Handling

A shift ending at:

```text
2:00 AM
```

belongs to the following calendar day where required by the existing product rules.

Do not allow the database migration to change this interpretation.

---

# 18. Replace the In-Memory Store

Migrate resource slices one at a time.

Recommended order:

### Step 1

Accounts and transactions.

### Step 2

Budgets, reserves, daily overrides, and planning.

### Step 3

Overview and reporting.

### Step 4

Career records.

For each resource:

* replace reads
* replace writes
* preserve validation
* preserve API behavior
* preserve financial calculations
* preserve error behavior where practical
* add persistence tests

Do not declare a resource migrated merely because its model exists.

The API must actually use the model/repository.

---

# 19. Persistence Write Rule

Database writes must be awaited.

Do not return successful API responses before the required persistence operation succeeds.

For example:

```text
POST transaction
      ↓
validate
      ↓
save to MongoDB
      ↓
save succeeds
      ↓
return success
```

not:

```text
POST transaction
      ↓
start database write
      ↓
return success immediately
```

---

# 20. Derived Balance Rule

Do not persist a separately mutable account balance unless there is a demonstrated performance requirement.

Preferred calculation:

```text
balance =
  initialBalance
  + actualIncome
  - actualExpenses
```

This reduces the risk of:

* stale balances
* double-counting
* failed updates
* inconsistent account totals

If a materialized balance is introduced later, it must have:

* transactional update rules
* reconciliation
* tests
* recovery behavior

---

# 21. MongoDB Transactions

Use MongoDB multi-document transactions only where genuinely required.

Examples may include:

* moving a transaction between accounts
* maintaining multiple derived records
* future ownership migrations

Verify that the deployment environment supports MongoDB transactions and replica-set requirements.

Do not add MongoDB transactions everywhere merely because they exist.

---

# 22. Persistence Verification

MongoDB integration is complete only after verification.

Test:

* create
* read
* update
* delete
* archive
* persistence after process restart
* transaction validation
* transaction type validation
* transaction account validation
* transaction date validation
* report calculations
* account balances
* planning records
* career records
* MongoDB unavailable
* MongoDB write failure
* malformed database IDs

A successful connection message alone is not evidence of completed persistence integration.

---

# 23. Restart Persistence Test

At least one integration test or controlled verification must demonstrate:

```text
write record
    ↓
close/restart application
    ↓
read record
    ↓
record still exists
```

This proves that the application is actually using durable persistence.

---

# 24. Error Handling

Database failures must not be converted into false success responses.

Examples:

```text
MongoDB unavailable
→ appropriate server error / readiness failure

Invalid ObjectId
→ appropriate client error

Validation failure
→ appropriate client error

Database write failure
→ appropriate server error
```

Do not expose raw database stack traces to users.

---

# 25. Logging

Development logs may include useful diagnostics such as:

* HTTP method
* route
* error message
* stack trace

Production logs must not expose:

* passwords
* session secrets
* MongoDB credentials
* connection strings
* full database errors containing credentials
* sensitive financial information
* transaction descriptions/notes by default

Do not log complete financial records merely for debugging convenience.

---

# 26. Phase 1 API Compatibility

During the MongoDB migration, preserve:

* existing routes
* HTTP methods
* request payloads
* response structures
* status codes
* field names
* frontend expectations

Do not make frontend changes unless required to support the persistence migration.

If frontend changes are required, keep them minimal and compatible.

---

# 27. MongoDB Identifier Rule

MongoDB may introduce `_id` / ObjectId values internally.

Do not unnecessarily expose MongoDB implementation details to the frontend.

Preserve the application's existing identifier contract where possible.

If ObjectIds become the API identifiers:

* migrate all affected frontend code consistently
* migrate all tests
* validate IDs at the API boundary
* do not mix identifier formats unpredictably

Do not maintain multiple incompatible ID systems without a documented reason.

---

# 28. API Boundary Validation

Validate:

* request bodies
* path parameters
* date keys
* monetary amounts
* transaction types
* account references
* category values
* database identifiers
* required fields
* data types

Do not assume the frontend has validated the request.

The server remains responsible for validating all persisted data.

---

# 29. Security Baseline for Phase 1

Even before authentication is introduced:

* keep database credentials server-side
* keep secrets out of source control
* do not expose environment variables to browser assets
* use safe production error responses
* apply request-size limits
* use appropriate security headers
* avoid logging sensitive financial data
* validate all database IDs and request bodies

---

# 30. Unsafe HTML Rendering

The current browser implementation uses `innerHTML` for some user-provided values.

Before persisted user-generated content becomes broadly exposed, replace unsafe rendering paths with:

* DOM creation + `textContent`

or:

* a deliberately reviewed sanitizer

Do not inject user-controlled strings directly into HTML.

This is especially important once MongoDB makes those values persistent.

---

# 31. Phase 2 — Authentication and User-Owned Data

**Phase 2 is future work.**

Do not implement Phase 2 during the Phase 1 task.

Authentication and multi-user support represent a product-scope change and require an updated/approved product PRD before implementation.

---

# 32. Future User Model

A future User model should include:

* normalized unique email or username
* password hash only
* role
* active/disabled status
* created timestamp
* updated timestamp

Possible roles:

```text
user
admin
```

---

# 33. Future Password Security

Passwords must:

* never be stored plaintext
* never be returned by APIs
* never be logged

Use a maintained password hashing library such as:

* Argon2id
* bcrypt

Do not encrypt passwords for later recovery.

Authentication errors should be generic enough not to reveal whether an account exists.

---

# 34. Future Session Architecture

For a same-origin browser application, prefer server-managed sessions.

Possible architecture:

```text
Browser
   ↓
Secure session cookie
   ↓
Express session middleware
   ↓
Mongo-backed session store
```

Production cookies should use:

* `HttpOnly`
* `Secure`
* appropriate `SameSite`

Use HTTPS in production.

Session secrets must come from environment configuration.

Do not store:

* session IDs
* passwords
* authentication secrets

in localStorage.

Add appropriate:

* CSRF protection
* login throttling
* session rotation
* logout invalidation

---

# 35. Future Authentication Routes

Possible future routes:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Registration should exist only if explicitly approved.

If public registration is approved:

```text
new account → user role
```

Never allow public clients to submit:

```json
{
  "role": "admin"
}
```

to create administrators.

---

# 36. Future Admin Provisioning

The first administrator should be provisioned through a controlled bootstrap process.

The process should be:

* safe to rerun
* explicit
* auditable
* not expose secrets in logs

Do not allow arbitrary users to promote themselves.

---

# 37. Future Data Ownership

When multi-user functionality is activated, every user-owned record must contain an immutable owner reference:

```text
userId
```

Every query must enforce ownership.

Bad:

```js
findById(resourceId)
```

Better:

```js
findOne({
  _id: resourceId,
  userId: authenticatedUserId
})
```

Ownership must be enforced in the repository/service layer wherever practical.

---

# 38. Future Ownership Rules

Examples:

### Account

```text
_id = accountId
userId = authenticated user
```

### Transaction

The transaction must:

* belong to the authenticated user
* reference an account owned by the same user

### Reports

Reports must query only the authenticated user's records.

### Budgets

Budgets must be scoped by owner and month.

### Reserves

Reserves must be scoped by owner.

### Daily Overrides

Overrides must be scoped by owner and Philippine date.

### Career

Career information must be scoped by owner.

Never fetch a resource by ID alone and assume that the caller owns it.

---

# 39. Future Legacy Data Migration

Before enabling multi-user accounts, decide what happens to existing prototype records.

If real data must be preserved:

1. identify the designated owner
2. assign ownership explicitly
3. verify record counts
4. verify balances
5. verify important reports
6. make migration idempotent
7. create a backup
8. document rollback

If no data needs to be preserved:

* document the clean-start behavior
* do not silently assign old records to an arbitrary user

Never perform an ambiguous ownership migration.

---

# 40. Phase 3 — Admin/User RBAC

Phase 3 is future work.

It must not be implemented during Phase 1.

RBAC determines permissions.

RBAC does **not** replace ownership.

---

# 41. Future RBAC Rules

| Capability                         | User | Admin                                  |
| ---------------------------------- | ---- | -------------------------------------- |
| View/edit own finance data         | Yes  | Yes, for own records                   |
| View/edit own planning data        | Yes  | Yes, for own records                   |
| View/edit own career data          | Yes  | Yes, for own records                   |
| Read another user's finance data   | No   | No by default                          |
| Modify another user's finance data | No   | No by default                          |
| Manage user accounts               | No   | Yes                                    |
| Disable/enable users               | No   | Yes                                    |
| Initiate approved account resets   | No   | Yes                                    |
| Assign admin role                  | No   | Restricted bootstrap/audited procedure |

An administrator does not automatically receive access to every user's:

* salary
* transactions
* descriptions
* notes
* career journal
* personal financial information

Any broader support/audit capability requires separate product approval.

---

# 42. Future Authorization Order

Protected requests should follow:

```text
Request
  ↓
Authentication
  ↓
Role authorization where required
  ↓
Ownership validation
  ↓
Business validation
  ↓
Database operation
```

Default deny protected routes.

Return:

```text
401
```

for unauthenticated access.

Return:

```text
403
```

for authenticated but unauthorized access.

Avoid disclosing whether another user's resource exists.

---

# 43. Future RBAC Tests

Test:

* unauthenticated requests to protected routes
* user A cannot access user B's account
* user A cannot read user B's transactions
* user A cannot modify user B's transactions
* user A cannot archive user B's account
* user A cannot delete user B's data
* users cannot access admin routes
* users cannot promote themselves
* admins can perform only approved management operations
* admin finance activity remains scoped to admin's own records
* disabled users cannot continue using active sessions

---

# 44. Future Browser Authentication

When authentication is activated:

* add login UI
* add logout
* call `/api/auth/me` on page load
* show an unauthenticated state when appropriate
* show finance UI only after authentication is established
* show admin navigation only to admins

UI visibility is not security.

The API must enforce every permission independently.

---

# 45. Future Admin UI

Admin UI may eventually support:

* user list
* account status
* disable/enable
* approved role management
* approved account-recovery operations

Require confirmation for destructive or access-changing actions.

---

# 46. Configuration

Server-side environment configuration should include at minimum:

```text
MONGODB_URI
SESSION_SECRET
NODE_ENV
PORT
```

`SESSION_SECRET` is only required once sessions are implemented.

Never expose these values to browser JavaScript.

---

# 47. MongoDB Operational Security

Production MongoDB configuration should use:

* least-privilege database credentials
* restricted network access
* TLS
* backups
* monitored database availability

Do not use unrestricted database credentials from application code.

---

# 48. Dependency Security

When adding dependencies:

* use maintained packages
* review versions
* review known security advisories
* avoid abandoned authentication/session packages
* avoid unnecessary dependencies

Do not add packages merely to solve problems that can be handled safely with the existing stack.

---

# 49. Development Diagnostics

The project should support:

```bash
npm run dev
```

using Nodemon.

Development startup should make failures obvious.

Useful diagnostics include:

* server startup
* database connection status
* route errors
* validation errors
* test failures

Do not suppress errors simply to make the development server appear successful.

---

# 50. ESLint

The project should support:

```bash
npm run check
```

using ESLint against relevant server and browser JavaScript.

The check should detect issues such as:

* syntax errors
* undefined variables
* undefined references
* common JavaScript mistakes
* missing imports where detectable

Do not broadly disable ESLint rules merely to make the migration pass.

Fix real problems.

---

# 51. Automated Tests

The project should support:

```bash
npm test
```

using:

```text
node --test
```

Test failures must result in a non-zero exit code.

The real MongoDB process-restart integration test uses `MONGODB_TEST_URI`, `MONGO_URI_TEST`, or `MONGODB_URI_TEST`. It starts the Express app in separate processes, uses a unique temporary test database, verifies API persistence and financial calculations after restart, and drops that database when the test finishes. Do not point these variables at a production database.

Tests should cover at least:

* account behavior
* transaction behavior
* monetary values
* date handling
* report boundaries
* budget behavior
* reserve behavior
* daily overrides
* account balances
* expected versus actual income
* Mongo persistence
* Mongo failures

---

# 52. Test Database Safety

MongoDB integration tests must use:

* a dedicated test database
* controlled test configuration
* or a deterministic repository adapter

Never allow automated tests to mutate production financial data.

Never use production credentials in tests.

---

# 53. Validation Command

The project should support:

```bash
npm run validate
```

which runs:

```text
static checks
+
automated tests
```

The validation command must return a non-zero exit code when validation fails.

---

# 54. Definition of Done — Phase 1

Phase 1 is complete only when all of the following are true:

1. Normal startup requires a reachable MongoDB connection.
2. The server does not silently fall back to the in-memory store.
3. MongoDB connection occurs before normal HTTP readiness.
4. Readiness accurately reflects database availability.
5. Graceful shutdown closes the database connection.
6. Accounts persist through MongoDB.
7. Transactions persist through MongoDB.
8. Planning records persist through MongoDB.
9. Reports operate from persisted data.
10. Career records persist without affecting financial calculations.
11. No normal application route relies on the process-local store.
12. Existing API behavior remains intact unless a documented change is required.
13. Existing frontend behavior remains intact.
14. Financial invariants remain unchanged.
15. Money remains integer centavos.
16. Philippine timezone behavior remains unchanged.
17. Expected income never becomes actual income automatically.
18. Account balances remain correctly derived from initial balance and actual transactions.
19. Archived history remains available.
20. Database failure paths are handled correctly.
21. Persistence survives application restart.
22. Invalid database IDs are handled safely.
23. Database errors are not exposed directly to users.
24. Credentials are never logged or exposed to the browser.
25. User-generated content is not rendered unsafely.
26. Relevant MongoDB integration tests pass.
27. `npm run check` passes.
28. `npm test` passes.
29. `npm run validate` passes.
30. No unrelated product functionality was removed or rewritten.

Do not declare Phase 1 complete based only on:

```text
MongoDB connected
```

or:

```text
Website loads
```

The application must demonstrably be using durable MongoDB persistence.

---

# 55. Phase 2 Completion Gate — Future

Phase 2 must not begin until:

* the product PRD explicitly approves authentication
* multi-user behavior is defined
* registration policy is defined
* account recovery behavior is defined
* session architecture is approved
* data ownership rules are approved
* legacy data migration strategy is approved

---

# 56. Phase 3 Completion Gate — Future

Phase 3 must not begin until:

* user roles are approved
* admin responsibilities are approved
* admin access boundaries are approved
* support/audit access, if any, is explicitly defined
* cross-user privacy rules are approved
* RBAC tests are defined

---

# 57. Recommended Delivery Sequence

## Phase 1

### Step 1

Confirm MongoDB-required startup behavior.

### Step 2

Confirm existing API and finance invariants.

### Step 3

Implement Account and Transaction persistence.

### Step 4

Add MongoDB integration tests.

### Step 5

Implement Budget, Reserve, and Daily Override persistence.

### Step 6

Verify Overview and Reports against persisted records.

### Step 7

Implement Career persistence.

### Step 8

Remove implicit normal-operation in-memory storage.

### Step 9

Verify restart persistence.

### Step 10

Run:

```bash
npm run check
npm test
npm run validate
```

### Step 11

Perform manual end-to-end verification.

---

# 58. Future Phase 2 Sequence

Only after PRD approval:

1. User model
2. Password hashing
3. Session storage
4. Login
5. Logout
6. `/api/auth/me`
7. Owner IDs
8. Ownership filters
9. Legacy data migration
10. Cross-user isolation tests
11. Browser authentication flow

---

# 59. Future Phase 3 Sequence

Only after PRD approval:

1. Role model
2. Authentication middleware
3. Role authorization middleware
4. Admin user management
5. Admin UI
6. Default-deny policy
7. Ownership enforcement
8. Cross-user security tests
9. Disabled-session handling
10. Full end-to-end validation

---

# 60. Final Agent Rules

The coding agent must follow these rules throughout implementation:

### Rule 1 — Preserve financial behavior

Do not change financial semantics while migrating storage.

### Rule 2 — Preserve working functionality

Do not rewrite working features without a requirement.

### Rule 3 — Phase boundaries matter

Implement Phase 1 only unless explicitly instructed otherwise.

### Rule 4 — Do not fake completion

A successful database connection does not mean persistence is complete.

### Rule 5 — Validate the whole path

Verify:

```text
Browser
→ API
→ persistence
→ MongoDB
→ response
```

where applicable.

### Rule 6 — Test failures honestly

Do not suppress or bypass failing tests.

Do not weaken validation simply to obtain green output.

### Rule 7 — Protect financial data

Do not log sensitive financial information unnecessarily.

### Rule 8 — Protect secrets

Never expose:

* passwords
* session secrets
* MongoDB credentials
* connection strings

### Rule 9 — Respect Philippine time

Use:

```text
Asia/Manila
```

for financial/business date interpretation.

### Rule 10 — Use exact monetary arithmetic

Use integer centavos consistently.

### Rule 11 — Avoid unnecessary architecture

Do not introduce complexity without a concrete benefit.

### Rule 12 — Work in coherent batches

Do not artificially divide related implementation work into tiny tasks.

### Rule 13 — Stop only for meaningful ambiguity

Ask for clarification when a decision could materially affect:

* financial correctness
* persisted data
* security
* compatibility
* product scope

Otherwise make the safest reasonable choice and document it.

### Rule 14 — Report honestly

At completion, report:

* what was implemented
* files changed
* tests added/changed
* validation results
* known limitations
* assumptions
* anything remaining

Do not claim completion if required validation is failing.

---

# 61. Final Completion Report Format

When the implementation task is complete, provide a concise report using this structure:

```text
IMPLEMENTED
- ...

FILES CHANGED
- ...

DATABASE
- ...

API
- ...

FRONTEND
- ...

TESTS
- ...

VALIDATION
- npm run check: PASS/FAIL
- npm test: PASS/FAIL
- npm run validate: PASS/FAIL

FINANCIAL INVARIANTS
- PASS/FAIL

MIGRATION / PERSISTENCE VERIFICATION
- PASS/FAIL

REMAINING ITEMS
- ...

ASSUMPTIONS
- ...
```

Do not mark an item as complete when it has only been partially implemented.

---

# 62. Final Product Boundary

The intended evolution is:

```text
CURRENT

Pocket Ledger
    ↓
Express
    ↓
In-memory storage
```

to:

```text
PHASE 1

Pocket Ledger
    ↓
Express
    ↓
Finance / Validation
    ↓
Repository / Service
    ↓
Mongoose
    ↓
MongoDB
```

then, only after explicit product approval:

```text
PHASE 2

Pocket Ledger
    ↓
Authentication
    ↓
User-owned data
    ↓
Express
    ↓
Finance / Validation
    ↓
Repository / Service
    ↓
Mongoose
    ↓
MongoDB
```

then:

```text
PHASE 3

Pocket Ledger
    ↓
Authentication
    ↓
RBAC
    ↓
Ownership
    ↓
Express
    ↓
Finance / Validation
    ↓
Repository / Service
    ↓
Mongoose
    ↓
MongoDB
```

The core product principle remains unchanged throughout:

> **Storage architecture may evolve. Financial meaning must not silently change.**

---

# 63. Vercel Deployment Readiness Gate

Use this gate after Phase 1 MongoDB persistence is implemented and before connecting this application to a production Vercel deployment. A successful local build, a successful MongoDB connection message, or a page loading in a preview is not by itself a GO decision.

## 63.1 Current Assessment

**Assessment: NO-GO for production deployment with real financial data.**

October 28 reassessment: authentication, ownership, and local browser verification are now implemented. The remaining hosting and real-data rollout work is summarized in [VERCEL_READINESS.md](VERCEL_READINESS.md). Prepare a protected synthetic-data Preview first; no hosted checks have passed yet.

This assessment is based on the current repository state:

| Check | Current state | Required before production GO |
| --- | --- | --- |
| Durable application storage | Normal API routes use the Mongo persistence store and do not fall back to process-local memory. A real-Mongo integration test now starts the app in two separate processes and verifies records, balances, planning data, overview, and reports survive the restart. The test uses an isolated, uniquely named database and drops it after the run. | Repeat persistence verification across a Vercel Preview redeploy. |
| Serverless entrypoint | `server.js` exports the Express app; `app.listen()` is only called when the file is run directly. Vercel's zero-configuration Express support recognizes an exported app from `server.js`. | Verify the detected Express Function and API routing on a Vercel Preview deployment; do not invoke `startServer()` from the Function. |
| Static assets | Browser assets are under `public/`. Vercel serves these as static assets; `express.static()` is retained for local Express use and is not Vercel's static-file delivery mechanism. | Verify `/`, `/styles.css`, and `/app.js` from a Vercel Preview deployment with correct content types. |
| Database lifecycle | A dedicated Mongo test URI connected successfully. The real-Mongo process-restart test passed. Local `/health` reports liveness while disconnected, `/ready` connects and reports readiness, and a Mongo-backed accounts read succeeded. | Verify warm/cold invocation reuse, cold-start behavior, and readiness failures against the Vercel Preview database. |
| Access control | Authentication, Admin/User separation, and per-user ownership are implemented and locally verified. Production sessions use Secure cookies. October 30 adds explicit Vercel proxy mode with immediate-hop trust and platform/runtime guards; default/local mode ignores forwarded headers. | Verify the actual hosting proxy boundary, HTTPS cookies, exact origin/CSRF handling, role isolation, revocation, and per-IP throttles on Preview. |
| Deployment access | No Vercel CLI, Vercel token, local Vercel project link, or Preview URL is available in this environment. | Install/authenticate the Vercel CLI or link the Git repository to a Vercel project, then configure Preview environment variables. |
| Production verification | No Vercel deployment or live smoke-test evidence is recorded. | Deploy a Development/QA Preview and complete all release checks below; this is not production approval. |

Use only synthetic data for the first protected Preview until hosted persistence, session behavior, and access controls have been verified. A successful Mongo connection alone does not establish production readiness.

## 63.2 Phase 1 Vercel Checklist

Mark every item PASS with evidence before considering a Vercel deployment that stores durable records:

- [ ] **Serverless-compatible app entry:** Vercel detects the Express app exported from `server.js`; `startServer()`/`app.listen()` are not invoked by serverless requests.
- [ ] **Static file delivery:** `/`, `/styles.css`, and `/app.js` return successfully from a Vercel Preview deployment, with correct content types and no missing assets.
- [ ] **Mongo persistence:** All in-scope records (accounts, transactions, budgets, reserves, daily overrides, and career data) are read/written through Mongoose repositories/models; no normal API route falls back to `inMemoryStore`.
- [ ] **Connection reuse:** Repeated requests and warm invocations reuse a safe cached Mongo connection/promise; simultaneous cold starts and connection failures are handled without false success responses.
- [ ] **Database availability:** `MONGODB_URI` is configured only in Vercel server-side environment settings. Readiness accurately reflects the database state. Liveness and readiness are not conflated.
- [ ] **Database network access:** MongoDB Atlas/network policy permits the chosen Vercel deployment to connect using a least-privilege database user and TLS. Do not expose database credentials to browser bundles or logs.
- [ ] **Serverless constraints:** API behavior does not depend on local disk persistence, in-memory state shared across requests/instances, long-running jobs, or a permanently running process. Review function duration/body limits for actual routes and data sizes.
- [ ] **Timezone invariants:** Date and report calculations pass under the Vercel runtime and continue to use `Asia/Manila`, including Monday-Sunday weeks and midnight/month-boundary cases.
- [ ] **Error handling:** Database outages and invalid requests return appropriate non-success responses; production responses do not reveal connection strings, credentials, stack traces, or internal implementation details.
- [ ] **Automated gates:** `npm run check`, `npm test`, and `npm run validate` all pass. Mongo integration tests use a dedicated test database, never production credentials/data.
- [ ] **Preview persistence smoke test:** Create a non-sensitive test record in Preview, read/update it, redeploy or start a fresh function instance, and confirm the record remains. Confirm a Mongo outage makes readiness fail and writes do not falsely report success.
- [ ] **Configuration separation:** Preview and Production use deliberately selected environment variables and database targets. Preview tests must not mutate production data.
- [ ] **Release evidence:** Record the Preview deployment URL, test date, validation output, persistence result, and any remaining limitations before Production promotion.

## 63.3 Public Financial Data Access Gate

The original Phase 1 supplied persistence only. Subsequent Admin/User phases now provide login and ownership isolation; local passing tests do not establish that these controls work behind the production proxy.

Before Production GO, choose and document one approved access model:

1. Keep the deployment private using an appropriate, verified Vercel access-protection policy for the target plan and environment; verify unauthenticated visitors cannot reach the application APIs.
2. Verify the implemented authentication/user-ownership controls on the hosted runtime before public access. Every business-data query must enforce ownership; Admin must remain excluded from financial/Career data.

If neither boundary is in place, verdict remains **NO-GO for real financial data**, even if every Phase 1 persistence check passes.

## 63.4 Decision Rule

Report one of these outcomes after testing:

- **NO-GO:** Any required checklist item is FAIL, UNKNOWN, or lacks evidence; do not promote to Production.
- **GO for protected Preview only:** Phase 1 checks pass, but production access/privacy policy or operational verification is incomplete. Use non-sensitive test data only.
- **GO for Production:** All Phase 1 checks pass, the production access boundary is approved and tested, secrets/network settings are verified, and the release evidence is recorded.

Do not mark Vercel readiness complete based only on a successful deployment build or a page load. Re-run this gate after changes to the Vercel adapter, Mongo connection lifecycle, environment variables, access controls, or persistence models.
