<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromLink } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import { setItems, upsertItem } from './store.svelte';
  import { onMount } from 'svelte';

  interface Props {
    initialMarkdown: Markdown;
    initialItems?: Markdown[] | null;
    isMobile?: boolean;
  }

  let { initialMarkdown, initialItems = null, isMobile = false }: Props = $props();
  const initialSource = initialMarkdown.source;

  if (initialItems) {
      setItems(initialItems);
  }

  let currentMarkdown = $state<Markdown>(initialMarkdown);
  let showSidebar = $state(!isMobile);
  let sidebar: Sidebar;

  onMount(() => {
    // Client-side refinement could happen here if needed, but we rely on server-side isMobile for initial state
  });

  function handleSelect(m: Markdown) {
    currentMarkdown = m;
    if (window.innerWidth < 768) {
      showSidebar = false;
    }
  }

  function handleSave(m: Markdown) {
    currentMarkdown = m;
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
      currentMarkdown = newMd;
  }
</script>

<div class="flex flex-1 h-full overflow-hidden w-full">
    <!-- Sidebar Container -->
    <div class="{showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col shrink-0 h-screen">
        <div class="flex-1 overflow-hidden pt-5">
             <Sidebar
                currentId={currentMarkdown.id}
                onSelect={handleSelect}
                onCreate={createNew}
                initialItems={currentMarkdown.source === initialSource ? initialItems : null}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#key currentMarkdown}
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8 flex flex-col">
                 <Editor 
                    markdown={currentMarkdown} 
                    toggleSidebar={() => showSidebar = !showSidebar}
                    onSave={handleSave}
                 />
             </div>
        {/key}
    </div>
</div>
