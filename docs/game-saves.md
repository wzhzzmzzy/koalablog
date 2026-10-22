# GBA cloud saves

A Game Save is an emulator checkpoint belonging to one signed-in User, game and slot (`auto` or `manual`). Ordinary member Sessions and API Tokens can use the same endpoint. The server derives the Owner from authentication; it never accepts a user ID or object key from the request. Cookie writes require an exact same-origin Origin. Responses are private and non-cacheable.

The binary checkpoint lives in the private OSS R2 binding at `game-saves/<owner>/<game>/<slot>/<uuid>.bin`. This root is outside the public OSS route allowlist. As with private Render Artifacts, the bucket must not be published through a public bucket domain. Local SQLite installations use the existing BlobStorage adapter.

The existing owner-only File remains the D1 index: `/game-saves/<game>/current-<owner>` for auto, or `/game-saves/<game>/manual-<owner>` for manual. Its schema-3 JSON contains the R2 key, raw byte count, checkpoint metadata/hash and optional legacy backup reference, never the base64 checkpoint. There is no database schema migration. The browser's IndexedDB names, slot keys and checkpoint format remain unchanged.

## API

`/api/game-saves/:game/:slot` supports:

- `GET`: `{version, exists, storage, savedAt, sha256}`. Read-only, including for legacy saves.
- `GET ?download=1&version=<file-id>:<revision>`: `{record, state}`. The record retains the existing browser checkpoint format, including base64 data. Download verifies bytes and revision.
- `PUT {expected, record}`: write a checkpoint, returning status. `expected` is the version from GET, or explicitly `null` for a missing index.
- `POST {expected}`: migrate this slot's legacy save, returning status. Empty or already migrated slots are no-ops.

There is no list-other-users or public upload interface. A stale version returns 409; clients must refresh and let the user decide rather than silently overwriting. Checkpoints are limited to 2 MiB of raw bytes. Requests are streamed with a corresponding JSON size limit and validated for canonical base64, metadata and SHA-256.

## Preservation and failures

Migration supports schema-2 D1 checkpoints and the earlier schema-1 AES-GCM R2 checkpoint/index. It preserves the checkpoint ID, timestamp, ROM hash, engine and exact emulator bytes. Before changing the index, it writes and verifies a private R2 JSON backup of the complete legacy File content. Earlier encrypted R2 objects are retained as well.

Every save writes a new immutable binary key and reads it back to verify SHA-256 before the owner/revision-guarded D1 update. Failed upload, verification, decode or CAS cannot replace the previous index. After a successful normal schema-3 save, the replaced binary is removed on a best-effort basis; the migration backup is retained. A known CAS loser removes only its own unreferenced candidate binary. An ambiguous database error retains the candidate because the commit might have succeeded. Failures can leave unreferenced objects; this change does not introduce a background garbage collector.

To recover a legacy save, first stop the client's migration attempts, retrieve the private JSON referenced by `legacyBackup` through an authenticated operator/R2 tool, verify it, then restore that File content with a fresh Source revision CAS. Do not change Owner, path or privacy. The backup contains the complete prior D1 checkpoint, or the legacy R2 ciphertext location and encryption metadata. Do not publish or log this backup.

## Rollout

Merge/deploy the backend first. The separately managed GBA dynamic page can then switch its runtime to this API. Its adapter explicitly POSTs migration when it discovers a legacy slot, and rechecks/falls back to reading the intact legacy record if migration fails. This is not a server write-on-GET or a bulk migration. Existing accounts migrate when they next use the updated page; inactive accounts keep their original data.

Old open page tabs do not understand schema-3 indexes. They fail closed for cloud operations and retain local IndexedDB saves; reload those tabs after the new runtime is published. This backend PR does not deploy the page or change its local autosave/manual-slot behavior.

## Verification

`pnpm exec vitest run --config vitest.d1.config.ts src/tests-d1/game-saves.d1.ts` exercises actual D1, R2 and KV Sessions in the Workers test runtime: member read/write, owner isolation, both legacy formats and slots, preservation on corruption/storage failures, CAS races, CSRF, expired Sessions, size limits and realistic checkpoint sizes. Run the existing `src/tests/api/sync-attachment-auth.spec.ts` alongside it for shared authentication regressions.
