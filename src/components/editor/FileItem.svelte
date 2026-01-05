<script lang="ts">
  import type { Markdown } from '@/db/types';
  import { FileText } from '@lucide/svelte';
  import { drafts } from './store.svelte';

  interface Props {
    item: Markdown;
    currentId: number;
    onSelect: (m: Markdown) => void;
  }

  let { item, currentId, onSelect }: Props = $props();
</script>

<button
  class="outline-none border-none w-full text-left p-2 hover:bg-[--koala-hover-block] transition-colors
         {item.id === currentId ? 'bg-[--koala-focusing-block]' : 'bg-transparent'}
         relative flex items-center gap-1.5 rounded
        {drafts.has(item.link) ? '!text-[--koala-warning-text] font-italic' : 'text-[--koala-text]'}"
  onclick={() => {
    onSelect(item)
  }}
>
    <FileText size={14} class="opacity-70 shrink-0 " />
    <span class="text-sm text-[--koala-text]">{item.link.split('/').pop() || item.link}.md</span>
</button>
