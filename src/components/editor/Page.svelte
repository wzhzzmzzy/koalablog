<script lang="ts">
  import { actions } from 'astro:actions';
  import type { FileRecord } from '@/db/types';
  import type { AbsolutePathPrefix } from '@/lib/files/types';
  import { tick } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import Notification from './Notification.svelte';
  import { discardEditorState } from './TextEditor.svelte';
  import { initializeEditBuffers, useEditBufferPersistence } from './edit-buffer.svelte';
  import { editorStore, setItems, setCurrentFile, upsertItem, pushHistory, updateLastHistory, replaceItemsByPrefix, notify, toggleSidebar, setShowSidebar, useSidebarPersistence, SIDEBAR_STORAGE_KEY, removeItem, removeTrashedItems } from './store.svelte';
  import { formatFileSaveError } from './utils';

  interface Props {
    initialFile: FileRecord | null;
    initialItems?: FileRecord[] | null;
    templatePrefixes?: AbsolutePathPrefix[];
    isMobile?: boolean;
  }

  let { initialFile, initialItems = null, templatePrefixes = [], isMobile = false }: Props = $props();

  // 统一初始化 Store
  if (initialItems) {
    initializeEditBuffers(initialItems);
    setItems(initialItems);
  }

  // 启用自动持久化
  useEditBufferPersistence();
  useSidebarPersistence();

  // Only override sidebar if no stored preference exists or it's mobile
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_STORAGE_KEY) === null) {
    setShowSidebar(!isMobile);
  } else if (isMobile) {
    // Force sidebar closed on mobile initialization for better UX
    setShowSidebar(false);
  }
  
  // Init History and Current
  if (initialFile && !initialFile.deletedAt) pushHistory(initialFile.path);
  setCurrentFile(initialFile);

  // Sync URL with the current File.
  $effect(() => {
    if (editorStore.currentFile) {
      const url = new URL(window.location.href);
      if (editorStore.currentFile.deletedAt) {
        url.searchParams.delete('path');
        url.searchParams.set('id', String(editorStore.currentFile.id));
      } else if (url.searchParams.get('path') !== editorStore.currentFile.path || url.searchParams.has('id')) {
        url.searchParams.set('path', editorStore.currentFile.path);
        url.searchParams.delete('id');
      }
      if (url.href !== window.location.href) window.history.pushState({}, '', url);
    }
  });

  function handleSelect(m: FileRecord) {
    if (!m.deletedAt && m.path) pushHistory(m.path);
    setCurrentFile(m);

    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }

  function handleSave(m: FileRecord) {
    updateLastHistory(m.path);
    setCurrentFile(m);
    upsertItem(m);
  }

  function handleUpdate(m: FileRecord) {
    setCurrentFile(m);
    upsertItem(m);
  }

  function selectFallback() {
    const fallback = editorStore.items.find(item => !item.deletedAt) ?? null;
    setCurrentFile(fallback);
  }

  function handlePurge(id: number) {
    const purgedCurrent = editorStore.currentFile?.id === id;
    discardEditorState(id);
    removeItem(id);
    if (purgedCurrent) selectFallback();
  }

  function handleEmptyTrash() {
    const removedCurrent = Boolean(editorStore.currentFile?.deletedAt);
    for (const file of editorStore.items) {
      if (file.deletedAt) discardEditorState(file.id);
    }
    removeTrashedItems();
    if (removedCurrent) selectFallback();
  }

  async function handleRefresh(prefix: string) {
    const result = await actions.db.markdown.byPrefix({ prefix });

    if (result.error) {
      console.error(`Failed to refresh sidebar items for prefix "${prefix}"`, result.error);
      notify('error', 'Failed to refresh sidebar');
      return;
    }

    replaceItemsByPrefix(prefix, result.data || []);
  }

  async function createNew(targetPrefix: AbsolutePathPrefix) {
    const result = await actions.db.markdown.create({ targetPrefix });
    if (result.error || !result.data) {
      notify('error', result.error ? formatFileSaveError(result.error) : 'File creation failed');
      return;
    }

    const file = result.data;
    upsertItem(file);
    pushHistory(file.path);
    setCurrentFile(file);
    notify('success', `Created ${file.path}`, 3000);
    if (window.innerWidth < 768) setShowSidebar(false);
    await tick();
    document.querySelector<HTMLInputElement>('#path-input')?.focus();
  }
</script>

<div class="flex h-screen overflow-hidden w-full">
    <Notification />
    <!-- Sidebar Container -->
    <div class="{editorStore.showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col shrink-0 h-screen">
        <div class="flex-1 overflow-hidden pt-5">
             <Sidebar
                currentId={editorStore.currentFile?.id || 0}
                {templatePrefixes}
                onSelect={handleSelect}
                onCreate={createNew}
                onRefresh={handleRefresh}
                onEmptyTrash={handleEmptyTrash}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#if editorStore.currentFile}
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8 flex flex-col">
                 <Editor 
                    file={editorStore.currentFile}
                    onSave={handleSave}
                    onUpdate={handleUpdate}
                    onPurge={handlePurge}
                 />
             </div>
        {/if}
    </div>
</div>
