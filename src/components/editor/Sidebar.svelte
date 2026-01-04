<script lang="ts">
  import { actions } from 'astro:actions';
  import { onMount } from 'svelte';
  import type { Markdown } from '@/db/types';
  import { MarkdownSource, getMarkdownSourceKey } from '@/db';
  import { FileText, Calendar, Link as LinkIcon, Hash } from '@lucide/svelte';

  interface Props {
    source: MarkdownSource;
    onSelect: (m: Markdown) => void;
    currentId: number;
    initialItems?: Markdown[] | null;
  }

  let { source, onSelect, currentId, initialItems = null }: Props = $props();

  let items = $state<Markdown[]>([]);
  let loading = $state(false);
  let hasAttemptedLoad = $state(false);

  async function loadAll() {
    if (loading) return;
    loading = true;

    try {
      const key = getMarkdownSourceKey(source);
      const sourceType = (key && ['posts', 'pages', 'memos'].includes(key)) ? key.slice(0, -1) : 'all';
      
      console.log('Sidebar loadAll', { source, key, sourceType });

      const result = await actions.db.markdown.all({
        source: sourceType as 'post' | 'page' | 'memo' | 'all'
      });

      if (result.data) {
        let newItems: Markdown[] = [];
        if (key && ['posts', 'pages', 'memos'].includes(key)) {
          // @ts-ignore
          newItems = result.data[key] || [];
        } else {
          newItems = [...(result.data.posts || []), ...(result.data.pages || []), ...(result.data.memos || [])];
        }
        items = newItems;
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
    // If source changes, reset load attempt flag
    // This allows re-loading for different sources if needed
    void source; 
    hasAttemptedLoad = false;
  });

  $effect(() => {
    if (initialItems && initialItems.length > 0) {
      items = initialItems;
      hasAttemptedLoad = true;
    } else if (!hasAttemptedLoad && !loading) {
      loadAll();
    }
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
    const index = items.findIndex(i => i.id === item.id);
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
    {#each items as item}
      <button
        class="w-full text-left p-3 border-b border-[--koala-border] hover:bg-[--koala-surface-1] transition-colors
               {item.id === currentId ? 'bg-[--koala-surface-1] border-l-4 border-l-[--koala-primary]' : ''} "
        onclick={() => onSelect(item)}
      >
        <div class="font-medium text-sm truncate mb-1" title={item.subject}>{item.subject || 'Untitled'}</div>

        <div class="flex items-center gap-1 text-xs text-[--koala-subtext-0] mb-1">
          <LinkIcon size={12} />
          <span class="truncate">{item.link}</span>
        </div>

        <div class="flex items-center gap-1 text-xs text-[--koala-subtext-0] mb-1">
          <Calendar size={12} />
          <span>{formatDate(item.createdAt)}</span>
        </div>

        <div class="text-xs text-[--koala-text] opacity-70 break-all">
          {getSnippet(item.content)}
        </div>
      </button>
    {/each}

    {#if items.length === 0}
      <div class="p-4 text-center text-[--koala-subtext-0] text-sm">
        No files found.
      </div>
    {/if}
  </div>
</div>