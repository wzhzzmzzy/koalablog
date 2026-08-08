<script lang="ts">
  import { actions } from 'astro:actions';
  import type { FileRecord } from '@/db/types';
  import type { AbsolutePathPrefix } from '@/lib/files/types';
  import { FolderOpen, Plus } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import '@/styles/editor-workspace.css';
  import Sidebar from './Sidebar.svelte';
  import FileFinder from './FileFinder.svelte';
  import Editor from './index.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import Notification from './Notification.svelte';
  import { discardEditorState } from './TextEditor.svelte';
  import { initializeEditBuffers, useEditBufferPersistence } from './edit-buffer.svelte';
  import { getMarkdownSourceKey } from '@/db';
  import { editorRecentFiles } from './recent-files.svelte';
  import { createWorkspaceNavigation } from './workspace-navigation.svelte';
  import { editorStore, hasStoredSidebarPreference, setItems, setCurrentFile, upsertItem, replaceItemsByPrefix, notify, setShowSidebar, removeItem, removeTrashedItems } from './store.svelte';
  import { formatFileSaveError } from './utils';

  interface Props {
    initialFile: FileRecord | null;
    initialItems?: FileRecord[] | null;
    templatePrefixes?: AbsolutePathPrefix[];
    isMobile?: boolean;
  }

  let { initialFile, initialItems = null, templatePrefixes = [], isMobile = false }: Props = $props();
  let finderOpen = $state(false);
  let editor: { focus: () => void } | undefined = $state();

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
  
  setCurrentFile(initialFile);

  const workspaceNavigation = createWorkspaceNavigation({
    initialFile,
    getFiles: () => editorStore.items,
    getCurrentFile: () => editorStore.currentFile,
    select: setCurrentFile,
    isMobile: () => window.innerWidth < 768,
    closeSidebar: () => setShowSidebar(false),
    recordRecent: editorRecentFiles.record,
    dashboardUrl: file => file ? `/dashboard/${getMarkdownSourceKey(file.source)}` : '/dashboard',
    focusIntent: () => {
      void tick().then(() => {
        const preview = document.querySelector<HTMLElement>('.editor-view-layout--preview .editor-markdown-preview')
        if (preview)
          preview.focus()
        else
          editor?.focus()
      })
    },
  });
  const recentFiles = $derived(editorRecentFiles.resolve(editorStore.items));

  onMount(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
        return;
      event.preventDefault();
      finderOpen = true;
    };

    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  });

  function handleSelect(m: FileRecord) {
    workspaceNavigation.open(m);
  }

  function backToDashboard(event: MouseEvent) {
    event.preventDefault();
    window.location.href = '/dashboard';
  }

  function handleSave(m: FileRecord) {
    upsertItem(m);
    setCurrentFile(m);
  }

  function handleUpdate(m: FileRecord) {
    upsertItem(m);
    setCurrentFile(m);
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
    workspaceNavigation.open(file);
    notify('success', `Created ${file.path}`, 3000);
    if (window.innerWidth < 768) setShowSidebar(false);
    await tick();
    editor?.focus();
  }
</script>

<div class="editor-workspace">
  <Notification />
  <FileFinder
    open={finderOpen}
    files={editorStore.items}
    {recentFiles}
    onOpen={file => workspaceNavigation.open(file)}
    onClose={() => { finderOpen = false; }}
  />

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
          bind:this={editor}
          file={editorStore.currentFile}
          onSave={handleSave}
          onUpdate={handleUpdate}
          onPurge={handlePurge}
          onBack={() => workspaceNavigation.back()}
          onOpenReference={file => workspaceNavigation.open(file)}
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
