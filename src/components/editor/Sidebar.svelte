<script lang="ts">
  import type { Markdown } from '@/db/types';
  import { actions } from 'astro:actions';
  import { Plus, ChevronRight, ChevronDown, LoaderCircle, Trash2, X } from '@lucide/svelte';
  import { editorStore, notify } from './store.svelte';
  import FileItem from './FileItem.svelte';
  import { buildDocumentTree, getTrashedDocuments, type DocumentTreeNode } from './document-tree';

  interface Props {
    onSelect: (m: Markdown) => void;
    onCreate: (prefix: string) => void;
    onRefresh?: (prefix: string) => Promise<void> | void;
    onEmptyTrash: () => void;
    currentId: number;
  }

  let { onSelect, onCreate, onRefresh, onEmptyTrash, currentId }: Props = $props();

  const tree = $derived(buildDocumentTree(editorStore.items));
  const recycleBin = $derived(getTrashedDocuments(editorStore.items));

  // Folder expansion state
  let expandedFolders = $state<Record<string, boolean>>({});
  let refreshingFolders = $state<Record<string, boolean>>({});
  let recycleBinExpanded = $state(false);
  let emptyingTrash = $state(false);
  const pendingRefreshes = new Map<string, Promise<void>>();

  function getRefreshKey(path: string) {
    return path || '__root__';
  }

  async function refreshPath(path: string) {
    if (!onRefresh) return;

    const refreshKey = getRefreshKey(path);
    const pending = pendingRefreshes.get(refreshKey);
    if (pending) return pending;

    refreshingFolders[refreshKey] = true;

    const task = Promise.resolve(onRefresh(path))
      .catch((error) => {
        console.error(`Failed to refresh editor tree for path "${path}"`, error);
      })
      .finally(() => {
        pendingRefreshes.delete(refreshKey);
        refreshingFolders[refreshKey] = false;
      });

    pendingRefreshes.set(refreshKey, task);
    return task;
  }

  function toggleFolder(path: string) {
    const nextExpanded = !expandedFolders[path];
    expandedFolders[path] = nextExpanded;

    if (nextExpanded) {
      void refreshPath(path);
    }
  }

  function handleTopLevelFileSelect(item: Markdown) {
    onSelect(item);
    void refreshPath('');
  }

  function toggleRecycleBin() {
    recycleBinExpanded = !recycleBinExpanded;
    if (recycleBinExpanded) void refreshPath('');
  }

  async function handleEmptyTrash(event: MouseEvent) {
    event.stopPropagation();
    if (emptyingTrash || recycleBin.length === 0 || !window.confirm('Permanently delete every document in the recycle bin?')) return;

    emptyingTrash = true;
    const result = await actions.db.markdown.emptyTrash();
    emptyingTrash = false;
    if (result.error) {
      notify('error', result.error.message);
      return;
    }

    onEmptyTrash();
    notify('success', `Permanently deleted ${result.data?.count ?? 0} document(s)`, 3000);
  }

  // Auto-expand current item's path
  $effect(() => {
     if (currentId) {
         const currentItem = editorStore.items.find(i => i.id === currentId);
         if (currentItem) {
             const parts = currentItem.link.split('/');
             parts.pop(); // remove filename
             let path = '';
             for (const part of parts) {
                 path += part + '/';
                 if (expandedFolders[path] === undefined) {
                      expandedFolders[path] = true;
                 }
             }
         }
     }
  });

  function formatDate(date: Date | string | null) {
    if (!date) return '';
    return new Date(date).toLocaleString();
  }
</script>

{#snippet folderNode(node: DocumentTreeNode)}
  <div>
    {#if node.name}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div 
          class="flex items-center justify-between group cursor-pointer select-none p-2"
          onclick={() => toggleFolder(node.fullPath)}
          aria-roledescription="button"
        >
            <div class="flex items-center gap-1.5 text-sm font-medium text-[--koala-subtext-0]">
                {#if refreshingFolders[getRefreshKey(node.fullPath)]}
                    <LoaderCircle size={14} class="animate-spin" />
                {:else if expandedFolders[node.fullPath]}
                    <ChevronDown size={14} />
                {:else}
                    <ChevronRight size={14} />
                {/if}
                <span>{node.name}</span>
            </div>
            <button 
                class="outline-none border-none bg-transparent p-0.5 rounded cursor-pointer" 
                onclick={(e) => { e.stopPropagation(); onCreate(node.fullPath); }}
                title="Create new file in {node.name}"
            >
                <Plus size={14} class="text-[--koala-text]" />
            </button>
        </div>
    {/if}

    {#if !node.name || expandedFolders[node.fullPath]}
        <div class="{node.name ? 'border-l border-[--koala-border-subtle] ml-2 pl-2' : ''}">
            {#each Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
                {@render folderNode(child)}
            {/each}
            {#each node.items as item (item.id)}
                <FileItem {item} {currentId} {onSelect} />
            {/each}
        </div>
    {/if}
  </div>
{/snippet}


<div class="h-full flex flex-col w-full overflow-y-auto">
  {#if editorStore.items.length === 0 && !editorStore.loading}
    <div class="p-4 text-center text-[--koala-subtext-0] text-sm">No files found.</div>
  {:else}
      {#each Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
            {@render folderNode(child)}
      {/each}
      {#each tree.items as item (item.id)}
            <FileItem {item} {currentId} onSelect={handleTopLevelFileSelect} />
      {/each}
  {/if}

  <button
    class="outline-none border-none w-full text-left p-2 hover:bg-[--koala-hover-block] transition-colors
           bg-transparent relative flex items-center gap-1.5 rounded opacity-60 italic shrink-0"
    onclick={() => onCreate('')}
  >
      <Plus size={14} class="shrink-0 text-[--koala-text]" />
      <span class="truncate text-sm text-[--koala-text]">New file...</span>
  </button>

  {#if recycleBin.length > 0}
    <div class="mt-auto border-t border-[--koala-border-subtle] pt-1">
      <div class="flex items-center gap-1 p-1">
        <button
          class="outline-none border-none bg-transparent flex-1 min-w-0 p-1 flex items-center gap-1.5 text-left"
          onclick={toggleRecycleBin}
          title="Recycle bin"
        >
          <Trash2 size={20} />
          <span class="truncate text-sm text-[--koala-subtext-0]">Recycle Bin:</span>
          <span class="text-sm text-[--koala-subtext-0]">{recycleBin.length}</span>
        </button>
        <button
          class="icon btn !p-1 !text-[--koala-error-text]"
          onclick={handleEmptyTrash}
          disabled={emptyingTrash}
          aria-label="Empty recycle bin"
          title="Empty recycle bin"
        >
          {#if emptyingTrash}<LoaderCircle size={20} class="animate-spin" />{:else}<X size={20} />{/if}
        </button>
      </div>

      {#if recycleBinExpanded}
        <div class="border-l border-[--koala-border-subtle] ml-2 pl-2">
          {#each recycleBin as item (item.id)}
            <button
              class="outline-none border-none w-full text-left px-2 py-1.5 hover:bg-[--koala-hover-block] transition-colors
                     {item.id === currentId ? 'bg-[--koala-focusing-block]' : 'bg-transparent'} rounded"
              onclick={() => onSelect(item)}
              title={`${item.link} · ${formatDate(item.deletedAt)} · #${item.id}`}
            >
              <span class="block truncate text-sm text-[--koala-text]">{item.link.split('/').pop() || item.link}.md</span>
              <span class="block truncate text-xs text-[--koala-subtext-0]">{item.link} · {formatDate(item.deletedAt)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
