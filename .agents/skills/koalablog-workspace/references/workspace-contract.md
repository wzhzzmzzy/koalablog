# Workspace Contract

## Local layout

```text
<workspace>/
  .koala/
    sync-state.json
  attachments/
  notes/
    plan.md
  widgets/
    counter.svelte
```

The workspace belongs to exactly one Owner. `.koala/` is generated state, not Source and not an import/export payload. It records only the last confirmed File identity, remote revision, Source Hash, and the local filesystem identity needed to recognize an in-filesystem rename. It has no Source history, local database, credential, or copy of D1 data.

Every other `.md` and `.svelte` file maps to an extensionless File Path: `notes/plan.md` maps to `/notes/plan`; `widgets/counter.svelte` maps to `/widgets/counter`. The extension selects the renderer. Empty directories are local-only and have no online representation. `attachments/` is the only binary root and maps to `/attachments/...` references.

## Source and metadata

The Local Workspace edits only File Path, Source, and renderer. It does not edit persisted `Source` or `Visibility`. A newly discovered local Source creates a private File, regardless of its Path; the ordinary server-side creation rule assigns `Source`. Dashboard-created Files retain the existing path-based Visibility Default.

An in-filesystem Source rename preserves the online File ID, Owner, Visibility, and Source while changing its Path. A cross-filesystem copy that cannot be identified as the same local object becomes a new private File and leaves the old File to the normal removal path. Source references never rewrite implicitly.

## Authentication and remote boundary

Every remote read and write uses `Authorization: Bearer <API token>` for the workspace Owner. The token comes from `KOALABLOG_BEARER_TOKEN` or a workspace-external personal configuration; it never appears in Source, `.koala/`, Content Exchange, CLI output, or the AI skill context.

The sync API must scope manifests, Source, mutations, and Attachments to that Owner. A public File owned by somebody else is not part of this workspace.

## One-shot synchronization

An external scheduler invokes `koala sync --once` every ten minutes. The CLI must not provide a watcher, daemon, service, or automatic startup facility.

One cycle performs these steps:

1. Authenticate and fetch the complete owner-scoped remote manifest for active Files and Attachments. A manifest carries the fields needed for comparison, including path, stable identity, renderer, remote revision, `updatedAt`, Source Hash, and Attachment size/hash/time. Fetch Source or bytes only when the manifest comparison requires them.
2. Traverse the Local Workspace once. Compare directory metadata, `mtime`, and size to Sync State; read and hash only changed candidates. This is the HDD-friendly scan.
3. Reconcile creates, updates, removals, and renames independently. A successful item updates Sync State. A failed item leaves its prior state and makes the command exit nonzero for a later retry.
4. Print a concise summary. `--json` exposes the same results for `launchd` or `systemd`. Exit 0 only if every requested operation succeeded.

The cycle is deliberately not a transactional workspace snapshot: successful File or Attachment changes remain visible when a later item fails.

### Concurrent File change

If both peers changed a File since their last confirmed state, choose the later edit time. Local time is filesystem `mtime`; remote time is D1 `updatedAt`; an equal time chooses the remote Source. Overwrite the earlier Source without conflict copies, merge attempts, or a paused state.

### Removal and Attachment paths

Deleting a local Source moves the remote File to the recycle bin. A remote removal deletes the local Source. Restoring a File is initiated online and recreates the local Source.

Deleting an Attachment below `attachments/` deletes the same remote object even if a Source still references it. Renaming an Attachment uploads the new path and deletes the old path; no Source reference is rewritten automatically.

## Content Exchange

Dashboard ZIP import/export and CLI import/export share one format: Source plus the `attachments/` tree. They exclude `.koala/`, remote IDs, revisions, credentials, recycle-bin history, and Render Artifacts. Import creates private Files. If the target already has a same-path File, skip it, report the collision, and continue with other entries.

## Svelte

Local Svelte Preview is a temporary localhost-only Vite runtime for one Source file. It never uploads Source or creates an online Render Artifact. A synchronized or imported Svelte Source without a Current Render Artifact reports `rebuild_required`; Dashboard Build is the only Artifact-attachment workflow.

## CLI surface

The implementation exposes a small, one-shot surface:

```text
koala workspace init <path>
koala workspace status [--json]
koala search <query> [--json]
koala sync --once [--json]
koala exchange export <archive-path>
koala exchange import <archive-path>
koala preview <source-path>
```

`search` is Instant Search: direct matching over Source Path, title, tags, and Source text. It returns Paths and snippets. It can match an Attachment filename or Source reference, but does not extract binary content, perform OCR, maintain an index, or use embeddings.
