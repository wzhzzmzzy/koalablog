# Svelte Artifact storage and Snapshot removal

## Behavior

- Svelte Source, File metadata, Owner, Visibility, revision CAS and current deployment metadata stay in D1. Local SQLite remains supported.
- Artifact input v2 contains JavaScript and CSS, not HTML. Deploy no longer executes Preview to capture a Snapshot. Interactive Preview remains available on demand.
- Public pages require JavaScript and show loading/error/no-script messages. File-derived titles remain; Snapshot-derived descriptions and no-script application bodies are intentionally removed.
- D1 mode stores compiled JavaScript and CSS inline. R2 mode stores the exact module wrapper and CSS in the private `OSS` binding under `render-artifacts/<fileId>/<resourceHash>/...`. The legacy public OSS API rejects this namespace.
- New deployments default to D1; redeployment retains the current mode unless Deploy explicitly selects another mode. Local installations without an R2 binding expose D1 only.
- Current access is checked before ETag handling. A public 304 reads database metadata only, with no R2 access. Cache misses stream only the requested R2 representation, with another access check after object retrieval. Private responses retain `private, no-store`, no ETag and no 304. Missing R2 objects produce uncached 503 diagnostics, not empty success or a stale fallback.

## Upgrade through Settings

1. Back up D1/SQLite using the installation's normal backup procedure and verify that the backup is recoverable. Record the deployed application version and migration ledger. Backups can contain private Source and old Snapshots: keep them private.
2. Deploy this application version normally. Existing v1 inline Artifacts continue serving; new deployment/transfer actions require the new schema. Do not mix old and new writers during migration; old editor tabs should reload.
3. Open **Dashboard → Settings → Svelte database migration** as Admin. Inspect the number and UTF-8 bytes of nonempty stored Snapshots. Confirm the backup and permanent Snapshot removal, then click **Migrate database and remove snapshots**.
4. The migration adds nullable resource references, drops `snapshotHtml` for every Artifact, and marks existing records as schema v2. Source and compiled bytes are not changed. Old opaque Artifact Hashes remain valid CAS identities; newly built artifacts use v2 serialization. The operation is transactional and safe to retry. Status must say the database is up to date.
5. Reload open editors. Verify an existing public app, an Owner-private app, anonymous denial, Source Save and Deploy.

For installations managed entirely by the CLI, migration `0003_artifact_objects.sql` is also registered in the normal migration journal. The Settings button records this migration in `d1_migrations` or `__drizzle_migrations`, so later normal migration application does not apply it twice. Keep the installation's pre-existing migration ledger; do not apply all historical migrations to an untracked existing database. Fresh onboarding applies the new schema directly.

This removes live database Snapshot values and the column, not backup copies, database Time Travel history or disk free-page forensic remnants. It is not a secure-erasure command. Rolling back to the old application requires restoring the compatible database backup; do not roll back the binary alone after dropping the column.

## Move existing deployments in either direction

1. Confirm the `OSS` R2 bucket is private: no public `r2.dev`, public custom domain, or alternate proxy that bypasses File access checks. Binding availability alone cannot prove bucket privacy.
2. Open **Dashboard → Deploy → Artifact storage** (`/dashboard/rebuild`). Only the signed-in Owner's deployed Files are shown, including recycled predecessors. Pages load 50 metadata records at a time, not Source or compiled bodies.
3. Select D1 or R2. Use a row's move button or **Migrate loaded Files**. The batch runs sequentially and stops at the first failure; closing the tab stops further scheduling. A request already in flight may finish.
4. D1 → R2 writes both representations, reads them back and verifies their existing SHA-256 hashes, then atomically replaces inline bodies with object references. R2 → D1 verifies both objects and the known module wrapper, then restores inline bodies and clears references. No compiler, Source Save, revision bump or Deploy is involved.
5. Refresh to reconcile completion after disconnects. Completed transfers remain complete; hash/mode conflicts require a fresh listing before retry. A missing, corrupt or unconfirmed object leaves the previous database record unchanged.

R2 objects are retained after reverse transfers, failed CAS, replacement or purge. They are not historical deployments accessible through application routes: routes still require the current File and deployed metadata. Retention prevents concurrent-read and backup-restore corruption. Do not add a blanket bucket lifecycle rule or delete the prefix while any live/backup database may reference it. Future garbage collection must account for retained database backups before deleting unreferenced objects.

## Scope and checks

No media or Markdown Source migration, new framework, Worker compiler, public bucket, async job service or per-request full-library scan is added. Storage transfers are bounded to one existing size-limited Artifact; normal attachment quotas do not become an R2 billing meter.

Run `KOALA_PREVIEW_INTEGRATION=1 pnpm exec vitest run`, `pnpm run test:d1`, `pnpm exec playwright test` and `pnpm run build:cf`. The D1/R2 suite covers live schema migration, both directions, empty CSS, UTF-8, authorization, Source/CAS races, readback failure, missing objects, private transitions, 304, recycle/restore/purge and preserved File records.

Platform references checked 2026-10-22: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/). The runbook relies on object upload receipts/checksums and explicit SQL migrations, not cross-service transactions.
