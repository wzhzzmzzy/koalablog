# CodeMirror 6 Editor Integration

Date: 2026-07-16

## Outcome

Replace the textarea behind one deep Text Editor Interface. Phase 2 delivers Markdown-only capability parity; Phase 3 extends the same Interface with Svelte language and diagnostics after Renderer Mode exists. File orchestration, persistence, Source analysis, preview, and rendering remain outside CodeMirror.

## Phase boundaries

Phase 2 includes:

- Markdown editing and navigation;
- per-File selection, scroll, fold, and undo restoration;
- Save shortcuts and read-only behavior;
- Markdown paste/drop/toolbar attachment insertion;
- same-ID server refresh and Edit Buffer reconciliation;
- browser parity for desktop, mobile, and Chinese IME.

Phase 2 excludes:

- Renderer Mode and its toolbar toggle;
- Svelte language packages or `<img>` insertion;
- compiler diagnostics, Rollup, Build Worker, or Svelte Preview;
- a transitional “Svelte but not renderable” state.

Phase 3 adds those Svelte-specific extensions without changing the Phase-2 File and editor ownership seams.

## Goals

- Preserve every current textarea workflow before deleting the adapter.
- Keep CodeMirror implementation details local to one module.
- Preserve editor state when switching Files in one browser session.
- Reconcile server refreshes without dropping a dirty Edit Buffer.
- Keep Source Save independent from preview and, later, Svelte compilation.
- Load CodeMirror only in the dashboard editor; public pages never load it.

## Non-goals

- Path, Title, lifecycle, visibility, references, preview, or persistence logic inside CodeMirror.
- Source tag/reference parsing inside the editor module.
- Serializing `EditorState` to localStorage.
- Full Language Server support, collaborative editing, Prettier, Vim mode, or a minimap.
- Cross-file navigation, relative Svelte imports, or npm completion.

## Deep Interface

`TextEditor.svelte` owns the external seam. Callers and tests never receive an `EditorView`, `EditorState`, transaction, selection offset, placeholder token, or Compartment.

Phase-2 contract:

```ts
interface TextEditorProps {
  fileId: number
  value: string
  baseRevision: number
  readonly: boolean
  onChange: (value: string) => void
  onSave: () => void
  uploadAttachment: (file: File) => Promise<{ url: string }>
}

interface TextEditorCommands {
  focus: () => void
  insertAttachments: (files: File[]) => Promise<void>
  forgetFile: (fileId: number) => void
}
```

`forgetFile(fileId)` is a domain lifecycle command used after purge. It removes private cached editor state without exposing CodeMirror's registry to File orchestration.

Phase 3 may add renderer and serializable diagnostic props, but it must not widen the Interface with CodeMirror types.

## Ownership and internal modules

```text
src/lib/files/
  analysis.ts

src/components/editor/
  FileEditor.svelte
  TextEditor.svelte
  edit-buffer.svelte.ts
  text-editor/
    textarea-adapter.ts
    codemirror-adapter.ts
    state-registry.ts
    markdown-language.ts
    attachments.ts
    theme.ts
```

- `src/lib/files/analysis.ts` is the single Source analyzer for tags and absolute File References.
- `FileEditor` owns File fields, Save/conflict orchestration, lifecycle actions, and Markdown Preview.
- `TextEditor` exposes the stable Interface.
- adapters own text mechanics only.
- `state-registry.ts` and its `Map<FileId, EditorState>` are private to the Text Editor module.
- `edit-buffer` persists recoverable unsaved File values, not CodeMirror state.

Phase 3 adds private Svelte language/diagnostic modules and the separate preview/build modules; it does not move those concerns into the Phase-2 registry.

## Existing capability migration

| Existing behavior | Text Editor responsibility |
| --- | --- |
| Content binding | Emit `onChange` once for a local document change. |
| External File selection/refresh | Restore or reconcile by File ID without feedback loops. |
| Save shortcut | `Mod-s` handles Ctrl+S and macOS Cmd+S exactly once. |
| Clipboard image upload | Insert a unique Markdown placeholder, then upload asynchronously. |
| Drag image upload | Use true `posAtCoords()` rather than stale selection. |
| Toolbar upload | Route through `insertAttachments(files)`. |
| Upload completion/failure | Replace or remove only the matching placeholder. |
| Read-only recycle-bin File | Combine read-only state and non-editable view. |
| Local recovery | Use Edit Buffer storage owned outside CodeMirror. |
| Dirty/conflict indication | Compare Edit Buffer values and `baseRevision` outside CodeMirror. |
| Preview | Remain owned by `FileEditor`. |
| Tags and references | Analyze Source through `src/lib/files/analysis.ts`. |

External replacements must be annotated so their transactions do not echo through `onChange`.

## Markdown extension set

Use curated packages rather than the aggregate setup:

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`
- `@codemirror/language`
- `@codemirror/search`
- `@codemirror/autocomplete` only for the required bracket-closing behavior
- `@codemirror/lang-markdown`

Phase 2 does not add `@replit/codemirror-lang-svelte`, compiler diagnostics, or the Svelte Build Worker.

The configured Markdown capability set includes line numbers, active line, undo/redo, search/replace, selection matching, multiple selection, bracket matching/closing, indentation, `Tab`/`Shift-Tab`, folding, Markdown wrapping, accessible labels/focus, Koalablog theme variables, and a narrow-screen gutter policy.

## Per-File state and refresh reconciliation

Maintain an in-memory private `Map<FileId, EditorState>` during the dashboard session:

- rename/move preserves state because File ID is stable;
- purge calls `forgetFile(fileId)`;
- recycle-bin selection may retain a read-only state;
- a newly selected File seeds state from its Edit Buffer or current server Source;
- no CodeMirror state enters localStorage.

When the Store receives a same-ID server File, the adapter follows the File-domain decision supplied by `FileEditor`:

| Edit Buffer state | Server revision | Cached editor action |
| --- | --- | --- |
| Clean | Newer or different | Replace with a fresh server-seeded `EditorState`; clear stale undo. |
| Dirty | Equals `baseRevision` | Keep cached state and local Source. |
| Dirty | Newer than `baseRevision` | Keep cached state, mark conflict outside the adapter, and reject automatic replacement. |
| Purged | Missing | Forget cached state. |

The adapter never silently merges text or chooses which revision wins. A `409 source_conflict` stays visible until File orchestration resolves it.

## Attachments

The adapter owns attachment transactions while upload I/O is injected:

1. Determine the current selection or true drop coordinate.
2. Insert one unique placeholder per attachment in one transaction.
3. Upload each image through the injected adapter.
4. Replace only the matching placeholder on success.
5. Remove only the matching placeholder on failure.
6. Preserve coherent undo/redo and never replace coincident user text.

Phase 2 emits Markdown only:

```text
![](/api/oss/...)
```

Phase 3 may select `<img>` output through Renderer Mode, behind the same command.

## Accessibility, mobile, and IME

- Give the editor a stable accessible label containing the current File Path.
- Keep touch scrolling native.
- Reduce gutters on narrow screens without hiding editing state.
- Preserve focus after File switch, Save, upload, and Preview toggle.
- Do not treat intermediate Chinese IME composition events as external replacement boundaries.
- Test hardware keyboard, touch selection, and composition in real browsers.

## Phase-2 test surface

Tests exercise the Interface and user behavior rather than CodeMirror internals:

1. Local edits emit Source once without an external-update loop.
2. File selection restores text, selection, scroll, folds, and undo by File ID.
3. Clean same-ID refresh replaces Source and base revision.
4. Dirty same-ID refresh retains Source; a newer revision exposes conflict.
5. Rename preserves state; purge calls `forgetFile` and removes it.
6. Read-only Files reject editing commands.
7. `Mod-s` triggers one Save.
8. Paste, drop, and toolbar uploads share one Markdown transaction flow.
9. Concurrent attachment uploads replace the correct placeholders.
10. Upload failure leaves no placeholder.
11. Undo remains coherent before and after upload completion.
12. Selection, refresh, keyboard navigation, mobile scrolling, focus, and Chinese IME work in a real browser.

## Phase-2 migration sequence

1. Ensure `src/lib/files/analysis.ts` has already removed Save's Preview-DOM dependency in Phase 1.
2. Introduce the Text Editor Interface and satisfy it with a textarea adapter.
3. Add Interface tests against the textarea baseline.
4. Add the private CodeMirror adapter and Markdown extensions.
5. Move Save keys and Markdown attachment editing behind the Interface.
6. Add the private state registry and same-ID refresh reconciliation.
7. Route production through CodeMirror while retaining the textarea adapter as rollback/parity reference.
8. Run browser parity for selection, undo, uploads, refresh, mobile, and Chinese IME.
9. Delete the textarea adapter and textarea-only helpers only after the gate passes.
10. Remove unused `monaco-editor` after bundle verification.

## Phase-3 extension sequence

After Renderer Mode and source-row migration exist:

1. Add renderer and serializable diagnostics to the Interface.
2. Add a lazy Svelte language extension and language Compartment.
3. Add Svelte attachment markup selection.
4. Connect compiler diagnostics without exposing lint internals.
5. Keep Build Worker and Svelte Preview behind separate Interfaces owned by `FileEditor`.

This sequence is not part of CodeMirror Phase-2 acceptance.
