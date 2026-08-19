# Markdown Tag Reconciliation and Completion Implementation Plan

Status: implemented; all planned feature and broad regression gates passed

## Goal

Make Markdown tags one coherent capability across Source, persistence, search, synchronization, and CodeMirror:

1. Preserve tags already declared in leading YAML frontmatter.
2. On Save, append tags discovered in the Markdown body to frontmatter without removing frontmatter-only tags.
3. Persist and query the merged Effective Tags exactly.
4. Offer existing tags as CodeMirror completions while writing a body tag.
5. Keep Dashboard Save, Page Runtime Save, batch import, Content Exchange, and Local Workspace synchronization on the same Source preparation contract.

Do not release a partial cutover in which the server rewrites Source but a caller keeps the pre-reconciliation Source or Source Hash.

## Resolved product decisions

- Frontmatter tags come first and retain their order.
- Body tags are appended in first-seen order.
- De-duplication is exact and case-sensitive. `Java` and `java` remain distinct.
- Removing a body tag does not remove it from frontmatter.
- Removing a frontmatter tag while it still occurs in the body causes Save to add it again.
- A Markdown File without frontmatter receives frontmatter only when at least one body tag exists.
- An empty File or a File without any tags does not receive `tags: []`.
- Canonical frontmatter output uses a deterministic, JSON-compatible YAML sequence:

  ```text
  tags: ["existing", "body-tag"]
  ```

- Existing scalar CSV frontmatter such as `tags: "one,two"` remains readable and is upgraded when reconciliation changes the tag field.
- Invalid or ambiguous frontmatter does not block File Save and is not rewritten. Body tags still become Effective Tags, and the Editor reports a non-blocking warning.
- Svelte Files have no Markdown tags and are not rewritten.
- Completion uses authorized active Files already loaded by the Editor. It does not request the server on each keystroke.
- This phase does not add a Tag management page, tag cloud, aliases, merge/rename, multi-tag Boolean filtering, or a normalized `file_tag` table.

## Domain language and authoritative documentation

Before product-code cutover:

1. Add these terms to `CONTEXT.md`:
   - **Frontmatter Tag** — a tag explicitly retained in the leading YAML frontmatter `tags` field.
   - **Body Tag** — a tag recognized from Markdown body `#tag` syntax.
   - **Effective Tags** — ordered exact union of Frontmatter Tags followed by Body Tags.
   - **Tag Reconciliation** — Markdown Save preparation that writes Effective Tags to frontmatter before Source Hash calculation.
2. Add ADR-0017 recording:
   - Markdown Source alone remains the editable truth.
   - Tag Reconciliation is an intentional Save-time Source normalization.
   - the canonical Source is stored and hashed;
   - every write adapter must return or adopt that canonical Source;
   - the `markdown.tags` column remains a rebuildable derived index, not an independently editable field.

This extends the existing File and Source Hash contracts without changing Renderer Replacement, Visibility, Source listing category, or explicit Svelte Deploy.

## Architecture

### Markdown Source preparation Module

Deepen the existing `src/lib/files/analysis.ts` seam into one pure in-process Module:

```text
interface PreparedMarkdownSource {
  content: string
  tags: string[]
  outgoingPaths: AbsoluteFilePath[]
  warnings: MarkdownSourceWarning[]
}

function prepareMarkdownSource(content: string): PreparedMarkdownSource
```

The Interface hides frontmatter parsing, legacy tag decoding, body tokenization, ordering, de-duplication, surgical Source rewriting, and warning construction. Callers do not merge tags themselves.

Invariants:

- `content` is the canonical Source to persist and hash.
- `tags` is the Effective Tags sequence represented by that canonical Source when frontmatter is valid.
- `outgoingPaths` keeps the current absolute File Reference contract.
- `warnings` is bounded structured data; do not return parser internals or thrown YAML errors.
- calling the function again on `content` is idempotent.
- line endings are normalized by the existing input adapter before preparation; preparation introduces no unrelated body whitespace changes.
- all non-`tags` frontmatter bytes, their order, and the Markdown body remain unchanged.
- the `tags` field itself may be normalized, including its comments and multiline formatting.

Retain `analyzeMarkdownSource()` temporarily only as a compatibility adapter if needed during the slices, then remove it when every caller crosses the new Interface. Tests should finish at `prepareMarkdownSource()`, not duplicate the implementation through old and new test suites.

### Leading frontmatter Module

Add `src/lib/markdown/frontmatter.ts` as the shared seam for:

- detecting a leading `---` block and its exact Source ranges;
- parsing a top-level YAML mapping;
- returning the body range even when the YAML payload is invalid;
- distinguishing absent, valid, invalid, and ambiguous frontmatter;
- replacing or appending exactly one top-level field without reserializing unrelated fields.

Add `yaml` as an explicit runtime dependency rather than relying on Astro's transitive dependency. Migrate `meta-plugin.ts` and Post Display Title parsing to this Module so rendering, display-title resolution, and Tag Reconciliation do not disagree about where frontmatter ends.

Compatibility requirements:

- retain current quoted/unquoted title, boolean, null, inline array, and empty-frontmatter behavior;
- strip a delimiter-bounded invalid frontmatter block from rendered Markdown while leaving Source unchanged;
- treat duplicate top-level `tags` keys as ambiguous and skip rewriting;
- never execute YAML tags, schemas, or arbitrary constructors.

### Stored Effective Tags codec

Add `src/lib/files/stored-tags.ts`:

```ts
function encodeStoredTags(tags: readonly string[]): string
function decodeStoredTags(value: string | null | undefined): string[]
```

- New writes use a JSON array in the existing text column.
- Reads first accept a valid JSON string array, then fall back to legacy comma-separated values.
- Malformed values decode to an empty array and may be reported by migration/audit tooling; ordinary reads must not crash.
- Keep `src/db/schema.ts` as `text()`. Do not use Drizzle JSON mode while legacy CSV rows remain possible.

Change public list filtering from substring `LIKE` to exact membership:

- JSON rows use `json_each` with exact value equality.
- Legacy CSV rows use delimiter-aware exact matching.
- Add SQLite and D1-compatible tests for `java` versus `javascript`, Unicode, case, commas in JSON tags, empty arrays, null, and malformed legacy values.

No DDL migration is required. Existing rows converge to JSON on their next Markdown Save. A future revision-guarded maintenance backfill may convert untouched rows, but it is not a launch dependency and must not rewrite Source merely to change the derived storage format.

### Markdown completion Module

Do not register a second independent `autocompletion({ override })`. Add one Markdown completion Module that owns the CodeMirror autocomplete extension:

```ts
function markdownCompletion(options: {
  references: readonly FileReferenceCandidate[]
  tags: readonly TagCompletionCandidate[]
  excludeFileId?: number
}): Extension
```

Internally it composes the existing File Reference Completion Source with a new Tag Completion Source and owns the single high-precedence Tab binding.

`TagCompletionCandidate` contains only display/ranking information:

```ts
interface TagCompletionCandidate {
  tag: string
  fileCount: number
  updatedAt: Date
}
```

Candidate aggregation is computed when the authorized Editor File collection changes, not on every keystroke. Use Effective Tags from current Source/derived storage and exclude recycled Files. Frontmatter tags containing whitespace or `#` remain valid Effective Tags but are excluded from body-tag completion because current body syntax cannot represent them faithfully.

Completion behavior:

- Markdown and editable mode only.
- Trigger immediately after a legal `#`. An empty query shows the most-used/recent candidates; typing narrows it. A following whitespace character closes the picker.
- Reject escaped markers, ASCII alphanumeric word-internal markers, frontmatter, inline/fenced code, code blocks, and Markdown link contexts.
- Reuse the body-tag lexical rules used by the Markdown tag renderer; do not create a divergent regex grammar.
- Rank case-insensitive prefix, then substring, then `fileCount` descending, `updatedAt` descending, and tag label.
- Limit to 12 options.
- Replace only the query after `#`; preserve the marker and do not add a synthetic trailing space.
- Arrow keys navigate; Enter or Tab accepts; Escape closes.
- Keep File Reference completion behavior and ranking unchanged.

## Slice 1 — Prove Source preparation without changing Save

Add the frontmatter and Markdown Source preparation Modules, plus the direct `yaml` dependency.

Characterization and contract tests must cover:

1. no frontmatter plus no tags — byte-identical Source;
2. no frontmatter plus body tags — new canonical frontmatter;
3. existing frontmatter with no `tags` — append the field before the closing delimiter;
4. inline YAML array, block sequence, one string, and legacy CSV string;
5. frontmatter-only tags retained after body removal;
6. frontmatter order followed by first-seen body order;
7. exact case-sensitive de-duplication;
8. Unicode, emoji, quotes, backslashes, commas, hyphens, and underscores;
9. body tags in ordinary text, lists, and quotations;
10. ignored inline/fenced code, escaped syntax, and Markdown links;
11. frontmatter values containing `#` never treated as Body Tags;
12. malformed YAML, duplicate `tags`, unsupported tag value types, and non-string array members;
13. comments and unrelated frontmatter fields remain byte-identical;
14. idempotence of repeated preparation;
15. outgoing File References are unchanged.

Update `meta-plugin.spec.ts`, Post Display Title tests, and Markdown parser tests to cross the new frontmatter seam.

Gate: no Save caller uses the new canonical `content` yet. This slice is safe to merge only if old rendering and display-title behavior remains covered.

## Slice 2 — Cut persistence to Effective Tags and exact filtering

Modify `src/db/markdown.ts` so `baseValues()`:

1. calls `prepareMarkdownSource()` for Markdown;
2. stores the returned canonical `content`;
3. calculates Source Hash from canonical `content`;
4. stores `encodeStoredTags(prepared.tags)`;
5. stores the returned outgoing Paths;
6. returns structured warnings alongside successful Save internally;
7. leaves Svelte Source byte-identical with `[]` tags and outgoing Paths.

All creation paths already converge through `add`, `batchAdd`, or `saveSyncedFile`; prove this for:

- Dashboard File Creation and Creation Templates;
- Editor Save;
- Page Runtime companion Markdown Save;
- Action batch import;
- `/api/markdown/batch`;
- sync create/update;
- Dashboard Content Exchange import.

Then replace every direct CSV reader:

- `readList()` exact tag filter;
- Editor Instant Search stored-tag decoding;
- RSS categories;
- any test fixture or serializer that assumes comma joining.

Keep Action/API input rejection for independently supplied `tags` and `outgoingLinks`.

Gate tests:

- stored File content equals prepared content;
- Source Hash is over the stored prepared content, never the submitted pre-reconciliation content;
- Save conflict, path conflict, Renderer Replacement, recycle/restore, and private ownership behavior are unchanged;
- old CSV and new JSON rows can coexist in one list query;
- SQLite and D1 File Save contracts agree.

## Slice 3 — Close every canonical Source round trip

### Dashboard Editor

The Editor must prepare the current Markdown Source before submitting Save so the visible Edit Buffer adopts the same canonical Source the server will store.

Add two narrow operations to the Text Editor Interface:

```ts
interface SavePreparationEditor {
  applySavePreparation: (content: string) => void
  acknowledgeSavedSource: (content: string) => void
}
```

Both apply the smallest common-prefix/common-suffix change so selection, scroll, diagnostics, and prior history survive. `applySavePreparation` is an ordinary undoable CodeMirror edit because Save visibly updates the user's Source and the update must remain reversible if the request fails. `acknowledgeSavedSource` is a non-history external acknowledgement used only after success when the returned canonical Source differs unexpectedly. Do not replace the entire EditorState merely because frontmatter changed.

Save sequencing:

1. prepare the current Source;
2. apply canonical Source to CodeMirror as an undoable Save-preparation edit and allow `onChange` to update `sourceValue`;
3. capture the exact submitted Path, Renderer, Source, Visibility, File ID, and base revision;
4. submit that snapshot;
5. adopt the returned File as the new server baseline;
6. if local values still equal the submitted snapshot, acknowledge any returned Source difference and clear the Edit Buffer;
7. if the user edited while Save was in flight, keep those newer local values as a dirty Edit Buffer over the returned revision;
8. never overwrite in-flight edits with the returned canonical Source.

Display bounded non-blocking warnings after a successful Save. The warning does not convert a successful Save into an error.

Add focused tests for clean reconciliation, no false dirty state, preserved selection/history, undo after a failed Save, and typing during an in-flight Save.

### Page Runtime and batch adapters

- Confirm `saveOwnedMarkdown()` adopts the returned canonical `content` and revision.
- Include canonical content in authenticated mutation results where a caller maintains a local Source copy.
- `/api/markdown/batch` POST results must expose the saved canonical Source or clearly document that the caller must fetch it before establishing a baseline.
- GET listing/manifest responses remain bounded and do not start returning every Source body.

### Local Workspace Sync

Extend sync create/update responses to include canonical `content`. After every successful local upload or rename:

1. compare returned Source with the uploaded Source;
2. atomically write the returned Source to the correct Disk Representation when different;
3. stat the resulting local File;
4. only then store its returned Source Hash/revision in Sync State.

Cover create, update, rename, Renderer Replacement, partial failure, and retry. The immediately following unchanged Sync Cycle must perform no upload, pull, or conflict.

Dashboard and CLI Content Exchange continue to exchange Source only; importing that Source passes through the same server preparation Module.

Release gate: do not deploy Slice 2 without this round-trip slice. A canonical server Source paired with an unmodified local peer would create a repeat-upload loop or false Sync Conflict.

## Slice 4 — Make Instant Search consume Effective Tags

Replace ad-hoc `split(',')` and body-only dirty parsing in `instant-search.ts` with the shared Module and stored-tag codec.

- Saved Files use decoded derived Effective Tags.
- Dirty Markdown Edit Buffers use `prepareMarkdownSource(buffer.content).tags` without mutating the Edit Buffer.
- Svelte Files expose no tags.
- Preserve current literal case-insensitive substring matching and Path > Tag > Source ranking.
- Continue excluding frontmatter from Source-text matching even though frontmatter tags participate in Tag matching.
- Cache saved Effective Tags by File ID plus Source Hash so a query does not reparse the full workspace.
- Invalidate only the changed File/buffer entry.

Add tests for frontmatter-only matching, body-only matching, union ordering, dirty removal/addition, old CSV, new JSON, and no frontmatter leakage into Source snippets.

## Slice 5 — Add unified CodeMirror Tag completion

Add:

- `src/components/editor/text-editor/tag-completion.ts`;
- `src/components/editor/text-editor/markdown-completion.ts`;
- focused candidate aggregation and completion tests.

Refactor `codemirror-adapter.svelte`:

- rename the current reference-only compartment to one Markdown completion compartment;
- pass both reference and tag candidates;
- reconfigure only when Renderer, read-only state, File ID, or candidate identities change;
- do not reset an open tooltip on ordinary document changes;
- keep Svelte and read-only modes extension-free.

Thread candidates through `index.svelte` → `EditorContent.svelte` → `TextEditor.svelte` → CodeMirror adapter without importing the Editor store inside the completion Module.

Unit tests:

- trigger and exclusion contexts;
- prefix/substring/frequency/recency ranking;
- exact-case candidate de-duplication contract;
- 12-option limit;
- insertion range and cursor;
- Enter, Tab, and Escape behavior;
- both Tag and File Reference sources active in the same extension;
- candidate changes reconfigure once, ordinary typing does not.

Playwright acceptance:

1. save two tagged Files, type a prefix in a third, and accept a suggestion;
2. verify displayed file count and deterministic ordering;
3. verify no popup in frontmatter, headings after a space, escaped syntax, code, or links;
4. verify `[[` File Reference completion still works before and after using Tag completion;
5. verify keyboard-only operation on desktop and mobile viewport geometry where the software keyboard does not cover the active option;
6. verify light and dark themes and long/Unicode tag labels.

## Slice 6 — Documentation, compatibility audit, and final acceptance

Run a read-only compatibility audit against a representative database snapshot before production rollout. Report, without rewriting:

- CSV, JSON, null, empty, and malformed stored-tag row counts;
- valid, invalid, ambiguous, and absent frontmatter counts;
- unsupported frontmatter tag shapes;
- Effective Tags containing whitespace, `#`, commas, or case-only duplicates;
- rows whose stored derived tags differ from current Source analysis.

This audit is evidence, not a production-data migration. Any future backfill requires a separate approved runbook and revision-guarded implementation.

Update user-facing/editor documentation with:

- accepted frontmatter forms;
- Save-time reconciliation behavior;
- how to intentionally remove a tag from both frontmatter and body;
- completion ranking and representability limitation;
- exact public tag filtering.

## Verification gates

Use Node 22.18.0. Run focused checks first:

```bash
fnm exec --using v22.18.0 pnpm test -- \
  src/tests/markdown/frontmatter.spec.ts \
  src/tests/files/analysis.spec.ts \
  src/tests/files/stored-tags.spec.ts \
  src/tests/markdown/meta-plugin.spec.ts \
  src/tests/db/file-save.spec.ts \
  src/tests/db/read-list.spec.ts \
  src/tests/services/markdown-parser.spec.ts \
  src/tests/editor/instant-search.spec.ts \
  src/tests/editor/tag-completion.spec.ts \
  src/tests/editor/file-reference-completion.spec.ts \
  src/tests/editor/text-editor-state.spec.ts \
  src/tests/koala-sync.spec.ts

fnm exec --using v22.18.0 pnpm test:d1 -- \
  src/tests-d1/file-save.d1.ts

fnm exec --using v22.18.0 pnpm exec playwright test \
  tests/e2e/editor.spec.ts \
  tests/e2e/editor-instant-search.spec.ts \
  tests/e2e/editor-mobile.spec.ts
```

Then run broad gates:

```bash
fnm exec --using v22.18.0 pnpm test
fnm exec --using v22.18.0 pnpm test:d1
fnm exec --using v22.18.0 pnpm exec astro check
fnm exec --using v22.18.0 pnpm lint
fnm exec --using v22.18.0 pnpm build:cf
git diff --check
```

For browser evidence, inspect actual completion-popup geometry at 1440×900, 393×727, and 320×640 rather than asserting visibility alone. Rebuild the Playwright fixture if state is contaminated. Treat Node 18 Web API failures and loopback bind restrictions as environment evidence, not product regressions.

## Completion checklist

- [x] `CONTEXT.md` and ADR-0017 define Effective Tags and Tag Reconciliation.
- [x] One Markdown Source preparation Interface owns frontmatter/body merging.
- [x] Preparation is deterministic and idempotent.
- [x] Invalid frontmatter remains saveable and byte-preserved with a bounded warning.
- [x] Stored Markdown content and Source Hash use canonical Source.
- [x] `markdown.tags` new writes are JSON and old CSV remains readable.
- [x] Public tag filtering is exact for JSON and legacy CSV rows.
- [x] RSS and Instant Search use the shared codec/Effective Tags.
- [x] Editor Save does not become falsely dirty and does not lose in-flight edits.
- [x] Page Runtime, batch adapters, imports, and all save paths share preparation.
- [x] Local Workspace writes canonical returned Source before advancing Sync State.
- [x] An unchanged second Sync Cycle is a no-op.
- [x] One CodeMirror autocompletion extension composes Tag and File Reference sources.
- [x] Tag completion excludes invalid contexts and remains keyboard accessible.
- [x] File Reference completion remains active in the unified completion extension.
- [x] Focused feature E2E, unit, D1, Astro, full lint, Cloudflare build, and diff gates pass.

Final acceptance evidence refreshed on 2026-08-19 using Node 22.18.0:

- Vitest: 533 passed, 1 skipped, including the idempotent CSV-to-JSON migration SQL fixture.
- D1: 33 passed.
- Astro Check: 323 files, 0 errors, 0 warnings, 0 hints.
- ESLint: 0 errors; 2 unused-disable warnings remain in the Wrangler-generated `worker-configuration.d.ts`.
- Chromium E2E: 88 passed, including six dedicated Tag Reconciliation/Completion scenarios and the in-flight Save regression.
- Mobile Chromium E2E: 7 passed.
- Completion geometry was inspected at 1440×900, 393×727, and 320×640, including long Unicode labels in light and dark themes.
- Cloudflare production-target build passed.
- The read-only audit completed against the generated E2E SQLite snapshot; production evidence still requires an exported production snapshot.
- `git diff --check` passed.
