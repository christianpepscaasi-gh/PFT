# Retained local test data

Use `npm run seed:test -- --target test --apply` to seed and verify **only `pft_test_local` on the dedicated test connection**. The script selects `MONGODB_URI_TEST` through the same safe wrapper as `dev:test`; it never falls back to the live connection. No email is sent.

The seed retains:

- Demo Admin (`seed.admin@example.test`) and Demo User (`seed.user@example.test`).
- User-owned synthetic Cash wallet with PHP 5,000 initial balance and a PHP 150 lunch expense.
- A synthetic private Career journal entry.

Passwords are randomly generated and saved in `test-seed.bootstrap.local.json`, which is gitignored. Open that file locally for both login details; never commit it, paste it into chat, or reuse these accounts outside the test database. Reruns preserve passwords and skip existing named samples. The seed refuses conflicting existing identities rather than replacing the sole Admin or resetting credentials. It does not delete unrelated test data.

Start `npm run dev:test` with the documented private `SESSION_SECRET` and matching `APP_ORIGIN`, then open `http://127.0.0.1:3000` (or your configured port/origin). Sign in as Demo User to inspect the wallet, transaction, and Career journal. Sign out and use Demo Admin's login to inspect Users and status. This is local test setup, not production provisioning.

The command checks real session-authenticated API writes/reads, transaction edit/delete using a disposable record, and Admin visibility of the User's active status. It confirms Admin gets 403 for finance/Career and User gets 403 for Admin. Access policies remain unchanged: Admin sees accounts/statuses and access history, not financial activity or Career content.

`npm run test:browser` separately verifies both roles in real Edge with synthetic identities in a random temporary test database, which is cleaned up. It does not delete the retained `pft_test_local` seed. Generated browser screenshots remain under ignored `artifacts/browser/`.
