<script lang="ts">
  import type { EditBufferServerValues } from './edit-buffer.svelte';
  import TextEditor, { type TextEditorHandle } from './TextEditor.svelte';

  interface Props {
    title: string;
    fileId: number;
    filePath: string;
    value: string;
    showPreview: boolean;
    previewHtml: string;
    trashed: boolean;
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
    value,
    showPreview,
    previewHtml,
    trashed,
    conflict,
    baseRevision,
    onUseServer,
    onRebase,
    onChange,
    uploadImage,
  }: Props = $props();

  let textEditor: TextEditorHandle | undefined = $state();

  export function focus() {
    textEditor?.focus();
  }

  export async function insertImages(files: File[]) {
    await textEditor?.insertImages(files);
  }
</script>

<input
  id="title-input"
  type="text"
  class="text-[--koala-text] {showPreview ? 'hidden' : ''} w-full text-xl font-bold bg-transparent border-none outline-none border-b border-[--koala-border] pb-2 placeholder-[--koala-editor-placeholder]"
  value={title}
  placeholder="File name"
  aria-label="File name"
  readonly
/>

{#if conflict}
  <div class="mb-2 rounded border border-[--koala-warning-text] p-3 text-sm" role="alert">
    <p class="m-0">Server revision {conflict.revision} differs from the Edit Buffer base revision {baseRevision}. The local Source is still intact.</p>
    <p class="m-0 mt-1 break-all">Server Path: {conflict.path}</p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button" class="btn" onclick={onUseServer}>Use server version</button>
      <button type="button" class="btn" onclick={onRebase}>Keep local and rebase</button>
    </div>
  </div>
{/if}

<div class="w-full flex-1 min-h-0 {showPreview ? 'hidden' : ''}">
  <TextEditor
    bind:this={textEditor}
    {fileId}
    {filePath}
    {value}
    readonly={trashed}
    {onChange}
    {uploadImage}
  />
</div>

<article id="preview-md" class="w-full flex-1 overflow-y-auto {showPreview ? '' : 'hidden'}">
  {@html previewHtml}
</article>
