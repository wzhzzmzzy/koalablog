# File Migration Recovery Runbook

Date: 2026-07-16
Applies to: Gate 1B preparation for the `markdown` replacement migration

## Safety boundary

Koalablog currently has no application-level maintenance mode. Before any backup, migration, or restore, stop the deployment or otherwise block every write path externally. The `--maintenance-confirmed` flag records an operator assertion; it does not stop traffic.

Gate 1B is read-only with respect to `markdown`. Its audit command never changes schema or rows. A report with `status: blocked`, an active normalized-Path collision, or an invalid active Path is a stop condition. Do not repair those rows automatically.

Create one new artifact directory for each rehearsal or migration attempt. Never reuse report, backup, rehearsal, or manifest paths; the commands use exclusive writes.

## Required audit shape

Both SQLite and D1 audits read these legacy columns in stable ID order:

```sql
SELECT id, source, link, subject, content, tags,
       incoming_links, outgoing_links, private, remoteTruth,
       createdAt, updatedAt, deletedAt
FROM markdown
ORDER BY id;
```

The JSON and text reports must be archived together. Preserve the source database or D1 snapshot beside them.

## SQLite procedure

1. Stop writes outside the application and record how that was done.
2. Record the operator, UTC timestamp, application commit, migration version, and absolute database path.
3. Run the read-only audit:

```sh
pnpm migration:audit -- \
  --sqlite /absolute/path/local.db \
  --output /absolute/path/migration-artifacts/audit
```

4. Open both `file-migration-audit.v1.json` and `file-migration-audit.v1.txt`. Continue only when the status is `ready` and the reported row count matches the expected database.
5. Create a consistent backup and an independent restore rehearsal:

```sh
pnpm migration:backup:sqlite -- \
  --source /absolute/path/local.db \
  --backup /absolute/path/migration-artifacts/pre-migration.backup.db \
  --rehearsal /absolute/path/migration-artifacts/restore-rehearsal.db \
  --manifest /absolute/path/migration-artifacts/sqlite-backup-manifest.v1.json \
  --commit <application-commit> \
  --migration <migration-version> \
  --operator <operator-name> \
  --timestamp <operator-utc-iso-timestamp> \
  --maintenance-confirmed
```

The command uses SQLite `VACUUM INTO`, runs `PRAGMA integrity_check` through Drizzle on source, backup, and rehearsal databases, and requires equal row counts and preservation manifests. It also requires the backup and rehearsal file hashes to match.

6. Archive the source audit, backup, rehearsal database, and manifest before running replacement SQL. Gate 1C must run SQLite replacement and post-verification inside one transaction.

### SQLite restore

Keep writes stopped. Preserve the failed database under a new name, copy the verified backup back to the configured database path, then rerun the legacy audit. Do not overwrite the only failed database or the only backup.

```sh
cp -- /absolute/path/migration-artifacts/pre-migration.backup.db /absolute/path/local.db
pnpm migration:audit -- \
  --sqlite /absolute/path/local.db \
  --output /absolute/path/migration-artifacts/post-restore-audit
```

The restored JSON preservation manifest must equal the pre-migration manifest.

## Cloudflare D1 procedure

These commands were checked against the repository's installed Wrangler 4.11.0 CLI. They are remote operations; run them only with the intended Cloudflare account and database selected.

1. Stop writes outside the application.
2. Confirm the database binding, name, and immutable database ID from `wrangler.toml`, then archive live identity:

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 info DB --json \
  > /absolute/path/migration-artifacts/d1-identity.json
```

3. Export the exact audit snapshot and run the same audit engine:

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 execute DB --remote --json \
  --command 'SELECT id, source, link, subject, content, tags, incoming_links, outgoing_links, private, remoteTruth, createdAt, updatedAt, deletedAt FROM markdown ORDER BY id' \
  > /absolute/path/migration-artifacts/d1-legacy-snapshot.json

pnpm migration:audit -- \
  --snapshot /absolute/path/migration-artifacts/d1-legacy-snapshot.json \
  --output /absolute/path/migration-artifacts/d1-audit
```

4. Continue only when the report is `ready`. Archive the snapshot even when blocked.
5. Record a Time Travel bookmark for the operator timestamp:

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 time-travel info DB \
  --timestamp <operator-utc-iso-timestamp> \
  --json \
  > /absolute/path/migration-artifacts/d1-time-travel.json
```

6. Verify that `d1-identity.json` names the intended database and that `d1-time-travel.json` contains a usable bookmark. Record the application commit, migration version, row count, operator, timestamp, database name, database ID, and bookmark in the migration ticket or operator log.
7. Gate 1C must use an idempotent forward D1 migration and explicit post-migration field/count verification. The Time Travel record is the rollback point; do not attempt automatic collision repair.

### D1 restore

Restoring is destructive. Reconfirm the database identity and keep writes stopped before running:

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 time-travel restore DB \
  --bookmark <recorded-bookmark> \
  --json
```

After restore, export a new legacy snapshot and rerun `pnpm migration:audit`. Compare its row counts and preservation manifest with the archived pre-migration report before reopening writes.

## Required archived evidence

- application commit and migration version;
- operator and UTC timestamp;
- how writes were stopped;
- database path or Cloudflare database name and ID;
- source snapshot and JSON/text audit reports;
- row counts, blockers, subject differences, duplicate groups, and preservation hashes;
- SQLite backup/rehearsal files plus manifest, or D1 Time Travel bookmark;
- post-migration verification or post-restore audit.
