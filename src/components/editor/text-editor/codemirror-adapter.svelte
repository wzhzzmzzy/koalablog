<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import { RENDERER_MODE } from '@/lib/files/types';
  import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
  import { isolateHistory } from '@codemirror/commands';
  import { diagnosticCount, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import { EditorView } from '@codemirror/view';
  import { onMount } from 'svelte';
  import { restoreCodeMirrorState, saveCodeMirrorState } from './codemirror-state';
  import { catppuccinEditorTheme, resolveEditorCatppuccinTheme } from './catppuccin-theme';
  import { reconcileTextEditorDiagnostics, type TextEditorDiagnosticUpdate } from './diagnostics';
  import type { FileReferenceCandidate } from './file-reference-completion';
  import { markdownCompletion } from './markdown-completion';
  import type { TagCompletionCandidate } from './tag-completion';
  import { createImageHistoryController, type ImageSettlementOutcome } from './image-history';
  import { imagesFromClipboard, imagesFromDrop, prepareImageBatch, type ImageUploadProgress, type ImageUploadStatus, type PendingImage } from './images';
  import { isCurrentTextEditorLanguageRequest, planTextEditorLanguageRequest } from './language-state';
  import { markdownLanguageExtension, textEditorExtensions } from './markdown-language';
  import { reconcileEditorInput } from './state-registry';
  import { sourceReconciliationChange } from './source-reconciliation';

  interface Props {
    fileId: number;
    filePath: string;
    renderer: RendererMode;
    diagnostics: TextEditorDiagnosticUpdate | null;
    value: string;
    readonly: boolean;
    referenceCandidates: readonly FileReferenceCandidate[];
    tagCandidates: readonly TagCompletionCandidate[];
    onChange: (value: string) => void;
    uploadImage: (file: File, onProgress: (progress: ImageUploadProgress) => void) => Promise<{ url: string }>;
    onImageUploadsChange: (uploads: ImageUploadStatus[]) => void;
  }

  let { fileId, filePath, renderer, diagnostics, value, readonly, referenceCandidates, tagCandidates, onChange, uploadImage, onImageUploadsChange }: Props = $props();
  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined = $state();
  let activeFileId = fileId;
  let desiredRenderer = renderer;
  let languageRenderer: RendererMode | null = null;
  let languageRequestId = 0;
  let appliedDiagnostics: TextEditorDiagnosticUpdate | null = null;
  let lastDiagnosticsInput: TextEditorDiagnosticUpdate | null | undefined;
  type SettledUpload = { pending: PendingImage; result: { type: 'success'; url: string } | { type: 'failure' } };
  interface TrackedUpload {
    fileId: number;
    pending: PendingImage;
    status: ImageUploadStatus;
  }
  const settledUploads = new Map<number, SettledUpload[]>();
  const uploads = new Map<string, TrackedUpload>();
  const imageHistory = createImageHistoryController({
    getView: () => view,
    getActiveFileId: () => activeFileId,
  });

  const accessCompartment = new Compartment();
  const labelCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const markdownCompletionCompartment = new Compartment();
  const themeCompartment = new Compartment();

  function initialLanguageExtension(initialRenderer: RendererMode): Extension {
    return initialRenderer === RENDERER_MODE.Markdown ? markdownLanguageExtension() : [];
  }

  function markdownCompletionExtension(nextRenderer: RendererMode, nextReadonly: boolean, nextReferences: readonly FileReferenceCandidate[], nextTags: readonly TagCompletionCandidate[], nextFileId: number): Extension {
    return nextRenderer === RENDERER_MODE.Markdown && !nextReadonly
      ? markdownCompletion({ references: nextReferences, tags: nextTags, excludeFileId: nextFileId })
      : [];
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

  function activeCatppuccinTheme() {
    const page = document.querySelector<HTMLElement>('#page');
    return resolveEditorCatppuccinTheme({
      light: page?.dataset.lightTheme,
      dark: page?.dataset.darkTheme,
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    });
  }

  function createState(doc: string, initialRenderer: RendererMode) {
    return EditorState.create({
      doc,
      extensions: [
        imageHistory.extension,
        textEditorExtensions(imageHistory.keyBindings),
        themeCompartment.of(catppuccinEditorTheme(activeCatppuccinTheme())),
        languageCompartment.of(initialLanguageExtension(initialRenderer)),
        accessCompartment.of(accessExtension(readonly)),
        labelCompartment.of(labelExtension(filePath, fileId)),
        markdownCompletionCompartment.of(markdownCompletionExtension(initialRenderer, readonly, referenceCandidates, tagCandidates, fileId)),
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

  // The $effect below runs on every keystroke, so reconfigure only when an
  // actual input changed; a redundant reconfigure would reset the open tooltip.
  let appliedMarkdownCompletion: {
    renderer: RendererMode;
    readonly: boolean;
    candidates: readonly FileReferenceCandidate[];
    tags: readonly TagCompletionCandidate[];
    fileId: number;
  } | null = null;

  function applyMarkdownCompletion(nextRenderer: RendererMode, nextReadonly: boolean, nextCandidates: readonly FileReferenceCandidate[], nextTags: readonly TagCompletionCandidate[], nextFileId: number) {
    if (!view) return;
    const last = appliedMarkdownCompletion;
    if (last
      && last.renderer === nextRenderer
      && last.readonly === nextReadonly
      && last.candidates === nextCandidates
      && last.tags === nextTags
      && last.fileId === nextFileId) return;
    appliedMarkdownCompletion = {
      renderer: nextRenderer,
      readonly: nextReadonly,
      candidates: nextCandidates,
      tags: nextTags,
      fileId: nextFileId,
    };
    view.dispatch({
      effects: markdownCompletionCompartment.reconfigure(
        markdownCompletionExtension(nextRenderer, nextReadonly, nextCandidates, nextTags, nextFileId),
      ),
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
    publishUploads();
  }

  function publishUploads() {
    onImageUploadsChange([...uploads.values()]
      .filter(upload => upload.fileId === activeFileId)
      .map(upload => ({ ...upload.status })));
  }

  function setUploadStatus(targetFileId: number, pending: PendingImage, status: ImageUploadStatus) {
    uploads.set(pending.id, { fileId: targetFileId, pending, status });
    if (targetFileId === activeFileId)
      publishUploads();
  }

  function clearUploadStatus(pending: PendingImage) {
    const tracked = uploads.get(pending.id);
    uploads.delete(pending.id);
    if (tracked?.fileId === activeFileId)
      publishUploads();
  }

  function flushSettledUploads(targetFileId: number) {
    const settled = settledUploads.get(targetFileId);
    if (!settled) return;
    settledUploads.delete(targetFileId);
    for (const settledUpload of settled) {
      const outcome = imageHistory.settle(settledUpload.pending, settledUpload.result);
      finishUploadSettlement(targetFileId, settledUpload.pending, settledUpload.result, outcome);
    }
  }

  function completeUpload(targetFileId: number, pending: PendingImage, result: SettledUpload['result']) {
    if (view && activeFileId === targetFileId) {
      return imageHistory.settle(pending, result);
    }
    const settled = settledUploads.get(targetFileId) ?? [];
    settled.push({ pending, result });
    settledUploads.set(targetFileId, settled);
    return null;
  }

  function finishUploadSettlement(targetFileId: number, pending: PendingImage, result: SettledUpload['result'], outcome: ImageSettlementOutcome) {
    if (outcome === 'discarded') {
      clearUploadStatus(pending);
      return;
    }
    if (result.type === 'success' && outcome === 'settled') {
      clearUploadStatus(pending);
      return;
    }
    const tracked = uploads.get(pending.id);
    setUploadStatus(targetFileId, pending, {
      id: pending.id,
      fileName: pending.file.name,
      state: 'failed',
      error: outcome === 'untracked'
        ? 'The upload finished, but the placeholder was changed. Remove the temporary image markup and upload the image again.'
        : tracked?.status.error || 'Upload failed. Try again or remove the placeholder.',
    });
  }

  function progressStatus(pending: PendingImage, progress: ImageUploadProgress): ImageUploadStatus {
    if (progress.phase === 'preparing')
      return { id: pending.id, fileName: pending.file.name, state: 'preparing' };
    if (progress.total > 0 && progress.loaded >= progress.total)
      return { id: pending.id, fileName: pending.file.name, state: 'processing' };
    const percentage = progress.total > 0
      ? Math.max(0, Math.min(99, Math.round(progress.loaded / progress.total * 100)))
      : undefined;
    return { id: pending.id, fileName: pending.file.name, state: 'uploading', progress: percentage };
  }

  async function uploadPendingImage(targetFileId: number, pending: PendingImage) {
    setUploadStatus(targetFileId, pending, {
      id: pending.id,
      fileName: pending.file.name,
      state: 'preparing',
    });
    try {
      const { url } = await uploadImage(pending.file, (progress) => {
        setUploadStatus(targetFileId, pending, progressStatus(pending, progress));
      });
      const result = { type: 'success', url } as const;
      const outcome = completeUpload(targetFileId, pending, result);
      if (outcome)
        finishUploadSettlement(targetFileId, pending, result, outcome);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadStatus(targetFileId, pending, {
        id: pending.id,
        fileName: pending.file.name,
        state: 'failed',
        error: message,
      });
      const result = { type: 'failure' } as const;
      const outcome = completeUpload(targetFileId, pending, result);
      if (outcome)
        finishUploadSettlement(targetFileId, pending, result, outcome);
    }
  }

  export function retryImageUpload(id: string) {
    const tracked = uploads.get(id);
    if (!tracked || tracked.fileId !== activeFileId || tracked.status.state !== 'failed')
      return;
    if (!imageHistory.retry(tracked.pending)) {
      setUploadStatus(tracked.fileId, tracked.pending, {
        ...tracked.status,
        error: 'The failed placeholder was changed. Remove it and upload the image again.',
      });
      return;
    }
    void uploadPendingImage(tracked.fileId, tracked.pending);
  }

  export function removeImageUpload(id: string) {
    const tracked = uploads.get(id);
    if (!tracked || tracked.fileId !== activeFileId)
      return;
    if (imageHistory.remove(tracked.pending)) {
      clearUploadStatus(tracked.pending);
      return;
    }
    setUploadStatus(tracked.fileId, tracked.pending, {
      ...tracked.status,
      state: 'failed',
      error: 'The failed placeholder was changed. Remove the temporary image markup manually before saving.',
    });
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

  function applySource(content: string, addToHistory: boolean) {
    if (!view) return;
    const change = sourceReconciliationChange(view.state.doc.toString(), content);
    if (!change) return;
    view.dispatch({
      changes: change,
      annotations: addToHistory ? undefined : Transaction.addToHistory.of(false),
    });
  }

  export function applySavePreparation(content: string) {
    applySource(content, true);
  }

  export function acknowledgeSavedSource(content: string) {
    applySource(content, false);
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
    applyMarkdownCompletion(renderer, readonly, referenceCandidates, tagCandidates, fileId);
    void applyLanguage(renderer);
    applyDiagnostics(diagnostics);
    publishUploads();

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const refreshTheme = () => view?.dispatch({
      effects: themeCompartment.reconfigure(catppuccinEditorTheme(activeCatppuccinTheme())),
    });
    colorScheme.addEventListener('change', refreshTheme);

    return () => {
      colorScheme.removeEventListener('change', refreshTheme);
      cacheCurrentState();
      view?.destroy();
      view = undefined;
      onImageUploadsChange([]);
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
    applyMarkdownCompletion(nextRenderer, nextReadonly, referenceCandidates, tagCandidates, nextFileId);
    const stateWasReplaced = action === 'switch' || action === 'replace';
    void applyLanguage(nextRenderer, stateWasReplaced);
    applyDiagnostics(nextDiagnostics, stateWasReplaced);
  });
</script>

<div bind:this={container} class="cm-adapter h-full w-full min-h-0"></div>
