# Vercel readiness — October 28, 2026

**Decision: not ready for production with real financial data. Next step: prepare a protected Preview using synthetic data in a separate database. No deployment has been performed or authorized by this assessment.**

## Already verified locally

- Express app exported from `server.js`; frontend assets in `public/`.
- Email/password authentication, Admin/User separation, per-user business-data ownership, Mongo-backed sessions and rate limits, CSRF, and account lifecycle controls.
- Latest validation: 78 tests passed without failures/skips; real Edge journey passed. These are local/test-cluster results, not Vercel evidence.

## Recommended order

1. Prepare Vercel runtime configuration: review the actual proxy boundary before configuring Express trust, verify Secure cookies behind HTTPS, set an exact HTTPS `APP_ORIGIN` and stable private `SESSION_SECRET`, and choose a supported Node version. Currently no Express trust-proxy setting exists; production cookies require hosted verification.
2. Configure a protected Preview with its own database, limited database credentials, Atlas access from the deployment, and synthetic Admin/User identities. Keep Preview credentials/data separate from Production. Verify protection covers API routes as well as pages. Do not upload `.env` or use the live database for Preview testing.
3. Test hosted routing/static assets, login/logout/CSRF, both roles, ownership isolation, disable/session revocation, Mongo connection reuse and failures, cold/warm invocations, and persistence across redeploy. Verify production dependency/runtime compatibility, including password hashing memory/latency. Record the URL and evidence before any promotion.
4. Complete the final email feature before inviting clients: choose provider, sender/domain, cost limits and credentials; implement delivery; test activation/reissue/expiry with an authorized recipient. Email is not required for a synthetic Preview, but the current UI cannot deliver an invitation to a real recipient.
5. Prepare real owner setup: separate Admin and personal User identities. If keeping existing records, review durable backup, explicit ownership migration, legacy indexes, validation, and rollback with writes stopped. This has not been performed against live data.
6. Review the completed release evidence and explicitly authorize Production deployment. Keep live provisioning/migration and deployment as concrete separately reviewed actions.

## Hosting references

Vercel supports Express apps exported from `server.js`; Express becomes a Vercel Function. Files in `public/` are served separately, so local `express.static()` behavior is not proof of hosted delivery. See [official Express hosting documentation](https://vercel.com/docs/frameworks/backend/express).

Review connection reuse and serverless pool lifecycle against the actual Mongo/Mongoose integration; see [Vercel connection-pool guidance](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute). No particular pool helper is assumed compatible without checking it.

The detailed release checklist remains in [FUTURE_INTEGRATION.md, section 63](FUTURE_INTEGRATION.md#63-vercel-deployment-readiness-gate). Google sign-in and password recovery remain deferred; they are not prerequisites for the synthetic Preview.
