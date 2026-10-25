# PFT working memory

Last updated: **October 26, 2026, Asia/Manila**.

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
- `PRD_v2.md` is the product source of truth. The file currently identifies itself as version 2.1.
- The active future-integration phase is MongoDB persistence. Authentication, ownership, multi-user support, and RBAC require a separate scope decision.
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
