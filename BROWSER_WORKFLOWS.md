# Session-aware browser workflows

Implemented and verified October 28, 2026. The app remains vanilla HTML/CSS/JavaScript with the existing financial UI. This work adds browser access to the previously implemented authentication and management APIs; it does not deploy the app, create the owner's actual identities, migrate live records, or send email.

## Available workflows

- The Users tab presents compact rows inside a separate table container: Name, Email, Created, Status, and Actions. Sort by newest/oldest, name, email, or status across all pages; status filters and sorting reset pagination. Mobile users scroll within the table to reach actions. Reissue is available for pending accounts; disable/enable remains confirmed.

- Visitors see sign-in or account-request forms. Private workspaces/navigation start hidden in HTML; no finance requests run before an authenticated User identity is established.
- A signed-in User sees the ledger, reports, planning, and Career UI. Existing writes use the shared session transport, which adds the current CSRF token automatically.
- Admin sees only account management: request approval/rejection, User creation, disable/enable, invitation reissue, status filters, bounded pagination, and management history. Admin never loads the financial endpoints. Applicant-controlled names, emails, and reasons are rendered through text APIs, not HTML interpolation.
- Access-changing actions require confirmation. Failed writes keep the relevant inputs and restore controls. No unsafe request is automatically replayed after an error.
- The UI explicitly states that invitation delivery and password recovery are unavailable. Creating/reissuing a pending invitation does not claim an email was sent and does not reveal a token or offer a public token-copy shortcut.

## Activation link format

The supported page entry is `/#activate=<token>`. The token is read from the URL fragment into private memory and immediately removed from the visible/history URL before API requests. It is not accepted as a query parameter, placed in the DOM, or saved in localStorage/sessionStorage.

An anonymous recipient chooses and confirms a 12-128-character password. Activation does not silently log in: success returns to sign-in. A person already signed in must sign out before using the activation form. Invalid links show a stable message; expired/replayed/reissued links remain subject to server validation. Refreshing after the fragment has been removed requires reopening the original invitation.

Email delivery remains deferred. Real activation links are not generated/exposed by the Admin UI yet. Controlled browser fixtures receive issuance bundles privately from the backend service to exercise this flow; no test-only HTTP activation bypass was added.

## Session and privacy behavior

`public/session-ui.js` owns in-memory identity/CSRF state and same-origin fetch handling. It rotates to the token returned by login, refreshes tokens safely after a denied write, and validates the session on visibility return and every 60 seconds while visible. It never stores passwords, cookies, tokens, or identity records in Web Storage.

Logout is confirmed by the server before the UI claims success. If the server session has already disappeared, a session recheck clears the expired UI instead of looping on stale CSRF. Network errors remain visible and retryable; they do not imply a successful save or logout.

Session loss/change clears ledger/Career lists, balances, account selectors, form values, editing caches, warnings, Admin rows, and cached references; dialogs close and navigation resets. Pending requests are cancelled. Generation checks around response parsing and every financial render prevent delayed data from a previous User appearing after logout or account switching. Pagehide clears private content before back/forward caching; a restored page rechecks its session before revealing a workspace.

## Running locally

Use the private test setup in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md): deliberate dedicated test connection, private `SESSION_SECRET`, matching `APP_ORIGIN`, and `npm run dev:test`. Provision the owner's two identities separately with the documented private stdin bootstrap when ready. This implementation has not run that real setup.

Existing ownerless records/global legacy indexes still require the explicit [migration review](OWNERSHIP_MIGRATION_RUNBOOK.md); a new browser login does not assign them to the caller. Do not use normal live `MONGODB_URI` startup for verification.

## Verification

- `npm.cmd run validate`: **78 passed, zero failures/skips**, including native Mongo auth, management concurrency/audit rollback, ownership/migration, restart persistence, and temporary-database cleanup. The UI shell test also enforces initially hidden workspaces/forms and session-script load order.
- `npm.cmd run test:browser`: **PASS**, one real headless Edge end-to-end journey with synthetic identities in its own temporary test database; cleanup passed. This is separate from the default suite.
- Browser coverage: anonymous/private gating; User A/B separation; create/edit/delete transactions; account archive warnings/confirmation; failed-save retention; Career writes/default dates; request submission; literal rendering of malicious HTML text; approval cancellation/confirmation; rejection; User creation; status/reissue controls; management failure recovery; pagination/filter reset; activation/password confirmation; disable/re-enable; logout and expired-session cleanup; delayed-response/account-switch privacy; empty Web Storage; no uncaught JavaScript errors.
- Desktop and 390px mobile screenshots were inspected. Evidence is generated under ignored `artifacts/browser/` (`user-desktop.png`, `request-mobile.png`, `admin-desktop.png`, `admin-mobile.png`) using synthetic data only.
- Added dev-only `playwright-core`, reusing installed Edge rather than downloading a browser. The runner defaults to the `msedge` channel; `PFT_BROWSER_EXECUTABLE` may explicitly select another compatible installed Chromium executable. Browser verification fails rather than silently skips if its prerequisites are absent. See [Playwright browser support](https://playwright.dev/docs/browsers).
- A compatible transitive `qs` patch resolved the advisory surfaced during installation. Final production dependency audit reported zero known vulnerabilities.

The browser test runner applies the same dedicated-test environment isolation before importing the app and never uses real personal credentials or a persistent browser profile. Normal API validation stays portable; real-browser verification is an explicit separate command requiring an installed browser and test database access.

## Next boundary

Phase 6's local API/Mongo/browser verification checklist is satisfied by the combined evidence above. Next is the final email feature, requiring product-owner choices for provider, sender/domain, delivery credentials, recipient smoke-test authorization, and cost limits. Google sign-in, password recovery, real provisioning, live migration, Vercel/proxy readiness, and deployment remain separate work.
