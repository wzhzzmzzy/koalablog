# Editor, Online File System, and Svelte Implementation Plan

Date: 2026-07-16

## Objective

Deliver the editor redesign through three strictly ordered, independently usable phases:

1. Creation Template v1 and Online File System foundations, with Markdown behavior only.
2. A Markdown-only CodeMirror 6 migration with textarea capability parity.
3. Persisted Renderer Mode, client-side Svelte building, Render Artifacts, preview, and public rendering.

Do not start a later phase until the previous phase's acceptance gate passes. Phase 1 is further split into gates 1A–1E; only 1A is safe to start before the migration audit exists. Preserve any user-owned worktree changes present at execution time, and treat the recent recycle-bin work as an overlapping compatibility surface rather than an invitation to redesign it.

## Governing contracts

- [Domain language](../../CONTEXT.md)
- [ADR 0001: trusted Svelte files](../adr/0001-trust-svelte-files-as-application-code.md)
- [ADR 0002: derived Svelte render artifacts](../adr/0002-store-derived-svelte-render-artifacts.md)
- [ADR 0003: online file-system model](../adr/0003-model-koalablog-as-an-online-file-system.md)
- [ADR 0004: client-only Svelte compilation](../adr/0004-compile-svelte-files-entirely-in-the-client.md)
- [ADR 0005: persisted Renderer Mode](../adr/0005-store-renderer-mode-with-source-files.md)
- [ADR 0006: staged Source Hash backfill](../adr/0006-backfill-source-hashes-through-a-staged-migration.md)
- [ADR 0007: confirm HTTPS dependency drift](../adr/0007-confirm-https-dependency-drift-before-artifact-replacement.md)
- [ADR 0008: store script-free SEO Snapshots](../adr/0008-store-execution-free-seo-snapshots.md)
- [ADR 0009: generate UnoCSS during Artifact builds](../adr/0009-generate-unocss-during-artifact-builds.md)
- [CodeMirror integration design](../design/2026-07-16-codemirror-editor-integration.md)
- [Official Svelte Playground research](../research/2026-07-16-svelte-playground-client-rendering.md)

## Phase ownership

| Capability | Phase 1 | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| Absolute File Path and derived Title | Deliver | Preserve | Preserve |
| Server-persisted creation | Deliver | Preserve | Preserve |
| Template Prefix, Title pattern, Path pattern, Content | Deliver | Preserve | Preserve |
| Markdown Source analysis and rendering | Deliver | Migrate editor | Preserve |
| Edit Buffer and optimistic Source Save | Deliver | Integrate | Preserve |
| CodeMirror | None | Markdown only | Add Svelte language and diagnostics |
| Persisted Renderer Mode | None | None | Deliver and migrate |
| Template Renderer field | None | None | Deliver as Template schema v2 |
| `.svelte` import/export | None | None | Deliver |
| Svelte compiler, Rollup, preview, Artifact, public runtime | None | None | Deliver |

Phase 1 and Phase 2 must not expose a Renderer toggle, persist a `renderer` field, load Svelte editor packages, accept `.svelte` files, or create a transitional Svelte state. All Files continue through the existing Markdown renderer until Phase 3.

## Cross-phase invariants

- A File is persisted immediately when created; there is no server Draft or publication state.
- Canonical File Path is absolute, slash-leading, extensionless, and unique among active Files.
- Title is always `basename(path)` and is never accepted as independent client input.
- Edit Buffer is recoverable client-local state keyed by stable File ID, not a server lifecycle state.
- References use absolute `[[/path]]` syntax only; rename and move never rewrite referring Source.
- Source Save never depends on compiler, preview, dependency fetch, or Artifact success.
- Once introduced in Phase 3, Renderer Mode is canonical source metadata and Render Artifacts remain replaceable derived data.
- No server code imports `svelte/compiler`, runs Rollup, or executes Svelte Source.

## Working-tree preflight

Before each phase or sub-gate:

1. Run `git status --short` and record the existing changed-file set.
2. Use CodeGraph first for affected symbols and tests because `.codegraph` exists.
3. Inspect overlapping user changes before editing; do not reset, checkout, or overwrite them.
4. Run the current targeted tests to establish a baseline, especially `src/tests/db/recycle-bin.spec.ts` and `src/tests/editor/document-tree.spec.ts`.
5. Keep migrations forward-only and exercise both local SQLite and Cloudflare D1-compatible paths.

---

# Phase 1 — Creation Template v1 and Online File System

## Phase outcome

The application behaves as a server-backed, Obsidian-like File system while preserving the existing Markdown renderer. Clicking `+` immediately creates a server File. Settings owns a configurable Template Catalog whose v1 records contain only Prefix, Title pattern, absolute Path pattern, and Content.

Phase 1 is complete only after gates 1A–1E pass in order.

## Gate 1A — File primitives, Source analysis, and configuration persistence

### 1A.1 Establish pure File-domain primitives

Create a File-domain module before changing callers:

```text
src/lib/files/
  path.ts
  template.ts
  analysis.ts
  types.ts
```

It owns:

- absolute Path normalization and validation;
- Prefix normalization and path-segment-aware matching;
- `basename(path)` Title derivation;
- extensionless active Path validation;
- Source classification from `/post/`, `/memo/`, `/wiki/`, and other Paths;
- absolute File Reference parsing;
- Template v1 validation, matching, and instantiation.

Do not add a Renderer abstraction to this phase. Write table-driven tests for root and nested Paths, repeated slashes, missing leading slashes, `.`, `..`, `.recycleBin`, invalid final segments, Unicode names, Prefix boundary collisions, and Paths that normalize to the same value.

### 1A.2 Make Source the single analysis input

Implement `src/lib/files/analysis.ts` before changing Save orchestration. It accepts Markdown Source and returns tags plus absolute outgoing Paths. It must:

- recognize only literal `[[/path]]` File References;
- mark missing targets as unresolved through the existing reference layer;
- never inspect `#preview-md` or any rendered DOM;
- never rewrite Source during rename or move;
- remain the single analyzer used later by Save, preview metadata, references, and CodeMirror callers.

Characterization tests must cover the current tag behavior, absolute references, rejected relative/title-only references, escaped syntax, and malformed input.

### 1A.3 Repair configuration persistence before Template UI

The current local `updateGlobalConfig` stores only the patch and can erase unrelated scopes; its shallow object spread also cannot define safe array-replacement semantics. Repair and test that existing Interface for its existing consumers, but do not store Templates in the shared Settings object.

Add a dedicated, versioned Template Catalog Interface backed by a single-row local SQLite adapter and a Cloudflare D1 adapter, rather than the shared global-config KV object:

```ts
interface CreationTemplateV1 {
  id: string
  prefix: string
  titlePattern: string
  pathPattern: string
  content: string
}

interface TemplateCatalogV1 {
  schemaVersion: 1
  revision: number
  templates: CreationTemplateV1[]
}
```

Use a dedicated catalog row keyed, for example, as `koala:creation-templates`, with the schema version inside the value. Catalog writes atomically replace the complete v1 catalog through `UPDATE ... WHERE revision = :baseRevision`; a missed row returns `409 template_catalog_conflict`. Local SQLite uses the same transaction contract as D1. This prevents two Template panels from silently overwriting each other, while the separate record removes lost-update coupling with the main Settings form. Do not claim compare-and-swap semantics on Cloudflare KV, which cannot provide this contract.

Initialization semantics are explicit:

- an absent catalog is distinct from a stored empty catalog;
- an onboarding/upgrade command atomically creates the catalog once if absent;
- that command writes the ordinary `/memo/` preset as data;
- catalog reads never synthesize a preset or hidden fallback;
- explicitly saving `templates: []` remains empty across refresh and restart.

The preset is:

```text
prefix:       /memo/
titlePattern: {{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}
pathPattern:  {{targetPrefix}}/{{title}}
content:      ""
```

### Gate 1A implementation work packages

Implement Gate 1A as the following ordered change sets. Each change set must pass its focused tests before the next starts. These are implementation boundaries, not suggested commits; do not stage or commit without separate authorization.

#### 1A-0 — Record the baseline

Before editing:

1. Record `git status --short`, the branch, and HEAD.
2. Confirm CodeGraph is current and capture the callers/impact of `updateGlobalConfig`, `initMarkdown`, `createNew`, `drafts`, and `extractLinksAndTags`.
3. Run the current safety tests:

```text
pnpm exec vitest run \
  src/tests/db/recycle-bin.spec.ts \
  src/tests/editor/document-tree.spec.ts \
  src/tests/services/markdown-parser.spec.ts \
  src/tests/markdown/double-link-plugin.spec.ts \
  src/tests/markdown/tag-plugin.spec.ts
```

Record pre-existing failures; do not repair unrelated behavior inside Gate 1A.

#### 1A-1 — Add absolute Path and Template v1 pure functions

Primary files:

```text
src/lib/files/types.ts                         new
src/lib/files/path.ts                          new
src/lib/files/template.ts                      new
src/tests/files/path.spec.ts                   new
src/tests/files/template.spec.ts               new
```

Required public functions and types:

```ts
declare const absoluteFilePathBrand: unique symbol
declare const absolutePathPrefixBrand: unique symbol
type AbsoluteFilePath = string & { readonly [absoluteFilePathBrand]: true }
type AbsolutePathPrefix = string & { readonly [absolutePathPrefixBrand]: true }

declare function parseAbsoluteFilePath(input: string): Result<AbsoluteFilePath, PathError>
declare function parseAbsolutePathPrefix(input: string): Result<AbsolutePathPrefix, PathError>
declare function deriveTitle(path: AbsoluteFilePath): string
declare function classifySource(path: AbsoluteFilePath): MarkdownSource
declare function isDescendantOfPrefix(path: AbsoluteFilePath, prefix: AbsolutePathPrefix): boolean

declare function validateTemplateV1(input: unknown): Result<CreationTemplateV1, TemplateError[]>
declare function selectTemplateV1(templates: CreationTemplateV1[], targetPrefix: AbsolutePathPrefix): CreationTemplateV1 | null
declare function instantiateTemplateV1(template: CreationTemplateV1, context: TemplateContext): Result<InstantiatedTemplateV1, TemplateError[]>
```

`Result` may use a small project-local discriminated union; do not add a dependency for it. Runtime creation APIs must reject relative input. Gate 1B may add a separately named migration-only function that prepends `/` to legacy Paths; do not make the runtime parser silently repair relative Paths.

Canonical Prefixes retain a trailing slash except `/`. File Paths do not retain a trailing slash. Reject dot segments, `.recycleBin`, empty final segments, NUL/control characters, and any Path that cannot round-trip to one canonical value. Preserve valid Unicode rather than transliterating it.

Template instantiation remains pure and deterministic:

- inject `now` and the candidate `uniqueSuffix` through `TemplateContext`;
- never read the database, clock, browser, or Settings inside the engine;
- resolve Title, then Path, then Content;
- require the resolved Path to start with the complete `targetPrefix` and end with the complete Title segment;
- let Gate 1D own database retries and collision responses.

Stop if the Path contract cannot represent an existing active route without changing its public URL; that is migration evidence for Gate 1B, not a reason to loosen runtime validation.

#### 1A-2 — Add the Source analyzer without switching Save yet

Primary files:

```text
src/lib/files/analysis.ts                     new
src/tests/files/analysis.spec.ts              new
src/lib/markdown/double-link-plugin.ts         compatibility only if token data is insufficient
src/lib/markdown/tag-plugin.ts                 compatibility only if token data is insufficient
```

Expose one pure Source contract:

```ts
interface MarkdownSourceAnalysis {
  tags: string[]
  outgoingPaths: AbsoluteFilePath[]
}

declare function analyzeMarkdownSource(source: string): MarkdownSourceAnalysis
```

Use the Markdown token stream or equivalent Source parsing; do not render HTML, create DOM elements, query `#preview-md`, or resolve references from a current File list. Collect only absolute `[[/path]]` references, preserve first-seen order, and de-duplicate exact canonical Paths and tags.

Characterization cases must include tags and references in ordinary paragraphs, multiple values, Unicode, fenced/inline code, escaped syntax, malformed brackets, relative/title-only `[[name]]`, duplicate references, and Markdown links that merely contain similar text. Preserve the current tag token rules unless the absolute-Path contract requires a documented change.

Do not switch `src/components/editor/index.svelte`, `src/actions/form/markdown.ts`, or `src/lib/services/markdown-parser.ts` in this change set. Gate 1C performs the production cutover after the File schema can store the new absolute reference shape. This ordering proves the analyzer before Save orchestration changes without creating a half-migrated payload.

#### 1A-3 — Repair GlobalConfig persistence

Primary files:

```text
src/lib/kv/index.ts
src/lib/kv/local.ts
src/tests/kv/global-config.spec.ts             new
```

Implement and test these contracts:

- `updateGlobalConfig` persists `updatedConfig`, never the incoming `payload` object;
- updating one scope preserves all other scopes;
- updating one property preserves siblings in that scope;
- local `set` plus `sync` actually reaches disk and survives a fresh store instance;
- Cloudflare KV receives the same complete merged object as local storage;
- `putGlobalConfig` follows the same durable-write rule;
- no Template array or Template-specific behavior is added to `GlobalConfig`.

Make the local store testable through an injected/temporary file path or an exported store factory. Do not let tests read or overwrite the developer's real `koala.config.json`. Keep the existing `src/actions/form/settings.ts` request contract unchanged in Gate 1A.

#### 1A-4 — Add the versioned Catalog record and one-time onboarding preset

Primary files:

```text
src/db/schema.ts
migrations/0001_creation_template_catalog.sql          new
migrations/meta/*                                      generated metadata
src/db/template-catalog.ts                             new
src/tests/db/template-catalog.spec.ts                  new
src/actions/form/onboarding.ts
src/pages/onboarding.astro
```

Add an isolated table; do not alter `markdown` in this migration:

```text
creation_template_catalog
  key            text primary key
  schemaVersion  integer not null
  revision       integer not null
  payload        text/json not null
  createdAt      integer not null
  updatedAt      integer not null
```

The storage Interface returns an explicit absent state rather than fabricating a preset:

```ts
declare function readTemplateCatalog(env: Env): Promise<{ status: 'absent' } | { status: 'ready', catalog: TemplateCatalogV1 }>
declare function ensureTemplateCatalogInitialized(env: Env): Promise<TemplateCatalogV1>
declare function replaceTemplateCatalog(env: Env, baseRevision: number, templates: CreationTemplateV1[]): Promise<
  | { status: 'saved', catalog: TemplateCatalogV1 }
  | { status: 'conflict', currentRevision: number }
>
```

Implementation rules:

- `ensureTemplateCatalogInitialized` uses one atomic `INSERT ... ON CONFLICT ... RETURNING` statement (or a backend transaction with the same contract) to create or return the winning row;
- the ordinary `/memo/` preset is written only by this initialization command;
- repeated initialization never restores a deleted preset or replaces an explicitly empty catalog;
- replacement validates every Template before entering the transaction and uses `UPDATE ... WHERE revision = :baseRevision`;
- SQLite and D1 share fixtures and result semantics;
- malformed stored JSON/schema versions return an explicit storage error rather than an empty synthesized catalog.

Call `ensureTemplateCatalogInitialized` in onboarding before `putGlobalConfig` marks `_runtime.ready = true`. For an existing ready installation, invoke the same idempotent command once per server/isolate startup after the additive migration is present. Do not run Catalog initialization and the readiness write in `Promise.all`: if catalog creation fails, onboarding must remain retryable; if the final config write fails, initialization is safe to repeat. Reads still never synthesize the preset.

The Cloudflare onboarding page currently builds a fresh database from imported SQL. Append the additive Catalog migration to that bootstrap path or route it through a shared migration initializer, and add a check that a fresh D1 onboarding database contains the Catalog table. Do not broaden Gate 1A into redesigning the existing destructive onboarding reset behavior.

#### 1A-5 — Gate verification and handoff

Run:

```text
pnpm exec vitest run \
  src/tests/files/path.spec.ts \
  src/tests/files/template.spec.ts \
  src/tests/files/analysis.spec.ts \
  src/tests/kv/global-config.spec.ts \
  src/tests/db/template-catalog.spec.ts \
  src/tests/db/recycle-bin.spec.ts \
  src/tests/editor/document-tree.spec.ts \
  src/tests/services/markdown-parser.spec.ts \
  src/tests/markdown/double-link-plugin.spec.ts \
  src/tests/markdown/tag-plugin.spec.ts

pnpm run lint
pnpm run build
pnpm run build:cf
```

Also inspect the generated migration and bundles to prove:

- `markdown` was not altered;
- no Renderer/Svelte field or package was introduced;
- no Template UI or server File creation behavior changed;
- no existing Save/import caller was switched to the new reference payload prematurely;
- the only onboarding behavior change is durable one-time Catalog initialization before readiness.

Gate 1A handoff must record test/build results, generated migration name, storage schema version, and any legacy Path discovered that cannot satisfy the new runtime parser. Gate 1B must not start without that evidence.

### Gate 1A verification

- File Path, Prefix, Template, and Source analyzer unit tests pass.
- Local and Cloudflare Template Catalog contract tests pass, including first initialization, repeated initialization, stored empty catalog, stale revision, and unrelated Settings updates.
- Existing Settings save behavior no longer erases unrelated scopes.
- No destructive Source schema or Template UI migration has started; the catalog record is an isolated additive storage change.

## Gate 1B — Migration audit, backups, and fixtures

### 1B.1 Add a read-only migration dry-run

Before replacement-table SQL can run, add a dry-run command that reads the same data shape and normalization rules as the real migration and emits a machine-readable and human-readable report containing:

- every group of active rows that collide after Path normalization;
- every row whose legacy `subject` differs from `basename(normalizedPath)`;
- invalid or unnormalizable legacy Paths;
- active versus recycled duplicate groups;
- row counts and preservation checks for IDs, timestamps, privacy, remote-truth fields, classification, tags, references, and recycle-bin metadata.

The independent legacy `subject` value is intentionally not retained as Title, but it must never be discarded silently. Store or archive the audit report with the migration runbook.

Any active normalized-Path collision or invalid active Path aborts the migration. Recycled duplicates are reported and preserved because the existing recycle-bin model permits them.

### 1B.2 Establish recovery points

Before destructive migration in each environment:

1. Stop writes or enter the existing maintenance boundary.
2. Run and archive the dry-run report against the migration snapshot.
3. Create and verify a local SQLite backup before local migration.
4. Record a Cloudflare D1 Time Travel restore point/bookmark and database identity before D1 migration.
5. Record the application commit, migration version, row counts, and operator timestamp.
6. Proceed only when the dry-run has no abort conditions and the recovery point is usable.

For SQLite, run replacement and verification inside one transaction. For D1, use an idempotent forward migration with explicit pre/post verification and the recorded Time Travel point as rollback. Never attempt to repair active collisions automatically.

### 1B.3 Build migration fixtures

Fixtures must include:

- raw Paths that normalize to one active Path;
- different legacy subjects for the same basename;
- active and recycled duplicates;
- private memos, root pages, Unicode Paths, and remote-truth rows;
- restore conflicts after independent Title uniqueness is removed;
- a successful dataset that proves stable IDs and timestamps.

### Gate 1B verification

- Dry-run output is deterministic and tested against the real normalization function.
- Active collisions and invalid active Paths abort before schema mutation.
- Subject differences appear in the audit.
- SQLite backup/restore rehearsal and D1 Time Travel runbook are recorded.
- Migration fixtures prove recycle-bin duplicates remain intact.

## Gate 1C — Source schema, caller, route, and Save cutover

### 1C.1 Migrate the `markdown` source table without Renderer Mode

Keep the table name `markdown` for compatibility, but align the File columns with the Phase-1 model:

- replace `link` with absolute `path`;
- replace independent `subject` with derived `title`;
- add or expose a monotonic `revision` used by optimistic Source Save;
- retain stable IDs, content, Source classification, tags, references, privacy, remote-truth state, timestamps, and recycle-bin metadata;
- remove the active-Title unique index;
- retain an active-Path partial unique index compatible with recycled duplicates;
- do not add `renderer` or `sourceHash` yet.

Migration rules:

```text
old link: post/example  -> path: /post/example
old subject: Any value -> title: example
```

Normalize stored outgoing Paths only when an existing reference already identifies a resolvable Path. Do not guess title-based targets and do not rewrite Source text.

### 1C.2 Replace legacy caller contracts

Introduce `FileRecord` as the canonical TypeScript name while permitting a short-lived internal compatibility alias. Phase-1 writes accept:

```ts
interface SaveFileInput {
  id: number
  path: string
  content: string
  private: boolean
  baseRevision: number
}
```

The server derives Title, Source classification, tags, and outgoing Paths. It rejects independently supplied Title. Update database access, Astro actions, API routes, page loaders, public routes, editor Store/history, recycle-bin lifecycle, remote-truth/batch endpoints, RSS/list rendering, and outgoing-link payloads while preserving existing Markdown output and URLs.

### 1C.3 Define optimistic Save behavior

Each Source mutation uses `baseRevision` as a precondition. The database update increments `revision` only when the active row still has that revision. A mismatch returns `409 source_conflict` with the current server File revision and values; it does not mutate the server row or discard the Edit Buffer.

The client enters an explicit conflict state and blocks automatic retries. It may reload the current server version after confirmation or let the user copy/reconcile local Source, but it must not silently overwrite either side. Rename, move, privacy changes, and content Save use the same precondition.

### 1C.4 Cut over Markdown routes without behavior changes

Keep `src/pages/post/[...link].astro`, `src/pages/memo/[...link].astro`, `src/pages/[...slug].astro`, RSS, and existing Markdown rendering compatible. Phase 1 must not dispatch by Renderer Mode or introduce Svelte failure states.

### Gate 1C verification

- The audited migration succeeds on SQLite and D1-compatible fixtures and preserves recorded fields.
- Existing Markdown routes and URLs remain reachable.
- Concurrent same-revision Saves produce one success and one `409 source_conflict`.
- Save analysis reads Source through `src/lib/files/analysis.ts`, not Preview DOM.
- Existing recycle-bin and document-tree tests still pass.

## Gate 1D — Template Utility and immediate server creation

### 1D.1 Define Template v1 resolution

The clicked normalized absolute Prefix is `targetPrefix`. Template resolution follows these rules:

- longest segment-boundary Prefix match selects at most one Template;
- matching selects initial values only and never redirects creation;
- the resolved final Path must be a descendant of `targetPrefix`;
- `{{targetPrefix}}` expands to the complete clicked Prefix, not the Template's configured Prefix;
- Title resolves first and contains no slash;
- Path resolves second, begins with the complete `{{targetPrefix}}` value, and ends with the complete `{{title}}` segment;
- Content resolves last and may use final `{{title}}`, `{{path}}`, and `{{targetPrefix}}`;
- placeholders are declarative only: datetime, targetPrefix, uniqueSuffix, title, and path;
- no JavaScript evaluation occurs.

Example: clicking `+` on `/memo/project/` while `/memo/` supplies the Template must create `/memo/project/<title>`, never `/memo/<title>`.

### 1D.2 Define collision behavior

Creation candidates are inserted under the active-Path database unique constraint. Use a shared bounded attempt limit, for example 100 candidates:

- Blank Creation tries `targetPrefix/unnamed`, then numbered variants.
- A Template containing `{{uniqueSuffix}}` may retry with the next suffix after a unique-path race.
- A Template without `{{uniqueSuffix}}` makes one insertion attempt; collision returns `409 path_conflict` with the resolved Path.
- No collision path silently changes a Template-resolved Title or Path.
- Retry decisions come from the database constraint, never a client-side File list snapshot.

### 1D.3 Build the independent Templates Utility panel

Add a lazy Svelte Settings module under Utility. It supports list, add, edit, delete, Prefix/Title pattern/absolute Path pattern/Content fields, inline normalized preview for a sample `targetPrefix`, duplicate-Prefix prevention, unsaved indication, and an independent `Save Templates` action using catalog revision.

There is no Renderer field in Template v1. Test malformed records, auth, empty catalogs, large Content, duplicate Prefixes, stale revisions, normalization, and independent Settings saves.

### 1D.4 Move File creation to the server

Replace ID-zero client-only creation with an authenticated action:

```ts
declare function createFile(input: { targetPrefix: string }): Promise<FileRecord>
```

Server sequence:

1. Normalize and validate `targetPrefix`.
2. Read the stored Template Catalog without synthesizing defaults.
3. Select the longest matching Template.
4. Instantiate Title, absolute Path, and Content once, or use Blank Creation.
5. Apply Visibility Default: `/memo/` private; other Paths public.
6. Insert immediately using the collision rules above.
7. Return the persisted File with stable ID and revision.

The client inserts the returned File into the Store, selects it, starts its Edit Buffer, updates the URL, and focuses the editor. Normal creation never has an ID-zero File.

### 1D.5 Add Template-backed empty Prefix nodes

Merge stored non-root Template Prefixes into the Sidebar projection so users can click `+` before a File exists. Preserve File-backed nodes after Template deletion, remove nodes backed by neither Files nor Templates, and keep the root Template on the ordinary New File action. Nested `+` always passes the clicked Prefix as `targetPrefix`.

### Gate 1D verification

- The `/memo/` preset is an ordinary stored Template and can be edited or deleted.
- A stored empty catalog applies no Template.
- Nested clicked-Prefix creation, root creation, longest-prefix selection, and Template-only nodes work.
- Blank and `{{uniqueSuffix}}` races retry within the bound; fixed-Path collisions return `409 path_conflict`.
- Every `+` returns and selects a persisted server File.

## Gate 1E — Edit Buffer, lifecycle, references, import/export, and sync

### 1E.1 Migrate Edit Buffer state by File ID

- Rename `drafts` to `editBuffers` in code and user-facing language.
- Key buffers by stable File ID, never Path.
- Store Path, content, private state, `baseRevision`, and dirty/conflict status.
- Migrate legacy `koala-editor-drafts` only when one entry maps safely to one active File.
- Ignore ambiguous or deleted legacy entries rather than attaching them incorrectly.
- Keep Sidebar dirty indicators and preserve the buffer across rename/move.

Same-ID server refresh reconciliation is deterministic:

| Local state | Server revision | Result |
| --- | --- | --- |
| No dirty Edit Buffer | Any newer revision | Replace editor/base values from server. |
| Dirty buffer, revision unchanged | Same as `baseRevision` | Keep the local buffer. |
| Dirty buffer, revision changed | Newer than `baseRevision` | Keep local values, mark conflict, expose server values, and block automatic Save. |
| File purged | Missing | Remove the buffer and private editor state. |

### 1E.2 Align references and lifecycle

- Derive Title from Path on create, Save, move, restore, and import.
- Remove automatic outgoing-reference rewriting on rename/move.
- Resolve only absolute `[[/path]]` references.
- Restore conflicts depend on active Path only.
- Renamed restore generates a unique final Path and derives Title.
- Preserve the recent duplicate recycle-bin behavior.
- Purge removes Edit Buffer and later lets the Text Editor domain command forget private editor state.
- Recycle-bin UI uses File vocabulary.

### 1E.3 Keep Phase-1 disk exchange Markdown-only

Disk representation is `/<path> -> <path>.md` only:

- export Source only and never derived data;
- preserve directory structure as absolute File Path on import;
- strip only the final `.md` extension;
- reject `.svelte` and other extensions in Phase 1;
- update Bearer/batch/sync APIs to use absolute Path and the same Save revision contract.

### Phase 1 acceptance gate

Functional acceptance:

- Every `+` creates and selects a persisted server File beneath the clicked Prefix.
- New installations receive the stored memo preset once; an explicitly empty catalog remains empty.
- Longest-prefix matching, `{{targetPrefix}}`, placeholders, collision semantics, and Template-only nodes work.
- Path is absolute and unique; Title always equals basename; duplicate Titles in different Prefixes work.
- Absolute references are deterministic and rename never rewrites Source.
- Concurrent Save conflicts preserve the local Edit Buffer and server row.
- Markdown-only import/export preserves directory structure.
- Recycle-bin restore/purge, duplicate behavior, remote sync, RSS, and existing routes still work.
- No Renderer Mode, `.svelte` handling, compiler, Artifact, or Svelte UI exists.

Verification:

- All 1A–1E targeted tests.
- SQLite migration rehearsal from a verified backup and D1-compatible migration/restore runbook.
- `src/tests/db/recycle-bin.spec.ts` and `src/tests/editor/document-tree.spec.ts` remain green.
- Editor tree, Edit Buffer, API batch, Markdown parser, RSS, and route tests.
- `pnpm test`, `pnpm run lint`, `pnpm run build`, and `pnpm run build:cf` where the environment permits.
- Browser smoke tests for create, nested create, rename, move, conflict refresh, Template Settings, Markdown import/export, and recycle bin.

Do not begin Phase 2 until all five sub-gates pass.

---

# Phase 2 — Markdown-only CodeMirror 6 parity

## Phase outcome

CodeMirror replaces the File Source textarea at `/dashboard/edit` without adding Renderer Mode, Svelte language packages, compiler diagnostics, `.svelte` exchange, or transitional Svelte states. The textarea adapter remains available until browser parity is proven. Creation Template Manager, Playground, and unrelated textareas remain unchanged in Phase 2.

## 2.1 Extract the deep Text Editor Interface

Implement the Interface defined in the CodeMirror design and first satisfy it with the existing textarea. Callers never receive `EditorView` or `EditorState`. The mounted editor exposes only current-instance commands such as focus and Markdown image insertion; its public module exposes the lifecycle command `discardEditorState(fileId)`.

Pass the current `filePath` only so Text Editor can expose the stable accessible label `File Source for <Path>`; Path editing, normalization, and validation remain in FileEditor.

Keep the single page-level `Mod-s` listener in FileEditor because Save persists the whole File, including Path and visibility. Text Editor does not receive `onSave` or register a Save keymap. Ctrl+S and macOS Cmd+S must save exactly once from both Path and Source focus.

`src/lib/files/analysis.ts` remains the single Source analyzer. Do not create an editor-owned `file-analysis.ts`.

Use only two Phase-2 test layers: Vitest for pure state/transaction/registry behavior and Playwright against the real `/dashboard/edit` page for DOM and editor behavior. Do not add `jsdom`, `happy-dom`, or a component Testing Library. Native Chinese IME candidate interaction and physical touch selection remain explicit final manual checks.

## 2.2 Add curated Markdown CodeMirror dependencies

Add only the CodeMirror packages required for Markdown parity: state, view, commands, language, search, limited autocomplete/bracket closing, and Markdown language. Do not add Svelte language or compiler packages in this phase.

Capabilities include line numbers, active line, undo/redo, search/replace, brackets, indentation, folding, selection matching, multiple selection, Markdown wrapping, accessible labels, theme integration, and a narrow-screen policy that hides line-number/fold gutters without reducing editing capability. Completion suggestions, formatting, Vim mode, and LSP remain out of scope; autocomplete is used only for bracket closing.

## 2.3 Implement the private adapter and state registry

Create one `EditorView` per mounted Text Editor behind the Interface. Keep `Map<FileId, EditorState>` private to the Text Editor module. External value transactions are annotated so they cannot echo through `onChange`.

The registry restores selection, scroll, folds, and undo across File switches and rename/move. Module-level `discardEditorState(fileId)` removes state after purge or empty-trash without exposing CodeMirror mechanics. CodeMirror state is never serialized to localStorage.

FileEditor's accepted `value` remains the only Source truth. Restore a cached `EditorState` only when its document equals that `value`; otherwise discard the stale cache and seed a fresh state from `value`. The registry must never become a second Source authority beside File/Edit Buffer.

Text Editor does not receive or interpret File revisions. FileEditor owns `baseRevision`, dirty state, conflict detection, and the choice of accepted Source. Reconcile its resulting inputs with three mechanical rules:

- a different File ID saves the current state and restores or seeds the selected File state;
- the same File ID with the same `value` is a no-op, including local `onChange` echoes and metadata-only revision changes;
- the same File ID with a different accepted `value` replaces the cached state and clears stale undo;
- purge and empty-trash invoke `discardEditorState(fileId)` for every permanently deleted File.

## 2.4 Move Markdown image insertion behind the Interface

Keep Phase 2 image-only and reject non-image Files from this flow. Paste, drop, and toolbar multi-select all call the same `insertImages(files)` command. Determine true drop coordinates with `posAtCoords` and insert the image batch as one undoable placeholder transaction. Upload success replacement and failure cleanup do not enter undo history; if the user removed a placeholder before completion, discard that result. One undo removes the original batch and never resurrects an upload placeholder. Emit Markdown image syntax only; Svelte `<img>` output is not part of Phase 2.

## 2.5 Run production parity before deleting textarea

Switch production through a private code-level adapter constant while keeping the textarea implementation available. Do not add an adapter prop, user setting, URL parameter, or localStorage flag; rollback changes the constant and redeploys. Verify selection, scroll, undo, Save shortcuts, external refresh, conflict preservation, paste/drop/toolbar upload, concurrent upload placeholders, read-only recycle-bin behavior, keyboard navigation, focus, mobile scrolling, and Chinese IME in real browsers.

Keep Text Editor mounted while Preview is visible and hide only its editing surface. Returning from Preview to Edit requests a fresh editor measurement and focuses Source without rebuilding editor state. Ordinary File selection does not steal focus; new File creation focuses Path; Save preserves current focus; completing toolbar image insertion focuses Source; paste and drop retain editor focus.

Delete textarea helpers, implementation-specific tests, and global textarea styling only after the browser gate passes. Remove unused `monaco-editor` only after bundle and behavior verification.

## Phase 2 acceptance gate

- All Phase-1 File, lifecycle, Save, and Markdown Preview behavior remains intact.
- File switching restores selection, scroll, folds, and undo by File ID.
- Same-ID refresh follows the clean/dirty/conflict reconciliation matrix.
- Rename preserves state; purge and empty-trash remove it through `discardEditorState(fileId)`.
- Cmd+S and Ctrl+S Save exactly once.
- Paste, drop, and toolbar multi-select share the tested Markdown image transaction flow.
- Mobile scrolling, focus, keyboard editing, undo, and selection pass through Playwright in a real browser; native Chinese IME candidate interaction and physical touch selection pass the final manual checklist.
- The temporary textarea adapter is removed only after parity passes.
- Public pages do not load CodeMirror chunks.
- No Renderer toggle, Svelte language, Svelte diagnostics, Build Worker, or Svelte state appears.
- Interface tests, browser tests, `pnpm test`, lint, production builds, and a bundle report pass.

Do not begin Phase 3 until this gate passes.

Gate status as of 2026-07-22: closed. The user confirmed native IME and physical-touch checks in the real environment and confirmed the Phase-2 version is deployed; see [the Phase-2 verification record](./2026-07-21-editor-codemirror-phase-2-verification.md). Phase 3 still starts only after the working tree is cleaned and a dedicated branch is created from the latest `main`.

---

# Phase 3 — Renderer Mode and client-side Svelte rendering

## Phase outcome

Phase 3 introduces the complete Renderer model at once: source-row metadata, Template schema v2, editor toggle and language, `.svelte` exchange, client diagnostics/build/preview, Render Artifact storage, SEO Snapshot, and public execution. The server remains a source/artifact store and validator only.

## 3.1 Migrate Renderer Mode, Template schema, and canonical source hashes

Add to the source `markdown` row:

```ts
renderer: 'markdown' | 'svelte'
sourceHash: string
```

Existing and Phase-1 rows migrate to `renderer = 'markdown'`. Template Catalog schema v2 adds `renderer`, and every v1 Template migrates to `markdown`. Only after both migrations pass may Settings show a Renderer field and the editor show a Markdown/Svelte toggle.

Roll out `sourceHash` through the staged forward migration in ADR 0006. Migration `0003` adds Renderer Mode with a Markdown default and a temporarily nullable `sourceHash`; it also converts legacy `NULL` content to `''` and makes content `NOT NULL`, matching every current create/save/sync input and the existing blank-File behavior. Compatible application code must compute the canonical hash for every new or changed Source. During a maintenance window, a JavaScript backfill processes old rows in stable ID batches and updates only rows whose revision still matches the value that was hashed. Audit every stored hash against the current Renderer Mode and content, then use migration `0004` to require `sourceHash`. Renderer UI remains disabled until the audit and `0004` both pass. Do not use placeholder hashes, permanent `NULL`/blank dual representations, or read-triggered lazy backfill.

Define the canonical hash as lowercase hexadecimal SHA-256 of the UTF-8 bytes of:

```ts
JSON.stringify(['koala-source-v1', renderer, content])
```

The array order and schema tag are part of the contract. `content` is the exact stored string after input validation: `''` is a valid blank Source, while `null` is rejected after migration `0003`; whitespace and line endings are not trimmed or otherwise normalized by the hash function. Path, Title, visibility, timestamps, and compiler version are not hash inputs. All supported server runtimes share fixtures for blank content, Unicode, line endings, and both Renderer values.

Every Source Save updates Renderer Mode, content, and `sourceHash` atomically in the same optimistic transaction. This makes an older Artifact non-current immediately, before any replacement build finishes. A Current Render Artifact requires both:

```text
file.renderer = svelte
artifact.sourceHash = file.sourceHash
```

Changing back to Markdown makes every Svelte Artifact non-current without blocking Source Save.

Currentness deliberately ignores File revision, Path, visibility, and timestamps. If Source changes from A to B without attaching a replacement and later returns exactly to renderer/content A, the preserved A Artifact becomes Current again because its `sourceHash` matches; the same applies when switching from Svelte to Markdown and back without changing Svelte content. If a B Artifact was attached, the one-to-one row already replaced A and reverting to A requires a new build. Reusing a preserved Artifact does not refetch dependencies; an explicit Rebuild remains the operation that can discover and confirm dependency drift.

Phase 3 also extends disk exchange:

```text
Markdown -> <absolute path>.md
Svelte   -> <absolute path>.svelte
```

Import strips only the recognized final renderer extension, derives the extensionless absolute Path, and saves Source before best-effort Artifact building.

Extend `sync-vault` and the headless batch API without adding a Node compiler. The sync client discovers `.md` and `.svelte`, derives Renderer Mode only from the final disk extension, and sends it with Source. An omitted API renderer remains backward-compatible Markdown input. The server response includes the stored `renderer`, canonical `sourceHash`, and `artifactStatus: 'not_applicable' | 'current' | 'rebuild_required'`; a Svelte Source Save reports `rebuild_required` whenever no matching Artifact remains. Pull writes the matching disk extension, and duplicate `.md`/`.svelte` inputs that map to one extensionless Path are rejected. Markdown attachment/reference rewriting never runs against Svelte Source.

## 3.2 Extend CodeMirror and the editor for Renderer Mode

- Add the Renderer toggle outside CodeMirror; switching changes the Edit Buffer but does not transform Source.
- Lazy-load `@replit/codemirror-lang-svelte` only for Svelte Files.
- Extend the Text Editor Interface with diagnostics without exposing CodeMirror types.
- Emit Markdown image syntax in Markdown Mode and `<img>` markup in Svelte Mode.
- Debounce compiler-only Svelte diagnostics and map structured offsets into CodeMirror ranges.
- Reject `<svelte:head>` with a structured diagnostic because document-head metadata belongs to the Page Shell.
- Permit explicit Svelte `:global(...)` styles, but emit a non-blocking `global_style_escape` warning when a selector has no component-local or Artifact-root anchor, including direct `body`, `html`, or `:root` targets. The warning does not prevent Preview or Artifact attachment.
- Keep `src/lib/files/analysis.ts` as the Source analyzer; Svelte v1 returns no Markdown tags/references unless an explicit syntax is added later.

## 3.3 Build the lazy client Worker with bounded dependencies

Adapt the official Svelte Playground implementation into one lazy module Worker with `diagnose` and `build` messages:

- pin Phase 3 v1 to the repository's current installed `svelte` version `5.19.2`, changing the package declaration from `^5.19.2` to the exact version;
- expose that version through one shared constant and assert that the loaded compiler and bundled runtime both report `5.19.2`; never load `latest` or allow the compiler, runtime, and Artifact metadata to drift;
- publish the compiler, matching runtime module registry, and `@rollup/browser` as same-origin lazy Worker assets; browser builds must not fetch the toolchain from npm or another CDN;
- publish the browser-safe UnoCSS generator profile as another same-origin lazy Worker asset; public pages must not load an UnoCSS runtime;
- load the compiler and run `@rollup/browser` only inside the Worker;
- build `/App.svelte` plus internal entry/runtime virtual modules;
- accept `<script lang="ts">` only for the TypeScript syntax that Svelte `5.19.2` can erase without a preprocessor, such as type annotations, interfaces, and type-only imports; reject compiler-reported non-erasable features such as TypeScript enums;
- treat Worker compiler diagnostics as syntax/build diagnostics rather than a complete TypeScript type check; Phase 3 v1 does not run `tsc` or promise semantic type errors;
- accept ordinary Svelte markup, JavaScript, and plain CSS without Sass, Less, Pug, or other script/markup/style preprocessors; the canonical UnoCSS directives transform is the only additional source transformation in v1;
- bundle the matching Svelte runtime into a named-export IIFE expression;
- emit CSS separately;
- expose only the pinned Svelte `5.19.2` browser runtime registry. User Source may import `svelte`, `svelte/animate`, `svelte/easing`, `svelte/events`, `svelte/legacy`, `svelte/motion`, `svelte/reactivity`, `svelte/reactivity/window`, `svelte/store`, and `svelte/transition`; type-only `svelte/action` or `svelte/elements` imports may be erased before bundling. The compiler's own exact internal-client imports resolve from a separate internal allowlist, while user imports of `svelte/compiler`, `svelte/server`, `svelte/internal/*`, or package metadata are rejected;
- reject user relative imports, aliases, and every other bare npm package;
- permit only absolute HTTPS imports and URL-relative dependencies that pass the policy below. Literal dynamic HTTPS imports enter the same bounded graph and are inlined into the single IIFE; non-literal dynamic imports are rejected because the stored Artifact cannot contain unresolved chunks.

Use monotonically increasing request IDs and **stale-result suppression**. Obsolete diagnose/build results are discarded and cannot update diagnostics, preview, or Artifact state. An `AbortController` may stop outstanding dependency fetches, but the plan does not claim Rollup/compiler CPU cancellation unless the implementation proves it.

HTTPS dependency policy for v1:

| Limit | Contract |
| --- | --- |
| Scheme/CORS | Absolute `https:` entry URLs only; opaque or CORS-blocked responses fail. |
| Redirects | None. Fetch with `redirect: 'error'`; a redirect fails with a structured diagnostic and the author must use the final versioned HTTPS URL directly. |
| MIME | JavaScript MIME types only (`text/javascript`, `application/javascript`, `text/ecmascript`, `application/ecmascript`). |
| Graph depth | At most 8 dependency edges from the user entry. |
| Module count | At most 64 fetched URL modules. |
| Per resource | At most 512,000 UTF-8 bytes. |
| Total fetched source | At most 4,000,000 UTF-8 bytes. |
| Timeout | 10 seconds per fetch and 20 seconds for dependency resolution/build. |

Exceeding a limit produces a structured diagnostic, uploads no Artifact, and never rolls back the already successful Source Save.

The build dependency graph accepts JavaScript ESM only. Phase 3 v1 does not implement build-time imports for CSS, JSON, images, fonts, WASM, or other asset modules. Statically declared fetch-bearing asset URLs in Svelte markup and component CSS must use either a slash-leading same-origin URL, including the existing `/api/oss/...` attachment representation, or an absolute `https:` URL. Reject static `./` or `../` asset URLs because a database-backed single Source File has no neighbouring disk directory; also reject protocol-relative, `blob:`, and `data:` asset URLs. Parse `srcset` candidates and CSS `url(...)` values under the same rule. Ordinary navigation links are not asset URLs and retain their existing File/URL behavior.

These non-JavaScript asset bytes are not fetched by the Worker, stored in the Artifact, included in the dependency manifest, or covered by `artifactHash`; their availability and drift remain public runtime behavior. This static validation does not claim to constrain trusted runtime-computed attributes, imperative DOM changes, remote JavaScript module behavior, or ordinary runtime `fetch()`.

Every successful build emits a canonical dependency manifest sorted by final URL. Each fetched URL module records its final URL, UTF-8 byte count, and lowercase hexadecimal SHA-256. The manifest remains Artifact provenance rather than a `sourceHash` input, so the server can continue calculating Source Hashes without network access. Its serialized bytes count toward the Artifact metadata and combined-row limits.

Run UnoCSS only during each full Svelte Artifact build, with exact version `65.4.3`; compiler-only diagnostics do not generate CSS. Use direct browser-safe `@unocss/core`, `@unocss/preset-uno`, and directives-transformer entry points rather than the Node/Vite config loader. Derive one shared, serializable `koala-unocss-v1` profile from `presetUno({ preflight: 'on-demand' })`, the repository's font-family theme, and the `font-ui`, `font-content`, and `font-code` shortcuts. Extract utility tokens from the Svelte AST only: literal tokens in static `class` attribute segments, Svelte class-directive names, and explicit UnoCSS directives inside component styles. Do not scan script string literals, imports, ordinary text content, or infer dynamically constructed class fragments; do not include `presetIcons` or a safelist in v1.

Postprocess every generated utility selector beneath `:where([data-koala-artifact-root])` and rewrite any on-demand UnoCSS variable initialization to the same root and its descendants; emit no unscoped preset preflight. This root marker is present in both Preview and the public Page. Emit the resulting utility CSS before Svelte's compiler-scoped component CSS so local component styles can override utilities, then store their combination as the Artifact `css` payload. Explicit `:global(...)` component styles and trusted runtime DOM changes can still affect the Page Shell under the accepted same-origin trust model; utility scoping is a collision boundary, not a sandbox.

During diagnostics, inspect Svelte style selectors and emit non-blocking `global_style_escape` for explicit global selectors that are not anchored by a component-local selector or the Artifact root. This warning makes intentional Page Shell styling visible without pretending that CSS restrictions can isolate trusted same-origin code.

Pin the package declarations used by the Worker to `65.4.3`. Calculate a constant `unocssConfigHash` from the canonical serializable profile, and record both the exact UnoCSS version and config hash in every Artifact. The server accepts new attachments only from the current supported pair; existing stored Artifacts keep serving their self-contained CSS after a later application upgrade.

## 3.4 Implement preview RPC and diagnostics

Preview uses a `srcdoc` iframe and a command-ID `postMessage` protocol. It owns CSS injection, previous-component unmount, DOM cleanup, IIFE evaluation, `mount`, Snapshot capture, runtime error forwarding, and focus hand-back. Each successful build marks the preview mount target with `data-koala-artifact-root`, injects that build's combined Artifact CSS inside the iframe before mounting, and replaces the previous preview stylesheet rather than accumulating styles.

The iframe is an editor containment surface, not the public trust boundary. Keep `allow-same-origin` disabled; grant only the sandbox capabilities actually required. Its CSP may permit the inline bootstrap, the `unsafe-eval` needed for the stored IIFE, and CORS-permitted HTTPS runtime requests in this preview-only environment. Do not forward same-origin credentials or proxy private application APIs into the opaque-origin iframe. Build-time import resolution remains bounded by the Worker resolver, while public mounted code may use ordinary browser runtime `fetch()`. Public Artifact execution must not use `eval`.

Snapshot capture uses `flushSync()`, `tick()`, two animation frames, and a five-second command timeout. It records the saved initial DOM only; it does not promise completion of arbitrary runtime fetches or animations. Components that depend on authenticated same-origin data must provide an initial or error state suitable for the credential-free Preview and Snapshot.

Before upload, pass `root.innerHTML` through a deterministic script-free Snapshot serializer. It removes `script`, `iframe`, `object`, `embed`, extra `style`, `link`, `meta`, and `base` elements; removes event-handler attributes, `srcdoc`, and executable URL schemes such as `javascript:`; and preserves ordinary body structure, text, images, safe links, native form controls, and form submission whose action/formaction URL passes the same safe-URL validation. Do not unwrap `<form>`, disable controls, remove ordinary submission attributes, or add an inert wrapper. The server independently parses and validates the submitted Snapshot against the same contract and returns `422 invalid_snapshot` without storing the Artifact if executable code remains or the representation is non-canonical. Snapshot filtering does not alter Source, Preview, or live Artifact JavaScript and is not presented as a sandbox or a side-effect-free document.

For Svelte Page metadata, the Page Shell always uses the path-derived File Title as the document title. It derives the optional description only from the first non-empty `<p>` in the server-validated Snapshot: take `textContent`, collapse whitespace, trim it, and retain at most the first 160 Unicode code points. Omit the description when no non-empty paragraph exists. Phase 3 v1 adds no Svelte frontmatter or metadata directive, and `<svelte:head>` remains unsupported; this keeps the initial SEO head deterministic without executing Source.

Full Rollup builds run only when Preview opens, stopped edits occur while Preview remains visible, Save requests an exact-buffer build, explicit Rebuild runs, or import performs best-effort rebuild. Preview-hidden edits may run compiler diagnostics but never Rollup.

Keep the legacy `/playground` and `/api/playground/compile` operating throughout this work. Delete the page, endpoint, old `Playground.svelte`, and its example Source only after the client Worker and preview iframe pass their gate at the end of Phase 3; do not migrate the experiment to the new Worker.

## 3.5 Store bounded Render Artifacts

Create a one-to-one `markdown_render` record keyed by File ID:

```ts
interface SvelteRenderArtifactV1 {
  schemaVersion: 1
  renderer: 'svelte'
  svelteVersion: string
  unocssVersion: string
  unocssConfigHash: string
  sourceHash: string
  dependencies: Array<{
    finalUrl: string
    bytes: number
    sha256: string
  }>
  artifactHash: string
  javascriptResourceHash: string
  cssResourceHash: string
  javascript: string
  css: string
  snapshotHtml: string
  createdAt: Date
  updatedAt: Date
}
```

Artifact upload is an authenticated admin-only same-origin operation. It re-reads the File and rejects missing/non-Svelte Files, unsupported schema, unsupported Svelte or UnoCSS toolchain metadata, hash mismatch, malformed/non-canonical dependency manifests, non-canonical or executable Snapshot HTML, and size violations. Hash mismatch returns `409`; invalid Snapshot returns `422 invalid_snapshot`; no Artifact failure rolls back Source Save. After validation, the server calculates `artifactHash` as lowercase hexadecimal SHA-256 of the UTF-8 bytes of `JSON.stringify(['koala-artifact-v1', svelteVersion, unocssVersion, unocssConfigHash, sourceHash, dependencies, javascript, css, snapshotHtml])` and stores it with the Artifact. It also serializes the final `koala-js-v1` ES module response and calculates `javascriptResourceHash` from those exact UTF-8 bytes, while `cssResourceHash` is the SHA-256 of the exact UTF-8 stylesheet response. All three hashes are lowercase hexadecimal and server-owned; the client does not choose them. The v1 module serializer is immutable for stored v1 Artifacts, and any response-byte serialization change requires a new resource representation version.

When an existing Current Artifact has the same `sourceHash` but its dependency manifest differs, an ordinary attach returns `409 dependency_changed` with a bounded dependency diff, the current `artifactHash`, and the server-calculated proposed `artifactHash`, leaving the existing Artifact untouched. The editor must show the changed final URLs and hashes and require an authenticated site-owner confirmation before resubmitting. Confirmation is not a blind boolean: it carries the exact current and proposed Artifact Hashes returned by that conflict. The server repeats all validation and attaches only when the current row, current File `sourceHash`, and recalculated proposed hash still equal that confirmed pair; otherwise it returns `409 dependency_confirmation_stale` and requires a fresh review. First builds and builds for a changed `sourceHash` do not require this confirmation. This protects explicit Rebuild and automatic workflows from silently replacing output when a mutable HTTPS dependency changes without a Source edit.

Enforce UTF-8 byte counts before D1 insertion:

- `javascript` at most 1,400,000 bytes;
- `css` at most 200,000 bytes;
- `snapshotHtml` at most 150,000 bytes;
- serialized Artifact metadata at most 50,000 bytes;
- combined stored Artifact row payload at most 1,800,000 bytes.

The combined limit is authoritative even when every individual field is below its limit, leaving headroom below D1's 2,000,000-byte value/row ceiling. Add local and D1 near-limit tests. Oversize returns a clear `413 artifact_too_large` and leaves Source saved.

## 3.6 Define public execution without runtime evaluation

Serve Artifact CSS through a dedicated same-origin stylesheet endpoint keyed by the File and requested `sourceHash`. The Page Shell emits a blocking `<link rel="stylesheet">` before the Snapshot body and marks the body mount target with `data-koala-artifact-root`; it never interpolates Artifact CSS into a raw `<style>` element. CSS is already generated and stored before this request: the public Page does not run UnoCSS or inject styles through JavaScript. The CSS endpoint performs the same currentness, visibility, lifecycle, cache, ETag, and stale-hash checks as the JavaScript Artifact module endpoint.

The stored JavaScript is a self-contained IIFE **expression** that evaluates to the named entry API. The Artifact endpoint responds as an ES module wrapper that embeds that stored expression as ordinary parsed module code and exports:

```ts
declare function mountKoalaArtifact(target: HTMLElement): Promise<{ unmount: () => void }>
```

The Page Shell imports that module, passes the explicit live-body target, and owns the switch from visible Snapshot to live DOM. Successful mount sets `data-koala-render-state="mounted"` and dispatches `koala:artifact-mounted`; failure sets `data-koala-render-state="failed"`, dispatches `koala:artifact-error`, and leaves the Snapshot visible. Neither the wrapper nor Page Shell uses `eval`, `new Function`, or a global target lookup. Do not call `hydrate()` because the Snapshot has no SSR hydration markers.

Keep Snapshot and the initially hidden live target beneath the shared Artifact root. If module import or the initial `mountKoalaArtifact(target)` rejects, best-effort clear partial live DOM, keep Snapshot visible, and report the failure; trusted code may already have produced external side effects, so cleanup is not described as isolation. Once initial mount resolves, remove Snapshot from the DOM and reveal the live target. After that transition, later event-handler exceptions, timer failures, rejected requests, or other asynchronous application errors do not restore Snapshot or reset live state. Do not install Page-Shell-wide `error` or `unhandledrejection` handlers for Artifact recovery; the Svelte application owns its post-mount error UI.

## 3.7 Enforce Artifact access, lifecycle, and revalidation

Every Page and Artifact request re-reads current File lifecycle, visibility, Renderer Mode, `sourceHash`, and Artifact match before serving bytes. Renderer Mode does not replace the existing private-Page authentication flow. Page HTML and Artifact resources use separate cache contracts:

- Active public Page HTML: `Cache-Control: public, no-cache`; v1 emits no custom Page ETag and never returns `304`, because Page Shell theme, navigation, and metadata are not covered by `artifactHash`.
- Active public JavaScript module: `Cache-Control: public, no-cache` plus the strong ETag `"koala-js-v1-sha256-<javascriptResourceHash>"`, calculated from the exact final module response bytes.
- Active public CSS resource: `Cache-Control: public, no-cache` plus the separate strong ETag `"koala-css-v1-sha256-<cssResourceHash>"`, calculated from the exact stylesheet response bytes.
- Active private Page, JavaScript module, or CSS resource for an authorized user: `Cache-Control: private, no-store`.
- Private Page for an unauthenticated visitor: preserve the existing redirect to `/guest-login`; after successful authentication, return the private Page without storing it.
- Private Artifact module or CSS resource for an unauthenticated visitor: `404` to avoid direct resource enumeration.
- Trashed or purged File: `404`.
- Requested hash does not equal the current File `sourceHash`: `404`.
- Current File/hash but no matching stored Artifact representation: direct JavaScript/CSS requests return `404` with `Cache-Control: no-store`; only the Page request uses the explicit `503` state below.
- `304 Not Modified` is allowed only for public JavaScript/CSS resources, only after the same access/currentness checks pass, and only when `If-None-Match` matches that representation's current strong ETag. A resource `304` repeats its `ETag` and `Cache-Control` headers and has no body.

Successful JavaScript uses `Content-Type: text/javascript; charset=utf-8`; successful CSS uses `Content-Type: text/css; charset=utf-8`; both send `X-Content-Type-Options: nosniff`. Parse `If-None-Match` as an HTTP validator list rather than comparing the raw header string. Every denied, missing, stale, malformed, or otherwise non-success Artifact resource response uses `Cache-Control: no-store` and never includes an Artifact ETag.

An otherwise accessible Svelte File whose Current Artifact is missing or stale returns a `503 Service Unavailable` Page Shell with an explicit unable-to-render body, `Cache-Control: no-store`, and no Artifact ETag. This response does not expose Source or execute an older Artifact. The same File returns `200` once a matching Artifact exists; do not use `404` or `200` for this temporary render-unavailable state.

Do not use `immutable` caching. A public-to-private change must reject the next unauthenticated request even when the visitor possesses an old ETag. Trash blocks the Artifact without deleting it; restore may make the preserved Artifact current again only when Renderer Mode and `sourceHash` still match. Purge deletes the Artifact through the File lifecycle.

Tests cover regenerated public Page HTML, representation-specific JavaScript/CSS ETags and 304s, public-to-private, private Page guest-login, authenticated private access, unauthenticated private Artifact denial, trash, restore, purge, renderer change, Source change, stale hash URL, and revalidation after every transition.

## 3.8 Attach, render, and describe Artifacts

Save sequence:

1. Optimistically save Path, Renderer Mode, Source, visibility, and canonical `sourceHash`.
2. Return the new revision and `sourceHash` immediately.
3. Reuse an exact-buffer build or ask the Worker to build.
4. Render inside the preview frame and capture Snapshot.
5. Upload the Artifact.
6. Recheck current File hash and persist only a matching Artifact.

Public Markdown continues through the existing renderer. Public Svelte renders the Page Shell, Artifact CSS, visible Snapshot, and empty live root, then imports the checked ES-module wrapper. Missing/stale Artifact produces the `503` unable-to-render Page Shell defined above without exposing Source or executing old output.

SEO metadata uses the derived File Title and the bounded first non-empty Snapshot paragraph defined above. Snapshot and Artifact CSS appear in the initial response and remain when JavaScript is disabled or live mount fails. Document that runtime-fetched or later animated state is outside the SEO contract.

## 3.9 Rebuild, import, and remove the legacy Playground

- Add per-File Rebuild and an admin Utility batch rebuild that runs only while the browser stays open. A per-File Rebuild may request dependency-change confirmation; batch Rebuild records `dependency_changed` as a per-Path result and never auto-confirms it.
- Import Source first and build Svelte Artifacts sequentially on a best-effort basis.
- Let `sync-vault` save `.svelte` Source without compiling and report every `rebuild_required` Path for the later browser Utility; it must not invoke the Worker toolchain from Node.
- Report per-Path failures without rolling back imported Source.
- Export Source only.
- After client Worker/preview acceptance passes, delete `/playground`, `/api/playground/compile`, the old `Playground.svelte`, and its example Source. Do not retain or migrate the separate experiment.
- Inspect server and public bundles to prove they contain no compiler or Rollup.

## Phase 3 acceptance gate

- Renderer and Template v2 migrations default every old record to Markdown.
- Migration `0003` converts legacy `NULL` content to `''`; all later Source writes and hash calculations require string content, including the valid blank string.
- Source Save atomically updates `sourceHash`; old Artifacts become non-current immediately.
- Currentness ignores revision and non-Source metadata: an exact Source reversion reactivates only a matching Artifact still preserved in the one-to-one row, while a previously replaced Artifact is not historical state and must be rebuilt.
- Svelte diagnostics and builds happen in the client and stale results cannot overwrite current state.
- The runtime resolver accepts only the pinned public browser Svelte specifiers and compiler-owned internal entries; server/compiler entries, other bare packages, user relative imports, and non-literal dynamic imports fail with structured diagnostics.
- HTTPS dependency limits, failures, redirect rejection, MIME, graph bounds, sizes, and timeouts are tested; the Worker never claims to inspect an opaque cross-origin redirect chain.
- Build-time non-JavaScript imports fail with structured diagnostics; static markup/CSS asset URLs accept only slash-leading same-origin or absolute HTTPS forms, while runtime-computed asset behavior remains part of the trusted application rather than Artifact provenance.
- Dependency manifests are canonical and covered by `artifactHash`; same-Source dependency drift requires explicit site-owner confirmation and is never auto-confirmed by batch Rebuild.
- Dependency-change confirmation is bound to the exact current/proposed Artifact Hash pair and becomes stale if either Artifact or current Source changes before resubmission.
- UnoCSS `65.4.3` runs only during full builds in the lazy Worker with the canonical browser-safe profile; Svelte-AST static classes, class directives, and explicit style directives enter Artifact CSS, while script/text false positives, icons, safelists, and dynamic class fragments remain unsupported in v1.
- UnoCSS utilities and on-demand variable initialization are limited to the shared Artifact root in Preview and public delivery; no global preset preflight or utility selector reaches the Page Shell accidentally.
- Explicit unanchored Svelte global styles remain allowed but produce the same non-blocking `global_style_escape` warning in editor diagnostics and full builds.
- Build-time import limits do not constrain public runtime requests; Preview remains opaque-origin, credential-free, and limited to CORS-permitted HTTPS requests.
- Source saves despite compiler, Rollup, dependency, runtime, Snapshot, upload, or size failure.
- Artifact byte limits pass local and D1 near-limit tests.
- Public module execution uses an explicit target and no runtime `eval`.
- Artifact CSS loads from a checked same-origin stylesheet endpoint and is never interpolated into the Page Shell's `<style>` context.
- `<svelte:head>` is rejected while public Svelte Source owns only the body mount target.
- Missing or stale Artifact pages return an uncached `503` Page Shell and recover to `200` after a matching build.
- Regenerated public HTML, private guest-login, direct private Artifact denial, public-to-private, trash, restore, purge, resource ETag, and resource-only 304 behavior pass integration/browser tests.
- Public JS/CSS ETags match SHA-256 fixtures of their exact response bytes, remain independent between representations, and revalidation runs only after access and currentness checks.
- Initial HTML contains styled Snapshot content; live DOM replaces it only after successful mount.
- Initial import/mount failure preserves Snapshot and best-effort clears partial live DOM; after successful mount the Snapshot is removed permanently and later application errors never trigger global fallback or live-state reset.
- Stored Snapshot HTML is canonical and script-free; executable code and embedded browsing contexts are rejected, while safe native links and form submissions remain functional without weakening or being confused with the trusted live component.
- Svelte Page titles use the derived File Title, while descriptions are omitted or deterministically projected from the first non-empty validated Snapshot paragraph with the 160-code-point bound; Source cannot provide separate head metadata in v1.
- Old exact-version Artifacts remain executable after an application Svelte upgrade.
- Phase 3 v1 builds and records Svelte `5.19.2`; changing the supported build version is a separate upgrade, not part of Phase 3 implementation.
- Erasable `<script lang="ts">` syntax compiles without a preprocessor, non-erasable TypeScript and unsupported style/markup languages produce structured diagnostics, and the editor does not claim full TypeScript type checking.
- Blocking npm/CDN access does not prevent the same-origin Worker toolchain from loading; Markdown editing and public routes contain no compiler, runtime registry, Rollup, or UnoCSS generator dependency.
- `.md` and `.svelte` import/export follow Renderer Mode while public Paths remain extensionless.
- Headless `.svelte` sync persists Source and reports browser Rebuild requirements without compiling in Node or on the server.
- The legacy Playground and `/api/playground/compile` remain until the client gate passes and are deleted only at Phase 3 end.
- Worker protocol, resolver, diagnostic mapping, preview, rebuild, version pinning, bundle inspection, `pnpm test`, lint, SQLite build, and Cloudflare build pass.

---

# Final delivery criteria

The complete work is done only when every sub-gate and phase gate passes and this end-to-end flow succeeds:

1. Onboarding stores the ordinary Markdown `/memo/` Template once.
2. Clicking `+` on `/memo/project/` immediately persists a File beneath that clicked Prefix.
3. Markdown editing, conflicts, references, lifecycle, and `.md` exchange work through the server-backed File model.
4. CodeMirror replaces textarea only after Markdown parity, refresh, upload, mobile, and Chinese IME checks pass.
5. Phase 3 upgrades a Template to Svelte and creates an extensionless Svelte File.
6. Source saves even when the first client build fails; its old Artifact becomes non-current immediately.
7. A later browser build captures Snapshot and attaches a matching, size-bounded Artifact.
8. A public visit receives revalidated styled Snapshot HTML and mounts live code without runtime evaluation.
9. Public-to-private, trash, restore, and purge take effect on the next Artifact request.
10. Rename preserves File ID and buffers without rewriting absolute references; export/import uses `.svelte` only as disk representation.
