<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource, getSourceFromLink } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';

  interface Props {
    source: MarkdownSource;
    initialMarkdown: Markdown;
    initialItems?: Markdown[] | null;
    allPosts?: Markdown[];
  }

  let { source: initialSource, initialMarkdown, initialItems = null, allPosts = [] }: Props = $props();

  let source = $state(initialSource);
  let currentMarkdown = $state<Markdown>(initialMarkdown);
  let showSidebar = $state(true);
  let sidebar: Sidebar;

  function handleSelect(m: Markdown) {
    currentMarkdown = m;
    source = m.source;
  }

  function handleSave(m: Markdown) {
    currentMarkdown = m;
    sidebar?.upsertItem(m);
  }

  async function createNew(prefix: string) {
      const targetSource = getSourceFromLink(prefix);
      source = targetSource;
      const newMd = initMarkdown(source);
      newMd.link = prefix;
      
      if (source === MarkdownSource.Memo) {
         const result = await actions.db.markdown.getNewMemoSubject();
         if (result.data) {
             newMd.subject = result.data;
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
                bind:this={sidebar}
                currentId={currentMarkdown.id}
                onSelect={handleSelect}
                onCreate={createNew}
                initialItems={source === initialSource ? initialItems : null}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#key currentMarkdown}
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8 flex flex-col">
                 <Editor 
                    markdown={currentMarkdown} 
                    bind:source={source} 
                    {allPosts} 
                    toggleSidebar={() => showSidebar = !showSidebar}
                    onSave={handleSave}
                 />
             </div>
        {/key}
    </div>
</div>
