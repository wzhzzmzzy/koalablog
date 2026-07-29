---
name: koalablog-workspace
description: Maintain an owner-scoped local Koalablog File workspace. Use when Codex needs to search, read, create, update, upload attachments, import, export, preview Svelte Source, or run one-shot synchronization for a Koalablog workspace without directly calling remote APIs.
---

# Koalablog Workspace

Use the local workspace and the `koala` CLI as the only operational boundary. Do not call Koalablog sync endpoints directly, read a Bearer Token, or put credentials in the workspace.

## Start

1. Locate the requested Local Workspace and confirm it belongs to the intended Owner.
2. Read [references/workspace-contract.md](references/workspace-contract.md) before setup, import/export, synchronization, attachment work, or Svelte preview.
3. Run the least invasive CLI operation that answers the request. Read and search before changing Source.
4. Report changed Paths, attachment Paths, synchronization outcome, and any `rebuild_required` Paths.

## Authority

- Search and read Source freely within the selected Local Workspace.
- Create or update `.md` and `.svelte` Source, add files under `attachments/`, and run `sync --once` when the user asks to publish or synchronize.
- Do not delete a Source or Attachment unless the user explicitly requests that deletion in the current task.
- Treat a missing or stale Svelte Render Artifact as `rebuild_required`; do not compile it locally for upload or attempt to attach an Artifact.

## Safe workflow

1. Use Instant Search to identify candidate Source and read only the necessary files.
2. Preserve the File Path, renderer extension, and ordinary Source content. Do not insert sync metadata into frontmatter or Source.
3. Put binary input only below `attachments/` and update Source references explicitly when their paths change.
4. Use `koala sync --once` only after local changes are complete. It uses the configured Bearer credential internally and is safe to retry after a failure.
5. Do not simulate a filesystem watcher, launch a background daemon, or create a local database.

## References

- Read [references/workspace-contract.md](references/workspace-contract.md) for layout, synchronization, authentication, import/export, and CLI contracts.
- Read [references/workflows.md](references/workflows.md) for concrete command sequences, expected reports, collision handling, and failure recovery.
