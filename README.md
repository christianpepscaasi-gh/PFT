# Pocket Ledger

Pocket Ledger is a personal finance tracker for recording income and expenses, reviewing account balances, and keeping budgets and spending plans separate from actual money. It also includes an optional career-progress area for probation dates, checkpoints, skills, tasks, and learning notes.

> **Prototype status:** This repository is suitable for development and a hosted demo, but it is not ready for real financial data. API data is currently held in memory and is lost when the server stops. Setting `MONGODB_URI` only connects Mongoose; the current routes still use the in-memory store. Complete the MongoDB persistence work described in [FUTURE_INTEGRATION.md](FUTURE_INTEGRATION.md) before using this with real financial records.

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

The server starts in in-memory mode when `MONGODB_URI` is not set. Data is reset when the process restarts. When `MONGODB_URI` is set, the server now connects to MongoDB and exposes a readiness check at `/ready`. Account and transaction routes are backed by the database when the connection is active, while the rest of the prototype remains intentionally in-memory until the broader migration work is completed.

To run without Nodemon:

```bash
node server.js
```

## Configuration

Create a local `.env` file if needed. `.env` is excluded from Git; never commit database credentials or other secrets.

| Variable | Required now | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `MONGODB_URI` | No for the current in-memory prototype | Mongoose connection string. The current API does not persist its records to MongoDB yet. |

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
