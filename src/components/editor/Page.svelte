<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromLink } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import CartaEditor from './CartaEditor.svelte';
  import Notification from './Notification.svelte';
  import { editorStore, setItems, setCurrentMarkdown, upsertItem, pushHistory, updateLastHistory, drafts, toggleSidebar, setShowSidebar, useEditorPersistence, SIDEBAR_STORAGE_KEY } from './store.svelte';

  interface Props {
    initialMarkdown: Markdown;
    initialItems?: Markdown[] | null;
    isMobile?: boolean;
    editorPref?: 'textarea' | 'carta';
  }

  let { initialMarkdown, initialItems = null, isMobile = false, editorPref = 'textarea' }: Props = $props();

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
  pushHistory(initialMarkdown.link);
  setCurrentMarkdown(initialMarkdown);

  // Sync URL with currentMarkdown
  $effect(() => {
    if (editorStore.currentMarkdown) {
      const url = new URL(window.location.href);
      const currentLink = url.searchParams.get('link');
      const currentId = url.searchParams.get('id');
      
      if (currentLink !== editorStore.currentMarkdown.link || currentId) {
        url.searchParams.set('link', editorStore.currentMarkdown.link);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);
      }
    }
  });

  function handleSelect(m: Markdown) {
    if (m.link) pushHistory(m.link);
    if (drafts.has(m.link)) {
      setCurrentMarkdown(drafts.get(m.link)!)
    } else {
      setCurrentMarkdown(m);
    }

    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }

  function handleSave(m: Markdown) {
    updateLastHistory(m.link);
    setCurrentMarkdown(m);
    upsertItem(m);
  }

  async function createNew(prefix: string) {
    const targetSource = getSourceFromLink(prefix);
    const newMd = initMarkdown(targetSource);
    
    if (targetSource === MarkdownSource.Memo) {
      const result = await actions.db.markdown.getNewMemoSubject();
      if (result.data) {
        newMd.subject = result.data;
        newMd.link = `${prefix}${result.data}`
        newMd.private = true
      } else if (result.error) {
          console.error('Error fetching memo subject', result.error);
          newMd.link = prefix;
      }
    } else {
      let baseName = 'unnamed';
      let counter = 0;
      let candidate = `${prefix}${baseName}`;
      
      const exists = (link: string) => editorStore.items.some(i => i.link === link);

      while(exists(candidate)) {
        counter++;
        candidate = `${prefix}${baseName}-${counter}`;
      }
      newMd.link = candidate;
    }
    setCurrentMarkdown(newMd);
  }
</script>

<div class="flex flex-1 overflow-hidden w-full">
    <Notification />
    <!-- Sidebar Container -->
    <div class="{editorStore.showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col shrink-0 h-screen">
        <div class="flex-1 overflow-hidden pt-5">
             <Sidebar
                currentId={editorStore.currentMarkdown?.id || 0}
                onSelect={handleSelect}
                onCreate={createNew}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#if editorStore.currentMarkdown}
             <div class="flex-1 overflow-y-auto px-4 md:px-8 flex flex-col">
                 {#if editorPref === 'carta'}
                    <CartaEditor 
                        markdown={editorStore.currentMarkdown} 
                        onSave={handleSave}
                    />
                 {:else}
                    <Editor 
                        markdown={editorStore.currentMarkdown} 
                        onSave={handleSave}
                    />
                 {/if}
             </div>
        {/if}
    </div>
</div>
