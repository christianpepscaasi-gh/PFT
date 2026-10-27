# Pocket Ledger (PFT)

## Product Requirements Document

**Version:** 2.2
**Status:** Revised product specification
**Updated:** October 27, 2026
**Audience:** Product owner, implementation team, and coding agents
**Supersedes:** The original `PRD.md` as the product direction; `REVISION.md` and `BUGS_AND_FEATURES.md` remain implementation references until their open items are closed.

---

## 0. Implementation Agent Instructions

### October 27 approved scope addendum: Admin/User

The product owner approved the decisions in [ADMIN_USER_PLAN.md](ADMIN_USER_PLAN.md) and requested implementation on October 27. This addendum supersedes this document's earlier exclusion of authentication and multi-user accounts only for that defined scope. It specifies required behavior, not completed functionality. Other financial requirements remain unchanged.

- One product-owner Admin manages account requests, creates/invites Users, disables/enables access, and reviews management audit events. There is no web role-promotion or permanent user-deletion capability.
- The Admin identity cannot access finance, planning, reports, or Career workspaces/data. The owner uses a distinct personal User identity for existing financial and Career records.
- Every User's accounts, transactions, budgets, reserves, daily overrides, and Career records are private to that User. Enforce ownership on the server, including aggregates, reports, referenced accounts, and owner-scoped upserts/indexes. RBAC alone does not establish isolation.
- Visitors may request an account using name, email, and optional reason. Admin approval or direct account creation produces a pending User; a valid, expiring, single-use activation invitation lets the recipient choose their password. No automatic public registration or caller-selected roles.
- Email/password login uses server-managed sessions. Disabling access immediately invalidates sessions and blocks login while preserving records; re-enabling does not revive sessions.
- Record access-management actions without passwords, tokens, credentials, or private business content. Never grant Admin implicit access to User records.
- Email invitation delivery is the final feature. Google sign-in and password recovery are deferred. No temporary public activation/password bypass may replace email during development.
- Localhost is the initial runtime; Vercel is future deployment work. Verification must select the dedicated test database before importing the app. Production data migration, pushes, and deployment remain separate operations.
- Migrate legacy records only to the explicitly designated personal User after backup, dry run, and preservation checks. No ambiguous assignment to the Admin or a guessed User.

Phase 1 implementation covers documentation alignment, [ownership inventory](ADMIN_USER_OWNERSHIP_INVENTORY.md), test-only identity fixtures, and safe test commands. Ownership and authentication must ship together before multi-user access is enabled. Phase 1 completion does not imply login or RBAC exists.

This document is the source of truth for the requested product behavior and release requirements.

When implementing or modifying Pocket Ledger:

1. Inspect the existing repository before changing code.
2. Inspect the current:

   * repository structure
   * `package.json`
   * server entry point
   * database connection logic
   * Mongoose models
   * API routes
   * frontend JavaScript
   * HTML/CSS
   * existing tests
   * existing development and production scripts
3. Preserve existing working functionality unless this PRD explicitly requires a change.
4. Do not rebuild the application using a frontend framework.
5. Do not replace MongoDB/Mongoose without an explicitly approved technical reason.
6. Do not rewrite large portions of the application merely to implement a localized requirement.
7. Reuse existing working abstractions where practical.
8. When changing a financial calculation, identify the existing calculation first and prefer extracting or reusing a shared calculation rather than implementing duplicate versions in multiple routes or UI components.
9. Do not invent product behavior that is not specified here when doing so could affect financial calculations, persisted data, account balances, reports, or user-visible financial information.
10. When a requirement is ambiguous, choose the safest interpretation that preserves recorded financial data and document the assumption.
11. Implement priorities in this order:

    * P0
    * P1
    * P2
    * P3 only when explicitly approved
12. Do not spend implementation time on P3 items unless explicitly requested.
13. After meaningful implementation changes, run the relevant checks and tests.
14. Before declaring implementation complete, run:

    * `npm run check`
    * `npm test`
    * `npm run validate`
15. If a command fails, investigate and fix the underlying issue. Do not hide, suppress, skip, weaken, or bypass the failure merely to make validation pass.
16. Do not delete failing tests simply because the current implementation does not satisfy them.
17. Do not broadly disable ESLint rules to avoid fixing errors.
18. Do not modify or expose production credentials, `.env` secrets, deployment secrets, or database connection strings.
19. Never place secrets in browser-delivered JavaScript.
20. Never expose database credentials or connection strings through API responses, logs, HTML, or frontend code.
21. Do not log transaction amounts, descriptions, notes, or other private financial data by default.
22. Development errors should be actionable enough to identify the failing operation, route, or function.
23. Production errors must not expose stack traces, credentials, database connection strings, or sensitive financial data.
24. When implementation is complete, report:

    * files changed
    * requirements completed
    * tests added or modified
    * commands executed
    * validation results
    * known remaining issues

The implementation agent must treat financial data correctness and preservation of existing transaction history as higher priority than cosmetic refactoring.

---

# 1. Product Summary

Pocket Ledger is a personal finance tracker with an optional career-progress area. It helps one person record actual financial activity, understand account balances, monitor spending, plan between expected paydays without counting money that has not arrived, and maintain a personal record of probation milestones and work-related learning.

The product must report recorded facts separately from estimates and plans.

In particular:

* An expected payday is not income.
* An employment checkpoint is not a predicted outcome.
* A budget is not a salary estimate.
* A savings plan is not a transaction.
* A spending limit is not a restriction on recording valid transactions.
* Missing information must not be replaced with invented values.

## Product questions

* Where did my money go?
* How much is in each account, based on its starting balance and recorded transactions?
* Am I within my daily and monthly spending targets?
* How much can I plan to spend before the next expected payday, using only money already received?
* What have I learned and completed during my probation period?

---

# 2. Product Principles

1. **Record reality:** Only actual, user-recorded transactions change income, spending, or account balances.

2. **Keep plans separate:** Budgets, savings intentions, daily limits, and expected paydays do not create or modify transactions.

3. **Preserve history:** Archive accounts rather than deleting transaction history.

4. **Use local dates correctly:** Financial dates and displayed times follow `Asia/Manila`. Timestamps crossing midnight belong to the Philippine calendar date on which they occurred.

5. **Explain uncertainty:** Estimates must be labeled and must not imply guaranteed pay or employment outcomes.

6. **Keep it personal and quick:** Optimize for one person's frequent use without enterprise workflows.

7. **Make failures visible:** Static checks, tests, and development-server errors must produce actionable terminal output.

8. **Prefer one source of truth:** Shared financial calculations should be implemented once and reused wherever possible.

9. **Do not fabricate information:** When required information is unavailable, show an explicit unavailable/unknown state instead of inventing a value.

10. **Preserve existing behavior:** Correct existing functionality should not be broken merely to introduce new features.

---

# 3. Users and Scope

## Primary user

A single person who wants to track day-to-day income and expenses, manage multiple wallets/accounts, review spending, and optionally track career progress.

## In scope

* Income and expense transaction management.
* Accounts, categories, monthly budgets, daily limits, and date-specific limit overrides.
* Daily, weekly, monthly, and custom-period reports.
* Actual salary recording and expected payday dates of the 6th and 21st.
* Account balance visibility.
* Planning based on received funds.
* Optional career tracking for probation dates, checkpoints, skills, tasks, and learning notes.
* Local development diagnostics.
* Automated tests.

## Out of scope

* Bank or e-wallet integrations.
* Automatic transaction imports.
* Payment processing.
* Credit-card integrations.
* Investment tracking.
* Cryptocurrency tracking.
* Full accounting ledgers.
* Financial advice.
* Authentication beyond the approved Admin/User addendum (for example, Google sign-in and password recovery).
* Multi-user features beyond separate private User workspaces (for example, shared workspaces).
* Organizations.
* Enterprise permissions.
* Native mobile applications.
* Push notifications.
* Automatic salary amounts.
* Guaranteed future income.
* Predicted employment decisions.
* Transfers between accounts in the initial scope.

If transfers are introduced later, transfers must not count as income or expenses and must have explicit neutral balance-movement semantics.

---

# 4. Financial Data Rules

## 4.1 Money representation

Money must be represented using integer centavos for persistence and calculations.

For example:

* `₱100.00` → `10000` centavos
* `₱1.50` → `150` centavos

Requirements:

* Persist monetary values as integer centavos.
* Do not persist formatted peso strings as monetary values.
* Do not use JavaScript floating-point currency values for persisted monetary totals.
* Avoid floating-point arithmetic when calculating persisted monetary values.
* Use a numeric database representation capable of safely representing the required range.
* Format values as Philippine pesos only for display.

### API money-unit contract

Every API field representing money must have one explicitly defined unit.

Unless an existing API contract requires otherwise, backend APIs should use **integer centavos** for monetary values.

Do not silently mix:

* pesos
* centavos
* formatted strings

within the same API contract.

If an existing API currently uses pesos, preserve compatibility where practical and document any migration rather than silently changing the contract.

---

## 4.2 Transaction types and fields

Each transaction must include:

* Type: `income` or `expense`.
* Positive amount in centavos.
* Description.
* Account reference.
* Actual date and time.
* Category where applicable.
* Optional notes.

Income may use the Salary category.

Users must be able to:

* create transactions
* view transactions
* edit transactions
* delete transactions

The following must be editable where valid:

* account
* type
* amount
* category
* description
* date/time
* notes

A successful transaction change must refresh every affected:

* dashboard/Overview total
* account balance
* report total
* category summary
* salary summary where applicable

Income is recorded on the date and time the money was actually received.

Expense and income reports use that actual timestamp interpreted in Philippine local time.

Payroll gross pay and deductions may be retained as optional detail, but the transaction amount and account balance effect must use the **net amount actually received**.

A zero-value salary transaction must not be created as a placeholder.

---

# 5. Financial Data Invariants

The following invariants must never be violated:

1. Expected income never automatically becomes actual income.

2. A budget never creates a transaction.

3. A savings plan never creates a transaction.

4. A savings plan does not move money between accounts unless an explicit transaction or future transfer feature is intentionally implemented.

5. A daily spending limit never changes the monthly budget.

6. A daily spending limit never blocks a valid transaction.

7. Editing a transaction updates all affected derived totals.

8. Deleting a transaction updates all affected derived totals.

9. A transaction belongs only to its selected account.

10. Historical transactions must never be silently reassigned when an account is archived.

11. Archived accounts retain their historical transactions.

12. Current account balances use one shared calculation everywhere.

13. Expected salary is never included in actual income.

14. Expected salary is never included in available funds for payday planning.

15. Missing required information produces an unavailable/unknown state rather than a fabricated number.

16. The application never invents salary amounts.

17. The application never predicts employment outcomes.

18. The application never invents checkpoint results.

19. The application never invents user activity.

20. Reports use actual recorded transactions unless a metric is explicitly identified as an estimate, plan, or projection.

21. Net cash flow, remaining budget, savings plans, and account balances must not be treated as interchangeable metrics.

---

# 6. Accounts and Balances

## 6.1 Account types

Support multiple accounts, including:

* Cash
* Bank
* E-wallet
* Credit Card
* Other

Each account has:

* name
* type
* initial balance
* active/archived state

## 6.2 Balance calculation

For an account:

**Calculated balance = initial balance + recorded income − recorded expenses**

through the selected as-of date.

Only transactions belonging to that account affect its balance.

If transfers are introduced later, they must have neutral transfer semantics and must not alter income or expense totals.

The same balance calculation must be used by:

* Settings
* Overview
* Reports
* account summaries
* account charts

These views must not show different definitions of "current balance."

## 6.3 Active and archived accounts

* Active accounts appear in current-balance summaries.
* Archived accounts remain in historical reports.
* Archived accounts retain their transaction history.
* Historical transactions must not be silently moved to another account.
* Archived accounts are excluded from current-balance visualizations unless the view is explicitly historical.

Account archiving requires:

1. a clear warning
2. a second confirmation

The warning must explain that:

* the account becomes inactive
* historical transactions remain preserved

## 6.4 Account type ordering

Summaries grouped by account type use this stable order:

1. Cash
2. Bank
3. E-wallet
4. Credit Card
5. Other

Account names and calculated amounts must remain visible.

---

# 7. Categories

Provide the existing default expense categories:

* Food
* Transportation
* Groceries
* Bills
* Shopping
* Entertainment
* Personal
* Health
* Education
* Debt
* Other

Provide:

* Salary

for income.

Category management beyond existing capabilities is an enhancement and is not a prerequisite for accurate transaction recording.

---

# 8. Payroll, Budgets, and Spending Plans

## 8.1 Expected payroll dates

The default expected salary dates are:

* 6th of each month
* 21st of each month

These dates are interpreted using `Asia/Manila`.

Expected payroll dates are estimates for planning only.

The app may display:

* next expected date
* expected status
* "Amount not set"

but must not:

* create an income transaction
* invent a salary amount
* increase an account balance
* increase actual income

A late or missing payment does not count as received income.

The user records salary only after payment is actually received.

Salary uses:

* actual received date/time
* selected receiving account
* actual net amount received

### Shift crossing midnight

A shift ending at `2:00 AM` on the following day belongs to that following calendar day.

Do not derive an income date from the shift's start date.

### Payroll labels

Salary release labels and work-period labels may be stored when explicitly provided.

Do not guess labels for historical salary entries that lack them.

---

# 9. Monthly Budget and Savings

## 9.1 Monthly budget

Monthly budgets are set by the user.

They are independent of:

* salary
* expected income
* daily limits
* savings plans

Changing a daily limit must never change the monthly budget.

Do not:

* assume a monthly salary
* calculate a budget automatically from expected pay
* convert expected salary into budgeted money

## 9.2 Savings

Savings are a user-entered plan or reservation.

Savings:

* are not an expense
* are not automatically an account transfer
* do not change account balances
* do not create transactions

unless the user records a corresponding transaction or an explicitly implemented future transfer feature is introduced.

---

# 10. Daily Spending Limit

Show a daily spending target derived from:

* the user's monthly budget
* the remaining budget period

The calculation must be clearly labeled as a **suggestion**.

A user can set a one-date override.

The override may include:

* target amount
* optional reason

A date-specific override:

* affects only that date
* does not change the monthly budget
* does not change other dates
* does not change account balances

Spending above a target is a visual warning only.

Never block a valid transaction because it exceeds a target.

Show:

* today's spending
* today's target or override
* remaining amount or exceeded amount

Use distinguishable states for:

* below limit
* approaching limit
* over limit

---

# 11. Recommendation Until Next Expected Payday

This recommendation is separate from the monthly-budget daily limit.

Calculate a suggested daily amount from:

* currently available funds
* calendar days before the next expected payday

Available funds must be based on:

* current recorded account balances
* less only explicitly configured user savings/reserved amounts

Do not include:

* expected salary
* unrecorded income
* hardcoded salary values
* predicted income

The recommendation must:

* clearly label itself as an estimate
* show the inputs used
* show the date window used
* distinguish itself from the monthly budget daily limit
* allow a date-specific target/override without modifying account balances or monthly budget

If the calculation lacks meaningful inputs, do not fabricate a number.

Examples of missing inputs include:

* no usable account balance
* no next expected date
* invalid date range
* missing user-defined reserve information when reserves are required

Instead, show an explicit unavailable explanation.

---

# 12. Overview and Transaction Entry

The Overview is the primary finance screen.

For the selected/current Philippine date and month as appropriate, it must show:

* actual income received
* actual expenses recorded
* today's spending
* daily target/override
* remaining or exceeded daily amount
* monthly budget
* monthly spending
* remaining monthly budget
* current balances by active account
* next expected income date
* expected-income status
* no assumed salary amount
* today's transaction timeline

Today's transactions must appear in chronological order.

## Quick Entry

Quick Entry must remain fast.

The planned interaction is a header action that opens a modal containing the existing transaction fields.

The modal must:

* default date to the current Philippine date
* default time to the current Philippine time
* support income and expense
* retain validation
* focus the first useful field
* refresh affected summaries after save
* keep account editable
* keep category editable

The most recently used account/category may be offered as a convenience but must remain editable.

## Salary-month summary

The salary-month summary input must:

* initialize to the current Philippine month on page load
* use the same month value for its API query
* display the queried period
* remain synchronized with the period actually queried

---

# 13. Reports and Account Views

## 13.1 Supported periods

Support:

* Today
* Week
* Month
* Custom date range

Custom range endpoints are inclusive.

A week is:

**Monday through Sunday**

using Philippine local dates.

Reports must correctly handle:

* month boundaries
* year boundaries
* leap years
* Philippine midnight transitions

## 13.2 Report metrics

Where applicable, reports include:

* actual income
* actual expenses
* net cash flow
* transaction count
* chronological transaction timeline
* spending by category
* largest expense
* daily spending totals
* daily limit/override
* daily over/under amount
* average daily spending
* highest spending day
* lowest spending day
* account balances as of the report end date

Account balances must be calculated consistently from:

* initial account balance
* account transactions through the report end date

Do not describe the following as interchangeable:

* net cash flow
* remaining budget
* savings plans
* account balances

## 13.3 Salary reports

Salary summaries must use actual recorded income only.

Expected salary dates do not create salary records.

Daily and monthly salary summaries must include only actual income within the selected period.

---

# 14. Charts

Preserve existing report chart behavior unless explicitly changed by this PRD.

## 14.1 Multi-month daily expense comparison

Add a daily-expense line chart comparing:

* current month
* up to five other selected months

Maximum:

**six months total**

Series must be aligned by calendar day number.

For example:

* March 5 aligns with April 5.
* March 31 remains March 31.
* A shorter month must not shift later dates.

Do not align dates merely by array index.

## 14.2 Account comparisons

Add account comparison views only when their semantics are explicit.

Use:

* period expenses for the selected report period
* balances as of the selected report end date

Do not present a period expense total as if it were a current balance.

## 14.3 Account balance charts

Account balance charts must use calculated balances, not initial balances mislabeled as current balances.

Charts must:

* clearly label zero balances
* clearly label negative balances
* exclude archived accounts from current-balance visualizations
* retain archived accounts in historical transaction/report data

## 14.4 Account activity bar/line switch

A bar/line switch for account activity must use:

* dated per-account movements
* explicitly selected time range
* clearly defined metric semantics

Do not represent a simple sum of expenses as a running balance.

---

# 15. Career Progress — Optional Personal Area

The finance experience remains primary.

The Career area is optional and must:

* not affect financial data
* not create financial transactions
* not assume a positive employment outcome
* not predict retention or employment decisions

## 15.1 Probation

Allow the user to configure:

* probation start date
* probation end date

Calculate:

* elapsed days
* remaining days

from the configured dates.

Do not assume a fixed 180-day duration.

## 15.2 Checkpoints

Support user-created checkpoints with:

* date
* title
* notes
* status

Statuses may include:

* upcoming
* completed
* passed
* needs improvement
* unknown

Do not infer checkpoint results.

## 15.3 Skills

Support user-entered skill statuses:

* not started
* learning
* practicing
* comfortable
* mastered

Do not invent numeric progress.

## 15.4 Work tasks

Support:

* todo
* in-progress
* completed

Tasks may include:

* dates
* optional notes

## 15.5 Learning journal

Support dated personal learning-journal entries.

## 15.6 Explanations

Provide concise, accessible explanations for:

* timeline
* checkpoints
* skills
* tasks
* journal

Avoid claims about:

* likely retention
* review results
* future performance
* employment outcomes

## 15.7 Financial runway

A financial-runway estimate based on available reserves and historical essential spending is a future enhancement.

It must:

* remain outside launch scope
* be clearly labeled as an estimate
* not assume job loss
* not assume guaranteed future income

---

# 16. Settings and Preferences

Allow management of:

* accounts
* existing settings

without losing transaction history.

## Salary display preferences

Salary display preferences must preserve separate selections for:

* Transactions
* Reports

Moving these settings into a Settings modal is a usability enhancement.

Saving one group must not silently overwrite the other.

## Account summaries

Account summaries must display:

* calculated current balances

not:

* initial balances mislabeled as current balances

## Consistency

Account:

* type ordering
* labels
* balance semantics

must remain consistent across:

* Settings
* Overview
* Reports

---

# 17. Technical Requirements

## 17.1 Stack

### Frontend

* HTML
* CSS
* vanilla JavaScript

### Backend

* Node.js 20 or newer
* Express

### Database

* MongoDB
* Mongoose
* existing Mongoose models where applicable

### Charts

* Chart.js where charting is needed

### Deployment

* Vercel-compatible Node application

## 17.2 Structure preservation

Preserve the existing application structure and working features.

Do not:

* introduce a frontend framework
* replace MongoDB
* rewrite the entire application
* replace working architecture without an approved product/technical reason

Localized improvements are preferred over unnecessary rewrites.

---

# 18. Date and Time Requirements

All financial date calculations must explicitly use:

**`Asia/Manila`**

Do not rely on the server's system timezone for financial calculations.

Application behavior must correctly interpret:

* transaction timestamps
* salary receipt timestamps
* expected payday dates
* daily reports
* weekly reports
* monthly reports
* custom ranges
* shift timestamps
* probation dates where applicable

When converting a timestamp to a financial calendar date, interpret it in `Asia/Manila`.

A timestamp crossing midnight must belong to the Philippine calendar date on which it actually occurred.

Do not use the server's local timezone as an implicit substitute.

Where possible, centralize date/time utilities instead of implementing timezone logic separately in each route.

---

# 19. Development Diagnostics

Development must not depend on manually checking code blindly.

The following terminal workflow is required.

## 19.1 `npm run dev`

`npm run dev` must run the server through **Nodemon**.

Nodemon must:

* watch relevant server files
* restart the server after changes
* display startup errors
* display runtime errors
* display stack traces in development

Add Nodemon as a development dependency.

Do not replace the requested Nodemon workflow with `node --watch`.

Nodemon detects file changes and restarts the process.

Nodemon does **not** prove that application logic is correct.

Correctness is verified through:

* ESLint
* automated tests
* focused integration tests
* visible runtime errors

### Database startup behavior

MongoDB is required for normal application operation.

If the initial database connection fails during development startup:

* log the database connection failure clearly
* include an actionable error/stack trace
* do not pretend the application is fully operational
* exit with a non-zero status when the application cannot function normally without the database

The error must identify that the failure is a database connection/startup failure.

Do not expose credentials or connection strings.

---

# 20. ESLint and Static Checks

## `npm run check`

`npm run check` must run **ESLint** across:

* server JavaScript
* browser JavaScript
* other applicable JavaScript source files

Rules must catch at minimum:

* syntax errors
* undefined variables
* undefined references
* common JavaScript mistakes
* missing/incorrect imports where detectable

Fix errors or explicitly document intentional exceptions.

Do not broadly suppress ESLint errors.

---

# 21. Automated Tests

## `npm test`

`npm test` must run Node's built-in test runner:

```text
node --test
```

A failed test must produce a non-zero exit code.

Tests must not silently pass when assertions fail.

---

# 22. Validation Gate

## `npm run validate`

`npm run validate` must run:

1. static checks
2. automated tests

It must stop with a non-zero exit code if either stage fails.

The minimum local verification gate before deployment is:

```text
npm run validate
```

Database-backed integration tests must use:

* a dedicated test database
* an isolated test database
* or a controlled test adapter

They must not:

* require production credentials
* mutate production data
* delete production data

---

# 23. Error Handling and Logging

Errors must be logged with enough context to locate the failing route or operation.

In development, diagnostic output may include:

* HTTP method
* route
* error message
* stack trace
* relevant non-sensitive diagnostic context

Production responses must not expose:

* stack traces
* credentials
* database connection strings
* secrets
* sensitive financial content

Client responses should provide stable, useful error messages.

Server logs should contain deeper diagnostic information.

Do not conceal server failures behind successful responses.

Do not return a successful response merely because an internal operation failed.

Do not log every successful function call.

Do not print transaction:

* amounts
* descriptions
* notes

by default.

Use automated tests for expected behavior and concise structured error logging for failures.

---

# 24. API and Security Requirements

Validate all incoming data at the API boundary.

Validation must cover:

* request bodies
* path parameters
* date keys
* amounts
* referenced records
* transaction types
* account references
* category references where applicable

Use environment variables for secrets.

Never:

* commit `.env` values
* expose MongoDB credentials
* expose database connection strings
* send secrets to browser code
* embed secrets in frontend JavaScript

Restrict database access to the backend.

Use HTTPS in production.

Sanitize user-provided text where it is rendered.

Prevent:

* HTML injection
* script injection
* unsafe rendering of user-provided content

Production error responses must not expose internal implementation details.

---

# 25. Priorities and Release Scope

## P0 — Preserve and verify existing product behavior

The following must remain functional:

* transaction CRUD
* income recording
* expense recording
* categories
* accounts
* budgets
* daily limits
* reports
* payroll actual-income handling
* Career tracking
* Philippine date/time behavior
* expected payday schedule
* no fabricated salary or income
* monthly budget independence from salary
* terminal diagnostics
* `npm run validate`

P0 work is primarily about preserving existing functionality and establishing confidence in correctness.

---

## P1 — Required correctness fixes and planning

1. Initialize the Overview salary-month field on page load.

2. Keep the salary-month field synchronized with the period actually queried from the API.

3. Fix the weekly report route's date helper/reference failure.

4. Cover Monday-Sunday weekly boundaries in tests.

5. Establish one shared account-balance calculation.

6. Use that calculation consistently in:

   * Settings
   * Overview
   * Reports

7. Ensure every transaction:

   * create
   * update
   * delete

updates all affected account balances and financial summaries.

8. Add the available-funds-to-next-payday recommendation.

9. Ensure the recommendation uses only:

   * actual recorded balances
   * explicit user reserves

10. Confirm separate account activity affects only the selected account.

11. Ensure missing planning inputs produce an explicit unavailable state rather than a fabricated recommendation.

---

## P2 — Planned usability and analytics enhancements

* Quick Entry modal launched from the header.
* Multi-month daily-spending comparison, up to six months total.
* Account expense/balance comparisons.
* Bar/line account activity views with defined date semantics.
* Account-balance distribution chart with zero/negative values handled explicitly.
* Salary display preferences modal.
* Account-type grouping.
* Career-section tooltips and explanations.

---

## P3 — Decision required / future scope

### Fund allocation proposal

The proposed allocation:

* 50% expenses
* 10% savings
* 10% self-improvement
* 10% play
* 10% tithes

currently totals **90%**.

Before implementation, decide:

1. whether the remaining 10% is intentionally unallocated
2. whether it should be assigned to another category
3. whether allocations are plans only
4. whether allocations ever move actual money

Allocations must not move money unless explicitly designed and confirmed.

### Financial runway

Financial runway is future scope.

It is not a launch requirement.

### Other future scope

* recurring transactions
* savings goals
* recurring-income automation
* multi-user support
* account transfers
* bank integrations
* automatic imports

---

# 26. Definition of Done

A requirement is considered implemented only when all applicable layers are complete.

Where applicable:

* Backend behavior is implemented.
* Request validation is implemented.
* Database behavior is correct.
* Existing transaction history is preserved.
* Frontend behavior is implemented.
* Existing affected screens remain functional.
* Relevant error paths are handled.
* Development diagnostics are actionable.
* Relevant automated tests are added or updated.
* Existing tests continue to pass.
* `npm run check` passes.
* `npm test` passes.
* `npm run validate` passes.
* No secrets are introduced into source code.
* No secrets are exposed to browser-delivered JavaScript.
* Financial calculations retain their specified semantics.
* Existing working finance features remain intact.

A feature must not be declared complete solely because its route, function, or UI component exists.

---

# 27. Acceptance Criteria

The revised PFT is acceptable when:

1. A user can add, view, edit, and delete actual income and expense transactions with:

   * amount
   * description
   * category where applicable
   * account
   * date/time
   * notes

2. Salary is expected on the 6th and 21st for planning, but only an actual user-recorded payment changes actual income or account balance.

3. No salary amount is fabricated.

4. Expected salary never contributes to available funds.

5. Philippine-local dates are used consistently.

6. Transactions and work shifts crossing midnight are assigned to the correct Philippine calendar date.

7. Monthly budget, savings plan, daily limit, and actual income remain separate values.

8. A one-date daily-limit override does not affect:

   * other dates
   * monthly budget
   * account balances

9. Current balances are derived consistently from:

   * initial balances
   * actual account transactions

10. Settings, Overview, and Reports agree on current account balances.

11. Daily reports produce correct totals.

12. Monday-Sunday weekly reports produce correct totals.

13. Monthly reports produce correct totals.

14. Inclusive custom date ranges produce correct totals.

15. Daily and monthly salary summaries include only actual income in their selected periods.

16. The weekly route works across:

* month boundaries
* year boundaries

17. Weekly boundary behavior has regression coverage.

18. The Overview salary-month field initializes to the current Philippine month.

19. The Overview salary-month field matches the period queried from the API.

20. The payday recommendation never counts expected income as available.

21. The payday recommendation clearly exposes missing inputs instead of inventing a value.

22. Account transactions affect only their selected account.

23. Editing and deleting transactions correctly update affected balances and reports.

24. Archived accounts retain historical transactions.

25. Archived accounts are excluded from current-balance visualizations.

26. Account balance charts use calculated balances rather than initial balances.

27. Zero and negative account balances are represented clearly.

28. Multi-month daily expense comparisons align values by calendar day number rather than array index.

29. Career dates, checkpoints, skills, tasks, and journal entries are user-controlled.

30. Career functionality never implies a predicted employment outcome.

31. `npm run dev` uses Nodemon.

32. Development server failures are visible in the terminal.

33. Initial required MongoDB connection failures do not leave the application falsely appearing fully operational.

34. `npm run check` runs ESLint and fails visibly when applicable errors exist.

35. `npm test` runs `node --test` and fails visibly when tests fail.

36. `npm run validate` runs static checks and tests and returns a non-zero exit code when either fails.

37. Production errors do not expose:

* stack traces
* credentials
* database connection strings
* sensitive financial data

38. No production secret is committed.

39. No production secret is sent to the frontend.

40. Existing working finance features remain intact after implementation.

---

# 28. Source Documents and Status Notes

This PRD consolidates:

* `PRD.md`
* `REVISION.md`
* `BUGS_AND_FEATURES.md`

The original backlog identifies smoke-test findings and proposed features.

Listing an item in this document does **not** mean it has already been implemented.

Implementation status must be determined by inspecting and running the application.

P0 items are preservation and verification requirements.

P1 items are correctness and release work.

P2 items are planned usability and analytics enhancements.

P3 items require product decisions or remain future scope.

Implementation status must only be marked complete after verification through the running application and appropriate automated tests.

The implementation agent must not claim a requirement is complete merely because code was written for it.
