# Local Workspace Sync and AI Maintenance

Status: ready-for-agent

## Goal

Replace the legacy `sync-vault` workflow with a filesystem-native Local Workspace that a single Owner, external scheduler, and AI skill can safely maintain. The workspace mirrors editable File Source and Attachments, while Dashboard remains responsible for Svelte Render Artifact Build.

## Success criteria

- An Owner can initialize a local workspace, schedule `koala sync --once` every ten minutes, and keep Source plus `attachments/` reconciled with the online File workspace using Bearer authentication.
- The local scan is HDD-friendly: one traversal per cycle and no content read or hash unless `mtime` / size indicates change.
- An AI can search, read, create, update, add Attachments, and explicitly synchronize through the local workspace without raw API calls or credential access.
- Dashboard ZIP and CLI import/export share a content-only exchange format.
- Existing Svelte Source remains saveable even when it needs Dashboard Build; no Node or server compiler is added.

## In scope

- One-Owner Local Workspace with `.md`, `.svelte`, `attachments/`, and generated `.koala/sync-state.json`.
- Owner-scoped authenticated manifest, Source, Attachment, and mutation APIs.
- One-shot CLI commands for initialize, status, search, sync, content exchange, and local Svelte preview.
- Ten-minute external scheduling guidance for `launchd` and `systemd`; no built-in daemon or watcher.
- Last-writer-wins File reconciliation, local/remote removal propagation, Source rename preservation, and Attachment path semantics.
- Dashboard and CLI Content Exchange plus Dashboard `rebuild_required` presentation.
- Repository-local `koalablog-workspace` AI skill and references.

## Out of scope

- SQLite/D1 replication, filesystem watching, service management, automatic startup, server-side Svelte compilation, Node artifact compilation, vector search, embeddings, OCR, Attachment text extraction, cross-Owner workspaces, source-reference rewriting, automatic merges, conflict copies, and whole-workspace transactions.

## Product rules

The authoritative vocabulary is [CONTEXT.md](../../CONTEXT.md). The accepted synchronization, authentication, lifecycle, content-exchange, and Svelte rules are captured in [ADR-0014](../../docs/adr/0014-use-owner-scoped-filesystem-workspaces-for-sync.md) and the repository-local [skill contract](../../.agents/skills/koalablog-workspace/references/workspace-contract.md).

### Workspace and ownership

- One workspace maps to exactly one API Token Owner; API responses and mutations must enforce that boundary.
- Source files map extension-bearing disk paths to extensionless File Paths. Empty directories are not records.
- `.koala/` records only minimal synchronization state and never travels in Content Exchange.
- Local creation is private. Dashboard creation keeps its existing path-based Visibility Default. Local edits never directly alter persisted `Source` or `Visibility`.

### Reconciliation

- The CLI receives a complete remote manifest each cycle, scans local metadata once, then reads only changed candidates.
- Local `mtime` versus remote `updatedAt` chooses a concurrent Source winner; equal timestamps select remote.
- Successful items are durable independently; any failure produces nonzero exit status and retries on a later one-shot cycle.
- Removing Source trashes the remote File; remote removal removes local Source. Same-filesystem Source rename preserves identity, while an unrecognized cross-filesystem copy becomes create plus removal.
- Attachment deletion removes the same remote object. Attachment rename uploads the new object and deletes the old one. No Source references change automatically.

### Content Exchange and Svelte

- ZIP and CLI exchange include only Source and `attachments/`. An existing same-path destination File is skipped and reported.
- Uploading or importing Svelte Source may succeed with `rebuild_required`. Dashboard Build is the only Artifact attachment operation.
- Local Preview is localhost-only and produces no online Artifact.

### AI skill

- The skill uses only local Source and CLI operations; it cannot obtain a Token or call sync endpoints directly.
- Deletion needs explicit user authorization in the current task.
- Instant Search returns paths and snippets from Source, with Attachment filenames and references only.

## Delivery order

| Issue | Slice | Dependency |
| --- | --- | --- |
| [01](issues/01-owner-scoped-sync-api.md) | Owner-scoped sync API and legacy retirement | ADR-0014 |
| [02](issues/02-one-shot-cli-reconciler.md) | HDD-friendly CLI workspace and one-shot reconciliation | 01 |
| [03](issues/03-content-exchange-and-attachments.md) | Shared Content Exchange and Attachment lifecycle | 01, 02 |
| [04](issues/04-dashboard-svelte-rebuild-and-preview.md) | Dashboard rebuild state and local Svelte Preview | 01, 02 |
| [05](issues/05-ai-workspace-skill.md) | Repository-local AI skill and user-facing operating references | 02, 03 |
| [06](issues/06-verification-and-legacy-removal.md) | Contract tests, external scheduler guidance, and legacy removal | 01-05 |

## Acceptance checks

- Contract tests cover Owner isolation, Bearer enforcement on every sync operation, full manifest shape, source and Attachment mutation, local creation privacy, LWW tie behavior, deletion, rename, import collisions, and independent retry after partial failure.
- CLI tests prove one traversal / metadata-first behavior, no watcher or daemon commands, JSON and human reports, correct exit status, and no credential output.
- Browser tests prove Dashboard content exchange and `rebuild_required` states. Local preview is tested separately as a localhost-only process.
- D1 and SQLite contracts stay aligned where the application shares a persistence contract; Workers runtime limitations remain reported separately from static test results.
- The old `sync-vault` script and `remoteTruth` read/clear APIs are removed only after the new contract and migration path are verified.
