<script lang="ts">
  import { actions } from 'astro:actions';
  import type { FileRecord } from '@/db/types';
  import type { AbsolutePathPrefix } from '@/lib/files/types';
  import { FolderOpen, Plus } from '@lucide/svelte';
  import { tick } from 'svelte';
  import '@/styles/editor-workspace.css';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import Notification from './Notification.svelte';
  import { discardEditorState } from './TextEditor.svelte';
  import { initializeEditBuffers, useEditBufferPersistence } from './edit-buffer.svelte';
  import { editorStore, hasStoredSidebarPreference, setItems, setCurrentFile, upsertItem, pushHistory, updateLastHistory, replaceItemsByPrefix, notify, setShowSidebar, removeItem, removeTrashedItems } from './store.svelte';
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

  // New mobile sessions begin with File Explorer closed, but an explicit toolbar
  // preference must survive navigation and reloads at every viewport size.
  if (!hasStoredSidebarPreference()) {
    setShowSidebar(!isMobile);
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

  function backToDashboard(event: MouseEvent) {
    event.preventDefault();
    window.location.href = '/dashboard';
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

<div class="editor-workspace">
  <Notification />

  <aside
    data-testid="editor-sidebar"
    class="editor-workspace__sidebar {editorStore.showSidebar ? 'w-64' : 'w-0'}"
    aria-label="File Explorer"
  >
    <div class="editor-workspace__sidebar-inner">
      <Sidebar
        currentId={editorStore.currentFile?.id || 0}
        {templatePrefixes}
        onSelect={handleSelect}
        onCreate={createNew}
        onRefresh={handleRefresh}
        onEmptyTrash={handleEmptyTrash}
      />
    </div>
  </aside>

  {#if editorStore.showSidebar}
    <button
      type="button"
      class="editor-workspace__sidebar-scrim"
      aria-label="Close File Explorer"
      onclick={() => setShowSidebar(false)}
    ></button>
  {/if}

  <main class="editor-workspace__main">
    <div class="editor-workspace__document">
      {#if editorStore.currentFile}
        <Editor
          file={editorStore.currentFile}
          onSave={handleSave}
          onUpdate={handleUpdate}
          onPurge={handlePurge}
        />
      {:else}
        <div class="editor-empty-layout">
          <EditorToolbar file={null} onBackToDashboard={backToDashboard} />
          <section class="editor-empty-state" aria-labelledby="editor-empty-state-title">
            <div class="editor-empty-state__icon" aria-hidden="true"><FolderOpen size={28} /></div>
            <h1 id="editor-empty-state-title">Choose a File to begin</h1>
            <p>Open a File from File Explorer, or create one to start writing in a focused workspace.</p>
            <button type="button" class="editor-empty-state__action" onclick={() => setShowSidebar(true)}>
              <Plus size={17} />
              <span>Open File Explorer</span>
            </button>
          </section>
        </div>
      {/if}
    </div>
  </main>
</div>
