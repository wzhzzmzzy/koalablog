<script lang="ts">
  import type { RendererMode } from '@/lib/files/types';
  import type { DeploymentSummary } from '@/lib/svelte/deployment-status';
  import { FileText, SquarePen } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import { clampSplitRatio, effectiveMarkdownViewMode, type MarkdownViewMode } from './markdown-view-state.svelte';
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
    markdownRequestedMode: MarkdownViewMode;
    markdownSplitRatio: number;
    previewHtml: string;
    svelteArtifact?: PreviewArtifact | null;
    svelteBuildError?: string | null;
    trashed: boolean;
    changed: boolean;
    privateValue: boolean;
    conflict: EditBufferServerValues | null;
    deploymentSummary: DeploymentSummary;
    deploying: boolean;
    baseRevision: number;
    onUseServer: () => void;
    onRebase: () => void;
    onClosePreview: () => void;
    onMarkdownSplitRatio: (ratio: number, contentWidth: number) => void;
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
    markdownRequestedMode,
    markdownSplitRatio,
    previewHtml,
    svelteArtifact = null,
    svelteBuildError = null,
    trashed,
    changed,
    privateValue,
    conflict,
    deploymentSummary,
    deploying,
    baseRevision,
    onUseServer,
    onRebase,
    onClosePreview,
    onMarkdownSplitRatio,
    onChange,
    uploadImage,
  }: Props = $props();

  let textEditor: TextEditorHandle | undefined = $state();
  let sveltePreview: SveltePreview | undefined = $state();
  let svelteSnapshotPreview: SveltePreview | undefined = $state();
  let previewCloseButton: HTMLButtonElement | undefined = $state();
  let markdownPreview: HTMLElement | undefined = $state();
  let viewContainer: HTMLDivElement | undefined = $state();
  let contentWidth = $state(0);
  let touchViewport = $state(false);
  let draggingSplit = $state(false);
  const lineCount = $derived(value.length === 0 ? 1 : value.split('\n').length);
  const effectiveMarkdownMode = $derived(effectiveMarkdownViewMode({
    requestedMode: markdownRequestedMode,
    renderer,
    contentWidth,
    isMobile: touchViewport,
  }));
  const effectiveSplitRatio = $derived(effectiveMarkdownMode === 'split'
    ? clampSplitRatio(markdownSplitRatio, contentWidth)
    : markdownSplitRatio);
  const showMarkdownPreview = $derived(renderer === 'markdown' && effectiveMarkdownMode !== 'source');
  const hideEditor = $derived(showPreview || effectiveMarkdownMode === 'preview');
  const modeLabel = $derived(showPreview
    ? 'Preview'
    : renderer === 'markdown'
      ? effectiveMarkdownMode[0].toUpperCase() + effectiveMarkdownMode.slice(1)
      : 'Source');
  const rendererLabel = $derived(renderer === 'svelte' ? 'Svelte' : 'Markdown');
  const fileExtension = $derived(renderer === 'svelte' ? '.svelte' : '.md');
  const artifactStatusLabel = $derived.by(() => {
    if (renderer !== 'svelte')
      return null
    if (deploying)
      return 'Artifact · deploying'
    if (deploymentSummary.status === 'not_deployed')
      return 'Artifact · not deployed'
    if (deploymentSummary.status === 'deployment_drift')
      return 'Artifact · deployment drift'
    return 'Artifact · deployed'
  });

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

  function setContentWidth(width: number) {
    contentWidth = Math.max(0, width)
  }

  function updateSplitRatio(clientX: number) {
    if (!viewContainer)
      return
    const bounds = viewContainer.getBoundingClientRect()
    onMarkdownSplitRatio((clientX - bounds.left) / bounds.width, bounds.width)
  }

  function beginSplitDrag(event: PointerEvent) {
    if (effectiveMarkdownMode !== 'split')
      return
    draggingSplit = true
    event.currentTarget.setPointerCapture(event.pointerId)
    updateSplitRatio(event.clientX)
  }

  function continueSplitDrag(event: PointerEvent) {
    if (draggingSplit)
      updateSplitRatio(event.clientX)
  }

  function endSplitDrag(event: PointerEvent) {
    draggingSplit = false
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function adjustSplitFromKeyboard(event: KeyboardEvent) {
    if (!viewContainer)
      return
    const step = event.shiftKey ? 0.1 : 0.02
    let next = effectiveSplitRatio
    if (event.key === 'ArrowLeft') next -= step
    else if (event.key === 'ArrowRight') next += step
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 1
    else return
    event.preventDefault()
    onMarkdownSplitRatio(clampSplitRatio(next, contentWidth), contentWidth)
  }

  onMount(() => {
    if (!viewContainer)
      return
    const updateTouchViewport = () => {
      touchViewport = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    }
    const observer = new ResizeObserver(entries => setContentWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(viewContainer)
    updateTouchViewport()
    const media = window.matchMedia('(hover: none) and (pointer: coarse)')
    media.addEventListener('change', updateTouchViewport)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', updateTouchViewport)
    }
  })

  let lastEffectiveMarkdownMode: MarkdownViewMode | undefined = $state()
  $effect(() => {
    const next = effectiveMarkdownMode
    if (next === lastEffectiveMarkdownMode)
      return
    lastEffectiveMarkdownMode = next
    if (next === 'preview')
      void tick().then(() => markdownPreview?.focus())
    else if (next === 'source')
      void tick().then(() => textEditor?.focus())
  })

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

  <div
    bind:this={viewContainer}
    class="editor-view-layout editor-view-layout--{effectiveMarkdownMode}"
    style={`--editor-split-ratio:${effectiveSplitRatio}`}
  >
    <div class:editor-canvas--hidden={hideEditor} class="editor-canvas">
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
    {#if showMarkdownPreview}
      {#if effectiveMarkdownMode === 'split'}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          class="editor-split-separator"
          role="separator"
          tabindex="0"
          aria-label="Resize Source and Preview panes"
          aria-orientation="vertical"
          aria-valuemin={Math.round(clampSplitRatio(0, contentWidth) * 100)}
          aria-valuemax={Math.round(clampSplitRatio(1, contentWidth) * 100)}
          aria-valuenow={Math.round(effectiveSplitRatio * 100)}
          onpointerdown={beginSplitDrag}
          onpointermove={continueSplitDrag}
          onpointerup={endSplitDrag}
          onpointercancel={endSplitDrag}
          onkeydown={adjustSplitFromKeyboard}
        ></div>
      {/if}
      <article
        bind:this={markdownPreview}
        id="preview-md"
        class="editor-markdown-preview"
        tabindex="-1"
        aria-label="Markdown Preview"
      >
        {@html previewHtml}
      </article>
    {/if}
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
      {#if artifactStatusLabel}<span class="editor-status-bar__detail" data-testid="editor-artifact-status">{artifactStatusLabel}</span>{/if}
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
