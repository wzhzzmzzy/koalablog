<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import type { AbsolutePathPrefix } from '@/lib/files/types';
  import { actions } from 'astro:actions';
  import { Plus, ChevronRight, ChevronDown, LoaderCircle, Trash2, X } from '@lucide/svelte';
  import { editorStore, notify } from './store.svelte';
  import FileItem from './FileItem.svelte';
  import { buildFileTree, getTrashedFiles, isFileTreeEmpty, type FileTreeNode } from './file-tree';

  interface Props {
    onSelect: (file: FileRecord) => void;
    onCreate: (prefix: AbsolutePathPrefix) => void;
    onRefresh?: (prefix: string) => Promise<void> | void;
    onEmptyTrash: () => void;
    currentId: number;
    templatePrefixes?: AbsolutePathPrefix[];
  }

  let { onSelect, onCreate, onRefresh, onEmptyTrash, currentId, templatePrefixes = [] }: Props = $props();

  const tree = $derived(buildFileTree(editorStore.items, templatePrefixes));
  const recycleBin = $derived(getTrashedFiles(editorStore.items));
  const activeFileCount = $derived(editorStore.items.filter(item => !item.deletedAt).length);

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

  function handleTopLevelFileSelect(item: FileRecord) {
    onSelect(item);
    void refreshPath('/');
  }

  function toggleRecycleBin() {
    recycleBinExpanded = !recycleBinExpanded;
    if (recycleBinExpanded) void refreshPath('/');
  }

  async function handleEmptyTrash(event: MouseEvent) {
    event.stopPropagation();
    if (emptyingTrash || recycleBin.length === 0 || !window.confirm('Permanently delete every File in the recycle bin?')) return;

    emptyingTrash = true;
    const result = await actions.db.markdown.emptyTrash();
    emptyingTrash = false;
    if (result.error) {
      notify('error', result.error.message);
      return;
    }

    onEmptyTrash();
    notify('success', `Permanently deleted ${result.data?.count ?? 0} File(s)`, 3000);
  }

  // Auto-expand current item's path
  $effect(() => {
     if (currentId) {
         const currentItem = editorStore.items.find(i => i.id === currentId);
         if (currentItem) {
             const parts = currentItem.path.split('/').filter(Boolean);
             parts.pop(); // remove filename
             let path = '';
             for (const part of parts) {
                 path += `/${part}`;
                 const prefix = `${path}/`;
                 if (expandedFolders[prefix] === undefined) {
                      expandedFolders[prefix] = true;
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

{#snippet folderNode(node: FileTreeNode)}
  <div class="editor-tree-branch">
    {#if node.name}
        <div class="editor-tree-folder">
          <button
            type="button"
            class="editor-tree-folder__toggle"
            onclick={() => toggleFolder(node.prefix)}
            aria-expanded={Boolean(expandedFolders[node.prefix])}
          >
            {#if refreshingFolders[getRefreshKey(node.prefix)]}
              <LoaderCircle size={14} class="animate-spin" />
            {:else if expandedFolders[node.prefix]}
              <ChevronDown size={14} />
            {:else}
              <ChevronRight size={14} />
            {/if}
            <span>{node.name}</span>
          </button>
          <button
            type="button"
            class="editor-tree-folder__create"
            onclick={() => onCreate(node.prefix)}
            aria-label="Create new file in {node.name}"
            title="Create new file in {node.name}"
          >
            <Plus size={15} />
          </button>
        </div>
    {/if}

    {#if !node.name || expandedFolders[node.prefix]}
        <div class="{node.name ? 'editor-tree-children' : ''}">
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


<div class="editor-sidebar">
  <header class="editor-sidebar__header">
    <div class="editor-sidebar__heading">
      <span>File Explorer</span>
      <span class="editor-sidebar__count">{activeFileCount}</span>
    </div>
    <button
      type="button"
      class="editor-sidebar__new-button"
      onclick={() => onCreate('/')}
      aria-label="Create new File"
      title="Create new File"
    >
      <Plus size={15} />
      <span>New</span>
    </button>
  </header>

  <div class="editor-sidebar__tree">
    {#if isFileTreeEmpty(tree) && !editorStore.loading}
      <div class="editor-sidebar__empty">No Files found.</div>
    {:else}
        {#each Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
              {@render folderNode(child)}
        {/each}
        {#each tree.items as item (item.id)}
              <FileItem {item} {currentId} onSelect={handleTopLevelFileSelect} />
        {/each}
    {/if}

    <button
      type="button"
      class="editor-sidebar__new-file"
      onclick={() => onCreate('/')}
    >
      <Plus size={15} />
      <span>New File</span>
    </button>
  </div>

  {#if recycleBin.length > 0}
    <section class="editor-recycle-bin" aria-label="Recycle bin">
      <div class="editor-recycle-bin__header">
        <button
          type="button"
          class="editor-recycle-bin__toggle"
          onclick={toggleRecycleBin}
          aria-expanded={recycleBinExpanded}
          title="Recycle bin"
        >
          {#if recycleBinExpanded}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}
          <Trash2 size={16} />
          <span>Recycle Bin</span>
          <span class="editor-sidebar__count">{recycleBin.length}</span>
        </button>
        <button
          type="button"
          class="editor-recycle-bin__clear"
          onclick={handleEmptyTrash}
          disabled={emptyingTrash}
          aria-label="Empty recycle bin"
          title="Empty recycle bin"
        >
          {#if emptyingTrash}<LoaderCircle size={17} class="animate-spin" />{:else}<X size={17} />{/if}
        </button>
      </div>

      {#if recycleBinExpanded}
        <div class="editor-recycle-bin__items">
          {#each recycleBin as item (item.id)}
            <button
              type="button"
              class="editor-recycle-bin__item"
              onclick={() => onSelect(item)}
              aria-current={item.id === currentId ? 'page' : undefined}
              title={`${item.path} · ${formatDate(item.deletedAt)} · #${item.id}`}
            >
              <span class="editor-recycle-bin__item-title">{item.title}</span>
              <span class="editor-recycle-bin__item-meta">{item.path} · {formatDate(item.deletedAt)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
