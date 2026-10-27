# Pocket Ledger

Pocket Ledger is a personal finance tracker for recording income and expenses, reviewing account balances, and keeping budgets and spending plans separate from actual money. It also includes an optional career-progress area for probation dates, checkpoints, skills, tasks, and learning notes.

> **Development status:** Normal application operations and sessions use MongoDB. Startup does not fall back to memory. Email/password authentication APIs and User ownership are implemented; browser login, Admin management, and actual personal setup are still pending. Production readiness requires reviewed provisioning/migration and the protected deployment checks in [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md#63-vercel-deployment-readiness-gate).

## Features

- Overview with account balances, monthly income/expenses, and cash flow.
- Create accounts and record income/expense transactions.
- Reports using actual recorded transactions.
- Planning tools for monthly budgets, reserves, daily targets, and expected payday estimates.
- Optional career tracking for probation, checkpoints, skills, tasks, and a learning journal.
- Philippine-local date handling for financial calculations.

Admin/User implementation is tracked in [ADMIN_USER_PLAN.md](ADMIN_USER_PLAN.md). Business APIs require an active User session; Admin has no finance/Career access. See [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md) for private test bootstrap and the API login/CSRF handshake. The browser workspace is not yet wired to login or CSRF tokens, so normal browser use awaits Phase 5. There is no default owner, password, public registration, or impersonation header. The [ownership migration runbook](OWNERSHIP_MIGRATION_RUNBOOK.md) covers test rehearsal and the separate live-migration gate.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Normal startup uses `MONGODB_URI`. In this workspace that variable is live: use `npm run dev:test` for development verification instead. Accounts, transactions, budgets, reserves, daily overrides, and Career records use MongoDB. `/health` reports process liveness; `/ready` checks database readiness. A failed initial connection prevents normal startup.

### Localhost with isolated test data

```bash
npm run dev:test
```

This command requires `MONGODB_URI_TEST` (aliases: `MONGODB_TEST_URI`, `MONGO_URI_TEST`) and a private `SESSION_SECRET` of at least 32 bytes. It selects the dedicated test connection before importing the app, replaces live configuration only in the current process, and binds to `127.0.0.1` on `PORT` (default `3000`). The browser origin must match `APP_ORIGIN` (default `http://127.0.0.1:<PORT>`). It refuses a missing/invalid test connection and never falls back to `MONGODB_URI`.

Browser test data is kept in the fixed `pft_test_local` database on the test connection, including after shutdown. Automated restart/ownership/migration/authentication tests use separate randomly named databases and clean those up. The shell/health/readiness work, and business requests require login. The server command does not modify `.env`, migrate records, seed identities, or delete browser test data. Explicit private provisioning uses `npm run bootstrap:test -- --target test [--apply]` with stdin, as documented in the setup guide.

To run without Nodemon:

```bash
node server.js
```

## Configuration

Copy `.env.example` to a local `.env` and configure your database. `.env` is excluded from Git; never commit database credentials or other secrets.

| Variable | Required now | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `MONGODB_URI` | Yes | Backend-only MongoDB connection string. |
| `MONGODB_URI_TEST` | For test commands | Dedicated test connection; never use live credentials. |
| `SESSION_SECRET` | For server authentication | Private random secret, at least 32 bytes; no real value in source control. |
| `APP_ORIGIN` | For browser API requests | Exact local origin; HTTPS required in production. |

Example local configuration:

```dotenv
PORT=3000
# MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
```

Do not put secrets in browser code, commit them to GitHub, or paste a real connection string into an issue or pull request.

## Checks

```bash
npm run check
npm test
npm run validate
```

`npm run validate` runs ESLint and the automated test suite. `npm test` loads the dedicated test connection and replaces all Mongo URI variables in the child test process before importing application code. It refuses missing or invalid test configuration. An explicit source database name must contain `test`; database-name query overrides are rejected. No actual URI is printed.

The Mongo integration tests create and drop uniquely named `pft_test_*` databases using that test connection; never supply production credentials. To deliberately run without live Mongo verification, use `npm run test:unit`. That command clears all Mongo URI variables in its child process and explicitly skips Mongo integration checks; it is not a full validation pass. Avoid raw `node --test` for the complete suite because it bypasses the safe configuration wrapper. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Financial calendar dates use `Asia/Manila`. Offset-free transaction timestamps are interpreted as Philippine wall-clock time; explicit offsets remain authoritative. Current balances include records through today?s Philippine date, while historical reports calculate balances through their selected end date. Weekly reports default to Monday?Sunday; custom report endpoints are inclusive. Monthly reports accept full `YYYY-MM-DD` start/end dates and derive omitted boundaries from that month.

Report date rules: weekly `start` or `end` selects its containing Monday-Sunday week. If both dates are supplied, they must be ordered and belong to the same week; otherwise the API returns 400. Use custom mode for exact inclusive endpoints or multiple weeks. Actual-income summaries exclude future-dated income with category `Salary` until its Philippine calendar date begins, including when a future report period is requested. The source transaction remains in history. Same-day salary follows the existing calendar-day convention, rather than a time-of-day cutoff. Other transaction types and report balances as of an explicitly selected end date retain their existing behavior.

## Publish to GitHub

Create an empty repository on GitHub first. This workspace currently has no Git repository initialized. From the project directory, initialize and push the source with:

```bash
git init
git add .
git commit -m "Initial Pocket Ledger app"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

Replace the remote URL with the URL of the repository you created. Before pushing, check that `.env` and any credentials are not staged:

```bash
git status
```

## Hosting notes

This is an Express/Node application, so GitHub Pages cannot host the running app; Pages serves static files and does not run `server.js`. To run the app from a public URL, deploy it to a Node.js web-service host that supports Express:

1. Push this repository to GitHub.
2. Create a web service on your chosen host and connect the repository.
3. Set the runtime to Node.js 20 or newer.
4. Use `npm ci` as the install command and `node server.js` as the start command.
5. Set `PORT` only if your host requires it; the app uses the host-provided port.
6. Configure secrets through the host's environment-variable settings, never in committed files.
7. Run `npm run check`, `npm test`, and `npm run validate` before releasing changes.

**Hosting status:** Records and sessions persist in MongoDB. Real provisioning, reviewed live ownership migration, browser workflows, and deployment protections still require completion before exposing real financial data. Vercel/proxy configuration is future work.

## Project documents

- [PRD_v2.md](PRD_v2.md) is the product requirements source of truth.
- [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md) describes the planned MongoDB persistence work and later authentication/RBAC architecture. Its current implementation scope is MongoDB persistence only; login and RBAC remain future work.
