<script lang="ts">
  import type { FileRecord } from '@/db/types';
  import type { AbsolutePathPrefix } from '@/lib/files/types';
  import { actions } from 'astro:actions';
  import { Plus, ChevronRight, ChevronDown, LoaderCircle, Trash2, X, Search, FileText } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { editorStore, notify } from './store.svelte';
  import { editBuffers } from './edit-buffer.svelte';
  import { highlightSearchText, searchFiles } from './instant-search';
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
  let searchInput: HTMLInputElement | undefined = $state();
  let query = $state('');
  let activeQuery = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const searchPending = $derived(query !== activeQuery);
  const searchMode = $derived(query.length > 0);
  const searchResponse = $derived(searchFiles(editorStore.items, activeQuery, editBuffers));

  // Folder expansion state
  let expandedFolders = $state<Record<string, boolean>>({});
  let refreshingFolders = $state<Record<string, boolean>>({});
  let recycleBinExpanded = $state(false);
  let emptyingTrash = $state(false);
  const pendingRefreshes = new Map<string, Promise<void>>();

  $effect(() => {
    const nextQuery = query;
    if (searchTimer)
      clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      activeQuery = nextQuery;
    }, 80);

    return () => {
      if (searchTimer)
        clearTimeout(searchTimer);
    };
  });

  export function focusSearch() {
    void tick().then(() => {
      searchInput?.focus();
      searchInput?.select();
    });
  }

  function clearSearch() {
    query = '';
    activeQuery = '';
    if (searchTimer)
      clearTimeout(searchTimer);
    searchInput?.focus();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape')
      return;
    event.preventDefault();
    if (query) {
      clearSearch();
      return;
    }
    searchInput?.blur();
  }

  function matchLabel(kind: 'path' | 'tag' | 'source') {
    if (kind === 'path') return 'Path';
    if (kind === 'tag') return 'Tag';
    return 'Source';
  }

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

  function handleSearchResultSelect(item: FileRecord) {
    onSelect(item);
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

  <div class="editor-sidebar__search" data-testid="editor-instant-search">
    <Search size={15} aria-hidden="true" />
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      autocomplete="off"
      spellcheck="false"
      aria-label="Search Files"
      placeholder="Search Files"
      onkeydown={handleSearchKeydown}
    />
    {#if query}
      <button
        type="button"
        class="editor-sidebar__search-clear"
        aria-label="Clear File search"
        title="Clear search"
        onclick={clearSearch}
      >
        <X size={14} />
      </button>
    {:else}
      <kbd class="editor-sidebar__search-shortcut" aria-label="Command or Control K">⌘K</kbd>
    {/if}
  </div>

  <div class="editor-sidebar__tree">
    {#if searchMode}
      {#if searchPending}
        <div class="editor-sidebar__search-state" aria-live="polite">Searching Files…</div>
      {:else if searchResponse.total === 0}
        <div class="editor-sidebar__search-empty" aria-live="polite">
          <Search size={17} aria-hidden="true" />
          <strong>No matching active Files</strong>
          <span>Searches Path, Tags, and Source. Recycle Bin is excluded.</span>
        </div>
      {:else}
        <div class="editor-sidebar__search-summary" aria-live="polite">
          <span>{searchResponse.total} {searchResponse.total === 1 ? 'result' : 'results'}</span>
          {#if searchResponse.total > searchResponse.results.length}
            <span>Showing {searchResponse.results.length}</span>
          {/if}
        </div>
        <div class="editor-sidebar__search-results">
          {#each searchResponse.results as result (result.file.id)}
            <button
              type="button"
              class="editor-search-result"
              aria-current={result.file.id === currentId ? 'page' : undefined}
              title={result.path}
              onclick={() => handleSearchResultSelect(result.file)}
            >
              <span class="editor-search-result__title-row">
                <FileText size={14} class="editor-file-tree__item-icon" />
                <span class="editor-search-result__title">
                  {#each highlightSearchText(result.title, activeQuery) as segment}
                    {#if segment.matched}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
                  {/each}
                </span>
                {#if result.dirty}<span class="editor-file-tree__dirty" aria-label="Unsaved changes"></span>{/if}
              </span>
              <span class="editor-search-result__path">
                {#each highlightSearchText(result.path, activeQuery) as segment}
                  {#if segment.matched}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
                {/each}
              </span>
              <span class="editor-search-result__matches" aria-label={`Matches in ${result.matches.map(matchLabel).join(', ')}`}>
                {#each result.matches as match}
                  <span data-match-kind={match}>{matchLabel(match)}</span>
                {/each}
                {#each result.matchedTags as tag}
                  <span class="editor-search-result__tag">#{tag}</span>
                {/each}
              </span>
              {#if result.sourceSnippet}
                <span class="editor-search-result__snippet">
                  {#each highlightSearchText(result.sourceSnippet, activeQuery) as segment}
                    {#if segment.matched}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
                  {/each}
                </span>
                {#if result.sourceMatchCount > 1}
                  <span class="editor-search-result__count">{result.sourceMatchCount} matches</span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else if isFileTreeEmpty(tree) && !editorStore.loading}
      <div class="editor-sidebar__empty">No Files found.</div>
    {:else}
        {#each Object.values(tree.children).sort((a, b) => a.name.localeCompare(b.name)) as child}
              {@render folderNode(child)}
        {/each}
        {#each tree.items as item (item.id)}
              <FileItem {item} {currentId} onSelect={handleTopLevelFileSelect} />
        {/each}
    {/if}

    {#if !searchMode}
      <button
        type="button"
        class="editor-sidebar__new-file"
        onclick={() => onCreate('/')}
      >
        <Plus size={15} />
        <span>New File</span>
      </button>
    {/if}
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
