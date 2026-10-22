# Svelte Artifact storage and Snapshot removal

## Behavior

- Svelte Source, File metadata, Owner, Visibility, revision CAS and current deployment metadata stay in D1. Local SQLite remains supported.
- Artifact input v2 contains JavaScript and CSS, not HTML. Deploy no longer executes Preview to capture a Snapshot. Interactive Preview remains available on demand.
- Public pages require JavaScript and show loading/error/no-script messages. File-derived titles remain; Snapshot-derived descriptions and no-script application bodies are intentionally removed.
- D1 mode stores compiled JavaScript and CSS inline. R2 mode stores the exact module wrapper and CSS in the private `OSS` binding under `render-artifacts/<fileId>/<resourceHash>/...`. The legacy public OSS API rejects this namespace.
- New deployments use the site default configured in Deploy (D1 when unset); redeployment retains the current mode. Only an Admin may save the default, and selecting R2 requires a binding. An unavailable configured R2 default fails explicitly rather than silently deploying to D1. The attach API still supports an explicit per-call override. Local installations without an R2 binding expose D1 only.
- Current access is checked before ETag handling. A public 304 reads database metadata only, with no R2 access. Cache misses stream only the requested R2 representation, with another access check after object retrieval. Private responses retain `private, no-store`, no ETag and no 304. Missing R2 objects produce uncached 503 diagnostics, not empty success or a stale fallback.

## Upgrade through Settings

1. Back up D1/SQLite using the installation's normal backup procedure and verify that the backup is recoverable. Record the deployed application version and migration ledger. Backups can contain private Source and old Snapshots: keep them private.
2. Deploy this application version normally. Existing v1 inline Artifacts continue serving; new deployment/transfer actions require the new schema. Do not mix old and new writers during migration; old editor tabs should reload.
3. Open **Dashboard → Settings → Svelte database migration** as Admin and click **Check migration status**. This reads only `PRAGMA table_info(markdown_render)`; it does not count or read Snapshot bodies. If migration is required, confirm the backup and permanent Snapshot removal, then click **Migrate database and remove snapshots**.
4. The migration adds nullable resource references, drops `snapshotHtml` for every Artifact, and marks existing records as schema v2. Source and compiled bytes are not changed. Old opaque Artifact Hashes remain valid CAS identities; newly built artifacts use v2 serialization. The operation is transactional and safe to retry. Status must say the database is up to date.
5. Reload open editors. Verify an existing public app, an Owner-private app, anonymous denial, Source Save and Deploy.

For installations managed entirely by the CLI, migration `0003_artifact_objects.sql` is also registered in the normal migration journal. The Settings button records this migration in `d1_migrations` or `__drizzle_migrations`, so later normal migration application does not apply it twice. Keep the installation's pre-existing migration ledger; do not apply all historical migrations to an untracked existing database. Fresh onboarding applies the new schema directly.

This removes live database Snapshot values and the column, not backup copies, database Time Travel history or disk free-page forensic remnants. It is not a secure-erasure command. Rolling back to the old application requires restoring the compatible database backup; do not roll back the binary alone after dropping the column.

## Move existing deployments in either direction

1. Confirm the `OSS` R2 bucket is private: no public `r2.dev`, public custom domain, or alternate proxy that bypasses File access checks. Binding availability alone cannot prove bucket privacy.
2. Open **Dashboard → Deploy → Existing pages** (`/dashboard/rebuild`). Only the signed-in Owner's Svelte Files are shown, including undeployed Files and recycled predecessors. Pages load 50 metadata records at a time, not Source or compiled bodies. Rows distinguish Deployed, Undeployed changes and Not deployed, and show D1 / R2 independently of that deployment state.
3. Use a row's **Move to R2** or **Move to D1** button. Only one operation runs at a time; its button remains disabled while running. A request already in flight may finish if the tab closes. The separate **Storage for new pages** selector persists a site default; it does not migrate or rebuild existing pages.
4. D1 → R2 writes both representations, reads them back and verifies their existing SHA-256 hashes, then atomically replaces inline bodies with object references. R2 → D1 verifies both objects and the known module wrapper, then restores inline bodies and clears references. No compiler, Source Save, revision bump or Deploy is involved.
5. Refresh to reconcile completion after disconnects. Completed transfers remain complete; hash/mode conflicts require a fresh listing before retry. A missing, corrupt or unconfirmed object leaves the previous database record unchanged.

R2 objects are retained after reverse transfers, failed CAS, replacement or purge. They are not historical deployments accessible through application routes: routes still require the current File and deployed metadata. Retention prevents concurrent-read and backup-restore corruption. Do not add a blanket bucket lifecycle rule or delete the prefix while any live/backup database may reference it. Future garbage collection must account for retained database backups before deleting unreferenced objects.

## Scope and checks

No media or Markdown Source migration, new framework, Worker compiler, public bucket, async job service or per-request full-library scan is added. Storage transfers are bounded to one existing size-limited Artifact; normal attachment quotas do not become an R2 billing meter.

Run `KOALA_PREVIEW_INTEGRATION=1 pnpm exec vitest run`, `pnpm run test:d1`, `pnpm exec playwright test` and `pnpm run build:cf`. The D1/R2 suite covers live schema migration, both directions, empty CSS, UTF-8, authorization, Source/CAS races, readback failure, missing objects, private transitions, 304, recycle/restore/purge and preserved File records.

Platform references checked 2026-10-22: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/). The runbook relies on object upload receipts/checksums and explicit SQL migrations, not cross-service transactions.

## Settings resource-limit investigation

Opening Settings used to server-render five interactive Svelte settings/import/export islands in addition to Dashboard navigation. Those five now mount only in the browser; ordinary account forms and their authorization remain server-rendered. The RSS checkbox has a server-rendered fallback so a form submitted before hydration does not reset RSS. Opening Settings no longer starts Snapshot status inspection or fetches the library's Source for the import picker. Choosing local files explicitly loads active Owner paths only; server-side duplicate and Owner checks remain authoritative.

Astro 5.18.2 loads the registered action module while creating each render context. Its static dependency on the Markdown database module previously also initialized the Markdown parser and YAML frontmatter stack on a read-only Settings request. Markdown analysis now loads only when preparing a Markdown write, not for reads or Svelte Source writes. This removes a demonstrated cold-path cost without changing saved Markdown, permissions, revisions or CAS.

The build no longer forces every static stylesheet into each HTML response. Astro's `inlineStylesheets: 'auto'` keeps small styles inline and emits larger hashed CSS assets for browser caching. The Site / Dashboard cascade and authenticated Artifact stylesheet route are unchanged. Publish the complete build output, including `_astro` assets, as before.

Cloudflare 1102 alone does not identify a function or distinguish CPU from memory exhaustion. An entire-page error happens before the migration island's browser request, so the former Snapshot aggregate is not by itself an explanation for that report. Reproduction with a locally built Worker and synthetic KV/D1 can measure module loading and render work, but is not a production CPU profile. Verify the deployed version and the failing invocation's `exceededCpu` / `exceededMemory` outcome in Workers Logs if the error persists. See [Cloudflare error 1102](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/).

This follow-up requires no additional database migration. Existing installations that have not yet applied `0003_artifact_objects.sql` still need the explicit, backed-up migration described above.
