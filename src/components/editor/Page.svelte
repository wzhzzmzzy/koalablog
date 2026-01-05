<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromLink } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import { editorStore, setItems, setCurrentMarkdown, upsertItem, pushHistory, updateLastHistory } from './store.svelte';

  interface Props {
    initialMarkdown: Markdown;
    initialItems?: Markdown[] | null;
    isMobile?: boolean;
  }

  let { initialMarkdown, initialItems = null, isMobile = false }: Props = $props();

  // 统一初始化 Store
  if (initialItems) {
      setItems(initialItems);
  }
  
  // Init History and Current
  pushHistory(initialMarkdown.link);
  setCurrentMarkdown(initialMarkdown);

  let showSidebar = $state(!isMobile);

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
    setCurrentMarkdown(m);

    if (window.innerWidth < 768) {
      showSidebar = false;
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
      newMd.link = prefix;
      
      if (targetSource === MarkdownSource.Memo) {
         const result = await actions.db.markdown.getNewMemoSubject();
         if (result.data) {
            newMd.subject = result.data;
            newMd.link = `${prefix}${result.data}`
         } else if (result.error) {
             console.error('Error fetching memo subject', result.error);
         }
      }
      setCurrentMarkdown(newMd);
  }
</script>

<div class="flex flex-1 h-full overflow-hidden w-full">
    <!-- Sidebar Container -->
    <div class="{showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col shrink-0 h-screen">
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
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8 flex flex-col">
                 <Editor 
                    markdown={editorStore.currentMarkdown} 
                    toggleSidebar={() => showSidebar = !showSidebar}
                    onSave={handleSave}
                 />
             </div>
        {/if}
    </div>
</div>
