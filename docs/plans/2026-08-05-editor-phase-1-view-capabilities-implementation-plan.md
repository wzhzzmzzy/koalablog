# Editor Phase 1 View Capabilities Implementation Plan

Status: accepted

## Resolved decisions

- Renderer Replacement and Artifact replacement require no schema changes: a Renderer change creates a new File identity without inheriting an Artifact, and single-row replacement does not preserve resources for an already-returned Page.
- Browser History is the sole File-navigation history. `pushState`, `replaceState`, and `popstate` replace the current internal Path stack.

## Goal

Implement the accepted PRD at `.scratch/editor-view-capabilities/PRD.md` in independently verifiable slices. Preserve the File/Edit Buffer model, use the current browser-local Instant Search, and keep deferred linked-note navigation out of this phase.

The plan begins from branch `codex/editor-instant-search`, commit `f2248ab`. Before implementation, recheck the worktree because `CONTEXT.md` and ADR-0015 are intentional planning changes.

## Authoritative decisions

- `CONTEXT.md`: Deployed Render Artifact and Deployment Drift.
- `docs/adr/0015-require-explicit-svelte-artifact-deployment.md` and ADR-0016: accepted explicit Deploy, Renderer Replacement, and single-row replacement contract.
- `.scratch/editor-view-capabilities/PRD.md`: UI, interaction, scope, and acceptance contract.
- ADR-0002 remains authoritative for derived Artifact storage except where ADR-0015 supersedes its Source-currentness rule.
- ADR-0007 remains authoritative for dependency confirmation when rebuilding the same saved Source Hash.

## Architecture

### Shared types

```ts
type SvelteDeploymentStatus =
  | 'not_applicable'
  | 'not_deployed'
  | 'deployed'
  | 'deployment_drift'

interface DeploymentSummary {
  status: SvelteDeploymentStatus
  deployedSourceHash: string | null
  artifactHash: string | null
}

type MarkdownViewMode = 'source' | 'split' | 'preview'
```

Do not persist transient `deploying`, `failed`, or `dependency_review` states. They are Editor operation state layered over the server-owned Deployment Summary.

### Module seams

| Module | Interface | Responsibility |
| --- | --- | --- |
| Svelte deployment status | `deploymentSummary(file, artifact)` | Pure four-state calculation shared by Editor and batch responses. |
| Deployed Artifact persistence | read, conditional replace | Keep one row; Renderer Replacement gives the new File no Artifact, and Deploy replacement affects subsequent Page requests. |
| Workspace Navigation | `open(file)`, `back()` | Browser History ownership, current File, canonical URL, mobile Sidebar response, MRU recording, focus handoff. |
| Recent Files | `record(id)`, `resolve(files)` | Versioned browser-local MRU IDs and filtering. |
| Markdown View State | requested mode, effective mode, ratio setters | Versioned persistence, responsive fallback, splitter clamping. |
| File Finder | open/close UI events plus `onOpen(file)` | Dialog focus, grouping, query, active option, keyboard interaction. |

Keep internal calculation functions pure so unit tests cross the same small interfaces as callers.

### Browser storage

Use independent, versioned records:

```text
koala-editor-markdown-view-v1
  { schemaVersion: 1, mode: 'source' | 'split' | 'preview', splitRatio: number }

koala-editor-recent-files-v1
  { schemaVersion: 1, fileIds: number[] } // newest first, maximum 20
```

Invalid values fall back to Source and 0.55 without blocking Editor startup. Runtime Split fallback never rewrites the requested mode.

## Slice 1 — Change the Svelte deployment contract

This slice comes first because Toolbar labels and status bars must consume truthful server state.

### 1.1 Add the shared deployment-status Module

Add `src/lib/svelte/deployment-status.ts`.

- Markdown returns `not_applicable`; a Markdown replacement has no inherited Artifact.
- Svelte without an Artifact returns `not_deployed`.
- Svelte with equal File/Artifact Source Hash returns `deployed`.
- Svelte with unequal hashes returns `deployment_drift`.
- Return a bounded summary only; do not expose Artifact JavaScript, CSS, Snapshot, or dependency bytes.

Add focused unit tests for all four states, exact reversion, Markdown with a leftover row, and recycled Files at the DB access layer.

### 1.2 Implement the Deployed Render Artifact storage contract

Modify `src/db/render-artifact.ts`.

- Rename currentness-oriented functions to deployed terminology where practical.
- Read an Artifact as deployed only while the File is Svelte, without requiring equality to the latest File Source Hash during ordinary Svelte Deployment Drift.
- Add a bounded Deployment Summary read for an authorized owner.
- Keep the existing one-row storage shape; add idempotent deletion used to gate Markdown-to-Svelte transitions.
- Keep the attach guard that requires the incoming build Source Hash to equal the current saved Svelte Source Hash.
- A failed or superseded replacement leaves the old row untouched.
- Do not add or alter database tables, columns, enum storage, generations, or retirement flags.

### 1.3 Serve the deployed row during Deployment Drift

Modify:

- `src/lib/svelte/artifact-access.ts`
- `src/components/article-view/FilePage.astro`
- `src/pages/api/render-artifacts/[fileId]/[sourceHash]/module.js.ts`
- `src/pages/api/render-artifacts/[fileId]/[sourceHash]/styles.css.ts`

Rules:

- File existence, ownership, Visibility, recycle state, and current Renderer Mode are still checked on every Page/resource request.
- The requested resource Source Hash must equal the Deployed Render Artifact Source Hash.
- It no longer has to equal the latest File Source Hash.
- `FilePage.astro` constructs module and stylesheet URLs from `artifact.sourceHash`.
- After single-row replacement, new Page requests use the new Artifact. Resources requested by an already-returned old Page may return 404; do not retain another Artifact version or add delayed cleanup.
- Svelte without a Deployed Render Artifact keeps the existing uncached Page 503 / resource 404 contract.
- A Markdown replacement never serves its Svelte predecessor's Artifact.
- Cache-Control remains public `no-cache` for public Page HTML, strong representation ETags for resources, and private `no-store` for private content.

### 1.4 Preserve dependency confirmation semantics

Modify `src/actions/db/render-artifact.ts`.

- Read the Deployed Render Artifact for conditional replacement.
- Require dependency confirmation only when rebuilding the same Source Hash and its dependency manifest changed.
- A new saved Source Hash is an explicit Source change; attaching it can replace the old deployment without treating all changed imports as invisible dependency drift.
- Confirmation still binds both current and proposed Artifact Hashes and must fail if either changes.

### 1.5 Replace Files on Renderer Mode transitions

Modify `src/db/markdown.ts`, Artifact persistence, and every Action/API adapter that can save a Renderer change.

- Ordinary Svelte Source changes must retain the valid deployed Artifact and produce Deployment Drift.
- A Renderer change atomically moves the active predecessor to the recycle bin and creates a new active File at the requested Path with a new ID and revision `1`, preserving requested Source, Owner, and Visibility.
- The replacement never inherits or copies a Render Artifact. A Markdown replacement uses normal Markdown rendering; a Svelte replacement is `not_deployed` until a later explicit Deploy.
- The recycled predecessor retains its Source and any Artifact for recovery, while recycle-bin access checks prevent that Artifact from serving publicly.
- Put Renderer Replacement behind the shared DB save interface so Editor Actions, batch saves, and synchronization cannot bypass it.
- Do not add Artifact deletion gates, persistent retirement identity, columns, or migrations.

### 1.6 Expose one status contract

Modify `src/pages/api/markdown/batch.ts` to use the shared four states instead of `current/rebuild_required`.

Add an owner-authorized render Artifact status Action under `actions.db.renderArtifact` for the currently selected Editor File. It returns only `DeploymentSummary`.

The Editor loads the summary on File selection and updates it locally after Save, successful Deploy, and Renderer change. Ignore stale Action responses when the selected File or Source Hash has changed.

### 1.7 Remove automatic deployment

Modify `src/components/editor/index.svelte`.

- Delete the session-pending automatic deployment record and resume-on-load path.
- Save never calls `deploySavedSvelteFile`.
- Keep Preview compilation independent from saved deployment.
- Deploy always builds the current saved File object, never `sourceValue` from a dirty Edit Buffer.
- Layer transient operation state over Deployment Summary to derive the accepted labels.
- On Deploy success, replace the local summary with `deployed` using the attached Artifact Source Hash.
- On failure or dependency review, preserve the prior summary.

### Slice 1 tests

Update or add:

- `src/tests/svelte/deployment-status.spec.ts`
- `src/tests/db/render-artifact.spec.ts`
- `src/tests/shared/render-artifact-contract.ts`
- `src/tests/svelte/artifact-access.spec.ts`
- `src/tests/actions/render-artifact.spec.ts`
- `src/tests/actions/file-save.spec.ts`
- `src/tests/api/render-artifact-resources.spec.ts`
- `src/tests/api/markdown-batch.spec.ts`
- `src/tests/components/file-page.spec.ts`
- `tests/e2e/svelte-public.spec.ts`
- `tests/e2e/svelte-rebuild.spec.ts`

Critical regression scenarios:

1. Deploy A, save Svelte B, public Page/resources still serve A, status is `deployment_drift`.
2. Revert Source to A, status becomes `deployed` without attach.
3. Deploy B makes new Page requests use B; an already-returned A Page may receive 404 when it later requests A resources.
4. Failed B build/attach keeps A online.
5. Save Svelte as Markdown: the predecessor moves to the recycle bin with its Artifact, and the new Markdown File is rendered as Markdown.
6. Save Markdown as Svelte: the predecessor moves to the recycle bin and the new Svelte File has a new ID with `not_deployed` status.
7. The Svelte replacement requires a subsequent explicit Deploy; no predecessor Artifact is reactivated.
8. Dirty Edit Buffer cannot invoke Deploy.
9. Save Svelte Source never invokes the attach Action.

## Slice 2 — Centralize Workspace Navigation

Add `src/components/editor/workspace-navigation.svelte.ts` and focused tests.

Move coordinated navigation out of `Page.svelte`, `index.svelte`, and direct store call sites:

- opening an active File;
- initializing the direct-URL File as workspace history index 0 with `replaceState`;
- pushing a different File with `pushState` and replaying Back/Forward through `popstate`;
- synchronizing canonical `?path=` / recycled `?id=` URL state;
- closing the mobile Sidebar after selection;
- recording Recent File IDs;
- selecting a fallback after purge/empty trash;
- returning a focus intent for Source/Split/Preview.

External interface remains exactly:

```ts
interface WorkspaceNavigation {
  open: (file: FileRecord) => void
  back: () => void
}
```

Keep server reconciliation (`setItems`, `replaceItemsByPrefix`, `upsertItem`) in the existing store. The Navigation Module coordinates selection behaviour; it does not become a second File data store.

Remove `history`, `pushHistory`, `popHistory`, and `updateLastHistory` from `store.svelte.ts`, and remove the reactive `pushState` effect from `Page.svelte`.

Use a versioned History state owned by the Module, for example:

```ts
interface WorkspaceHistoryStateV1 {
  koalaWorkspaceHistory: 1
  fileId: number | null
  index: number
}
```

- `open(file)` ignores the current File ID, otherwise pushes the canonical URL and the next index.
- `back()` calls `history.back()` for index greater than 0 and navigates to the applicable Dashboard collection at index 0.
- `popstate` resolves by File ID rather than stale Path and then runs one shared selection implementation without pushing another entry.
- Rename / Move and Restore call `replaceState` for the same File ID and canonical `?path=`.
- Recycle calls `replaceState` with canonical `?id=` and retains the read-only recycled File selection.
- A historical entry whose File has been purged keeps the current active File when valid, otherwise selects the first authorized active File, otherwise the empty workspace; replace that entry instead of calling Back/Forward recursively.
- Encapsulate `window.history`, URL construction, and `popstate` subscription behind an implementation-internal History adapter so focused tests use a fake without expanding the Module's external interface.
- Register and remove the `popstate` listener with the Editor lifecycle inside the Module implementation.

Add `src/components/editor/recent-files.svelte.ts`:

- accept injected storage in tests;
- store IDs only, newest first, max 20;
- drop duplicates, recycled/missing Files, and IDs not present in the current authorized item set;
- tolerate invalid or unavailable localStorage.

Tests assert direct-URL initialization, `pushState`, Toolbar Back, browser Back/Forward, no duplicate current entry, canonical URL updates after Rename/Move/Recycle/Restore, purged-entry fallback, current File, mobile Sidebar response, MRU ordering, and listener cleanup.

## Slice 3 — Rebuild Toolbar and responsive chrome

Modify:

- `src/components/editor/EditorToolbar.svelte`
- `src/components/editor/EditorContent.svelte`
- `src/components/editor/index.svelte`
- `src/components/editor/FileLifecycle.svelte`
- `src/components/editor/svelte/RendererToggle.svelte`
- `src/styles/editor-workspace.css`

Add focused UI modules only where they hide real behaviour, for example:

- `EditorMoreMenu.svelte` for menu focus/close/action reachability;
- `RenameMoveDialog.svelte` for Path validation and explicit entry/exit;
- `EditorMobileActions.svelte` if sharing action view models avoids duplicating handler logic.

Do not create pass-through wrappers around individual buttons.

### Desktop layout

- Navigation: Sidebar and Back.
- Identity: renderer mark plus read-only absolute Path with ellipsis and full accessible label/title.
- View: Markdown segmented control or Svelte Preview action.
- Primary actions: Save, dynamic Svelte Deploy, More.
- Move Dashboard, Renderer, Visibility, Upload, copy, Rename/Move, and lifecycle actions to More.

### More behaviour

- Use a real menu/dialog focus model: Escape closes, focus returns to More, arrow keys navigate menu items.
- Renderer and Visibility keep current handlers and conflict semantics.
- `Copy public link` writes `${origin}${file.path}`.
- `Copy File Reference` writes `[[${pathValue}]]` and announces success without changing button layout.
- Rename / Move initializes from the current Edit Buffer Path, validates with the existing absolute-path parser, writes `pathValue`, marks dirty, then closes; it does not call the server directly.
- Destructive lifecycle items remain visually separated and keep native confirmation dialogs.

### Save and status presentation

- Derive the Save button state from dirty/saving/conflict/short-lived saved acknowledgement.
- Do not use success green for unsaved changes.
- Use amber/brand emphasis for `Save changes`; clean disabled Save is neutral.
- Status bar exposes Source state and, for Svelte, Artifact state separately.
- Keep `Cmd/Ctrl+S` unchanged except clean Save becomes a no-op.

### Mobile layout

- Convert the form/workspace into rows: top chrome, content, status, bottom actions.
- Use `env(safe-area-inset-bottom)` and the existing `100dvh` container.
- Do not globally fix the bottom row over CodeMirror.
- Preserve touch scrolling inside `.cm-scroller` and ensure soft-keyboard resizing does not cover focused content.
- Verify every More item and bottom action at 320×640 and 393×727.

### Slice 3 tests

- Update `tests/e2e/editor-mobile.spec.ts` away from assertions for the removed permanent controls.
- Update `tests/e2e/editor.spec.ts` for read-only Path, Rename/Move, disabled clean Save, dirty Save, copied File Reference, menu keyboard operation, and all actions reachable.
- Extend Svelte Editor E2E for dynamic Deploy labels and separate Source/Artifact status.
- Add component/pure-state tests for Save and Deploy view models if conditional markup begins to duplicate rules.

## Slice 4 — Add Markdown Source / Split / Preview

Add `src/components/editor/markdown-view-state.svelte.ts`.

- Parse and persist the versioned requested mode and split ratio.
- First default is Source and ratio 0.55.
- Clamp ratio so both panes remain at least 320px while Split is effective.
- Compute effective mode from requested mode, renderer, content-container width, and mobile/narrow state.
- `split` falls back to `source` under 720px and returns automatically when width recovers.
- Never write the fallback to storage.

Modify `EditorContent.svelte` and `index.svelte`:

- Keep one mounted `TextEditor`/CodeMirror instance.
- Source: show editor only.
- Split: show editor plus Markdown Preview.
- Preview: visually hide the editor but retain its state; show the in-workspace reading view.
- Remove the Markdown full-workspace overlay branch.
- Keep the existing Svelte full-screen Preview and its build/snapshot runtime path separate.
- Debounce Markdown rendering to approximately 150ms and cancel stale timers on File/mode changes.
- Derive preview HTML from the effective Edit Buffer and current active paths exactly once.
- Do not duplicate upload handlers, history, diagnostics, or file-reference completion.

Add an accessible Split separator:

- `role="separator"`, vertical orientation, `tabindex="0"`;
- pointer capture for mouse/touch drag;
- Arrow Left/Right adjusts by 2 percentage points;
- Shift+Arrow adjusts by 10 percentage points;
- Home/End move to the clamped extremes;
- announce `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.

Focus behaviour:

- switching to Source restores CodeMirror focus/selection;
- switching to Preview focuses its heading/container;
- switching to Split preserves the currently focused pane when possible;
- responsive fallback from Split does not steal focus unless the Preview pane disappears while focused, in which case focus moves to CodeMirror.

### Slice 4 tests

Add unit tests for storage parsing, ratio clamping, 720px fallback, preference preservation, and mobile mapping.

Extend Editor E2E for:

- Source default and workspace-level persistence across File switches/reload;
- live dirty Edit Buffer Preview;
- one CodeMirror instance through mode changes;
- Split drag and keyboard resize;
- Sidebar-open container shrink causing fallback, then restore;
- mobile Source/Preview only;
- public-link behaviour for Markdown File References;
- focus restoration and reduced-motion behaviour.

## Slice 5 — Replace Sidebar Search with the unified File Finder

Retain `src/components/editor/instant-search.ts` as the framework-free query engine. Do not move search into the File Finder component.

Add:

- `src/components/editor/FileFinder.svelte`
- optionally `src/components/editor/file-finder-model.ts` for pure empty-group and active-option calculations

Modify:

- `src/components/editor/Page.svelte`
- `src/components/editor/Sidebar.svelte`
- `src/styles/editor-workspace.css`
- existing Instant Search tests and E2E

### Remove duplicate Sidebar search

- Delete Sidebar query, debounce, search markup, clear behaviour, and result mode.
- Sidebar always renders the File tree and recycle bin.
- Remove the exposed `focusSearch()` handle and the old `Cmd/Ctrl+K` Sidebar path.
- Retain File tree refresh and current-File expansion behaviour.

### File Finder behaviour

- Page owns open/close placement and invokes the Workspace Navigation interface on selection.
- `Cmd/Ctrl+K` prevents the browser default only on the Editor page and opens/focuses the one dialog.
- Opening captures `document.activeElement` as the focus return target.
- Empty query builds Local changes (max 8) and Recent (max 12) groups, de-duplicated by File ID.
- Omit empty groups; show the agreed empty state when both are absent.
- Non-empty query passes current Files and Edit Buffers to `searchFiles` after the existing 80ms debounce.
- Preserve the existing 100-result cap and ranking.
- Active option starts at the first visible result; query/group changes reset it to the first valid option.
- Arrow Up/Down moves within visible options and scrolls the active option into view.
- Enter calls `navigation.open(file)`, closes, then performs the view-specific focus handoff.
- Escape always closes immediately and returns focus; it does not require a first Escape to clear.
- Scrim click and explicit close use the same close path.

### Accessibility

- Dialog has a stable title and description.
- Input uses combobox semantics with `aria-controls`, `aria-expanded`, and `aria-activedescendant`.
- Results container is a listbox; every result has a stable option ID and accessible name unaffected by highlighted `<mark>` nodes.
- Local changes, dirty/conflict status, Path, and match kind are announced without reading full Source snippets unnecessarily.
- Focus is trapped while open and restored on every close path.

### Slice 5 tests

Refactor `tests/e2e/editor-instant-search.spec.ts` into File Finder behaviour:

- one shortcut/one dialog and no Sidebar searchbox;
- conditional Local changes group;
- Recent persistence, filtering, de-duplication, and caps;
- literal Path/Tag/Source ranking and Effective Source behaviour;
- Arrow navigation and Enter open through Workspace Navigation;
- Escape/scrim focus restoration from CodeMirror, Toolbar, and Sidebar;
- stable accessible names with highlighted matches;
- mobile selection closes the Finder without changing Sidebar preference;
- no File creation or alternate command mode.

Keep and update `src/tests/editor/instant-search.spec.ts`; add model tests rather than testing ranking through Svelte markup.

## Slice 6 — Integration and visual acceptance

Run this slice only after the previous behavioural tests pass.

### Browser matrix

Use Node 22 (`fnm exec --using v22.18.0`) for the local fixture and Playwright.

Capture and inspect at minimum:

- Desktop Markdown Source, Split, Preview
- Desktop Svelte clean deployed, Deployment Drift, and failed Deploy
- File Finder empty, Local changes + Recent, query results, no results
- Mobile 393×727 and 320×640 Source, Preview, More, and Svelte actions
- Sidebar open/closed while Split crosses its effective-width threshold
- Light/dark theme if the fixture supports both

Store screenshots outside the repository or in the active visualization directory.

### Accessibility acceptance

- Keyboard-only completion of File Finder, More, Rename/Move, View switch, and Split resize.
- No focus is lost into hidden Source/Preview content.
- Dialogs use native dialog behaviour or an equivalent complete focus trap, Escape, scrim, and focus-return contract.
- Reduced motion disables Finder/list entry animation and compresses operational transitions.
- No duplicate search cancel controls.

### Verification commands

Run focused tests first, then broad checks:

```bash
fnm exec --using v22.18.0 pnpm test -- \
  src/tests/svelte/deployment-status.spec.ts \
  src/tests/db/render-artifact.spec.ts \
  src/tests/svelte/artifact-access.spec.ts \
  src/tests/actions/render-artifact.spec.ts \
  src/tests/actions/file-save.spec.ts \
  src/tests/api/render-artifact-resources.spec.ts \
  src/tests/api/markdown-batch.spec.ts \
  src/tests/components/file-page.spec.ts \
  src/tests/editor/instant-search.spec.ts

fnm exec --using v22.18.0 pnpm exec playwright test \
  tests/e2e/editor-instant-search.spec.ts \
  tests/e2e/editor-mobile.spec.ts \
  tests/e2e/editor.spec.ts \
  tests/e2e/svelte-public.spec.ts \
  tests/e2e/svelte-rebuild.spec.ts

fnm exec --using v22.18.0 pnpm test
fnm exec --using v22.18.0 pnpm lint
fnm exec --using v22.18.0 pnpm build:cf
git diff --check
```

If Playwright fixture state is contaminated, rebuild it with the repository script rather than weakening assertions. Do not attribute Node 18 `crypto is not defined` failures to the change.

## Completion checklist

- [ ] ADR-0015 and `CONTEXT.md` terminology are reflected in code and user-facing copy.
- [ ] No automatic Svelte Deploy path remains.
- [ ] Old deployed Svelte output remains available through ordinary Source edits.
- [ ] Renderer retirement matches the resolved persistence and failure contract.
- [ ] Batch and Editor share the four deployment statuses.
- [ ] Workspace Navigation is the only File-open/back seam.
- [ ] Desktop and mobile actions match the accepted hierarchy.
- [ ] Markdown has one Source editor and bounded Source/Split/Preview views.
- [ ] File Finder is the only search UI and is fully keyboard/focus accessible.
- [ ] Deferred linked-note features did not enter the diff.
- [ ] Focused, full, E2E, lint, Cloudflare build, and diff checks pass or any pre-existing/environment limitation is precisely reported.
