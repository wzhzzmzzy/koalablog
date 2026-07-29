<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import { FileText } from '@lucide/svelte';
  import type { PreviewArtifact, PreviewRuntimeErrorMessage } from './svelte/preview-runtime';
  import type { EditBufferServerValues } from './edit-buffer.svelte';
  import type { TextEditorDiagnosticUpdate } from './text-editor/diagnostics';
  import SveltePreview from './svelte/SveltePreview.svelte';
  import TextEditor, { type TextEditorHandle } from './TextEditor.svelte';

  interface Props {
    title: string;
    fileId: number;
    filePath: string;
    renderer: RendererMode;
    diagnostics?: TextEditorDiagnosticUpdate | null;
    value: string;
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
    onChange,
    uploadImage,
  }: Props = $props();

  let textEditor: TextEditorHandle | undefined = $state();
  let sveltePreview: SveltePreview | undefined = $state();
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
    if (!sveltePreview)
      throw new Error('Open Svelte Preview before capturing an Artifact Snapshot')
    return sveltePreview.snapshot(artifact)
  }

  function returnPreviewFocus() {
    textEditor?.focus();
  }

  function reportPreviewError(error: Error | PreviewRuntimeErrorMessage) {
    console.error('Svelte Preview failed:', error.message)
  }
</script>

<section class="editor-content" aria-label="File editor">
  <header class="editor-content__header">
    <div class="editor-content__identity">
      <span class="editor-content__identity-mark" aria-hidden="true"><FileText size={19} /></span>
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
      {onChange}
      {uploadImage}
    />
  </div>

  {#if showPreview && renderer === 'svelte'}
    <section class="editor-canvas editor-svelte-preview" aria-label="Svelte Preview">
      {#if svelteBuildError}
        <p class="m-0 p-4 text-[color:var(--koala-error-text)]" role="alert">{svelteBuildError}</p>
      {:else}
        <SveltePreview bind:this={sveltePreview} artifact={svelteArtifact} onFocusReturn={returnPreviewFocus} onPreviewError={reportPreviewError} />
      {/if}
    </section>
  {:else}
    <article id="preview-md" class="editor-markdown-preview {showPreview ? '' : 'hidden'}">
      {@html previewHtml}
    </article>
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
</section>
