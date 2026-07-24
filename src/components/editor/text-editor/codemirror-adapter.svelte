<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import { RENDERER_MODE } from '@/lib/files/types';
  import { Compartment, EditorState, type Extension } from '@codemirror/state';
  import { isolateHistory } from '@codemirror/commands';
  import { diagnosticCount, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import { EditorView } from '@codemirror/view';
  import { onMount } from 'svelte';
  import { restoreCodeMirrorState, saveCodeMirrorState } from './codemirror-state';
  import { reconcileTextEditorDiagnostics, type TextEditorDiagnosticUpdate } from './diagnostics';
  import { createImageHistoryController } from './image-history';
  import { imagesFromClipboard, imagesFromDrop, prepareImageBatch, type PendingImage } from './images';
  import { isCurrentTextEditorLanguageRequest, planTextEditorLanguageRequest } from './language-state';
  import { markdownLanguageExtension, textEditorExtensions } from './markdown-language';
  import { reconcileEditorInput } from './state-registry';

  interface Props {
    fileId: number;
    filePath: string;
    renderer: RendererMode;
    diagnostics: TextEditorDiagnosticUpdate | null;
    value: string;
    readonly: boolean;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let { fileId, filePath, renderer, diagnostics, value, readonly, onChange, uploadImage }: Props = $props();
  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined = $state();
  let activeFileId = fileId;
  let desiredRenderer = renderer;
  let languageRenderer: RendererMode | null = null;
  let languageRequestId = 0;
  let appliedDiagnostics: TextEditorDiagnosticUpdate | null = null;
  let lastDiagnosticsInput: TextEditorDiagnosticUpdate | null | undefined;
  const settledUploads = new Map<number, Array<{ pending: PendingImage; url?: string }>>();
  const imageHistory = createImageHistoryController({
    getView: () => view,
    getActiveFileId: () => activeFileId,
  });

  const accessCompartment = new Compartment();
  const labelCompartment = new Compartment();
  const languageCompartment = new Compartment();

  function initialLanguageExtension(initialRenderer: RendererMode): Extension {
    return initialRenderer === RENDERER_MODE.Markdown ? markdownLanguageExtension() : [];
  }

  function accessExtension(isReadonly: boolean) {
    return [
      EditorState.readOnly.of(isReadonly),
      EditorView.editable.of(!isReadonly),
    ];
  }

  function labelExtension(path: string, id: number) {
    return EditorView.contentAttributes.of({
      'aria-label': `File Source for ${path}`,
      'data-file-id': String(id),
    });
  }

  function createState(doc: string, initialRenderer: RendererMode) {
    return EditorState.create({
      doc,
      extensions: [
        imageHistory.extension,
        textEditorExtensions(imageHistory.keyBindings),
        languageCompartment.of(initialLanguageExtension(initialRenderer)),
        accessCompartment.of(accessExtension(readonly)),
        labelCompartment.of(labelExtension(filePath, fileId)),
        EditorView.domEventHandlers({
          paste(event) {
            const files = imagesFromClipboard(event);
            if (files.length === 0) return false;
            event.preventDefault();
            void insertImages(files);
            return true;
          },
          drop(event, editorView) {
            const files = imagesFromDrop(event);
            if (files.length === 0) return false;
            event.preventDefault();
            const position = editorView.posAtCoords({ x: event.clientX, y: event.clientY });
            if (position !== null) editorView.dispatch({ selection: { anchor: position } });
            void insertImages(files);
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          imageHistory.track(update.transactions);
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
  }

  function cacheCurrentState() {
    if (!view) return;
    const state = diagnosticCount(view.state) > 0
      ? view.state.update(setDiagnostics(view.state, [])).state
      : view.state;
    saveCodeMirrorState(activeFileId, {
      state,
      languageRenderer,
      scrollTo: view.scrollSnapshot(),
    });
  }

  function restoreState(nextFileId: number, acceptedValue: string, nextRenderer: RendererMode) {
    return restoreCodeMirrorState(nextFileId, acceptedValue, doc => ({
      state: createState(doc, nextRenderer),
      languageRenderer: nextRenderer === RENDERER_MODE.Markdown ? RENDERER_MODE.Markdown : null,
    }));
  }

  async function applyLanguage(nextRenderer: RendererMode, stateWasReplaced = false) {
    if (!view) return;
    desiredRenderer = nextRenderer;
    const plan = planTextEditorLanguageRequest(
      languageRequestId,
      languageRenderer,
      nextRenderer,
      stateWasReplaced,
    );
    languageRequestId = plan.latestRequestId;
    if (!plan.request) return;
    if (plan.request.renderer === RENDERER_MODE.Markdown) {
      view.dispatch({ effects: languageCompartment.reconfigure(markdownLanguageExtension()) });
      languageRenderer = RENDERER_MODE.Markdown;
      return;
    }

    const { svelteLanguageExtension } = await import('./svelte-language');
    if (!view || !isCurrentTextEditorLanguageRequest(plan.request, languageRequestId, desiredRenderer)) return;
    view.dispatch({ effects: languageCompartment.reconfigure(svelteLanguageExtension()) });
    languageRenderer = RENDERER_MODE.Svelte;
  }

  function applyDiagnostics(nextDiagnostics: TextEditorDiagnosticUpdate | null, force = false) {
    if (!view) return;
    if (!force && lastDiagnosticsInput === nextDiagnostics) return;
    lastDiagnosticsInput = nextDiagnostics;
    if (!nextDiagnostics) {
      appliedDiagnostics = null;
      if (diagnosticCount(view.state) > 0)
        view.dispatch(setDiagnostics(view.state, []));
      return;
    }
    const accepted = reconcileTextEditorDiagnostics(appliedDiagnostics, nextDiagnostics);
    if (!accepted) return;
    appliedDiagnostics = accepted;
    const documentLength = view.state.doc.length;
    const mapped: Diagnostic[] = accepted.diagnostics.map((diagnostic) => {
      const from = Math.max(0, Math.min(diagnostic.from, documentLength));
      const to = Math.max(from, Math.min(diagnostic.to, documentLength));
      return { ...diagnostic, from, to };
    });
    view.dispatch(setDiagnostics(view.state, mapped));
  }

  function applyDynamicConfiguration(nextReadonly: boolean, nextPath: string, nextFileId: number) {
    view?.dispatch({
      effects: [
        accessCompartment.reconfigure(accessExtension(nextReadonly)),
        labelCompartment.reconfigure(labelExtension(nextPath, nextFileId)),
      ],
    });
  }

  function applyRestoredState(nextFileId: number, acceptedValue: string, nextRenderer: RendererMode) {
    if (!view) return;
    const restored = restoreState(nextFileId, acceptedValue, nextRenderer);
    activeFileId = nextFileId;
    languageRenderer = restored.state.languageRenderer;
    appliedDiagnostics = null;
    lastDiagnosticsInput = undefined;
    view.setState(restored.state.state);
    if (restored.state.scrollTo) view.dispatch({ effects: restored.state.scrollTo });
    flushSettledUploads(nextFileId);
  }

  function flushSettledUploads(targetFileId: number) {
    const settled = settledUploads.get(targetFileId);
    if (!settled) return;
    settledUploads.delete(targetFileId);
    for (const result of settled) imageHistory.settle(result.pending, result.url);
  }

  function completeUpload(targetFileId: number, pending: PendingImage, url?: string) {
    if (view && activeFileId === targetFileId) {
      imageHistory.settle(pending, url);
      return;
    }
    const settled = settledUploads.get(targetFileId) ?? [];
    settled.push({ pending, url });
    settledUploads.set(targetFileId, settled);
  }

  async function uploadPendingImage(targetFileId: number, pending: PendingImage) {
    try {
      const { url } = await uploadImage(pending.file);
      completeUpload(targetFileId, pending, url);
    }
    catch {
      completeUpload(targetFileId, pending);
    }
  }

  export function focus() {
    view?.requestMeasure();
    view?.focus();
  }

  export function insertImages(files: File[]): Promise<void> {
    if (!view || readonly) return Promise.resolve();
    const batch = prepareImageBatch(files, renderer);
    if (batch.items.length === 0) return Promise.resolve();

    const targetFileId = activeFileId;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: batch.text },
      selection: { anchor: selection.from + batch.text.length },
      effects: imageHistory.appliedEffect(),
      annotations: isolateHistory.of('full'),
    });
    imageHistory.register(targetFileId, batch, selection.from);
    for (const pending of batch.items) void uploadPendingImage(targetFileId, pending);
    return Promise.resolve();
  }

  onMount(() => {
    if (!container) return;
    const restored = restoreState(fileId, value, renderer);
    activeFileId = fileId;
    languageRenderer = restored.state.languageRenderer;
    view = new EditorView({
      state: restored.state.state,
      scrollTo: restored.state.scrollTo,
      parent: container,
    });
    applyDynamicConfiguration(readonly, filePath, fileId);
    void applyLanguage(renderer);
    applyDiagnostics(diagnostics);

    return () => {
      cacheCurrentState();
      view?.destroy();
      view = undefined;
    };
  });

  $effect(() => {
    const nextFileId = fileId;
    const acceptedValue = value;
    const nextReadonly = readonly;
    const nextPath = filePath;
    const nextRenderer = renderer;
    const nextDiagnostics = diagnostics;
    if (!view) return;

    const action = reconcileEditorInput(
      activeFileId,
      view.state.doc.toString(),
      nextFileId,
      acceptedValue,
    );
    if (action === 'switch') {
      cacheCurrentState();
      applyRestoredState(nextFileId, acceptedValue, nextRenderer);
    }
    else if (action === 'replace') {
      applyRestoredState(nextFileId, acceptedValue, nextRenderer);
    }
    applyDynamicConfiguration(nextReadonly, nextPath, nextFileId);
    const stateWasReplaced = action === 'switch' || action === 'replace';
    void applyLanguage(nextRenderer, stateWasReplaced);
    applyDiagnostics(nextDiagnostics, stateWasReplaced);
  });
</script>

<div
  bind:this={container}
  class="h-full w-full min-h-0
    [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-editor]:text-sm [&_.cm-editor]:text-[--koala-editor-text]
    [&_.cm-editor.cm-focused]:outline-none
    [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:[font-family:var(--koala-font-mono)]
    [&_.cm-scroller]:leading-[1.6] [&_.cm-scroller]:[touch-action:pan-x_pan-y]
    [&_.cm-content]:min-h-full [&_.cm-content]:py-2 [&_.cm-content]:[caret-color:var(--koala-editor-text)]
    [&_.cm-line]:px-2
    [&_.cm-gutters]:bg-transparent
    [&_.cm-gutters]:text-[--koala-subtext-0] lt-sm:[&_.cm-gutters]:hidden
    [&_.cm-activeLine]:bg-[color-mix(in_srgb,var(--koala-focusing-block)_60%,transparent)] [&_.cm-activeLineGutter]:bg-[--koala-focusing-block]
    [&_.cm-selectionBackground]:!bg-[--koala-editor-selection-bg] [&_::selection]:!bg-[--koala-editor-selection-bg]
    [&_.cm-cursor]:[border-left-color:var(--koala-editor-text)] [&_.cm-dropCursor]:[border-left-color:var(--koala-editor-text)]
    [&_.cm-searchMatch]:bg-[--koala-warning-bg] [&_.cm-searchMatch]:outline [&_.cm-searchMatch]:outline-[--koala-warning-text]
    [&_.cm-searchMatch.cm-searchMatch-selected]:bg-[--koala-focusing-block]"
></div>
