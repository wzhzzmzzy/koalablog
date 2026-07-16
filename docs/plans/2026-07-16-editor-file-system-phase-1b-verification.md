# Gate 1B Verification Record

Date: 2026-07-16
Branch: `codex/editor-files-phase-1a`
Gate base: `6b34459df69c98f343a6b435a51f95de737574f8`

## Delivered seams

- A separately named legacy Path normalizer that prepends `/` only for migration input and then delegates to the canonical Gate 1A parser.
- A deterministic, read-only audit for legacy `markdown` rows.
- Machine-readable JSON and human-readable text report archives.
- SQLite database and Wrangler D1 snapshot inputs using the same row shape and audit engine.
- A verified SQLite `VACUUM INTO` backup and restore rehearsal manifest.
- Blocking and successful fixtures for Gate 1C migration work.
- A SQLite/D1 recovery runbook with explicit maintenance, identity, Time Travel, and restore checks.

No `markdown` schema, row, index, production caller, Save flow, Renderer field, or Svelte dependency is changed by Gate 1B.

## Audit coverage

The report records:

- active normalized-Path collision groups;
- invalid active and recycled Paths;
- legacy `subject` differences from `basename(normalizedPath)`;
- active/recycled and recycled-only duplicate groups;
- non-blocking derived-Title duplicates;
- stored/derived Source classification differences;
- stable row projections for ID, Path, derived Title, and recycle state;
- row counts plus SHA-256 preservation manifests for IDs, content, timestamps, privacy, remote truth, classification, tags, references, and recycle-bin metadata.

Only active normalized-Path collisions and invalid active Paths set `status: blocked` and make the CLI exit with code `2`. Recycled duplicates are reported and retained as separate projected rows.

## Fixture evidence

The fixtures include:

- `memo/note` and `/memo//note` colliding after normalization;
- a legacy subject that differs from the derived Title;
- one active row and two recycled rows sharing `/post/hello`;
- an invalid extension-bearing active Path;
- a private Unicode memo, root page, remote-truth post, tags, and absolute references;
- two active Files at different Paths with the same derived Title, proving Title duplication is not a Path collision;
- stable explicit IDs and timestamps used by the preservation and backup checks.

## Recovery evidence

- The SQLite integration test creates a real temporary legacy database through Drizzle, runs the CLI, and proves the source rows are unchanged.
- The backup rehearsal creates a consistent backup, copies it to an independent restore target, runs `PRAGMA integrity_check` on all three databases, and compares row counts and preservation manifests.
- The backup API refuses to run without an explicit maintenance confirmation or when the source audit is blocked.
- D1 identity, snapshot, Time Travel info, and restore command shapes were verified against the installed Wrangler 4.11.0 help. No remote database operation was executed.

## Verification results

| Check | Result |
| --- | --- |
| Focused audit/backup/Path/recycle-bin/tree suite | Pass: 5 files, 34 tests |
| Full `pnpm test` | Pass: 19 files, 145 tests |
| Changed-file ESLint | Pass |
| `pnpm exec astro check` | No new diagnostics; blocked by the two existing errors in `drizzle.config.ts` and `src/pages/api/playground/compile.ts` |
| `pnpm run build:cf` | Pass |
| SQLite dry-run CLI integration | Pass; JSON/text archives created and source rows unchanged |
| Unsafe snapshot CLI integration | Pass; reports blockers and exits with code `2` |
| SQLite backup/restore rehearsal | Pass; integrity, row counts, preservation manifests, and backup/rehearsal hashes verified |
| D1 runbook command validation | Pass against installed Wrangler 4.11.0 help; no remote operation executed |

The existing `markdown-parser` tests continue to emit their pre-existing incomplete-DOM-mock stderr while passing. Gate 1B does not touch that parser.

The final Standards and Spec review result is appended after review. Gate 1C must not start if this record contains a failing implementation check or an unresolved Gate 1B review finding.
