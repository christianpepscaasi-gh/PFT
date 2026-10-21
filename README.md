# Pocket Ledger

Pocket Ledger is a personal finance tracker for recording income and expenses, reviewing account balances, and keeping budgets and spending plans separate from actual money. It also includes an optional career-progress area for probation dates, checkpoints, skills, tasks, and learning notes.

> **Development status:** Normal application operations use MongoDB for all resource types. MongoDB is required; startup does not fall back to memory. Authentication is not implemented. Production readiness still requires successful persistence tests and the protected deployment checks in [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md#63-vercel-deployment-readiness-gate).

## Features

- Overview with account balances, monthly income/expenses, and cash flow.
- Create accounts and record income/expense transactions.
- Reports using actual recorded transactions.
- Planning tools for monthly budgets, reserves, daily targets, and expected payday estimates.
- Optional career tracking for probation, checkpoints, skills, tasks, and a learning journal.
- Philippine-local date handling for financial calculations.

The app does not currently provide login, multi-user accounts, or Admin/User roles. Those are future scope, not implemented features.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Configure `MONGODB_URI` in your local `.env` before starting. Accounts, transactions, budgets, reserves, daily overrides, and Career records use MongoDB. `/health` reports process liveness; `/ready` checks database readiness. A failed initial connection prevents normal startup.

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

`npm run validate` runs ESLint and the automated test suite.

The restart persistence test reads `MONGODB_URI_TEST` first (aliases: `MONGODB_TEST_URI`, `MONGO_URI_TEST`). An explicit database name must contain `test`; a connection URI without a database name is also supported. It creates and drops a uniquely named `pft_test_*` database using that test connection; never supply production credentials. `MONGODB_URI` is for normal application operation and is not the restart test target. Without a test URI, this test is skipped and Mongo persistence is unverified.

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

**Demo warning:** A hosted instance currently uses process memory for API records. Restarting or redeploying will clear that data, and a host's temporary filesystem should not be treated as a database. Do not enter real or sensitive financial information until MongoDB persistence, ownership/security requirements, and deployment hardening are implemented.

## Project documents

- [PRD_v2.md](PRD_v2.md) is the product requirements source of truth.
- [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md) describes the planned MongoDB persistence work and later authentication/RBAC architecture. Its current implementation scope is MongoDB persistence only; login and RBAC remain future work.
