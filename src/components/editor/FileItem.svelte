<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import { FileText } from '@lucide/svelte';
  import { editBuffers } from './edit-buffer.svelte';

  interface Props {
    item: FileRecord;
    currentId: number;
    onSelect: (file: FileRecord) => void;
  }

  let { item, currentId, onSelect }: Props = $props();
</script>

<button
  type="button"
  class="editor-file-tree__item"
  onclick={() => onSelect(item)}
  aria-current={item.id === currentId ? 'page' : undefined}
  title={item.path}
>
    <FileText size={14} class="editor-file-tree__item-icon" />
    <span class="editor-file-tree__item-label">{item.title}</span>
    {#if editBuffers.has(item.id)}<span class="editor-file-tree__dirty" aria-hidden="true"></span>{/if}
</button>
