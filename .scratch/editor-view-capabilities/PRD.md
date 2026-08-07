# Editor Phase 1 View Capabilities

Status: ready-for-agent

## Resolved decisions

- Renderer Replacement and Artifact replacement require no database schema changes: changing Renderer moves the predecessor to the recycle bin and creates a new File ID without an Artifact; single-row Artifact replacement is guaranteed only for new Page requests.
- The browser History API is the single source of truth for File navigation. The Editor does not maintain a second internal File history stack.

## Intent

Turn the current Editor into a calmer, keyboard-first File workspace without introducing Tabs, arbitrary panes, backlinks, or a server search system. This phase delivers four coordinated capabilities:

1. explicit Svelte Source Save and Render Artifact Deploy;
2. compact desktop/mobile workspace chrome;
3. Markdown Source / Split / Preview views;
4. one unified, browser-local File Finder.

The phase begins from `codex/editor-instant-search` at `f2248ab`. It supersedes the persistent Sidebar search UI in `.scratch/editor-instant-search/PRD.md` while retaining that PRD's literal Effective Source search semantics and performance budget.

## Domain contract

The root `CONTEXT.md` and ADR-0015 are authoritative.

- A File remains server-persisted Source, not a draft or publication.
- Markdown Save immediately changes the saved and publicly rendered Source.
- A Svelte File has independently saved Source and an explicitly Deployed Render Artifact.
- Saving Svelte Source never starts Deploy.
- A Deployed Render Artifact remains public while newer saved Svelte Source has Deployment Drift.
- Deploy accepts only the current saved Svelte Source; it never saves a dirty Edit Buffer implicitly.
- An exact Source reversion to the deployed Source Hash clears Deployment Drift without another Deploy.
- Changing Renderer is Renderer Replacement: the active predecessor is moved to the recycle bin and a new active File at the requested Path receives a new identity, revision `1`, requested Source, Owner, and Visibility.
- The replacement inherits no Render Artifact. Any Artifact remains with the recycled predecessor and stays unavailable through ordinary recycle-bin access checks.
- Renderer Replacement adds no column, table, generation, retirement marker, or Artifact copy.
- Deploy replaces the single stored Artifact row. New Page requests use the replacement; a Page returned before replacement is not guaranteed to finish loading the old module or stylesheet resources.
- This deployment model is Svelte-only and does not add a general Markdown/File publication lifecycle.

## Shared Svelte deployment status

Editor, batch responses, and future synchronization surfaces use one server-owned status calculation:

| Status | Meaning |
| --- | --- |
| `not_applicable` | The File uses Markdown. |
| `not_deployed` | The File uses Svelte and has no Deployed Render Artifact. |
| `deployed` | Saved Source Hash equals the Deployed Render Artifact Source Hash. |
| `deployment_drift` | A prior Artifact is still deployed while newer Svelte Source is saved. |

Build progress, failure, and dependency review are transient Editor operation states, not persisted deployment statuses.

## Save and Deploy behaviour

### Save

- Clean: `Save`, disabled and low emphasis.
- Dirty: `Save changes`, enabled and primary.
- In flight: `Saving…`, disabled.
- Success: `Saved` for about 1.2 seconds, then clean.
- Conflict: Save remains disabled and the existing conflict resolution remains reachable.
- `Cmd/Ctrl+S` preserves the existing optimistic revision and conflict behaviour.
- Saving Svelte Source does not create session-pending auto-deployment state and does not invoke Deploy.

### Deploy

- Dirty Source: disabled with `Save Source before deploying` guidance.
- `not_deployed`: `Deploy`.
- `deployment_drift`: `Deploy changes`.
- `deployed`: `Rebuild`, low emphasis.
- In flight: `Deploying…`, disabled.
- Last attempt failed: `Retry deploy`.
- Dependency confirmation required: `Review dependency changes`.
- Build or attach failure preserves the prior Deployed Render Artifact.
- Deploy validates that the build belongs to the current saved Source Hash before replacement.
- Rebuilding the same Source Hash retains the existing dependency-drift confirmation contract.
- Successful replacement switches subsequent Page requests to the new Artifact. Already-returned Pages may receive 404 for old resource URLs after replacement; Phase 1 does not retain immutable Artifact versions or promise an uninterrupted loading window.

## Workspace chrome

### Desktop

The persistent hierarchy is:

`Sidebar` · `Back` | File identity | View control | `Save` · Svelte Deploy action · `More`

- File identity shows renderer mark and a compact read-only absolute Path.
- Path is not permanently editable.
- Markdown View control exposes Source / Split / Preview.
- Svelte keeps its current Preview path in this phase.
- Dashboard exit, Renderer Mode, Visibility, Upload Image, copy actions, Rename / Move, and recycle action live in More.

### More

More keeps all existing actions reachable and adds one frontend-only action:

- Back to Dashboard
- Renderer Mode
- Visibility
- Upload Image
- Copy public link
- Copy File Reference as the canonical `[[/absolute/path]]`
- Rename / Move
- Move to recycle bin, or restore/purge for a recycled File

Rename / Move edits the Path in the Edit Buffer. Save commits it with the Source and existing revision guard.

### Mobile

- Top row: Menu, Back, compact File identity, More.
- Bottom workspace row: Save, Source/Preview, and Svelte Deploy when applicable.
- The bottom row participates in the `100dvh` workspace layout rather than using a global fixed overlay.
- Safe-area and virtual-keyboard resizing must not hide CodeMirror or the primary actions.
- All actions remain reachable and text-labelled at 320px and 393px.

## Markdown views

```ts
type MarkdownViewMode = 'source' | 'split' | 'preview'
```

- Source is the existing CodeMirror editor.
- Preview is an in-workspace reading view; the separate full-screen Markdown Preview is removed.
- Split renders the one existing CodeMirror instance on the left and a Preview derived from the same Edit Buffer on the right.
- Preview refreshes from the Edit Buffer after an approximately 150ms debounce and never requires Save or a server request.
- First-use desktop default is Source.
- The last requested mode is stored once per browser workspace, not per File.
- Mobile supports Source and Preview only.
- Split automatically falls back to Source when the editor content container is narrower than 720px, without overwriting the saved Split preference; it restores Split when space returns.
- Default Split ratio is 55% Source / 45% Preview.
- Both panes have a 320px minimum when Split is effective.
- The separator supports pointer, touch, and keyboard adjustment. Its ratio is stored with the workspace view preference.
- Markdown File Reference links retain the current public-page, new-browser-tab behaviour. Editor-native routing remains deferred.

## Unified File Finder

- `Cmd/Ctrl+K` opens one centered File Finder.
- Sidebar has no persistent search input, filter state, or second search shortcut.
- Empty query conditionally shows `Local changes`; if there are none, the group is not rendered.
- `Recent` follows and excludes Files already shown under Local changes.
- Local changes include dirty and conflicted Edit Buffers.
- Recent is a browser-local MRU list of at most 20 File IDs. Display at most 12 Recent results after filtering unavailable, recycled, or duplicate Files.
- Display at most 8 Local changes before Recent.
- If both groups are empty, show `Start typing to find a File`.
- Non-empty query reuses the existing browser-local, literal Effective Source search over Path/derived Title, Tag, and Source.
- Leading Markdown frontmatter remains excluded from Source matches; Svelte Source remains fully searchable; recycled Files remain excluded.
- Existing Path, Tag, Source ranking, 80ms input debounce, 100 rendered-result cap, and 2,000 Files / 20MB budget remain.
- Arrow Up/Down changes the active option; Enter opens it; Escape closes immediately.
- File creation from a query, Command Palette syntax, new tabs, and split-right are absent.

### Focus contract

- Opening records the previously focused element and focuses the File Finder input.
- Escape, scrim click, or explicit close returns focus to the recorded element when it still exists.
- Enter uses Workspace Navigation to open the File, closes the dialog, and focuses the effective target view.
- Source or Split restores that File's CodeMirror state and focus.
- Preview focuses its reading heading/container.
- The dialog uses combobox/listbox/option semantics with stable accessible names and an active descendant.

## Workspace Navigation Module

Introduce one in-process Module with this external interface:

```ts
interface WorkspaceNavigation {
  open: (file: FileRecord) => void
  back: () => void
}
```

It owns the coordinated current-File selection path: history, URL, mobile Sidebar response, MRU recording, and focus handoff. Sidebar, File Finder, and Back call the same interface. Do not expose `new-tab` or `split-right` until those behaviours exist.

### Browser History contract

- The initial directly requested `?path=` or recycled `?id=` File becomes workspace history index 0 through `replaceState`.
- `open(file)` uses `pushState` for a different File and stores the File ID plus the next workspace history index. Path remains a readable URL, not historical identity.
- Reopening the current File does not add a duplicate history entry.
- `back()` calls `history.back()` when the current workspace index is greater than 0. At index 0 it navigates to the applicable Dashboard collection.
- Browser Back/Forward `popstate` is the only path that replays a historical File selection. It resolves the stored File ID against the current authorized File set and performs the same mobile Sidebar, MRU, and focus coordination as other navigation.
- Rename / Move and Restore keep File identity and use `replaceState` to canonicalize the current entry to the new `?path=` URL. Visiting another historical entry for the same ID also canonicalizes its stale Path with `replaceState`.
- Recycling the current File replaces its current entry with `?id=<fileId>` and opens its read-only recycled view. A historical entry for a recycled File behaves the same way when revisited.
- Purging a File makes its historical entries unresolvable. On such a `popstate`, keep the current active File when valid, otherwise choose the first authorized active File, otherwise show the empty workspace; replace the unresolvable entry with that canonical state instead of pushing or recursively navigating history.
- The Module owns listener setup and teardown internally. Its external interface remains only `open(file)` and `back()`.

## Explicitly deferred

- Editor-native File Reference routing and hover Peek
- Backlinks, Outgoing Links, Linked Mentions, and Local Graph
- Tabs, arbitrary pane trees, split-right, or linked views
- Command Palette and query-driven File creation
- Server search, FTS, embeddings, or a database search index
- Unlinked mentions, fuzzy Title references, automatic reference rewrites, and Block References
- Reworking the Svelte Preview runtime or its full-screen presentation

## Acceptance

- Save never auto-deploys Svelte Source.
- A public Svelte page continues serving its previous Artifact during Deployment Drift.
- Artifact module/style URLs use the Deployed Render Artifact Source Hash, not the latest File Source Hash.
- A Markdown replacement never inherits or serves its Svelte predecessor's Artifact.
- A Svelte replacement starts `not_deployed` and requires an explicit Deploy, while the recycled Markdown predecessor remains recoverable.
- Deploy replacement affects new Page requests; an already-returned old Page is not guaranteed to finish loading its old resources.
- Exact Source reversion reports `deployed` without a new Deploy.
- `Cmd/Ctrl+S`, optimistic conflict handling, Edit Buffer recovery, and per-File CodeMirror state continue to work.
- Source and Preview show the same current Edit Buffer without duplicate editor state or image-upload handlers.
- Split fallback is based on the content container, not only viewport width.
- The unified File Finder is fully keyboard-operable and restores focus predictably.
- File opens, Toolbar Back, and browser Back/Forward share the browser History source of truth; Rename/Move, Recycle, Restore, Purge, and direct URLs follow the defined canonicalization and fallback rules.
- Sidebar remains a File tree and has no search UI.
- All File actions remain reachable at 320px and 393px.
- Svelte Source and Artifact states are visibly distinct.
- Reduced motion remains respected; operational transitions stay around 140–180ms.
- Phase 1 makes no database table or column changes.
