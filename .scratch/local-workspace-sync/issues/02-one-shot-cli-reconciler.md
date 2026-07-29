# One-shot CLI reconciler

Status: ready-for-agent
Type: task
Blocked by: 01

## Goal

Implement workspace initialization, minimal Sync State, Instant Search, and `sync --once` reconciliation without SQLite, a watcher, daemon, or service manager.

## Acceptance

- The scanner makes one metadata-first traversal and reads/hashes only changed candidates.
- The reconciler follows the LWW timestamp rule, Source rename detection, removal semantics, and independent retry model.
- Human and JSON reports list changed Paths, attachment paths, skipped items, failures, and `rebuild_required` paths without exposing credentials.
- Any failed item produces nonzero exit status; successful items remain synchronized.
