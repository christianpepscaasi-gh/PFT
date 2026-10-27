# Ownership migration rehearsal and later live migration

Updated October 27, 2026. Phase 2 provides a test-only rehearsal, not a live migration command. Production data has not been read or changed.

## Implemented boundary

- All ten business collections now require immutable `userId` in the Mongoose schema. Mongo and memory repositories expose business operations through `root.forUser(trustedIdentity)` only; missing, Admin, pending, and disabled identities are rejected.
- All business reads/writes, report sources, balances, planning inputs, and Career records are scoped to that User. Transaction creation/reassignment requires an account with the same owner. Caller-supplied ownership, roles, primary-key changes, and update operators are rejected.
- Budget uniqueness is `(userId, month)`, daily-override uniqueness is `(userId, date)`, and probation is one record per `userId`. The memory adapter matches these owner boundaries and upsert semantics.
- Startup does not remove legacy global indexes. A scoped Mongo connection refuses those legacy constraints and requires migration. New owner indexes are initialized on scoped access; ownerless records never become implicitly owned by a caller.
- Phase 3 now supplies Mongo-backed session authentication and current identity/status/version checks. Unauthenticated business APIs return 401; active Users access only owned data, and Admin is denied finance/Career access. The app factory's trusted server-side resolver remains for explicit test injection only. No request header, query parameter, environment default owner, or public identity-switching endpoint is provided. See [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md); browser login/CSRF handling is still pending.
- Health/readiness and the static shell remain available; readiness checks database connectivity, not full migration/authentication release readiness.

## Reproduce the rehearsal

Run `npm.cmd run validate` (or `npm run validate` where supported). The safe wrapper selects `MONGODB_URI_TEST` and replaces live configuration before app imports. `tests/ownership-mongo.test.js` creates separate short, random `pft_test_*` databases and drops them in cleanup. Atlas's tested database-name limit is respected by the generated names.

The test uses synthetic identities and legacy records only. It covers:

1. Every business resource under both owners through shared Mongo/memory repository and HTTP contracts.
2. Foreign-ID reads/updates/deletes/archive, transaction reassignment, owner/role injection, update operators, reports, salary totals, planning calculations, and all five Career record types.
3. Same-month/date coexistence across Users, database-enforced per-owner uniqueness, and isolation after reconnect.
4. Dry-run preservation across ten collections, exact timestamp/field comparison, explicit owner assignment, and no writes during preparation.
5. Rejection of Admin/ambiguous targets, orphans, cross-owner references, duplicate owner/month/date/probation keys, and changes after the inventory.
6. Transactional backfill, owner-index creation before legacy-index removal, unchanged account balances/report totals/planning/Career data, idempotent reruns, restored documents/indexes on rollback, and rollback refusal after new writes.

`npm run test:unit` deliberately skips Mongo checks and does not prove the live rehearsal. A Mongo environment supporting transactions is required for the migration rehearsal; its successful Atlas run is the database evidence.

## Test-only module contract

`src/migrations/test-ownership.js` exports:

- `planOwnershipMigration(documents, targetUser)`: pure complete-inventory validation and proposed owner assignments/counts. Existing valid owners are preserved; only missing/null owners receive the explicit personal User ID.
- `prepareTestOwnershipMigration(connection, targetUser)`: read-only document/index snapshot and plan.
- `applyTestOwnershipMigration(connection, backup)`: verifies the inventory is still current, transactionally backfills ownership, then creates owner indexes and removes the two old global unique indexes. Repeating a successful plan is safe and reports zero new assignments.
- `rollbackTestOwnershipMigration(connection, backup)`: refuses document/index drift, restores prior indexes, then restores exactly missing versus null ownership fields. It does not overwrite later business writes.

Database operations require a database name beginning `pft_test_`. These functions are not exposed by HTTP or an npm migration script. The backup is an in-memory test snapshot containing private record fields; never log it or return it through an API. It is not a durable production backup. Do not rename a live database or relax this guard to run a production migration.

Stop all application writers before apply/rollback. Index DDL is separate from the document transaction; an interruption after the backfill can leave owner data with unfinished indexes. Retain the prepared backup, inspect the failure, and either resume the reviewed index step or roll back while writes remain stopped. A failed backfill transaction needs inspection, not a blind rollback of unrelated data. Stop/restart repository connections around rollback so cached index readiness is not reused.

## Separate live-migration gate, after identity provisioning exists

Before preparing a real migration:

1. Complete Phase 3 identity/session controls and establish the real personal User identity separately from the sole Admin. Validate that target against the actual identity repository; a fixture/guessed ID is not a production owner.
2. Review a dedicated production migration implementation and explicit target selection. The current test-only module must retain its guard. Obtain authorization for the concrete live operation; implementation work is not permission to run it.
3. Arrange a maintenance window, stop every writer, and take an encrypted durable backup of documents and index definitions for all ten collections. Verify restoration in an isolated environment. Keep private records and credentials out of logs/source control.
4. Dry-run the explicit owner mapping and inspect counts, duplicate keys, orphan/cross-owner account references, and unexpected legacy probation multiplicity. Resolve ambiguities before any write.
5. Record balance/report/planning/Career baselines privately. Preserve integer centavos, Philippine dates, source transaction IDs, timestamps, archived history, and separation of plans from actual money.
6. Apply the reviewed backfill and explicit index transition with a recovery journal. Required owner indexes must exist and legacy global month/date uniqueness must be removed before onboarding another User.
7. Verify counts, ownership, references, unique indexes, important reports, and restart persistence. Test User A/B and Admin access boundaries with real sessions. Confirm there are no ownerless records left in scope.
8. Keep writes stopped if a verification fails. Restore using the reviewed backup/rollback procedure; do not blindly remove ownership after users have started adding records. Resume access only after the combined ownership/authentication release gate passes.

No deployment, production backup, production dry run, live migration, or real identity provisioning has been performed during Phase 2.
