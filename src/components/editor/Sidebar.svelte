<script lang="ts">
  import { actions } from 'astro:actions';
  import type { Markdown } from '@/db/types';
  import { Calendar } from '@lucide/svelte';

  interface Props {
    onSelect: (m: Markdown) => void;
    currentId: number;
    initialItems?: Markdown[] | null;
  }

  let { onSelect, currentId, initialItems = null }: Props = $props();

  let items = $state<Markdown[]>([]);
  let loading = $state(false);
  let hasAttemptedLoad = $state(false);

  async function loadAll() {
    if (loading) return;
    loading = true;

    try {
      const result = await actions.db.markdown.all({ source: 'all' });

      if (result.data) {
        items = [...(result.data.posts || []), ...(result.data.pages || []), ...(result.data.memos || [])];
        console.log('Sidebar loaded items', items.length);
      } else if (result.error) {
        console.error('Sidebar loadAll error', result.error);
      }
    } finally {
      loading = false;
      hasAttemptedLoad = true;
    }
  }

  $effect(() => {
    if (initialItems && initialItems.length > 0) {
      items = initialItems;
      hasAttemptedLoad = true;
    } else if (!hasAttemptedLoad && !loading) {
      loadAll();
    }
  });

  const groupedItems = $derived.by(() => {
    const groups: Record<string, Markdown[]> = {};

    const sortedItems = [...items].sort((a, b) => {
      const linkCompare = a.link.localeCompare(b.link);
      if (linkCompare !== 0) {
        return linkCompare;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    for (const item of sortedItems) {
      const lastSlashIndex = item.link.lastIndexOf('/');
      const prefix = lastSlashIndex !== -1 ? item.link.substring(0, lastSlashIndex + 1) : '';

      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(item);
    }

    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((prefix) => ({
        prefix,
        items: groups[prefix],
      }));
  });

  function formatDate(date: Date | string) {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  function getSnippet(content: string | null | undefined) {
    if (!content) return '';
    return content.slice(0, 30) + (content.length > 30 ? '...' : '');
  }

  export function upsertItem(item: Markdown) {
    const index = items.findIndex((i) => i.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items = [item, ...items];
    }
  }
</script>

<div class="h-full flex flex-col w-full">
  <div class="p-4 border-b border-[--koala-border] font-bold text-lg flex justify-between items-center">
    <span>Files</span>
    <span class="text-xs text-[--koala-subtext-0]">{items.length} loaded</span>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#each groupedItems as group}
      {#if group.prefix}
        <div class="p-2 pt-4 pl-3 text-xs font-bold text-[--koala-subtext-0] border-b border-[--koala-border-subtle]">
          {group.prefix}
        </div>
      {/if}
      {#each group.items as item}
        <button
          class="outline-none border-none w-full text-left p-3 hover:bg-[--koala-hover-block] transition-colors
                 {item.id === currentId ? 'bg-[--koala-focusing-block]' : 'bg-transparent'}"
          onclick={() => onSelect(item)}
        >
          <div class="flex items-center gap-1 text-sm text-[--koala-subtext-0] mb-1">
            <span class="truncate">{item.link.substring(group.prefix.length)}.md</span>
          </div>

          <!-- <div class="font-medium text-sm truncate mb-1" title={item.subject}>{item.subject || 'Untitled'}</div> -->

          <div class="flex items-center gap-1 text-xs text-[--koala-subtext-0] mb-1">
            <Calendar size={12} />
            <span>{formatDate(item.createdAt)}</span>
          </div>

          <div class="text-xs text-[--koala-text] opacity-70 break-all">
            {getSnippet(item.content)}
          </div>
        </button>
      {/each}
    {/each}

    {#if items.length === 0 && !loading}
      <div class="p-4 text-center text-[--koala-subtext-0] text-sm">No files found.</div>
    {/if}
  </div>
</div>
