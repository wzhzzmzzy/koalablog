<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import { FileText, SquarePen } from '@lucide/svelte';
  import type { PreviewArtifact, PreviewRuntimeErrorMessage } from './svelte/preview-runtime';
  import type { EditBufferServerValues } from './edit-buffer.svelte';
  import type { TextEditorDiagnosticUpdate } from './text-editor/diagnostics';
  import type { FileReferenceCandidate } from './text-editor/file-reference-completion';
  import SvelteIcon from './SvelteIcon.svelte';
  import SveltePreview from './svelte/SveltePreview.svelte';
  import TextEditor, { type TextEditorHandle } from './TextEditor.svelte';

  interface Props {
    title: string;
    fileId: number;
    filePath: string;
    renderer: RendererMode;
    diagnostics?: TextEditorDiagnosticUpdate | null;
    value: string;
    referenceCandidates: readonly FileReferenceCandidate[];
    showPreview: boolean;
    previewHtml: string;
    svelteArtifact?: PreviewArtifact | null;
    svelteBuildError?: string | null;
    trashed: boolean;
    changed: boolean;
    privateValue: boolean;
    conflict: EditBufferServerValues | null;
    baseRevision: number;
    onUseServer: () => void;
    onRebase: () => void;
    onClosePreview: () => void;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<{ url: string }>;
  }

  let {
    title,
    fileId,
    filePath,
    renderer,
    diagnostics = null,
    value,
    referenceCandidates,
    showPreview,
    previewHtml,
    svelteArtifact = null,
    svelteBuildError = null,
    trashed,
    changed,
    privateValue,
    conflict,
    baseRevision,
    onUseServer,
    onRebase,
    onClosePreview,
    onChange,
    uploadImage,
  }: Props = $props();

  let textEditor: TextEditorHandle | undefined = $state();
  let sveltePreview: SveltePreview | undefined = $state();
  let svelteSnapshotPreview: SveltePreview | undefined = $state();
  let previewCloseButton: HTMLButtonElement | undefined = $state();
  const lineCount = $derived(value.length === 0 ? 1 : value.split('\n').length);
  const modeLabel = $derived(showPreview ? 'Preview' : 'Source');
  const rendererLabel = $derived(renderer === 'svelte' ? 'Svelte' : 'Markdown');
  const fileExtension = $derived(renderer === 'svelte' ? '.svelte' : '.md');

  export function focus() {
    textEditor?.focus();
  }

  export async function insertImages(files: File[]) {
    await textEditor?.insertImages(files);
  }

  export async function snapshotSvelteArtifact(artifact: PreviewArtifact) {
    const snapshotPreview = sveltePreview ?? svelteSnapshotPreview
    if (!snapshotPreview)
      throw new Error('Svelte Snapshot Preview is not ready')
    return snapshotPreview.snapshot(artifact)
  }

  export function focusPreview() {
    previewCloseButton?.focus()
  }

  function returnPreviewFocus() {
    void onClosePreview()
  }

  function reportPreviewError(error: Error | PreviewRuntimeErrorMessage) {
    console.error('Svelte Preview failed:', error.message)
  }
</script>

<section class="editor-content" aria-label="File editor">
  <header class="editor-content__header">
    <div class="editor-content__identity">
      <span class="editor-content__identity-mark" data-testid="editor-title-file-icon" data-renderer={renderer} aria-hidden="true">
        {#if renderer === 'svelte'}
          <SvelteIcon size={17} />
        {:else}
          <FileText size={19} />
        {/if}
      </span>
      <div class="editor-content__heading">
        <h1 class="editor-file-title">
          <span class="editor-file-title__name">{title || 'Untitled'}</span>
          <span class="editor-file-title__extension">{fileExtension}</span>
        </h1>
      </div>
    </div>
    <span class="editor-content__mode">{modeLabel}</span>
  </header>

  {#if conflict}
    <div class="editor-conflict" role="alert">
      <p>Server revision {conflict.revision} differs from the Edit Buffer base revision {baseRevision}. The local Source is still intact.</p>
      <p class="break-all">Server Path: {conflict.path}</p>
      <div class="editor-conflict__actions">
        <button type="button" class="editor-conflict__button" onclick={onUseServer}>Use server version</button>
        <button type="button" class="editor-conflict__button" onclick={onRebase}>Keep local and rebase</button>
      </div>
    </div>
  {/if}

  <div class="editor-canvas {showPreview ? 'hidden' : ''}">
    <TextEditor
      bind:this={textEditor}
      {fileId}
      {filePath}
      {renderer}
      {diagnostics}
      {value}
      readonly={trashed}
      {referenceCandidates}
      {onChange}
      {uploadImage}
    />
  </div>

  {#if showPreview}
    <section class="editor-preview-overlay" data-testid="editor-preview-overlay" aria-label="File preview">
      <header class="editor-preview-overlay__header">
        <div class="editor-preview-overlay__identity">
          <span class="editor-preview-overlay__icon" data-renderer={renderer} aria-hidden="true">
            {#if renderer === 'svelte'}
              <SvelteIcon size={17} />
            {:else}
              <FileText size={18} />
            {/if}
          </span>
          <p class="editor-preview-overlay__title">
            <span>{title || 'Untitled'}</span><span class="editor-file-title__extension">{fileExtension}</span>
          </p>
        </div>
        <button
          bind:this={previewCloseButton}
          type="button"
          class="editor-tool-button editor-preview-overlay__close"
          onclick={() => void onClosePreview()}
          aria-label="Edit Source"
          title="Edit Source"
        >
          <SquarePen size={18} />
          <span class="editor-tool-button__label">Edit Source</span>
        </button>
      </header>

      <div class="editor-preview-overlay__canvas">
        {#if renderer === 'svelte'}
          <section class="editor-svelte-preview" aria-label="Svelte Preview">
            {#if svelteBuildError}
              <p class="m-0 p-4 text-[color:var(--koala-error-text)]" role="alert">{svelteBuildError}</p>
            {:else}
              <SveltePreview bind:this={sveltePreview} artifact={svelteArtifact} onFocusReturn={returnPreviewFocus} onPreviewError={reportPreviewError} />
            {/if}
          </section>
        {:else}
          <article id="preview-md" class="editor-markdown-preview">
            {@html previewHtml}
          </article>
        {/if}
      </div>
    </section>
  {/if}

  <footer class="editor-status-bar" aria-label="File status">
    <div class="editor-status-bar__group">
      <span class="editor-status-bar__state {trashed ? 'editor-status-bar__state--readonly' : (changed ? 'editor-status-bar__state--dirty' : '')}">
        <span class="editor-status-bar__dot" aria-hidden="true"></span>
        {trashed ? 'Recycled · read-only' : (changed ? 'Unsaved changes' : 'Saved')}
      </span>
      <span class="editor-status-bar__detail">{modeLabel} · {rendererLabel}</span>
      {#if privateValue && !trashed}<span class="editor-status-bar__detail">Private</span>{/if}
    </div>
    <div class="editor-status-bar__group">
      <span class="editor-status-bar__detail editor-status-bar__detail--desktop">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
      <span class="editor-status-bar__detail">{value.length} characters</span>
    </div>
  </footer>

  {#if renderer === 'svelte' && !showPreview}
    <div class="editor-svelte-snapshot-host" aria-hidden="true">
      <SveltePreview bind:this={svelteSnapshotPreview} onFocusReturn={() => {}} onPreviewError={reportPreviewError} />
    </div>
  {/if}
</section>
