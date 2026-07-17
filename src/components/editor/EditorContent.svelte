<script lang="ts">
  import type { FileRecord } from '@/db/types';

  interface Props {
    title: string;
    value: string;
    showPreview: boolean;
    previewHtml: string;
    trashed: boolean;
    conflict: FileRecord | null;
    baseRevision: number;
    onUseServer: () => void;
    onRebase: () => void;
    onPaste: (event: ClipboardEvent) => void;
    onDrop: (event: DragEvent) => void;
  }

  let {
    title,
    value = $bindable(),
    showPreview,
    previewHtml,
    trashed,
    conflict,
    baseRevision,
    onUseServer,
    onRebase,
    onPaste,
    onDrop,
  }: Props = $props();
</script>

<input
  id="title-input"
  type="text"
  class="text-[--koala-text] {showPreview ? 'hidden' : ''} w-full text-xl font-bold bg-transparent border-none outline-none border-b border-[--koala-border] pb-2 placeholder-[--koala-editor-placeholder]"
  value={title}
  placeholder="Title"
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

<textarea
  class="text-sm w-full flex-1 box-border bg-transparent border-none outline-none resize-none p-2 {showPreview ? 'hidden' : ''}"
  name="content"
  placeholder="Type here..."
  bind:value
  onpaste={onPaste}
  ondrop={onDrop}
  readonly={trashed}
></textarea>

<article id="preview-md" class="w-full flex-1 overflow-y-auto {showPreview ? '' : 'hidden'}">
  {@html previewHtml}
</article>
