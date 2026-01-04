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
  }

  let { source, onSelect, currentId }: Props = $props();

  let items = $state<Markdown[]>([]);
  let offset = $state(0);
  const limit = 20;
  let hasMore = $state(true);
  let loading = $state(false);

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    
    const key = getMarkdownSourceKey(source);
    // Determine source string for action
    // We only support post, page, memo for specific filtering. Fallback to 'all'.
    const sourceType = (key && ['posts', 'pages', 'memos'].includes(key)) ? key.slice(0, -1) : 'all';
    
    const result = await actions.db.markdown.all({ 
      source: sourceType, 
      limit, 
      offset 
    });

    if (result.data) {
      let newItems: Markdown[] = [];
      if (key && ['posts', 'pages', 'memos'].includes(key)) {
        // @ts-ignore
         newItems = result.data[key] || [];
      } else {
         newItems = [...(result.data.posts || []), ...(result.data.pages || []), ...(result.data.memos || [])];
      }
      
      if (newItems.length < limit) {
        hasMore = false;
      }
      items = [...items, ...newItems];
      offset += limit;
    } else if (result.error) {
        console.error(result.error);
    }
    loading = false;
  }

  function formatDate(date: Date | string) {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  function getSnippet(content: string | null | undefined) {
    if (!content) return '';
    return content.slice(0, 10) + (content.length > 10 ? '...' : '');
  }

  onMount(() => {
    loadMore();
  });
</script>

<div class="h-full flex flex-col border-r border-[--koala-border] bg-[--koala-surface-0] w-64">
  <div class="p-4 border-b border-[--koala-border] font-bold text-lg flex justify-between items-center">
    <span>Files</span>
    <span class="text-xs text-[--koala-subtext-0]">{items.length} loaded</span>
  </div>
  
  <div class="flex-1 overflow-y-auto">
    {#each items as item}
      <button 
        class="w-full text-left p-3 border-b border-[--koala-border] hover:bg-[--koala-surface-1] transition-colors
               {item.id === currentId ? 'bg-[--koala-surface-1] border-l-4 border-l-[--koala-primary]' : ''}"
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

    {#if hasMore}
      <button 
        class="w-full p-3 text-sm text-[--koala-primary] hover:underline disabled:opacity-50"
        onclick={loadMore}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Load More'}
      </button>
    {:else if items.length === 0}
        <div class="p-4 text-center text-[--koala-subtext-0] text-sm">
            No files found.
        </div>
    {/if}
  </div>
</div>
