# CodeMirror 6 Editor Integration

Date: 2026-07-16
Revised: 2026-07-21

## Outcome

Replace the textarea behind one deep Text Editor Interface. Phase 2 delivers Markdown-only capability parity; Phase 3 extends the same Interface with Svelte language and diagnostics after Renderer Mode exists. File orchestration, persistence, Source analysis, preview, and rendering remain outside CodeMirror.

## Phase boundaries

Phase 2 includes:

- Markdown editing and navigation;
- per-File selection, scroll, fold, and undo restoration;
- Save shortcuts and read-only behavior;
- Markdown paste/drop/toolbar image insertion;
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
- Replacing the Creation Template Manager or Playground textarea. Phase 2 applies only to File Source editing at `/dashboard/edit`.

## Deep Interface

`TextEditor.svelte` owns the external seam. Callers and tests never receive an `EditorView`, `EditorState`, transaction, selection offset, placeholder token, or Compartment.

Phase-2 contract:

```ts
interface TextEditorProps {
  fileId: number
  filePath: string
  value: string
  readonly: boolean
  onChange: (value: string) => void
  uploadImage: (file: File) => Promise<{ url: string }>
}

interface TextEditorHandle {
  focus: () => void
  insertImages: (files: File[]) => Promise<void>
}

declare function discardEditorState(fileId: number): void
```

`focus()` and `insertImages()` act on the mounted editor and are exposed through its typed component handle. `discardEditorState(fileId)` is a module-level lifecycle command used after purge and empty-trash; it removes private cached editor state without exposing CodeMirror's registry to File orchestration.

Phase 3 may add renderer and serializable diagnostic props, but it must not widen the Interface with CodeMirror types.

## Ownership and internal modules

```text
src/lib/files/
  analysis.ts

src/components/editor/
  index.svelte              # existing FileEditor orchestration
  TextEditor.svelte
  edit-buffer.svelte.ts
  text-editor/
    adapter-selection.ts
    textarea-adapter.ts
    codemirror-adapter.ts
    state-registry.ts
    markdown-language.ts
    images.ts
    theme.ts
```

- `src/lib/files/analysis.ts` is the single Source analyzer for tags and absolute File References.
- `FileEditor` owns File fields, Save/conflict orchestration, the single page-level `Mod-s` listener, lifecycle actions, and Markdown Preview.
- `TextEditor` exposes the stable Interface.
- adapters own text mechanics only.
- `adapter-selection.ts` contains the private production adapter constant. It is not a prop, user setting, URL parameter, or localStorage value; rollback changes the constant and redeploys.
- `state-registry.ts` and its `Map<FileId, EditorState>` are private to the Text Editor module.
- `edit-buffer` persists recoverable unsaved File values, not CodeMirror state.

Phase 3 adds private Svelte language/diagnostic modules and the separate preview/build modules; it does not move those concerns into the Phase-2 registry.

## Existing capability migration

| Existing behavior | Text Editor responsibility |
| --- | --- |
| Content binding | Emit `onChange` once for a local document change. |
| External File selection/refresh | Restore by File ID; for the same File, replace only when FileEditor supplies a different accepted `value`. |
| Clipboard image upload | Insert a unique Markdown placeholder, then upload asynchronously. |
| Drag image upload | Use true `posAtCoords()` rather than stale selection. |
| Toolbar image upload | Allow multiple selection and route every selected image through `insertImages(files)`. |
| Upload completion/failure | Replace or remove only the matching placeholder. |
| Read-only recycle-bin File | Combine read-only state and non-editable view. |
| Local recovery | Use Edit Buffer storage owned outside CodeMirror. |
| Dirty/conflict indication | Compare Edit Buffer values and `baseRevision` outside CodeMirror. |
| Preview | Remain owned by `FileEditor`; hide the mounted editor surface rather than unmounting it. |
| Tags and references | Analyze Source through `src/lib/files/analysis.ts`. |

External replacements must be annotated so their transactions do not echo through `onChange`. Text Editor does not receive or interpret File revisions: `baseRevision`, dirty state, and conflict decisions remain wholly owned by FileEditor.

Text Editor does not register a Save keymap. FileEditor handles Ctrl+S and macOS Cmd+S exactly once across the whole File editing surface, including when focus is in the Path input or Source editor.

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

The configured Markdown capability set includes line numbers, active line, undo/redo, search/replace, selection matching, multiple selection, bracket matching/closing, indentation, `Tab`/`Shift-Tab`, folding, Markdown wrapping, accessible labels/focus, Koalablog theme variables, and a narrow-screen gutter policy. Narrow screens hide line-number and fold gutters without reducing editing capability. Completion suggestions, formatting, Vim mode, and LSP remain out of scope; `@codemirror/autocomplete` is used only for bracket closing.

## Per-File state and refresh reconciliation

Maintain an in-memory private `Map<FileId, EditorState>` during the dashboard session:

- rename/move preserves state because File ID is stable;
- purge and empty-trash call the module-level `discardEditorState(fileId)` command;
- recycle-bin selection may retain a read-only state;
- a newly selected File seeds state from its Edit Buffer or current server Source;
- no CodeMirror state enters localStorage.

FileEditor's accepted `value` is always the Source truth. A cached `EditorState` restores selection, scroll, folds, and undo only when its document equals that `value`; otherwise the adapter discards the stale cached state and seeds a fresh state from `value`. The registry is an interaction cache, never a second Source authority.

When the Store receives a same-ID server File, `FileEditor` first applies the File-domain reconciliation rules and then supplies the resulting accepted `value` to Text Editor. The Text Editor rules stay deliberately mechanical:

| Input | Cached editor action |
| --- | --- |
| Different File ID | Save the current File state, then restore it only if its document equals the selected File's accepted `value`; otherwise seed a fresh state from `value`. |
| Same File ID and `value` equals the current document | Do nothing, including for metadata-only revision changes and local `onChange` echoes. |
| Same File ID and `value` differs from the current document | Treat it as an accepted external Source, replace with a fresh state, and clear stale undo. |
| Purged File | Forget cached state. |

The adapter never silently merges text or chooses which revision wins. A `409 source_conflict` stays visible until File orchestration resolves it, and FileEditor keeps supplying the local Edit Buffer value until the user accepts another Source.

## Images

Phase 2 supports images only. Non-image Files do not enter this flow. Paste, drop, and toolbar multi-select all call the same `insertImages(files)` command. The adapter owns Markdown image transactions while upload I/O is injected:

1. Determine the current selection or true drop coordinate.
2. Insert one unique placeholder per image in one undoable transaction, so a multi-image user action is one undo step.
3. Upload each image through the injected adapter.
4. Replace only the matching placeholder on success without adding the asynchronous replacement to undo history.
5. Remove only the matching placeholder on failure without adding the asynchronous cleanup to undo history.
6. If the user removed a placeholder before completion, discard that upload result rather than reinserting the image.
7. Undo removes the original image batch and never resurrects an `Uploading...` placeholder; coincident user text is never replaced.

Phase 2 emits Markdown only:

```text
![](/api/oss/...)
```

Phase 3 may select `<img>` output through Renderer Mode, behind the same command.

## Accessibility, mobile, and IME

- `filePath` is used only to produce the stable accessible label `File Source for <Path>`; Path editing and validation remain outside Text Editor.
- Keep touch scrolling native.
- Reduce gutters on narrow screens without hiding editing state.
- Ordinary File selection does not steal focus, which avoids opening the mobile keyboard and preserves Sidebar keyboard navigation.
- New File creation keeps the existing behavior of focusing Path; Save preserves whichever control already has focus.
- Preview keeps the Text Editor mounted and hides only its surface so undo, selection, and scroll remain intact. Returning to Edit requests a fresh editor measurement and focuses Source.
- Completing toolbar image insertion focuses Source. Paste and drop retain their existing editor focus.
- Do not treat intermediate Chinese IME composition events as external replacement boundaries.
- Test hardware keyboard, touch selection, and composition in real browsers.

## Phase-2 test surface

Keep two test layers only:

- Vitest covers pure state, transaction, image-placeholder, and registry behavior without `jsdom`, `happy-dom`, or a component Testing Library.
- Playwright exercises the real `/dashboard/edit` page and the Text Editor Interface in a browser.

Tests exercise the Interface and user behavior rather than CodeMirror internals:

1. Local edits emit Source once without an external-update loop.
2. File selection restores text, selection, scroll, folds, and undo by File ID.
3. A different accepted `value` for the same File replaces Source without exposing revisions to Text Editor.
4. Dirty same-ID refresh retains Source; a newer revision exposes conflict.
5. Rename preserves state; purge and empty-trash call `discardEditorState` for every permanently deleted File.
6. Read-only Files reject editing commands.
7. FileEditor's page-level `Mod-s` triggers one Save from both Path and Source focus without a Text Editor keymap.
8. Paste, drop, and toolbar multi-select share one Markdown image transaction flow.
9. Concurrent image uploads replace the correct placeholders.
10. Upload failure leaves no placeholder, and a completion after user removal does not reinsert an image.
11. One undo removes the original image batch before or after upload completion and never restores an upload placeholder.
12. Selection, refresh, Preview hide/show without remounting, keyboard navigation, mobile scrolling, and the explicit focus rules work through Playwright in a real browser.
13. Native Chinese IME candidate interaction and physical touch selection pass the final manual browser checklist.

## Phase-2 migration sequence

1. Ensure `src/lib/files/analysis.ts` has already removed Save's Preview-DOM dependency in Phase 1.
2. Introduce the Text Editor Interface and satisfy it with a textarea adapter.
3. Add pure Vitest contract tests and Playwright tests against the real textarea baseline; do not add a simulated DOM stack.
4. Add the private CodeMirror adapter and Markdown extensions.
5. Move Markdown image insertion behind the Interface while keeping the single page-level Save shortcut in FileEditor.
6. Add the private state registry and same-ID refresh reconciliation.
7. Change the private code-level production adapter constant to CodeMirror while retaining the textarea adapter as rollback/parity reference. Runtime adapter configuration is out of scope.
8. Run browser parity for selection, undo, uploads, refresh, mobile, and Chinese IME.
9. Delete the textarea adapter and textarea-only helpers only after the gate passes.
10. Remove unused `monaco-editor` after bundle verification.

## Phase-3 extension sequence

After Renderer Mode and source-row migration exist:

1. Add renderer and serializable diagnostics to the Interface.
2. Add a lazy Svelte language extension and language Compartment.
3. Add Svelte image markup selection.
4. Connect compiler diagnostics without exposing lint internals.
5. Keep Build Worker and Svelte Preview behind separate Interfaces owned by `FileEditor`.

This sequence is not part of CodeMirror Phase-2 acceptance.
