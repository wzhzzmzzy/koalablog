<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import { FileText } from '@lucide/svelte';
  import { drafts } from './store.svelte';

  interface Props {
    item: FileRecord;
    currentId: number;
    onSelect: (file: FileRecord) => void;
  }

  let { item, currentId, onSelect }: Props = $props();
</script>

<button
  class="outline-none border-none w-full text-left p-2 hover:bg-[--koala-hover-block] transition-colors
         {item.id === currentId ? 'bg-[--koala-focusing-block]' : 'bg-transparent'}
         relative flex items-center gap-1.5 rounded
        {drafts.has(item.path) ? '!text-[--koala-warning-text] font-italic' : 'text-[--koala-text]'}"
  onclick={() => {
    onSelect(item)
  }}
>
    <FileText size={14} class="opacity-70 shrink-0 " />
    <span class="text-sm text-[--koala-text]">{item.title}.md</span>
</button>
