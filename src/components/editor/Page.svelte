<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromPath } from '@/db';
  import type { FileRecord } from '@/db/types';
  import { initFileRecord } from '@/db/types';
  import { deriveTitle, parseAbsoluteFilePath } from '@/lib/files/path';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import Notification from './Notification.svelte';
  import { editorStore, setItems, setCurrentMarkdown, upsertItem, pushHistory, updateLastHistory, replaceItemsByPrefix, drafts, notify, toggleSidebar, setShowSidebar, useEditorPersistence, SIDEBAR_STORAGE_KEY, removeItem, removeTrashedItems } from './store.svelte';

  interface Props {
    initialMarkdown: FileRecord;
    initialItems?: FileRecord[] | null;
    isMobile?: boolean;
  }

  let { initialMarkdown, initialItems = null, isMobile = false }: Props = $props();

  // 启用自动持久化
  useEditorPersistence();

  // 统一初始化 Store
  if (initialItems) {
    setItems(initialItems);
  }

  // Only override sidebar if no stored preference exists or it's mobile
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_STORAGE_KEY) === null) {
    setShowSidebar(!isMobile);
  } else if (isMobile) {
    // Force sidebar closed on mobile initialization for better UX
    setShowSidebar(false);
  }
  
  // Init History and Current
  if (!initialMarkdown.deletedAt) pushHistory(initialMarkdown.path);
  setCurrentMarkdown(initialMarkdown);

  // Sync URL with currentMarkdown
  $effect(() => {
    if (editorStore.currentMarkdown) {
      const url = new URL(window.location.href);
      if (editorStore.currentMarkdown.deletedAt) {
        url.searchParams.delete('path');
        url.searchParams.set('id', String(editorStore.currentMarkdown.id));
      } else if (url.searchParams.get('path') !== editorStore.currentMarkdown.path || url.searchParams.has('id')) {
        url.searchParams.set('path', editorStore.currentMarkdown.path);
        url.searchParams.delete('id');
      }
      if (url.href !== window.location.href) window.history.pushState({}, '', url);
    }
  });

  function handleSelect(m: FileRecord) {
    if (!m.deletedAt && m.path) pushHistory(m.path);
    if (!m.deletedAt && drafts.has(m.path)) {
      setCurrentMarkdown(drafts.get(m.path)!)
    } else {
      setCurrentMarkdown(m);
    }

    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }

  function handleSave(m: FileRecord) {
    updateLastHistory(m.path);
    setCurrentMarkdown(m);
    upsertItem(m);
  }

  function handleUpdate(m: FileRecord) {
    setCurrentMarkdown(m);
    upsertItem(m);
  }

  function selectFallback() {
    const fallback = editorStore.items.find(item => !item.deletedAt) ?? initFileRecord();
    setCurrentMarkdown(fallback);
  }

  function handlePurge(id: number) {
    const purgedCurrent = editorStore.currentMarkdown?.id === id;
    removeItem(id);
    if (purgedCurrent) selectFallback();
  }

  function handleEmptyTrash() {
    const removedCurrent = Boolean(editorStore.currentMarkdown?.deletedAt);
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

  async function createNew(prefix: string) {
    const targetSource = getSourceFromPath(prefix);
    const newFile = initFileRecord(targetSource);

    const setPath = (path: string) => {
      const parsed = parseAbsoluteFilePath(path);
      if (!parsed.ok) return;
      newFile.path = parsed.value;
      newFile.title = deriveTitle(parsed.value);
    };
    
    if (targetSource === MarkdownSource.Memo) {
      const result = await actions.db.markdown.getNewMemoTitle();
      if (result.data) {
        setPath(`${prefix}${result.data}`)
        newFile.private = true
      } else if (result.error) {
          console.error('Error fetching memo Title', result.error);
      }
    } else {
      let baseName = 'unnamed';
      let counter = 0;
      let candidate = `${prefix}${baseName}`;
      
      const exists = (path: string) => editorStore.items.some(i => !i.deletedAt && i.path === path);

      while(exists(candidate)) {
        counter++;
        candidate = `${prefix}${baseName}-${counter}`;
      }
      setPath(candidate);
    }
    setCurrentMarkdown(newFile);
  }
</script>

<div class="flex flex-1 h-full overflow-hidden w-full">
    <Notification />
    <!-- Sidebar Container -->
    <div class="{editorStore.showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col shrink-0 h-screen">
        <div class="flex-1 overflow-hidden pt-5">
             <Sidebar
                currentId={editorStore.currentMarkdown?.id || 0}
                onSelect={handleSelect}
                onCreate={createNew}
                onRefresh={handleRefresh}
                onEmptyTrash={handleEmptyTrash}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#if editorStore.currentMarkdown}
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8 flex flex-col">
                 <Editor 
                    markdown={editorStore.currentMarkdown} 
                    onSave={handleSave}
                    onUpdate={handleUpdate}
                    onPurge={handlePurge}
                 />
             </div>
        {/if}
    </div>
</div>
