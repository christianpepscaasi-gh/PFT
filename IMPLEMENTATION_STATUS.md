# PFT implementation status

Reviewed October 21, 2026 (Asia/Manila).

## Implemented locally

- Philippine calendar defaults and display in the browser; explicit offsets on new transactions; Philippine interpretation of offset-free API timestamps.
- Monday–Sunday default report boundaries, valid month ends including leap years, inclusive explicit date endpoints, and range validation.
- Current balances through today's Philippine date; historical balances through the requested report end date.
- Payday input validation, calendar-day calculations, exclusion of archived balances, and daily-estimate labels with the calculation window.
- Checked API responses, visible save errors, retained input after failed writes, and duplicate-submit protection.
- Browser transaction editing/deletion, account archiving with warning and confirmation, daily override controls, and spending warning states.
- Probation counts refreshed on read; validation for Career statuses, task dates, and probation date order.
- Development stack-frame diagnostics without request bodies or connection strings.
- Updated MongoDB setup and test database documentation. Existing local secret values were not changed.

## Verification

- ESLint passes.
- Full validation: PASS, 37 tests passed, zero failures or skips. The MongoDB restart test passed using the explicitly authorized `.env` `MONGODB_URI_TEST` connection and a uniquely named `pft_test_*` database, which was cleaned up after the run. The validation process replaced its application URI with the test connection; production was not contacted and `.env` was not modified.
- The sandboxed attempt hit a DNS timeout. The network-enabled run passed in approximately 14 seconds, including restart persistence verification. ESLint, `npm test`, and `npm run validate` passed in that run.
- Date and planning regression tests also pass with the host timezone set to America/New_York.
- Browser handler tests cover failed-save retention, network errors, duplicate-submit prevention, and edit request/timestamp behavior. These use a controlled DOM adapter; they do not replace an interactive browser smoke test.

## Remaining release gates

1. Database validation gate: passed for the current code using `MONGODB_URI_TEST`. Repeat `npm run validate` with test database network access after relevant changes. Never substitute the production URI for the test URI.
2. Smoke-test account creation, transaction creation/editing/deletion, archiving, failed saves, daily overrides, and Career screens in a browser against a development database.
3. Configure a protected Vercel Preview with its own database. No Vercel CLI/project configuration or Preview URL was available during this update; nothing was deployed.
4. Verify static assets, cold/warm invocations, database outages, and persistence across Preview redeployment. Record the Preview URL and access-protection evidence before considering production.

Production remains NO-GO until the browser and deployment/access gates in FUTURE_INTEGRATION.md section 63 pass. Local restart persistence is verified; persistence across a Preview redeployment is still outstanding. Authentication, ownership, and RBAC remain future scope. Charts and the other P2 analytics enhancements remain deferred.
