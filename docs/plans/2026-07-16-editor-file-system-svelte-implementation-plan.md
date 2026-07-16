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

- `ensureTemplateCatalogInitialized` uses an insert-if-absent transaction and then reads the winning row;
- the ordinary `/memo/` preset is written only by this initialization command;
- repeated initialization never restores a deleted preset or replaces an explicitly empty catalog;
- replacement validates every Template before entering the transaction and uses `UPDATE ... WHERE revision = :baseRevision`;
- SQLite and D1 share fixtures and result semantics;
- malformed stored JSON/schema versions return an explicit storage error rather than an empty synthesized catalog.

Call `ensureTemplateCatalogInitialized` in onboarding before `putGlobalConfig` marks `_runtime.ready = true`. Do not run both operations in `Promise.all`: if catalog creation fails, onboarding must remain retryable; if the final config write fails, the idempotent Catalog initialization is safe to repeat.

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

CodeMirror replaces the textarea for Markdown editing without adding Renderer Mode, Svelte language packages, compiler diagnostics, `.svelte` exchange, or transitional Svelte states. The textarea adapter remains available until browser parity is proven.

## 2.1 Extract the deep Text Editor Interface

Implement the Interface defined in the CodeMirror design and first satisfy it with the existing textarea. Callers never receive `EditorView` or `EditorState`. The Interface owns text mechanics and exposes only domain commands such as focus, Markdown attachment insertion, and `forgetFile(fileId)`.

`src/lib/files/analysis.ts` remains the single Source analyzer. Do not create an editor-owned `file-analysis.ts`.

## 2.2 Add curated Markdown CodeMirror dependencies

Add only the CodeMirror packages required for Markdown parity: state, view, commands, language, search, limited autocomplete/bracket closing, and Markdown language. Do not add Svelte language or compiler packages in this phase.

Capabilities include line numbers, active line, undo/redo, search/replace, brackets, indentation, folding, selection matching, multiple selection, Markdown wrapping, accessible labels, theme integration, and narrow-screen gutter policy.

## 2.3 Implement the private adapter and state registry

Create one `EditorView` per mounted Text Editor behind the Interface. Keep `Map<FileId, EditorState>` private to the Text Editor module. External value transactions are annotated so they cannot echo through `onChange`.

The registry restores selection, scroll, folds, and undo across File switches and rename/move. `forgetFile(fileId)` removes state on purge without exposing CodeMirror mechanics. CodeMirror state is never serialized to localStorage.

Reconcile a same-ID server refresh with Phase-1 Edit Buffer rules:

- clean buffer plus new revision replaces the cached state with a new server-seeded state;
- dirty buffer plus unchanged base retains the cached state;
- dirty buffer plus changed server revision retains the local state but marks conflict and prevents automatic external replacement;
- purge invokes `forgetFile(fileId)`.

## 2.4 Move Markdown attachment editing behind the Interface

Use one transaction flow for paste, drop, and toolbar upload. Determine true drop coordinates with `posAtCoords`, insert unique placeholders, inject upload I/O, replace/remove the exact placeholder, emit Markdown image syntax, and preserve coherent undo. Svelte `<img>` output is not part of Phase 2.

## 2.5 Run production parity before deleting textarea

Switch production through a reversible adapter selection while keeping the textarea implementation available. Verify selection, scroll, undo, Save shortcuts, external refresh, conflict preservation, paste/drop/toolbar upload, concurrent upload placeholders, read-only recycle-bin behavior, keyboard navigation, focus, mobile scrolling, and Chinese IME in real browsers.

Delete textarea helpers, implementation-specific tests, and global textarea styling only after the browser gate passes. Remove unused `monaco-editor` only after bundle and behavior verification.

## Phase 2 acceptance gate

- All Phase-1 File, lifecycle, Save, and Markdown Preview behavior remains intact.
- File switching restores selection, scroll, and undo by File ID.
- Same-ID refresh follows the clean/dirty/conflict reconciliation matrix.
- Rename preserves state; purge removes it through `forgetFile(fileId)`.
- Cmd+S and Ctrl+S Save exactly once.
- Paste, drop, and toolbar upload share the tested Markdown transaction flow.
- Mobile scrolling, focus, keyboard editing, undo, selection, and Chinese IME pass in a real browser.
- The temporary textarea adapter is removed only after parity passes.
- Public pages do not load CodeMirror chunks.
- No Renderer toggle, Svelte language, Svelte diagnostics, Build Worker, or Svelte state appears.
- Interface tests, browser tests, `pnpm test`, lint, production builds, and a bundle report pass.

Do not begin Phase 3 until this gate passes.

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

Define the canonical hash as lowercase hexadecimal SHA-256 of the UTF-8 bytes of:

```ts
JSON.stringify(['koala-source-v1', renderer, content])
```

The array order and schema tag are part of the contract. Path, Title, visibility, timestamps, and compiler version are not hash inputs. All supported server runtimes share fixtures for Unicode, newlines, and both Renderer values.

Every Source Save updates Renderer Mode, content, and `sourceHash` atomically in the same optimistic transaction. This makes an older Artifact non-current immediately, before any replacement build finishes. A Current Render Artifact requires both:

```text
file.renderer = svelte
artifact.sourceHash = file.sourceHash
```

Changing back to Markdown makes every Svelte Artifact non-current without blocking Source Save.

Phase 3 also extends disk exchange:

```text
Markdown -> <absolute path>.md
Svelte   -> <absolute path>.svelte
```

Import strips only the recognized final renderer extension, derives the extensionless absolute Path, and saves Source before best-effort Artifact building.

## 3.2 Extend CodeMirror and the editor for Renderer Mode

- Add the Renderer toggle outside CodeMirror; switching changes the Edit Buffer but does not transform Source.
- Lazy-load `@replit/codemirror-lang-svelte` only for Svelte Files.
- Extend the Text Editor Interface with diagnostics without exposing CodeMirror types.
- Emit Markdown image syntax in Markdown Mode and `<img>` markup in Svelte Mode.
- Debounce compiler-only Svelte diagnostics and map structured offsets into CodeMirror ranges.
- Keep `src/lib/files/analysis.ts` as the Source analyzer; Svelte v1 returns no Markdown tags/references unless an explicit syntax is added later.

## 3.3 Build the lazy client Worker with bounded dependencies

Adapt the official Svelte Playground implementation into one lazy module Worker with `diagnose` and `build` messages:

- load one exact supported Svelte package version, never `latest`;
- load the compiler and run `@rollup/browser` only inside the Worker;
- build `/App.svelte` plus internal entry/runtime virtual modules;
- bundle the matching Svelte runtime into a named-export IIFE expression;
- emit CSS separately;
- reject user relative imports, aliases, and bare npm packages;
- permit only absolute HTTPS imports and URL-relative dependencies that pass the policy below.

Use monotonically increasing request IDs and **stale-result suppression**. Obsolete diagnose/build results are discarded and cannot update diagnostics, preview, or Artifact state. An `AbortController` may stop outstanding dependency fetches, but the plan does not claim Rollup/compiler CPU cancellation unless the implementation proves it.

HTTPS dependency policy for v1:

| Limit | Contract |
| --- | --- |
| Scheme/CORS | Absolute `https:` entry URLs only; opaque or CORS-blocked responses fail. |
| Redirects | At most 3; every hop and final URL must remain HTTPS. |
| MIME | JavaScript MIME types only (`text/javascript`, `application/javascript`, `text/ecmascript`, `application/ecmascript`). |
| Graph depth | At most 8 dependency edges from the user entry. |
| Module count | At most 64 fetched URL modules. |
| Per resource | At most 512,000 UTF-8 bytes. |
| Total fetched source | At most 4,000,000 UTF-8 bytes. |
| Timeout | 10 seconds per fetch and 20 seconds for dependency resolution/build. |

Exceeding a limit produces a structured diagnostic, uploads no Artifact, and never rolls back the already successful Source Save.

## 3.4 Implement preview RPC and diagnostics

Preview uses a `srcdoc` iframe and a command-ID `postMessage` protocol. It owns CSS injection, previous-component unmount, DOM cleanup, IIFE evaluation, `mount`, Snapshot capture, runtime error forwarding, and focus hand-back.

The iframe is an editor containment surface, not the public trust boundary. Keep `allow-same-origin` disabled; grant only the sandbox capabilities actually required. Its CSP may permit the inline bootstrap and `unsafe-eval` needed for the stored IIFE in this preview-only environment, while network access remains bounded by the Worker resolver. Public Artifact execution must not use `eval`.

Snapshot capture uses `flushSync()`, `tick()`, two animation frames, and a five-second command timeout. It records the saved initial DOM only; it does not promise completion of arbitrary runtime fetches or animations.

Full Rollup builds run only when Preview opens, stopped edits occur while Preview remains visible, Save requests an exact-buffer build, explicit Rebuild runs, or import performs best-effort rebuild. Preview-hidden edits may run compiler diagnostics but never Rollup.

Keep `/api/playground/compile` operating throughout this work. It is removed or migrated only after the client Worker and preview iframe pass their gate at the end of Phase 3.

## 3.5 Store bounded Render Artifacts

Create a one-to-one `markdown_render` record keyed by File ID:

```ts
interface SvelteRenderArtifactV1 {
  schemaVersion: 1
  renderer: 'svelte'
  svelteVersion: string
  sourceHash: string
  artifactHash: string
  javascript: string
  css: string
  snapshotHtml: string
  createdAt: Date
  updatedAt: Date
}
```

Artifact upload re-reads the File and rejects missing/non-Svelte Files, unsupported schema, hash mismatch, and size violations. Hash mismatch returns `409`; no Artifact failure rolls back Source Save. After validation, the server calculates `artifactHash` as lowercase hexadecimal SHA-256 of the UTF-8 bytes of `JSON.stringify(['koala-artifact-v1', svelteVersion, sourceHash, javascript, css, snapshotHtml])` and stores it with the Artifact. The client does not choose this value.

Enforce UTF-8 byte counts before D1 insertion:

- `javascript` at most 1,400,000 bytes;
- `css` at most 200,000 bytes;
- `snapshotHtml` at most 150,000 bytes;
- serialized Artifact metadata at most 50,000 bytes;
- combined stored Artifact row payload at most 1,800,000 bytes.

The combined limit is authoritative even when every individual field is below its limit, leaving headroom below D1's 2,000,000-byte value/row ceiling. Add local and D1 near-limit tests. Oversize returns a clear `413 artifact_too_large` and leaves Source saved.

## 3.6 Define public execution without runtime evaluation

The stored JavaScript is a self-contained IIFE **expression** that evaluates to the named entry API. The Artifact endpoint responds as an ES module wrapper that embeds that stored expression as ordinary parsed module code and exports:

```ts
declare function mountKoalaArtifact(target: HTMLElement): Promise<{ unmount: () => void }>
```

The Page Shell imports that module, passes the explicit live-body target, and owns the switch from visible Snapshot to live DOM. Successful mount sets `data-koala-render-state="mounted"` and dispatches `koala:artifact-mounted`; failure sets `data-koala-render-state="failed"`, dispatches `koala:artifact-error`, and leaves the Snapshot visible. Neither the wrapper nor Page Shell uses `eval`, `new Function`, or a global target lookup. Do not call `hydrate()` because the Snapshot has no SSR hydration markers.

## 3.7 Enforce Artifact access, lifecycle, and revalidation

Every Page and Artifact request re-reads current File lifecycle, visibility, Renderer Mode, `sourceHash`, and Artifact match before serving bytes or honoring `If-None-Match`.

- Active public File: `Cache-Control: public, no-cache` plus the strong ETag `"koala-artifact-v1-<artifactHash>"`.
- Active private File for an authorized user: `Cache-Control: private, no-store`.
- Private File for an unauthenticated visitor: `404` to avoid existence disclosure.
- Trashed or purged File: `404`.
- Requested hash does not equal the current File `sourceHash`: `404`.
- `304 Not Modified` is allowed only after the same access/currentness checks pass.

Do not use `immutable` caching. A public-to-private change must reject the next unauthenticated request even when the visitor possesses an old ETag. Trash blocks the Artifact without deleting it; restore may make the preserved Artifact current again only when Renderer Mode and `sourceHash` still match. Purge deletes the Artifact through the File lifecycle.

Tests cover public fetch and 304, public-to-private, authenticated private access, unauthenticated private denial, trash, restore, purge, renderer change, Source change, stale hash URL, and revalidation after every transition.

## 3.8 Attach, render, and describe Artifacts

Save sequence:

1. Optimistically save Path, Renderer Mode, Source, visibility, and canonical `sourceHash`.
2. Return the new revision and `sourceHash` immediately.
3. Reuse an exact-buffer build or ask the Worker to build.
4. Render inside the preview frame and capture Snapshot.
5. Upload the Artifact.
6. Recheck current File hash and persist only a matching Artifact.

Public Markdown continues through the existing renderer. Public Svelte renders the Page Shell, Artifact CSS, visible Snapshot, and empty live root, then imports the checked ES-module wrapper. Missing/stale Artifact produces an explicit unable-to-render body without exposing Source or executing old output.

SEO metadata uses derived File Title and the first meaningful Snapshot text. Snapshot and Artifact CSS appear in the initial response and remain when JavaScript is disabled or live mount fails. Document that runtime-fetched or later animated state is outside the SEO contract.

## 3.9 Rebuild, import, and remove the server experiment

- Add per-File Rebuild and an admin Utility batch rebuild that runs only while the browser stays open.
- Import Source first and build Svelte Artifacts sequentially on a best-effort basis.
- Report per-Path failures without rolling back imported Source.
- Export Source only.
- After client Worker/preview acceptance passes, delete `/api/playground/compile` or migrate Playground to the same Worker.
- Inspect server and public bundles to prove they contain no compiler or Rollup.

## Phase 3 acceptance gate

- Renderer and Template v2 migrations default every old record to Markdown.
- Source Save atomically updates `sourceHash`; old Artifacts become non-current immediately.
- Svelte diagnostics and builds happen in the client and stale results cannot overwrite current state.
- HTTPS dependency limits, failures, redirects, MIME, graph bounds, sizes, and timeouts are tested.
- Source saves despite compiler, Rollup, dependency, runtime, Snapshot, upload, or size failure.
- Artifact byte limits pass local and D1 near-limit tests.
- Public module execution uses an explicit target and no runtime `eval`.
- Public, private, public-to-private, trash, restore, purge, ETag, and 304 behavior pass integration/browser tests.
- Initial HTML contains styled Snapshot content; live DOM replaces it only after successful mount.
- Old exact-version Artifacts remain executable after an application Svelte upgrade.
- `.md` and `.svelte` import/export follow Renderer Mode while public Paths remain extensionless.
- `/api/playground/compile` remains until the client gate passes and is removed/migrated only at Phase 3 end.
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
