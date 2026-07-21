<script lang="ts">
  import { Compartment, EditorState } from '@codemirror/state';
  import { isolateHistory } from '@codemirror/commands';
  import { EditorView } from '@codemirror/view';
  import { onMount } from 'svelte';
  import { restoreCodeMirrorState, saveCodeMirrorState } from './codemirror-state';
  import { createImageHistoryController } from './image-history';
  import { imagesFromClipboard, imagesFromDrop, prepareImageBatch, type PendingImage } from './images';
  import { markdownEditorExtensions } from './markdown-language';
  import { reconcileEditorInput } from './state-registry';

  interface Props {
    fileId: number;
    filePath: string;
    value: string;
    readonly: boolean;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let { fileId, filePath, value, readonly, onChange, uploadImage }: Props = $props();
  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined = $state();
  let activeFileId = fileId;
  const settledUploads = new Map<number, Array<{ pending: PendingImage; url?: string }>>();
  const imageHistory = createImageHistoryController({
    getView: () => view,
    getActiveFileId: () => activeFileId,
  });

  const accessCompartment = new Compartment();
  const labelCompartment = new Compartment();

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

  function createState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        imageHistory.extension,
        markdownEditorExtensions(imageHistory.keyBindings),
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
    saveCodeMirrorState(activeFileId, {
      state: view.state,
      scrollTo: view.scrollSnapshot(),
    });
  }

  function restoreState(nextFileId: number, acceptedValue: string) {
    return restoreCodeMirrorState(nextFileId, acceptedValue, doc => ({ state: createState(doc) }));
  }

  function applyDynamicConfiguration(nextReadonly: boolean, nextPath: string, nextFileId: number) {
    view?.dispatch({
      effects: [
        accessCompartment.reconfigure(accessExtension(nextReadonly)),
        labelCompartment.reconfigure(labelExtension(nextPath, nextFileId)),
      ],
    });
  }

  function applyRestoredState(nextFileId: number, acceptedValue: string) {
    if (!view) return;
    const restored = restoreState(nextFileId, acceptedValue);
    activeFileId = nextFileId;
    view.setState(restored.state.state);
    if (restored.state.scrollTo) view.dispatch({ effects: restored.state.scrollTo });
    flushSettledUploads(nextFileId);
  }

  function applySettledUpload(pending: PendingImage, url?: string) {
    imageHistory.settle(pending, url);
  }

  function flushSettledUploads(targetFileId: number) {
    const settled = settledUploads.get(targetFileId);
    if (!settled) return;
    settledUploads.delete(targetFileId);
    for (const result of settled) applySettledUpload(result.pending, result.url);
  }

  function completeUpload(targetFileId: number, pending: PendingImage, url?: string) {
    if (view && activeFileId === targetFileId) {
      applySettledUpload(pending, url);
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
    const batch = prepareImageBatch(files);
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
    const restored = restoreState(fileId, value);
    activeFileId = fileId;
    view = new EditorView({
      state: restored.state.state,
      scrollTo: restored.state.scrollTo,
      parent: container,
    });
    applyDynamicConfiguration(readonly, filePath, fileId);

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
    if (!view) return;

    const action = reconcileEditorInput(
      activeFileId,
      view.state.doc.toString(),
      nextFileId,
      acceptedValue,
    );
    if (action === 'switch') {
      cacheCurrentState();
      applyRestoredState(nextFileId, acceptedValue);
    }
    else if (action === 'replace') {
      applyRestoredState(nextFileId, acceptedValue);
    }
    applyDynamicConfiguration(nextReadonly, nextPath, nextFileId);
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
    [&_.cm-gutters]:bg-transparent [&_.cm-gutters]:border-r [&_.cm-gutters]:border-[--koala-border-subtle]
    [&_.cm-gutters]:text-[--koala-subtext-0] lt-sm:[&_.cm-gutters]:hidden
    [&_.cm-activeLine]:bg-[--koala-focusing-block] [&_.cm-activeLineGutter]:bg-[--koala-focusing-block]
    [&_.cm-selectionBackground]:!bg-[--koala-editor-selection-bg] [&_::selection]:!bg-[--koala-editor-selection-bg]
    [&_.cm-cursor]:[border-left-color:var(--koala-editor-text)] [&_.cm-dropCursor]:[border-left-color:var(--koala-editor-text)]
    [&_.cm-searchMatch]:bg-[--koala-warning-bg] [&_.cm-searchMatch]:outline [&_.cm-searchMatch]:outline-[--koala-warning-text]
    [&_.cm-searchMatch.cm-searchMatch-selected]:bg-[--koala-focusing-block]"
></div>
