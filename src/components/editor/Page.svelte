<script lang="ts">
  import { actions } from 'astro:actions';
  import { MarkdownSource } from '@/db';
  import type { Markdown } from '@/db/types';
  import { initMarkdown } from '@/db/types';
  import Sidebar from './Sidebar.svelte';
  import Editor from './index.svelte';
  import { FileText, StickyNote, Layout } from '@lucide/svelte';

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

  function handleSelect(m: Markdown) {
    currentMarkdown = m;
  }

  async function createNew(targetSource: MarkdownSource) {
      console.log('createNew called', targetSource);
      source = targetSource;
      const newMd = initMarkdown(source);
      if (source === MarkdownSource.Memo) {
         console.log('Fetching new memo subject');
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
    <div class="{showSidebar ? 'w-64' : 'w-0'} transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col border-r border-[--koala-border] bg-[--koala-surface-0] shrink-0">
        <div class="p-2 border-b border-[--koala-border] flex gap-2">
             <button class="flex-1 py-2 px-1 bg-[--koala-primary] text-white rounded hover:opacity-90 flex items-center justify-center gap-1 btn text-xs" onclick={() => createNew(MarkdownSource.Post)} title="New Post">
                <FileText size={14} />
                <span>Post</span>
             </button>
             <button class="flex-1 py-2 px-1 bg-[--koala-primary] text-white rounded hover:opacity-90 flex items-center justify-center gap-1 btn text-xs" onclick={() => createNew(MarkdownSource.Memo)} title="New Memo">
                <StickyNote size={14} />
                <span>Memo</span>
             </button>
             <button class="flex-1 py-2 px-1 bg-[--koala-primary] text-white rounded hover:opacity-90 flex items-center justify-center gap-1 btn text-xs" onclick={() => createNew(MarkdownSource.Page)} title="New Page">
                <Layout size={14} />
                <span>Page</span>
             </button>
        </div>
        <div class="flex-1 overflow-hidden">
             <Sidebar 
                {source} 
                currentId={currentMarkdown.id} 
                onSelect={handleSelect} 
                initialItems={source === initialSource ? initialItems : null}
             />
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {#key currentMarkdown}
             <!-- Pass currentMarkdown to Editor -->
             <div class="flex-1 h-full overflow-y-auto px-4 md:px-8">
                 <!-- Add padding-top to avoid overlap with toggle button if necessary, 
                      but Editor usually has its own header. 
                      The toggle button is absolute.
                      We might want to push the editor content down or to the right?
                      Actually, the editor header has title and buttons.
                      The toggle button might overlap with the title.
                      Let's check Editor layout.
                      Editor starts with <div class="w-full flex-1 flex flex-col pt-5">
                      The toggle button is top-5 left-5.
                      It will overlap with the header "New Post" / "Edit Post".
                      
                      Maybe I should put the toggle button IN the Sidebar when open, and floating when closed?
                      Or just make it part of the layout.
                      
                      For now, I'll place it. If it overlaps, I'll adjust.
                 -->
                 <Editor markdown={currentMarkdown} {source} {allPosts} toggleSidebar={() => showSidebar = !showSidebar} />
             </div>
        {/key}
    </div>
</div>
